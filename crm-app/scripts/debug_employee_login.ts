
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPrisma } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function checkEmployeeDetails() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    try {
        const employees = await prisma.employee.findMany();
        console.log('--- EMPLOYEE DETAILS ---');
        console.log(JSON.stringify(employees, null, 2));
        console.log('------------------------');
    } catch (error) {
        console.error('Error fetching employees:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkEmployeeDetails();
