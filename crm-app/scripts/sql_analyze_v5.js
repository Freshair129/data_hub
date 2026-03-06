
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Message Responder Counts ---');
        const res = await pool.query(`
      SELECT e.first_name, e.last_name, e.nick_name, m.responder_id, COUNT(m.id) as count
      FROM messages m
      JOIN employees e ON m.responder_id = e.id
      GROUP BY e.first_name, e.last_name, e.nick_name, m.responder_id
      ORDER BY count DESC
    `);
        console.table(res.rows);

        console.log('\n--- All Employees ---');
        const res3 = await pool.query(`
      SELECT id, first_name, last_name, nick_name, employee_id, metadata FROM employees
    `);
        console.table(res3.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
