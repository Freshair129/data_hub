import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkSyncCount() {
    try {
        const count = await prisma.conversation.count({
            where: {
                lastMessageAt: {
                    gte: new Date('2026-01-01T00:00:00Z')
                }
            }
        });
        console.log(`📊 DB Count (since 2026-01-01): ${count}`);
    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

checkSyncCount();
