/**
 * check_message_completeness.js
 *
 * ตรวจสอบว่าแต่ละ conversation ถูกดึงมาตั้งแต่ข้อความแรกหรือไม่
 *
 * Logic:
 *  - NO MESSAGES    : conversation อยู่ใน DB แต่ไม่มี message เลย
 *  - TRUNCATED      : msg_count น้อย (≤5) แต่ conversation เก่ามาก
 *                     วัดจาก last_message_at - MIN(messages.created_at) > threshold
 *                     AND msg_count ≤ 5
 *  - SPARSE         : msg_count 6–15 แต่ span > 30 วัน (อาจ missing บาง page)
 *  - OK             : ที่เหลือ
 *
 * รัน:
 *   node scripts/check_message_completeness.js
 *   node scripts/check_message_completeness.js --verbose
 *   node scripts/check_message_completeness.js --show-breakdown
 *
 * NOTE: ต้องรันบน Mac โดยตรง (ไม่ใช่ใน Claude sandbox)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const args          = process.argv.slice(2);
const VERBOSE       = args.includes('--verbose');
const SHOW_BREAKDOWN = args.includes('--show-breakdown');

// Thresholds
const TRUNCATED_MSG_MAX   = 5;    // <= 5 messages = อาจ truncated
const TRUNCATED_SPAN_DAYS = 7;    // แต่ถ้า span < 7 วัน ก็ปกติ (สั้นจริง)
const SPARSE_MSG_MAX      = 15;
const SPARSE_SPAN_DAYS    = 30;

async function main() {
  console.log('🔍 Checking message completeness...\n');

  // ดึงทุก conversation พร้อม aggregate จาก messages จริง
  const { rows } = await pool.query(`
    SELECT
      c.conversation_id,
      c.participant_name,
      c.last_message_at,
      COUNT(m.id)::int          AS msg_count,
      MIN(m.created_at)         AS oldest_msg_at,
      MAX(m.created_at)         AS newest_msg_at,
      EXTRACT(EPOCH FROM (c.last_message_at - MIN(m.created_at))) / 86400
                                AS span_days_conv_to_oldest
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    GROUP BY c.conversation_id, c.participant_name, c.last_message_at
    ORDER BY c.last_message_at DESC NULLS LAST
  `);

  console.log(`Conversations checked: ${rows.length}\n`);

  const buckets = {
    no_messages: [],
    truncated:   [],
    sparse:      [],
    ok:          [],
  };

  for (const r of rows) {
    const msgCount = r.msg_count;
    const spanDays = r.oldest_msg_at && r.newest_msg_at
      ? (new Date(r.newest_msg_at) - new Date(r.oldest_msg_at)) / 86400000
      : 0;
    // span จาก oldest message ถึง last_message_at ของ conversation (อาจ > span ของ messages ถ้า missing)
    const spanConvDays = parseFloat(r.span_days_conv_to_oldest) || 0;

    if (msgCount === 0) {
      buckets.no_messages.push(r);
    } else if (msgCount <= TRUNCATED_MSG_MAX && spanConvDays > TRUNCATED_SPAN_DAYS) {
      // น้อยกว่า 5 messages แต่ conversation ยาวกว่า 7 วัน → น่าจะ truncated
      buckets.truncated.push({ ...r, msgCount, spanDays, spanConvDays });
    } else if (msgCount <= SPARSE_MSG_MAX && spanConvDays > SPARSE_SPAN_DAYS) {
      // messages น้อยกว่า 15 แต่ span > 30 วัน → อาจ missing บาง page
      buckets.sparse.push({ ...r, msgCount, spanDays, spanConvDays });
    } else {
      buckets.ok.push({ ...r, msgCount, spanDays });
    }
  }

  // ——— SHOW BREAKDOWN ———
  if (SHOW_BREAKDOWN) {
    console.log('📊 Message count distribution:');
    const dist = {};
    for (const r of rows) {
      const bucket = r.msg_count === 0 ? '0'
        : r.msg_count <= 3   ? '1–3'
        : r.msg_count <= 10  ? '4–10'
        : r.msg_count <= 30  ? '11–30'
        : r.msg_count <= 100 ? '31–100'
        : '100+';
      dist[bucket] = (dist[bucket] || 0) + 1;
    }
    for (const [k, v] of Object.entries(dist)) {
      const bar = '█'.repeat(Math.ceil(v / rows.length * 40));
      console.log(`  ${k.padStart(6)} msgs : ${bar} ${v}`);
    }
    console.log();
  }

  // ——— PRINT RESULTS ———
  printBucket('❌ NO MESSAGES — conversation มีอยู่ แต่ไม่มี message เลยใน DB',
    buckets.no_messages, (r) =>
      `  ${fmtName(r)} | last: ${fmtDate(r.last_message_at)}`
  );

  printBucket('🚨 TRUNCATED — น้อยกว่า 5 messages แต่ conversation ยาวกว่า 7 วัน (น่าจะดึงไม่ครบ)',
    buckets.truncated, (r) =>
      `  ${fmtName(r)} | msgs: ${String(r.msgCount).padStart(3)} | oldest: ${fmtDate(r.oldest_msg_at)} | span: ${r.spanConvDays.toFixed(0)}d`
  );

  printBucket('⚠️  SPARSE — messages น้อยกว่า 15 แต่ span > 30 วัน (อาจ missing บาง page)',
    buckets.sparse, (r) =>
      `  ${fmtName(r)} | msgs: ${String(r.msgCount).padStart(3)} | oldest: ${fmtDate(r.oldest_msg_at)} | span: ${r.spanConvDays.toFixed(0)}d`,
    VERBOSE
  );

  printBucket('✅ OK',
    buckets.ok, (r) =>
      `  ${fmtName(r)} | msgs: ${String(r.msgCount).padStart(3)} | span: ${r.spanDays.toFixed(0)}d`,
    false  // ไม่แสดงรายชื่อ OK
  );

  // ——— SUMMARY ———
  const total        = rows.length;
  const problematic  = buckets.no_messages.length + buckets.truncated.length;
  const warning      = buckets.sparse.length;
  const ok           = buckets.ok.length;

  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total           : ${total}`);
  console.log(`✅ OK            : ${ok}  (${pct(ok, total)}%)`);
  console.log(`⚠️  Sparse        : ${warning}  (${pct(warning, total)}%)`);
  console.log(`🚨 Truncated     : ${buckets.truncated.length}  (${pct(buckets.truncated.length, total)}%)`);
  console.log(`❌ No messages   : ${buckets.no_messages.length}  (${pct(buckets.no_messages.length, total)}%)`);
  console.log(`\nCompleteness est.: ${pct(ok + warning, total)}%`);

  if (problematic > 0) {
    console.log('\n💡 Suggestion:');
    if (buckets.no_messages.length > 0) {
      console.log(`   ${buckets.no_messages.length} conversations มี 0 messages → รัน sync_fb_missing_range.js อีกรอบ`);
    }
    if (buckets.truncated.length > 0) {
      console.log(`   ${buckets.truncated.length} conversations น่าจะดึง messages ไม่ครบ → ต้องเพิ่ม pagination ใน sync script`);
    }
  }

  if (!SHOW_BREAKDOWN) {
    console.log('\n💡 ดู distribution เพิ่มเติม: --show-breakdown');
  }
  if (!VERBOSE) {
    console.log('💡 ดูรายละเอียด sparse: --verbose');
  }

  await pool.end();
}

function printBucket(title, items, fmt, show = true) {
  console.log(`\n${title}: ${items.length}`);
  if (!show || items.length === 0) return;
  console.log('─'.repeat(60));
  const slice = items.slice(0, 30);
  slice.forEach(r => console.log(fmt(r)));
  if (items.length > 30) console.log(`  ... and ${items.length - 30} more`);
}

const fmtName = r => (r.participant_name || 'unknown').slice(0, 22).padEnd(22);
const fmtDate = d => d ? new Date(d).toISOString().slice(0, 16) : 'N/A             ';
const pct = (n, t) => t ? ((n / t) * 100).toFixed(1) : '0.0';

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
