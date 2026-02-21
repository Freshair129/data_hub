import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Manual env parsing since dotenv might be flaky in this env
import fs from 'fs';
const envLocal = fs.readFileSync('.env.local', 'utf8');
const dbUrlMatch = envLocal.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
const DATABASE_URL = dbUrlMatch ? dbUrlMatch[1] : null;

const { Pool } = pg;

async function checkEmployees() {
    if (!DATABASE_URL) {
        console.error('DATABASE_URL not found in .env.local');
        return;
    }

    console.log('Connecting to:', DATABASE_URL.split('@')[1]); // Log host only for safety

    const pool = new Pool({ connectionString: DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        const employees = await prisma.employee.findMany({
            select: {
                email: true,
                firstName: true,
                role: true,
                passwordHash: true
            }
        });

        console.log('Employees found in DB:');
        console.log(JSON.stringify(employees, null, 2));
    } catch (e) {
        console.error('Error querying DB:', e);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

checkEmployees();
