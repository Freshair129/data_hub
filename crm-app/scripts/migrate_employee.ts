import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Migrating employee data...');
    const dataHubRoot = path.join(process.cwd(), '..');
    const employeeDir = path.join(dataHubRoot, 'employee');

    if (!fs.existsSync(employeeDir)) {
        console.log('Employee directory not found, skipping migration.');
        return;
    }

    const dirs = fs.readdirSync(employeeDir).filter(f => fs.statSync(path.join(employeeDir, f)).isDirectory());

    for (const dir of dirs) {
        const profileFile = `profile_${dir}.json`;
        const profilePath = path.join(employeeDir, dir, profileFile);
        if (!fs.existsSync(profilePath)) {
            console.log(`Skipping ${dir}, no profile found at ${profilePath}`);
            continue;
        }
        const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

        try {
            const employeeData = {
                employeeId: raw.employee_id,
                agentId: raw.agent_id,
                firstName: raw.profile?.first_name || 'Unknown',
                lastName: raw.profile?.last_name || 'Unknown',
                nickName: raw.profile?.nick_name || null,
                role: raw.profile?.role || 'sales',
                department: raw.profile?.department || null,
                status: raw.profile?.status || 'Active',
                joinDate: raw.profile?.join_date ? new Date(raw.profile.join_date) : null,
                email: raw.contact_info?.email || `${raw.employee_id}@datahub.local`,
                phonePrimary: raw.contact_info?.phone_primary || null,
                lineId: raw.contact_info?.line_id || null,
                passwordHash: raw.credentials?.password || '',
                permissions: raw.permissions || {},
                performance: raw.performance || {}
            };

            const res = await prisma.employee.upsert({
                where: { employeeId: employeeData.employeeId },
                update: employeeData,
                create: employeeData
            });
            console.log('Migrated:', res.employeeId);
        } catch (e) {
            console.error(`Failed to migrate ${dir}:`, e);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        pool.end();
    });
