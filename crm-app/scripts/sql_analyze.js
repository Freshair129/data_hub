
const { Pool } = require('pg');

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        console.log('--- Message Responder Counts ---');
        const res = await pool.query(`
      SELECT e.name, m."responderId", COUNT(m.id) as count
      FROM "Message" m
      LEFT JOIN "Employee" e ON m."responderId" = e.id
      GROUP BY e.name, m."responderId"
      ORDER BY count DESC
    `);
        console.table(res.rows);

        console.log('\n--- Conversation Assigned Employee Counts ---');
        const res2 = await pool.query(`
      SELECT e.name, c."assignedEmployeeId", COUNT(c.id) as count
      FROM "Conversation" c
      LEFT JOIN "Employee" e ON c."assignedEmployeeId" = e.id
      GROUP BY e.name, c."assignedEmployeeId"
      ORDER BY count DESC
    `);
        console.table(res2.rows);

        console.log('\n--- All Employees ---');
        const res3 = await pool.query(`
      SELECT id, name, "employeeId", metadata FROM "Employee"
    `);
        console.table(res3.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

main();
