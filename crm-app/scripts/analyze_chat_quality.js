
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    const admins = [
        { id: 'cmlvsl5290002yxm60cqxad2i', name: 'Fah' },
        { id: 'cmlwnuhfa0001bzm6c2tr5ic0', name: 'พี่อ้อย' }
    ];

    for (const admin of admins) {
        console.log('\n' + '='.repeat(40));
        console.log(`Summary Statistics for: ${admin.name}`);
        console.log('='.repeat(40));

        // Get total messages and average message length
        const statsRes = await pool.query(`
      SELECT 
        COUNT(*) as total_msgs,
        AVG(LENGTH(content)) as avg_length
      FROM messages 
      WHERE responder_id = $1
    `, [admin.id]);

        console.log(`Total Messages: ${statsRes.rows[0].total_msgs}`);
        console.log(`Avg Message Length: ${Math.round(statsRes.rows[0].avg_length)} characters`);

        // Get sample of conversations with context
        const sampleRes = await pool.query(`
      SELECT m.id, m.content, m.created_at, m.conversation_id,
             (SELECT content FROM messages WHERE conversation_id = m.conversation_id AND created_at < m.created_at ORDER BY created_at DESC LIMIT 1) as prev_customer_msg
      FROM messages m
      WHERE m.responder_id = $1
      ORDER BY m.created_at DESC
      LIMIT 15
    `, [admin.id]);

        console.log('\nSample Content:');
        sampleRes.rows.forEach((row, i) => {
            console.log(`\n--- Sample ${i + 1} ---`);
            console.log(`Time: ${row.created_at.toLocaleString('th-TH')}`);
            console.log(`Customer: ${row.prev_customer_msg || '(First Message/Auto-reply)'}`);
            console.log(`${admin.name}: ${row.content}`);
        });
    }

    await pool.end();
}

main().catch(console.error);
