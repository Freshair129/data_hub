
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Fetching Employees ---');
        const empRes = await pool.query("SELECT id, first_name, last_name, nick_name, facebook_name, metadata FROM employees WHERE status = 'Active'");
        const employees = empRes.rows;

        function resolveEmployeeId(fromName) {
            if (!fromName || fromName === 'The V School') return null;
            const nameLower = fromName.toLowerCase().trim();

            const customerBlacklist = ['jariya jedidiah', 'madamejoy sk', 'toto chao', 'pasagon isalam'];
            if (customerBlacklist.includes(nameLower)) return null;

            const found = employees.find(e => {
                const candidates = [
                    e.facebook_name,
                    e.nick_name,
                    e.first_name,
                    `${e.first_name} ${e.last_name}`,
                    ...(e.metadata?.aliases || [])
                ].filter(Boolean).map(v => v.toLowerCase().trim());

                if (candidates.some(c => c === nameLower)) return true;
                return candidates.some(c => {
                    if (c.length < 3) return c === nameLower;
                    return nameLower.includes(c) || c.includes(nameLower);
                });
            });
            return found?.id || null;
        }

        console.log('--- Relinking Messages ---');
        const msgRes = await pool.query("SELECT id, from_name FROM messages WHERE responder_id IS NULL AND from_name IS NOT NULL AND from_name != 'The V School'");
        console.log(`Found ${msgRes.rows.length} messages to analyze.`);

        let msgUpdated = 0;
        for (const row of msgRes.rows) {
            const empId = resolveEmployeeId(row.from_name);
            if (empId) {
                await pool.query('UPDATE messages SET responder_id = $1 WHERE id = $2', [empId, row.id]);
                msgUpdated++;
            }
        }
        console.log(`✅ Relinked ${msgUpdated} messages.`);

        console.log('--- Relinking Conversations ---');
        const convRes = await pool.query('SELECT id, assigned_agent FROM conversations WHERE assigned_employee_id IS NULL AND assigned_agent IS NOT NULL');
        console.log(`Found ${convRes.rows.length} conversations to analyze.`);

        let convUpdated = 0;
        for (const row of convRes.rows) {
            const empId = resolveEmployeeId(row.assigned_agent);
            if (empId) {
                await pool.query('UPDATE conversations SET assigned_employee_id = $1 WHERE id = $2', [empId, row.id]);
                convUpdated++;
            }
        }
        console.log(`✅ Relinked ${convUpdated} conversations.`);

    } catch (err) {
        console.error('Error during relinking:', err);
    } finally {
        await pool.end();
    }
}

main();
