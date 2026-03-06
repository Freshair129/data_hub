
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    const admins = [
        { id: 'cmlvsl5290002yxm60cqxad2i', name: 'Fah' },
        { id: 'cmlwnuhfa0001bzm6c2tr5ic0', name: 'พี่อ้อย' },
        { id: 'cmlwnuh3j0000bzm6rnhgeodw', name: 'พี่ผึ้ง' }
    ];

    for (const admin of admins) {
        console.log(`\n--- Analysis for ${admin.name} ---`);

        // Get last 15 messages
        const msgsRes = await pool.query(`
      SELECT id, content, created_at, conversation_id 
      FROM messages 
      WHERE responder_id = $1 
      ORDER BY created_at DESC 
      LIMIT 15
    `, [admin.id]);

        for (const msg of msgsRes.rows) {
            // Get previous message for context
            const contextRes = await pool.query(`
        SELECT content FROM messages 
        WHERE conversation_id = $1 AND created_at < $2 
        ORDER BY created_at DESC LIMIT 1
      `, [msg.conversation_id, msg.created_at]);

            const prev = contextRes.rows[0]?.content || '(No context)';
            console.log(`\nTime: ${msg.created_at.toLocaleString('th-TH')}`);
            console.log(`Customer: ${prev}`);
            console.log(`${admin.name}: ${msg.content}`);
        }
    }

    await pool.end();
}

main().catch(console.error);
