
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SYNC_CACHE_PATH = '/Users/ideab/Desktop/data_hub/crm-app/cache/synced_threads.json';
const CUSTOMER_DIR = '/Users/ideab/Desktop/data_hub/crm-app/cache/customer';

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
        console.log(`Found ${threadIds.length} entry keys in synced_threads.json.`);

        // Map threadId to JSON filename
        console.log('--- Scanning Cache Directory ---');
        const threadToFileMap = new Map();
        const folders = fs.readdirSync(CUSTOMER_DIR);
        for (const folder of folders) {
            const historyDir = path.join(CUSTOMER_DIR, folder, 'chathistory');
            if (!fs.existsSync(historyDir)) continue;
            const files = fs.readdirSync(historyDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const name = file.replace('.json', '');
                const rawId = name.replace(/^t_/, '');
                threadToFileMap.set(rawId, path.join(historyDir, file));
                threadToFileMap.set(name, path.join(historyDir, file)); // Store both for easy lookup
            }
        }
        console.log(`Mapped ${threadToFileMap.size} files to thread IDs.`);

        let totalConvUpdated = 0;
        let totalMsgUpdated = 0;

        for (const threadId of threadIds) {
            const entry = syncCache[threadId];
            if (!entry.agents || entry.agents.length === 0) continue;

            const agentName = entry.agents[0];
            const empId = resolveEmployeeId(agentName);
            if (!empId) continue;

            const filePath = threadToFileMap.get(threadId);
            if (!filePath) {
                // Fallback: try direct DB lookup if cache file missing
                const convRes = await pool.query(`
          SELECT id FROM conversations 
          WHERE conversation_id = $1 OR conversation_id = $2 OR participant_id = $1
        `, [threadId, `t_${threadId}`]);

                if (convRes.rows.length > 0) {
                    await updateDb(convRes.rows[0].id, empId, agentName);
                }
                continue;
            }

            // Read JSON to get Prisma ID
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const prismaId = data.id;
                if (prismaId) {
                    await updateDb(prismaId, empId, agentName);
                }
            } catch (e) {
                console.error(`Error reading ${filePath}:`, e.message);
            }
        }

        async function updateDb(convDbId, empId, agentName) {
            // Update conversation
            const convUpdate = await pool.query(`
        UPDATE conversations 
        SET assigned_employee_id = $1, assigned_agent = $2
        WHERE id = $3 AND (assigned_employee_id IS NULL OR assigned_agent = 'The V School')
      `, [empId, agentName, convDbId]);

            if (convUpdate.rowCount > 0) totalConvUpdated++;

            // Update messages
            const msgUpdateRes = await pool.query(`
        UPDATE messages 
        SET responder_id = $1, from_name = $2
        WHERE conversation_id = $3 
        AND from_id = '170707786504'
        AND (responder_id IS NULL OR from_name = 'The V School')
      `, [empId, agentName, convDbId]);
            totalMsgUpdated += msgUpdateRes.rowCount;
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
