
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    const admin = { id: 'cmlvsl5290002yxm60cqxad2i', name: 'Fah' };

    console.log(`\nDetailed Search for: ${admin.name}`);

    const sampleRes = await pool.query(`
    SELECT m.content, m.created_at, m.conversation_id,
           (SELECT content FROM messages WHERE conversation_id = m.conversation_id AND created_at < m.created_at ORDER BY created_at DESC LIMIT 1) as prev_customer_msg
    FROM messages m
    WHERE m.responder_id = $1
    ORDER BY m.created_at DESC
    LIMIT 15
  `, [admin.id]);

    sampleRes.rows.forEach((row, i) => {
        console.log(`\n--- Sample ${i + 1} ---`);
        console.log(`Time: ${row.created_at.toLocaleString('th-TH')}`);
        console.log(`Customer: ${row.prev_customer_msg || '(First)'}`);
        console.log(`${admin.name}: ${row.content}`);
    });

    await pool.end();
}

main().catch(console.error);
