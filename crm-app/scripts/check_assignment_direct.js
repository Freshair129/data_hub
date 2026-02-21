const { Pool } = require('pg');
const DATABASE_URL = "postgresql://postgres.qcxjallsoccqsgmrpqdz:Suanranger1295@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
    const convId = 't_10159997649326505';
    const pageId = '170707786504';
    
    console.log('--- DB Direct Query ---');
    try {
        const convRes = await pool.query('SELECT * FROM conversations WHERE conversation_id = $1', [convId]);
        if (convRes.rows.length === 0) {
            console.log('Conversation not found.');
        } else {
            const conv = convRes.rows[0];
            console.log('Conversation:', JSON.stringify(conv, null, 2));

            const msgRes = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20', [conv.id]);
            console.log('\nRecent Messages:');
            msgRes.rows.forEach(m => {
                const isPage = m.from_id === pageId;
                const attr = isPage ? '(Page)' : (m.from_id === conv.participant_id ? '(Customer)' : '(ADMIN ID: ' + m.from_id + ')');
                console.log(`[${m.created_at.toISOString()}] ${m.from_name} (${m.from_id}): ${m.content ? m.content.substring(0, 30) : '(Att)'} ${attr}`);
            });
        }
    } catch (e) {
        console.error('Query Error:', e.message);
    } finally {
        await pool.end();
        console.log('--- END ---');
    }
}
main();
