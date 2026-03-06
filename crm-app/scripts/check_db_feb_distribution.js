/**
 * check_db_feb_distribution.js
 * ─────────────────────────────────────────────────────────────
 * แสดง distribution ของ Conversation.lastMessageAt รายวัน
 * เพื่อเช็คว่า DB มีข้อมูลครบหรือไม่
 *
 * Usage:  cd crm-app && node scripts/check_db_feb_distribution.js
 * ─────────────────────────────────────────────────────────────
 */

const dotenv = require('dotenv');
const path = require('path');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

async function main() {
    const pool = new Pool({ connectionString: DATABASE_URL });

    try {
        console.log('\n📊 Conversation distribution by day (DB)\n');

        // Count by date
        const { rows } = await pool.query(`
            SELECT
                DATE(last_message_at AT TIME ZONE 'Asia/Bangkok') AS day,
                COUNT(*) AS count
            FROM conversations
            WHERE last_message_at >= '2026-01-01'
              AND last_message_at <= NOW()
            GROUP BY 1
            ORDER BY 1
        `);

        const maxCount = Math.max(...rows.map(r => parseInt(r.count)));

        for (const row of rows) {
            const count = parseInt(row.count);
            const bar = '█'.repeat(Math.round((count / maxCount) * 35));
            const peak = count === maxCount ? ' ◄ PEAK' : '';
            console.log(`  ${row.day.toISOString().slice(0,10)}: ${String(count).padStart(3)}  ${bar}${peak}`);
        }

        const total = rows.reduce((s, r) => s + parseInt(r.count), 0);
        console.log(`\n  TOTAL: ${total} conversations (since 2026-01-01)`);

        // Specific Feb check
        const febRows = rows.filter(r => r.day.toISOString().slice(0,7) === '2026-02');
        const febTotal = febRows.reduce((s, r) => s + parseInt(r.count), 0);
        console.log(`  February 2026: ${febTotal} conversations`);

        // Check gap
        const febDays = febRows.map(r => r.day.toISOString().slice(0,10));
        const missingDays = [];
        for (let d = 1; d <= 28; d++) {
            const dateStr = `2026-02-${String(d).padStart(2,'0')}`;
            if (!febDays.includes(dateStr)) missingDays.push(dateStr);
        }
        if (missingDays.length > 0) {
            console.log(`\n  ⚠️  Missing days in Feb: ${missingDays.join(', ')}`);
        } else {
            console.log('\n  ✅ No missing days in February');
        }

    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('❌ Error:', err.message || err);
    console.error('Stack:', err.stack);
    console.error('Code:', err.code);
    process.exit(1);
});
