
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const CUSTOMER_DIR = '/Users/ideab/Desktop/data_hub/crm-app/cache/customer';

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Loading Employees ---');
        const empRes = await pool.query("SELECT id, first_name, last_name, nick_name, facebook_name, metadata FROM employees WHERE status = 'Active'");
        const employees = empRes.rows;

        function resolveEmployeeId(name) {
            if (!name || name === 'The V School') return null;
            const nameLower = name.toLowerCase().trim();
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

        console.log('--- Deep Scanning JSON Cache ---');
        const folders = fs.readdirSync(CUSTOMER_DIR);
        let totalConvUpdated = 0;
        let totalMsgUpdated = 0;

        for (const folder of folders) {
            const historyDir = path.join(CUSTOMER_DIR, folder, 'chathistory');
            if (!fs.existsSync(historyDir)) continue;

            const files = fs.readdirSync(historyDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                try {
                    const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
                    const prismaId = data.id;
                    if (!prismaId) continue;

                    // Look for an anchor in fromName or assignedAgent
                    let anchorId = resolveEmployeeId(data.assignedAgent);
                    let anchorName = data.assignedAgent;

                    if (!anchorId) {
                        const messages = Array.isArray(data.messages) ? data.messages : (data.messages?.data || []);
                        for (const msg of messages) {
                            const empId = resolveEmployeeId(msg.fromName);
                            if (empId) {
                                anchorId = empId;
                                anchorName = msg.fromName;
                                break;
                            }
                        }
                    }

                    if (anchorId) {
                        // Update DB
                        const convUpdate = await pool.query(`
              UPDATE conversations 
              SET assigned_employee_id = $1, assigned_agent = $2
              WHERE id = $3 AND (assigned_employee_id IS NULL OR assigned_agent = 'The V School')
            `, [anchorId, anchorName, prismaId]);

                        if (convUpdate.rowCount > 0) totalConvUpdated++;

                        const msgUpdate = await pool.query(`
              UPDATE messages 
              SET responder_id = $1, from_name = $2
              WHERE conversation_id = $3 
              AND from_id = '170707786504'
              AND (responder_id IS NULL OR from_name = 'The V School')
            `, [anchorId, anchorName, prismaId]);

                        totalMsgUpdated += msgUpdate.rowCount;
                    }
                } catch (e) {
                    // Skip malformed JSON
                }
            }
        }

        console.log(`--- Result ---`);
        console.log(`Updated ${totalConvUpdated} conversations.`);
        console.log(`Updated ${totalMsgUpdated} messages.`);

        const finalStats = await pool.query("SELECT count(*) as total, count(responder_id) as attributed FROM messages WHERE from_id = '170707786504'");
        console.log(`Final Admin Message Stats: ${finalStats.rows[0].attributed} / ${finalStats.rows[0].total} attributed.`);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
