
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        // Get all employees who have responded to messages
        const employeesRes = await pool.query(`
      SELECT DISTINCT e.id, e.nick_name 
      FROM employees e
      JOIN messages m ON e.id = m.responder_id
    `);

        const dashboard = [];

        for (const emp of employeesRes.rows) {
            const stats = await pool.query("SELECT count(*) as total_msgs FROM messages WHERE responder_id = $1", [emp.id]);
            const convs = await pool.query("SELECT count(DISTINCT conversation_id) as total_convs FROM messages WHERE responder_id = $1", [emp.id]);
            const orders = await pool.query("SELECT count(*) as total_orders, COALESCE(sum(total_amount), 0) as total_revenue FROM orders WHERE closed_by_id = $1", [emp.id]);

            const respTime = await pool.query(`
        WITH msg_pairs AS (
          SELECT m.conversation_id, m.created_at,
                 lag(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as prev_msg_at,
                 m.from_id, lag(m.from_id) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at) as prev_from_id
          FROM messages m
          WHERE m.conversation_id IN (SELECT DISTINCT conversation_id FROM messages WHERE responder_id = $1)
        )
        SELECT AVG(EXTRACT(EPOCH FROM (created_at - prev_msg_at))) as avg_resp_sec
        FROM msg_pairs
        WHERE from_id = '170707786504' AND prev_from_id != '170707786504'
      `, [emp.id]);

            dashboard.push({
                nick_name: emp.nick_name,
                msgs: parseInt(stats.rows[0].total_msgs),
                convs: parseInt(convs.rows[0].total_convs),
                orders: parseInt(orders.rows[0].total_orders),
                revenue: parseFloat(orders.rows[0].total_revenue),
                avg_resp_min: respTime.rows[0].avg_resp_sec ? Math.round(respTime.rows[0].avg_resp_sec / 60) : 0
            });
        }

        // Sort by message volume
        dashboard.sort((a, b) => b.msgs - a.msgs);
        console.log(JSON.stringify(dashboard, null, 2));

    } finally {
        await pool.end();
    }
}

main().catch(console.error);
