const { Pool } = require('pg');
const DATABASE_URL = "postgresql://postgres.qcxjallsoccqsgmrpqdz:Suanranger1295@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
    console.log('--- Verifying Attachment ID Storage ---');
    try {
        const total = await pool.query('SELECT COUNT(*) FROM messages');
        console.log('Total messages:', total.rows[0].count);
        
        const attachCount = await pool.query('SELECT COUNT(*) FROM messages WHERE has_attachment = true');
        console.log('Messages with has_attachment=true:', attachCount.rows[0].count);

        const idCount = await pool.query('SELECT COUNT(*) FROM messages WHERE attachment_id IS NOT NULL');
        console.log('Messages with attachment_id NOT NULL:', idCount.rows[0].count);

        const res = await pool.query('SELECT message_id, attachment_id, has_attachment FROM messages WHERE has_attachment = true AND attachment_id IS NOT NULL LIMIT 10');
        console.log('Found ' + res.rows.length + ' sample records.');
        res.rows.forEach(r => {
            console.log(`Message: ${r.message_id} | Attachment ID: ${r.attachment_id}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}
main();
