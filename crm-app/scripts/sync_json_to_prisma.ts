/**
 * sync_json_to_prisma.ts
 * 
 * Scans cache/customer/* /chathistory/*.json and upserts into Prisma.
 * This reconciles the 52 vs 681 count discrepancy.
 */

import { PrismaClient } from '../src/generated/prisma-client/index.js';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Helper: resolve agent name -> Employee.id (Simplified version for script)
async function resolveEmployeeId(prisma: any, agentName: string | null) {
    if (!agentName || agentName === 'Unassigned' || agentName === 'The V School') return null;
    const nameLower = agentName.toLowerCase().trim();
    const employees = await prisma.employee.findMany({ where: { status: 'Active' } });
    const found = employees.find((e: any) => {
        const candidates = [
            e.facebookName,
            e.nickName,
            e.firstName,
            `${e.firstName} ${e.lastName}`,
            ...(e.metadata?.aliases || [])
        ].filter(Boolean).map((v: any) => v.toLowerCase());
        return candidates.some((c: any) => c === nameLower || nameLower.includes(c) || c.includes(nameLower));
    });
    return found?.id || null;
}

async function main() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const CUSTOMER_DIR = path.resolve(process.cwd(), 'cache/customer');
    if (!fs.existsSync(CUSTOMER_DIR)) {
        console.error('❌ Cache directory not found:', CUSTOMER_DIR);
        process.exit(1);
    }

    console.log('🚀 Starting JSON to Prisma Reconciliation...');

    let convUpserted = 0;
    let msgUpserted = 0;

    const folders = fs.readdirSync(CUSTOMER_DIR);
    for (const folder of folders) {
        const historyDir = path.join(CUSTOMER_DIR, folder, 'chathistory');
        const profilePath = path.join(CUSTOMER_DIR, folder, 'profile.json');

        if (!fs.existsSync(historyDir)) continue;
        if (!fs.existsSync(profilePath)) continue;

        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        const customerFBId = profile.facebookId || null;
        const customerId = profile.customerId;

        if (!customerFBId && !customerId) {
            console.warn(`  ⚠️ Skipping folder ${folder}: No facebookId or customerId`);
            continue;
        }

        // Ensure customer exists in DB first
        let dbCustomer = null;
        if (customerFBId) {
            dbCustomer = await prisma.customer.findUnique({
                where: { facebookId: customerFBId }
            });
        }

        if (!dbCustomer && customerId) {
            dbCustomer = await prisma.customer.findUnique({
                where: { customerId: customerId }
            });

            // If found by customerId and we have a facebookId now, link them
            if (dbCustomer && customerFBId && !dbCustomer.facebookId) {
                dbCustomer = await prisma.customer.update({
                    where: { id: dbCustomer.id },
                    data: { facebookId: customerFBId }
                });
            }
        }

        if (!dbCustomer) {
            // Create new
            try {
                dbCustomer = await prisma.customer.create({
                    data: {
                        customerId: customerId || `TEMP_${customerFBId}`,
                        facebookId: customerFBId,
                        facebookName: profile.facebookName || `${profile.firstName} ${profile.lastName}`.trim(),
                        firstName: profile.firstName,
                        lastName: profile.lastName,
                        nickName: profile.nickName,
                        status: profile.status || 'Active',
                        intelligence: profile.intelligence || {}
                    }
                });
            } catch (err: any) {
                console.warn(`  ⚠️ Failed to create customer ${customerId}:`, err.message);
                continue;
            }
        }

        const files = fs.readdirSync(historyDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const filePath = path.join(historyDir, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const convId = file.replace('.json', '');

            // 1. Upsert Conversation
            const employeeId = await resolveEmployeeId(prisma, data.assignedAgent);
            const dbConv = await prisma.conversation.upsert({
                where: { conversationId: convId },
                update: {
                    assignedAgent: data.assignedAgent,
                    assignedEmployeeId: employeeId,
                    lastMessageAt: data.lastMessageAt ? new Date(data.lastMessageAt) : undefined,
                    participantId: data.participantId,
                    participantName: data.participantName
                },
                create: {
                    conversationId: convId,
                    customerId: dbCustomer.id,
                    channel: 'facebook',
                    assignedAgent: data.assignedAgent,
                    assignedEmployeeId: employeeId,
                    lastMessageAt: data.lastMessageAt ? new Date(data.lastMessageAt) : new Date(),
                    participantId: data.participantId,
                    participantName: data.participantName
                }
            });
            convUpserted++;

            // 2. Upsert Messages
            const messages = Array.isArray(data.messages) ? data.messages : (data.messages?.data || []);
            for (const msg of messages) {
                const msgTime = new Date(msg.createdAt || msg.created_time);
                if (isNaN(msgTime.getTime())) continue;

                const msgEmployeeId = await resolveEmployeeId(prisma, msg.fromName);

                await prisma.message.upsert({
                    where: { messageId: msg.id },
                    update: {
                        fromName: msg.fromName,
                        responderId: msgEmployeeId,
                        content: msg.content || msg.message || msg.text || ''
                    },
                    create: {
                        messageId: msg.id,
                        conversationId: dbConv.id,
                        fromId: msg.fromId || (msg.from?.id),
                        fromName: msg.fromName || (msg.from?.name),
                        responderId: msgEmployeeId,
                        content: msg.content || msg.message || msg.text || '',
                        createdAt: msgTime,
                        sessionId: msg.sessionId
                    }
                });
                msgUpserted++;
            }
        }
        console.log(`✅ Synced customer: ${folder} | ${files.length} conversations`);
    }

    console.log('\n' + '═'.repeat(40));
    console.log(`✨ Reconciliation Complete!`);
    console.log(`📂 Total Conversations: ${convUpserted}`);
    console.log(`💬 Total Messages: ${msgUpserted}`);
    console.log('═'.repeat(40));

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Fatal:', err);
    process.exit(1);
});
