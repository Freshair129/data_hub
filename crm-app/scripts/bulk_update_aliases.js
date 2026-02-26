const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL is not set');
        return;
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const mappings = [
        {
            id: 'e004',
            aliases: ["Jutamat Fah N'Finn Sangprakai", "Jutamat Sangprakai"]
        },
        {
            id: 'em_mgr_01',
            aliases: ["Preeyaporn NuPhung Kornvathin", "NuPhung", "Preeyaporn Kornvathin"]
        },
        {
            id: 'em_sls_01',
            aliases: ["Satabongkot Noinin"]
        }
    ];

    try {
        for (const m of mappings) {
            const emp = await prisma.employee.findUnique({
                where: { employeeId: m.id }
            });

            if (emp) {
                await prisma.employee.update({
                    where: { id: emp.id },
                    data: {
                        metadata: {
                            ...(emp.metadata || {}),
                            aliases: m.aliases
                        }
                    }
                });
                console.log(`Successfully updated aliases for ${m.id}`);
            } else {
                console.warn(`Employee ${m.id} not found`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
