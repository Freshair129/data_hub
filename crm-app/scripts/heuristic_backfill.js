
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Loading Employees ---');
        const empRes = await pool.query("SELECT id, first_name, last_name, nick_name, facebook_name, metadata FROM employees WHERE status = 'Active'");
        const employees = empRes.rows;

        console.log('--- Fetching Target Conversations (since 2026-02-01) ---');
        // Using simple JOIN to find conversations that have at least one attributed message OR an assigned employee
        const convRes = await pool.query(`
      SELECT DISTINCT c.id, c.conversation_id, c.assigned_employee_id, c.assigned_agent
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.updated_at >= '2026-02-01'
      AND (c.assigned_employee_id IS NOT NULL OR (m.responder_id IS NOT NULL AND m.from_id = '170707786504'))
    `);

        const conversations = convRes.rows;
        console.log(`Found ${conversations.length} conversations with potential anchors.`);

        let totalUpdated = 0;
        let conversationsProcessed = 0;

        for (const conv of conversations) {
            let anchorId = conv.assigned_employee_id;
            let anchorName = conv.assigned_agent;

            // If no assigned employee, pick the most recent attribution from messages
            if (!anchorId) {
                const lastAttributedRes = await pool.query(`
          SELECT responder_id, from_name FROM messages 
          WHERE conversation_id = $1 
          AND responder_id IS NOT NULL 
          AND from_id = '170707786504'
          ORDER BY created_at DESC LIMIT 1
        `, [conv.id]);

                if (lastAttributedRes.rows.length > 0) {
                    anchorId = lastAttributedRes.rows[0].responder_id;
                    anchorName = lastAttributedRes.rows[0].from_name;
                }
            }

            if (anchorId) {
                // Update all unmapped admin messages in this conversation
                const updateRes = await pool.query(`
          UPDATE messages 
          SET responder_id = $1, from_name = $2
          WHERE conversation_id = $3 
          AND from_id = '170707786504'
          AND responder_id IS NULL
        `, [anchorId, anchorName || 'The V School', conv.id]);

                if (updateRes.rowCount > 0) {
                    totalUpdated += updateRes.rowCount;
                }
                conversationsProcessed++;
            }
        }

        console.log(`--- Result ---`);
        console.log(`Processed ${conversationsProcessed} conversations.`);
        console.log(`Updated ${totalUpdated} messages with heuristic attribution.`);

        // Final Statistics check
        const finalStats = await pool.query("SELECT count(*) as total, count(responder_id) as attributed FROM messages WHERE from_id = '170707786504'");
        console.log(`Final Admin Message Stats: ${finalStats.rows[0].attributed} / ${finalStats.rows[0].total} attributed.`);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
