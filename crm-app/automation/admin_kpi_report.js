#!/usr/bin/env node
/**
 * Admin KPI Report Generator
 * ──────────────────────────
 * Generates performance reports for admins based on discovered PSIDs.
 * 
 * Usage:
 *   node admin_kpi_report.js --month=2026-02
 *   node admin_kpi_report.js --month=2026-03 --weekly
 */

const pg = require('pg');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const MONTH = args.find(a => a.startsWith('--month='))?.split('=')[1] || '2026-02';
const WEEKLY = args.includes('--weekly');
const DB_URL = 'postgresql://postgres:password123@localhost:5432/vschool_crm';

async function generateReport() {
    console.log(`\n📊 Admin KPI Report — ${MONTH} ${WEEKLY ? '(Weekly)' : '(Monthly)'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const pool = new pg.Pool({ connectionString: DB_URL });
    try {
        // 1. Get all employees with facebook_id
        const empResult = await pool.query(`
            SELECT id, employee_id, first_name, nick_name, facebook_id 
            FROM employees 
            WHERE status = 'Active' AND (facebook_id IS NOT NULL OR role = 'Agent')
        `);
        const employees = empResult.rows;

        const [year, month] = MONTH.split('-');
        const startDate = `${year}-${month}-01`;
        const endDate = new Date(parseInt(year), parseInt(month), 1).toISOString().slice(0, 10);

        console.log(`📅 Period: ${startDate} to ${endDate}\n`);

        const reports = [];

        for (const emp of employees) {
            // Metrics Query
            const metricsQuery = `
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(DISTINCT conversation_id) as conversations_handled,
                    COUNT(DISTINCT DATE(created_at)) as active_days
                FROM messages
                WHERE (responder_id = $1 OR (from_id = $2 AND from_id IS NOT NULL))
                  AND created_at >= $3 AND created_at < $4
            `;
            const mRes = await pool.query(metricsQuery, [emp.id, emp.facebook_id, startDate, endDate]);
            const stats = mRes.rows[0];

            if (parseInt(stats.total_messages) === 0) continue;

            // Average Response Time Query (Simple version)
            // Time between a customer message and the next admin message in the same conversation
            const rtQuery = `
                WITH msg_pairs AS (
                    SELECT 
                        m1.conversation_id,
                        m1.created_at as customer_time,
                        MIN(m2.created_at) as admin_time
                    FROM messages m1
                    JOIN messages m2 ON m1.conversation_id = m2.conversation_id 
                        AND m2.created_at > m1.created_at
                    JOIN conversations c ON m1.conversation_id = c.id
                    WHERE m1.from_id = c.participant_id -- From Customer
                      AND (m2.responder_id = $1 OR m2.from_id = $2) -- To Admin
                      AND m1.created_at >= $3 AND m1.created_at < $4
                    GROUP BY m1.id, m1.conversation_id, m1.created_at
                )
                SELECT AVG(EXTRACT(EPOCH FROM (admin_time - customer_time))) / 60 as avg_rt_minutes
                FROM msg_pairs
            `;
            const rtRes = await pool.query(rtQuery, [emp.id, emp.facebook_id, startDate, endDate]);
            const avgRt = parseFloat(rtRes.rows[0]?.avg_rt_minutes || 0).toFixed(1);

            reports.push({
                name: emp.nick_name || emp.first_name,
                id: emp.employee_id,
                psid: emp.facebook_id || 'Not Mapped',
                messages: stats.total_messages,
                convs: stats.conversations_handled,
                days: stats.active_days,
                avgRt: `${avgRt} min`
            });
        }

        // Output Table
        console.table(reports);

        // Save to Markdown
        const reportPath = path.join(__dirname, 'logs', `kpi_report_${MONTH}.md`);
        let md = `# Admin KPI Report - ${MONTH}\n\n`;
        md += `| Admin | ID | PSID | Messages | Convs | Days | Avg RT |\n`;
        md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
        for (const r of reports) {
            md += `| ${r.name} | ${r.id} | \`${r.psid}\` | ${r.messages} | ${r.convs} | ${r.days} | ${r.avgRt} |\n`;
        }

        fs.writeFileSync(reportPath, md);
        console.log(`\n✅ Report saved to: ${reportPath}`);

    } catch (e) {
        console.error(`❌ Error generating report: ${e.message}`);
    } finally {
        await pool.end();
    }
}

generateReport();
