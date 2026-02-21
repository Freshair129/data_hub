const { Pool } = require('pg');
const DATABASE_URL = "postgresql://postgres.qcxjallsoccqsgmrpqdz:Suanranger1295@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres";
const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
    console.log('--- Direct DB Search ---');
    try {
        // Search in customers table
        const res = await pool.query(`
            SELECT * FROM customers 
            WHERE first_name ILIKE '%กรณัฐฏ์%' 
               OR last_name ILIKE '%กรณัฐฏ์%' 
               OR phone_primary LIKE '%0825525459%'
               OR customer_id ILIKE '%Pk5%'
               OR nick_name ILIKE '%Pk5%'
               OR member_id ILIKE '%Pk5%'
        `);
        
        console.log('Found ' + res.rows.length + ' customers.');
        if (res.rows.length > 0) {
            console.log(JSON.stringify(res.rows, null, 2));
        } else {
            // Try searching in orders or timeline just in case
            console.log('No direct customer matches. Checking timeline/orders...');
            const timelineRes = await pool.query(`
                SELECT * FROM timeline_events 
                WHERE summary ILIKE '%กรณัฐฏ์%' 
                   OR summary LIKE '%0825525459%'
                   OR summary ILIKE '%Pk5%'
                LIMIT 5
            `);
            console.log('Timeline matches:', timelineRes.rows.length);
            if (timelineRes.rows.length > 0) {
                console.log(JSON.stringify(timelineRes.rows, null, 2));
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
        console.log('--- DONE ---');
    }
}
main();
