
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    const admins = [
        { id: 'cmlwnuhfa0001bzm6c2tr5ic0', name: 'พี่อ้อย' },
        { id: 'cmlwnuh3j0000bzm6rnhgeodw', name: 'พี่ผึ้ง' }
    ];

    const results = {};

    try {
        for (const admin of admins) {
            const stats = await pool.query("SELECT count(*) as total_msgs, count(DISTINCT conversation_id) as total_convs FROM messages WHERE responder_id = $1", [admin.id]);
            const orders = await pool.query("SELECT count(*) as total_orders, COALESCE(sum(total_amount), 0) as total_revenue FROM orders WHERE closed_by_id = $1", [admin.id]);

            const responseTimes = await pool.query(`
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
      `, [admin.id]);

            results[admin.name] = {
                msgs: stats.rows[0].total_msgs,
                convs: stats.rows[0].total_convs,
                orders: orders.rows[0].total_orders,
                revenue: orders.rows[0].total_revenue,
                avg_resp: responseTimes.rows[0].avg_resp_sec
            };
        }
        console.log(JSON.stringify(results, null, 2));
    } finally {
        await pool.end();
    }
}

main().catch(console.error);
