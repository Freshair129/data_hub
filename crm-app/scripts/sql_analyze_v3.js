
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function main() {
    const connectionString = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
    const pool = new Pool({ connectionString });

    try {
        console.log('--- Message Responder Counts ---');
        const res = await pool.query(`
      SELECT e.name as employee_name, m."responderId", COUNT(m.id) as count
      FROM "messages" m
      LEFT JOIN "employees" e ON m."responderId" = e.id
      WHERE m."responderId" IS NOT NULL
      GROUP BY e.name, m."responderId"
      ORDER BY count DESC
    `);
        console.table(res.rows);

        console.log('\n--- Conversation Assigned Employee Counts ---');
        const res2 = await pool.query(`
      SELECT e.name as employee_name, c."assignedEmployeeId", COUNT(c.id) as count
      FROM "conversations" c
      LEFT JOIN "employees" e ON c."assignedEmployeeId" = e.id
      WHERE c."assignedEmployeeId" IS NOT NULL
      GROUP BY e.name, c."assignedEmployeeId"
      ORDER BY count DESC
    `);
        console.table(res2.rows);

        console.log('\n--- All Employees ---');
        const res3 = await pool.query(`
      SELECT id, name, "employeeId", metadata FROM "employees"
    `);
        console.table(res3.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
