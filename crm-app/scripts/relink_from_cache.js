
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const CUSTOMER_DIR = '/Users/ideab/Desktop/data_hub/crm-app/cache/customer';

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Loading Employees ---');
        const empRes = await pool.query("SELECT id, first_name, last_name, nick_name, facebook_name, metadata FROM employees WHERE status = 'Active'");
        const employees = empRes.rows;

        function resolveEmployeeId(fromName) {
            if (!fromName || fromName === 'The V School') return null;
            const nameLower = fromName.toLowerCase().trim();
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

        console.log('--- Extracting from JSON Cache ---');
        const folders = fs.readdirSync(CUSTOMER_DIR);
        let totalMsgs = 0;
        let totalUpdated = 0;

        for (const folder of folders) {
            const historyDir = path.join(CUSTOMER_DIR, folder, 'chathistory');
            if (!fs.existsSync(historyDir)) continue;

            const files = fs.readdirSync(historyDir);
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                const data = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
                const messages = Array.isArray(data.messages) ? data.messages : (data.messages?.data || []);

                const threadID = file.replace('.json', '').replace(/^t_/, '');

                for (const msg of messages) {
                    totalMsgs++;
                    const fromName = msg.fromName;
                    const content = msg.content || msg.message || msg.text || '';
                    if (!fromName || fromName === 'The V School') continue;

                    const empId = resolveEmployeeId(fromName);
                    if (empId) {
                        // Match in DB by threadID and content/timestamp
                        // We use a partial content match for robustness
                        const searchText = content.slice(0, 50);
                        if (!searchText) continue;

                        const updateRes = await pool.query(`
              UPDATE messages 
              SET responder_id = $1, from_name = $2
              WHERE responder_id IS NULL 
              AND (from_name = 'The V School' OR from_name IS NULL)
              AND conversation_id IN (SELECT id FROM conversations WHERE conversation_id LIKE $3)
              AND content LIKE $4
            `, [empId, fromName, `%${threadID}`, `%${searchText}%`]);

                        if (updateRes.rowCount > 0) {
                            totalUpdated += updateRes.rowCount;
                        }
                    }
                }
            }
        }

        console.log(`--- Result ---`);
        console.log(`Scanned ${totalMsgs} messages in cache.`);
        console.log(`Updated ${totalUpdated} messages in DB.`);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
