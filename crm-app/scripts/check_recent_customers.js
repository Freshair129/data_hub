const { Pool } = require('pg');
const DATABASE_URL = "postgresql://postgres.qcxjallsoccqsgmrpqdz:Suanranger1295@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
    console.log('--- Recent Customers ---');
    try {
        const res = await pool.query('SELECT * FROM customers ORDER BY created_at DESC LIMIT 20');
        console.log('Total customers in table: ' + (await pool.query('SELECT COUNT(*) FROM customers')).rows[0].count);
        console.log(JSON.stringify(res.rows.map(r => ({
            id: r.id,
            customerId: r.customer_id,
            name: r.first_name + ' ' + r.last_name,
            phone: r.phone_primary,
            nick: r.nick_name,
            created: r.created_at
        })), null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}
main();
