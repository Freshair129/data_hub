const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const fs = require('fs');
const path = require('path');

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL is not set');
        return;
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        // 1. Unique Agents from Conversations
        const convAgents = await prisma.conversation.findMany({
            where: { assignedAgent: { not: null } },
            select: { assignedAgent: true },
            distinct: ['assignedAgent']
        });
        console.log('--- Unique Agents in DB Conversations ---');
        convAgents.forEach(a => console.log(a.assignedAgent));

        // 2. Unique Agents from Employees
        const emps = await prisma.employee.findMany();
        console.log('\n--- Current Employees ---');
        emps.forEach(e => {
            console.log(`ID: ${e.employeeId}, Nick: ${e.nickName}, Full: ${e.firstName} ${e.lastName}`);
        });

        // 3. Search Cache for "agent" field values
        const customerDir = path.join(process.cwd(), 'cache', 'customer');
        const uniqueCacheAgents = new Set();
        if (fs.existsSync(customerDir)) {
            const folders = fs.readdirSync(customerDir);
            for (const folder of folders) {
                const profilePath = path.join(customerDir, folder, 'profile.json');
                if (fs.existsSync(profilePath)) {
                    try {
                        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
                        if (profile.agent) uniqueCacheAgents.add(profile.agent);
                        if (profile.intelligence?.agent) uniqueCacheAgents.add(profile.intelligence.agent);
                    } catch (e) { }
                }
            }
        }
        console.log('\n--- Unique Agents in Cache ---');
        uniqueCacheAgents.forEach(a => console.log(a));

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
