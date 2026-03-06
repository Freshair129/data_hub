
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SYNC_CACHE_PATH = '/Users/ideab/Desktop/data_hub/crm-app/cache/synced_threads.json';

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Loading Employees ---');
        const empRes = await pool.query("SELECT id, first_name, last_name, nick_name, facebook_name, metadata FROM employees WHERE status = 'Active'");
        const employees = empRes.rows;

        function resolveEmployeeId(agentName) {
            if (!agentName || agentName === 'The V School') return null;
            const nameLower = agentName.toLowerCase().trim();
            const customerBlacklist = ['jariya jedidiah', 'madamejoy sk', 'toto chao', 'pasagon isalam'];
            if (customerBlacklist.includes(nameLower)) return null;

            const found = employees.find(e => {
                const candidates = [
                    e.facebook_name, e.nick_name, e.first_name,
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

        console.log('--- Loading Synced Threads Cache ---');
        const syncCache = JSON.parse(fs.readFileSync(SYNC_CACHE_PATH, 'utf8'));
        const threadIds = Object.keys(syncCache);
        console.log(`Found ${threadIds.length} threads in cache.`);

        let totalConvUpdated = 0;
        let totalMsgUpdated = 0;

        for (const threadId of threadIds) {
            const entry = syncCache[threadId];
            if (!entry.agents || entry.agents.length === 0) continue;

            // If multiple agents, we take the last one or skip? 
            // For now, if there's only one, it's safe. If multiple, we might be guessing.
            // Let's try to map the first one for now as a baseline.
            const agentName = entry.agents[0];
            const empId = resolveEmployeeId(agentName);
            if (!empId) continue;

            // Find conversation in DB
            // Match t_ID or ID
            const convRes = await pool.query(`
        SELECT id FROM conversations 
        WHERE conversation_id = $1 OR conversation_id = $2
      `, [threadId, `t_${threadId}`]);

            if (convRes.rows.length > 0) {
                const convDbId = convRes.rows[0].id;

                // Update conversation
                await pool.query(`
          UPDATE conversations 
          SET assigned_employee_id = $1, assigned_agent = $2
          WHERE id = $3 AND assigned_employee_id IS NULL
        `, [empId, agentName, convDbId]);
                totalConvUpdated++;

                // Update messages
                const msgUpdateRes = await pool.query(`
          UPDATE messages 
          SET responder_id = $1, from_name = $2
          WHERE conversation_id = $3 
          AND from_id = '170707786504'
          AND responder_id IS NULL
        `, [empId, agentName, convDbId]);
                totalMsgUpdated += msgUpdateRes.rowCount;
            }
        }

        console.log(`--- Result ---`);
        console.log(`Updated ${totalConvUpdated} conversations.`);
        console.log(`Updated ${totalMsgUpdated} messages.`);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
