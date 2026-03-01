/**
 * backfill_responder_ids.js
 *
 * One-time script: backfill Message.responderId and Conversation.assignedEmployeeId
 * จาก fromName / assignedAgent (string) → Employee.id (FK)
 *
 * Usage: node scripts/backfill_responder_ids.js
 */

import { PrismaClient } from '../src/generated/prisma-client/index.js';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pg;

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function resolveEmployeeId(employees, name) {
    if (!name) return null;
    const nameLower = name.toLowerCase().trim();
    const found = employees.find(e => {
        const candidates = [
            e.facebookName,
            e.nickName,
            e.firstName,
            `${e.firstName} ${e.lastName}`,
            ...(e.metadata?.aliases || [])
        ].filter(Boolean).map(v => v.toLowerCase());
        return candidates.some(c => c === nameLower || nameLower.includes(c) || c.includes(nameLower));
    });
    return found?.id || null;
}

async function main() {
    console.log('[Backfill] Starting REQ-01/02 backfill...\n');

    // Load all active employees once
    const employees = await prisma.employee.findMany({
        where: { status: 'Active' },
        select: { id: true, firstName: true, lastName: true, nickName: true, facebookName: true, metadata: true }
    });
    console.log(`[Backfill] Loaded ${employees.length} active employees`);

    // ─── REQ-01: Backfill Message.responderId ─────────────────────────────
    console.log('\n[Backfill] Phase 1: Messages...');

    // ดึงเฉพาะข้อความ admin — ข้ามข้อความลูกค้าโดย join กับ conversation
    // และ filter ออก: fromId !== conversation.participantId (PSID ลูกค้า)
    const messages = await prisma.message.findMany({
        where: {
            fromName: { not: null },
            responderId: null,
            conversation: {
                // fromId ต้องไม่ใช่ participantId (PSID ลูกค้า)
                // กรณี participantId = null ก็ให้ผ่านไป (ข้อมูลเก่า)
                participantId: { not: null }
            }
        },
        select: {
            id: true,
            fromName: true,
            fromId: true,
            conversation: {
                select: { participantId: true }
            }
        }
    });

    // กรองเพิ่มอีกชั้น: ข้ามข้อความที่ fromId ตรงกับ participantId (= ข้อความลูกค้า)
    const adminMessages = messages.filter(
        m => !m.fromId || !m.conversation?.participantId || m.fromId !== m.conversation.participantId
    );

    console.log(`[Backfill] Found ${adminMessages.length} admin messages (filtered from ${messages.length} total) with fromName but no responderId`);

    let msgSuccess = 0;
    let msgFailed = 0;
    let unresolvedNames = new Set();

    for (const msg of adminMessages) {
        const employeeId = await resolveEmployeeId(employees, msg.fromName);
        if (employeeId) {
            await prisma.message.update({
                where: { id: msg.id },
                data: { responderId: employeeId }
            });
            msgSuccess++;
        } else {
            msgFailed++;
            unresolvedNames.add(msg.fromName);
            if (msgFailed <= 10) {
                console.log(`  ⚠️ No match for: "${msg.fromName}"`);
            }
        }
    }

    console.log(`[Backfill] Messages: ✅ ${msgSuccess} linked, ❌ ${msgFailed} unresolved (admin messages only)`);

    // ─── REQ-02: Backfill Conversation.assignedEmployeeId ─────────────────
    console.log('\n[Backfill] Phase 2: Conversations...');

    const conversations = await prisma.conversation.findMany({
        where: {
            assignedAgent: { not: null },
            assignedEmployeeId: null
        },
        select: { id: true, assignedAgent: true }
    });

    console.log(`[Backfill] Found ${conversations.length} conversations with assignedAgent but no assignedEmployeeId`);

    let convSuccess = 0;
    let convFailed = 0;

    for (const conv of conversations) {
        const employeeId = await resolveEmployeeId(employees, conv.assignedAgent);
        if (employeeId) {
            await prisma.conversation.update({
                where: { id: conv.id },
                data: { assignedEmployeeId: employeeId }
            });
            convSuccess++;
        } else {
            convFailed++;
            if (conv.assignedAgent) {
                unresolvedNames.add(conv.assignedAgent);
            }
        }
    }

    console.log(`[Backfill] Conversations: ✅ ${convSuccess} linked, ❌ ${convFailed} unresolved`);

    // ─── Summary ──────────────────────────────────────────────────────────
    console.log('\n========================================');
    console.log('[Backfill] DONE');
    console.log(`  Messages linked:      ${msgSuccess}/${adminMessages.length} (admin only, skipped ${messages.length - adminMessages.length} customer messages)`);
    console.log(`  Conversations linked: ${convSuccess}/${conversations.length}`);
    console.log('  Unresolved names:', Array.from(unresolvedNames));
    console.log('========================================');

    await prisma.$disconnect();
}

main().catch(async e => {
    console.error('[Backfill] Fatal error:', e);
    await prisma.$disconnect();
    process.exit(1);
});
