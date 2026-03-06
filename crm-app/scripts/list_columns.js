
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees'
    `);
        console.log('--- Columns in employees Table ---');
        console.table(res.rows);

        const res2 = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'messages'
    `);
        console.log('--- Columns in messages Table ---');
        console.table(res2.rows);

        const res3 = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'conversations'
    `);
        console.log('--- Columns in conversations Table ---');
        console.table(res3.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
