// Script to create Panxei employee record in Prisma DB
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf8');
const dbUrlMatch = envLocal.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
const DATABASE_URL = dbUrlMatch ? dbUrlMatch[1] : null;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in .env.local');
    process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    try {
        const result = await prisma.employee.upsert({
            where: { employeeId: 'em_agt_05' },
            update: {
                firstName: 'Panxei',
                lastName: '',
                nickName: 'แป้ง',
                role: 'Agent',
                department: 'Sales',
                status: 'Active',
                facebookName: 'Panxei',
                metadata: {
                    aliases: ['Panxei', 'แป้ง']
                }
            },
            create: {
                employeeId: 'em_agt_05',
                firstName: 'Panxei',
                lastName: '',
                nickName: 'แป้ง',
                role: 'Agent',
                department: 'Sales',
                status: 'Active',
                email: 'panxei@placeholder.com',
                passwordHash: 'placeholder',
                facebookName: 'Panxei',
                metadata: {
                    aliases: ['Panxei', 'แป้ง']
                }
            }
        });
        console.log('✅ Panxei created/updated:', result.employeeId, result.firstName, result.nickName);
    } catch (e) {
        console.error('❌ Error:', e.message);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

main();
