
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Message Responder Counts ---');
        const res = await pool.query(`
      SELECT e.name as employee_name, m.responder_id, COUNT(m.id) as count
      FROM messages m
      LEFT JOIN employees e ON m.responder_id = e.id
      WHERE m.responder_id IS NOT NULL
      GROUP BY e.name, m.responder_id
      ORDER BY count DESC
    `);
        console.table(res.rows);

        console.log('\n--- Conversation Assigned Employee Counts ---');
        const res2 = await pool.query(`
      SELECT e.name as employee_name, c.assigned_employee_id, COUNT(c.id) as count
      FROM conversations c
      LEFT JOIN employees e ON c.assigned_employee_id = e.id
      WHERE c.assigned_employee_id IS NOT NULL
      GROUP BY e.name, c.assigned_employee_id
      ORDER BY count DESC
    `);
        console.table(res2.rows);

        console.log('\n--- All Employees ---');
        const res3 = await pool.query(`
      SELECT id, name, employee_id, metadata FROM employees
    `);
        console.table(res3.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
