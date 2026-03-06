
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        const res = await pool.query(`
      SELECT from_name, COUNT(*) as count
      FROM messages
      WHERE from_name IS NOT NULL
      GROUP BY from_name
      ORDER BY count DESC
      LIMIT 50
    `);
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
