/**
 * update_employees_req06.js
 *
 * Updates employee records with specific aliases and adds missing agents
 * as requested in REQ-06.
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

async function main() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    console.log('[REQ-06] Updating Employee mappings...');

    const updates = [
        {
            // Fah
            match: { firstName: 'Jutamat' },
            data: {
                nickName: 'Fah',
                meta: {
                    aliases: [
                        "Jutamat Sangprakai",
                        "Fah",
                        "ฟ้า",
                        "Jutamat Fah N'Finn Sangprakai",
                        "Fafah Fasai"
                    ]
                }
            }
        },
        {
            // P'Aoi
            match: { firstName: 'Satabongkot' },
            data: {
                nickName: 'พี่อ้อย',
                meta: {
                    aliases: [
                        "Satabongkot Noinin",
                        "พี่อ้อย",
                        "Aoi"
                    ]
                }
            }
        },
        {
            // NuPhung
            match: { firstName: 'Preeyaporn' },
            data: {
                nickName: 'NuPhung',
                meta: {
                    aliases: [
                        "Preeyaporn Kornvathin",
                        "NuPhung",
                        "หนูผึ้ง",
                        "Preeyaporn NuPhung Kornvathin"
                    ]
                }
            }
        }
    ];

    for (const update of updates) {
        const emp = await prisma.employee.findFirst({ where: update.match });
        if (emp) {
            await prisma.employee.update({
                where: { id: emp.id },
                data: {
                    nickName: update.data.nickName,
                    metadata: update.data.meta
                }
            });
            console.log(`✅ Updated ${update.match.firstName} (${update.data.nickName})`);
        }
    }

    // Add missing employees if they don't exist
    const missing = [
        {
            employeeId: 'TVS-EMP-008',
            firstName: 'Panxei',
            lastName: 'Agent',
            nickName: 'แป้ง',
            email: 'panxei@vschool.com',
            passwordHash: 'placeholder',
            meta: { aliases: ["Panxei", "แป้ง"] }
        },
        {
            employeeId: 'TVS-EMP-009',
            firstName: 'Atom',
            lastName: 'Agent',
            nickName: 'Atom',
            email: 'atom@vschool.com',
            passwordHash: 'placeholder',
            meta: { aliases: ["DM Atom", "Atom", "อะตอม"] }
        }
    ];

    for (const m of missing) {
        const exist = await prisma.employee.findFirst({
            where: {
                OR: [
                    { employeeId: m.employeeId },
                    { email: m.email }
                ]
            }
        });

        if (!exist) {
            await prisma.employee.create({
                data: {
                    employeeId: m.employeeId,
                    firstName: m.firstName,
                    lastName: m.lastName,
                    nickName: m.nickName,
                    email: m.email,
                    passwordHash: m.passwordHash,
                    metadata: m.meta
                }
            });
            console.log(`➕ Added missing employee: ${m.firstName} (${m.nickName})`);
        } else {
            console.log(`ℹ️ Employee ${m.firstName} already exists.`);
        }
    }

    await prisma.$disconnect();
}

main().catch(async e => {
    console.error('[REQ-06] Fatal error:', e);
    process.exit(1);
});
