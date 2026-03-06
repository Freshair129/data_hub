/**
 * backfill_agents_from_messages.js
 *
 * ดึงชื่อ agent จาก system messages ใน DB แล้ว update conversations.assigned_agent
 *
 * Patterns ที่ใช้:
 *   - "ระบบมอบหมายแชทนี้ให้กับ [ชื่อ] ผ่านระบบอัตโนมัติ"  (157 records)
 *   - "กำหนดการสนทนานี้ให้กับ [ชื่อ]"                      (91 records)
 *   - "assigned this conversation to [name]"               (fallback)
 *
 * Logic:
 *   1. หา messages ที่มี pattern ข้างบน
 *   2. Extract ชื่อ agent
 *   3. Map ชื่อ → Employee.id (ถ้าเจอ)
 *   4. Update conversations.assigned_agent และ assigned_employee_id
 *   5. ถ้า conversation มีหลาย assignment → ใช้อันล่าสุด (newest created_at)
 *
 * รัน:
 *   node scripts/backfill_agents_from_messages.js
 *   node scripts/backfill_agents_from_messages.js --dry-run
 *   node scripts/backfill_agents_from_messages.js --force   (overwrite existing assignments)
 *
 * NOTE: รันบน Mac โดยตรง
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE   = args.includes('--force');

// ─── Regex patterns ──────────────────────────────────────────────────────────
// ใช้เฉพาะ manual assignment เท่านั้น
// ตัด "ระบบมอบหมายแชทนี้ให้กับ" ออก เพราะเป็น auto-assign ที่มั่ว ใช้ไม่ได้
const PATTERNS = [
  // Thai manual: "กำหนดการสนทนานี้ให้กับ [ชื่อ]"
  /กำหนดการสนทนานี้ให้กับ\s+(.+?)(?:\s*$|\n)/,
  // English: "assigned this conversation to [name]"
  /assigned this conversation to\s+(.+?)(?:\s*$|\n)/i,
];

// ชื่อที่ไม่ใช่ agent จริง — ตัดออกจาก attribution
const EXCLUDED_NAMES = [
  'กระต่าย ตำยา',       // ไม่ใช่ staff
  'พรพล ธนสุวรรณธาร',   // developer/owner ไม่ใช่ agent
];

function extractAgentName(content) {
  if (!content) return null;
  for (const pattern of PATTERNS) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim().replace(/\s+/g, ' ');
      if (EXCLUDED_NAMES.includes(name)) return null;
      return name;
    }
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔄 backfill_agents_from_messages.js');
  console.log('━'.repeat(55));
  if (DRY_RUN) console.log('🔍 DRY RUN — ไม่มีการแก้ไข DB จริง\n');

  // 1. Load all employees for name matching
  const { rows: employees } = await pool.query(`
    SELECT id, first_name, last_name,
           metadata->>'aliases' AS aliases,
           metadata->>'facebookName' AS facebook_name,
           metadata->>'nickName' AS nick_name
    FROM employees
  `);
  console.log(`👥 Employees loaded: ${employees.length}`);

  // Build name → employee_id map (case-insensitive partial match)
  function findEmployee(name) {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    for (const e of employees) {
      const candidates = [
        e.first_name,
        e.last_name,
        e.facebook_name,
        e.nick_name,
        `${e.first_name} ${e.last_name}`,
      ];
      // Also check aliases array
      try {
        const aliases = e.aliases ? JSON.parse(e.aliases) : [];
        candidates.push(...aliases);
      } catch {}

      for (const c of candidates) {
        if (!c) continue;
        if (c.toLowerCase().trim() === n) return e.id;
        if (n.includes(c.toLowerCase().trim()) && c.length > 3) return e.id;
        if (c.toLowerCase().trim().includes(n) && n.length > 3) return e.id;
      }
    }
    return null;
  }

  // 2. Find all assignment messages
  const { rows: assignMsgs } = await pool.query(`
    SELECT
      m.conversation_id   AS conv_internal_id,
      m.content,
      m.created_at,
      c.id                AS conv_id,
      c.assigned_agent    AS current_agent
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE
      m.content ILIKE '%กำหนดการสนทนานี้ให้กับ%'
      OR m.content ILIKE '%assigned this conversation to%'
    ORDER BY m.created_at ASC
  `);

  console.log(`📨 Assignment messages found: ${assignMsgs.length}\n`);

  // 3. Build latest-assignment map per conversation
  // key: conv_id → { agentName, employeeId, msgTime }
  const convMap = new Map();

  for (const msg of assignMsgs) {
    const agentName = extractAgentName(msg.content);
    if (!agentName) continue;

    const existing = convMap.get(msg.conv_id);
    // Keep latest assignment
    if (!existing || new Date(msg.created_at) > new Date(existing.msgTime)) {
      convMap.set(msg.conv_id, {
        agentName,
        employeeId: findEmployee(agentName),
        msgTime: msg.created_at,
        currentAgent: msg.current_agent,
      });
    }
  }

  console.log(`🎯 Unique conversations with agent: ${convMap.size}`);

  // 4. Stats
  const alreadySet    = [...convMap.values()].filter(v => v.currentAgent && v.currentAgent !== 'Unassigned').length;
  const willUpdate    = FORCE
    ? convMap.size
    : [...convMap.values()].filter(v => !v.currentAgent || v.currentAgent === 'Unassigned').length;
  const withEmployee  = [...convMap.values()].filter(v => v.employeeId).length;

  console.log(`✅ Already has agent: ${alreadySet}`);
  console.log(`🔄 Will update: ${willUpdate}`);
  console.log(`🔗 Matched to Employee record: ${withEmployee}/${convMap.size}\n`);

  // 5. Show agent name distribution
  const nameCounts = {};
  for (const v of convMap.values()) {
    nameCounts[v.agentName] = (nameCounts[v.agentName] || 0) + 1;
  }
  console.log('Agent distribution:');
  Object.entries(nameCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
      const empId = findEmployee(name);
      const matched = empId ? '✅' : '❓';
      console.log(`  ${matched} ${name.padEnd(35)} → ${count} conversations`);
    });

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN complete — ไม่มีการแก้ไข DB');
    await pool.end();
    return;
  }

  // 6. Update DB
  console.log('\n📝 Updating conversations...');
  let updated = 0, skipped = 0;

  for (const [convId, info] of convMap.entries()) {
    const hasAgent = info.currentAgent && info.currentAgent !== 'Unassigned';
    if (hasAgent && !FORCE) {
      skipped++;
      continue;
    }

    await pool.query(`
      UPDATE conversations
      SET
        assigned_agent       = $1,
        assigned_employee_id = COALESCE($2, assigned_employee_id),
        updated_at           = NOW()
      WHERE id = $3
    `, [info.agentName, info.employeeId, convId]);

    updated++;
  }

  console.log(`✅ Updated: ${updated}`);
  console.log(`⏭  Skipped (already set): ${skipped}`);

  // 7. Final count
  const { rows: [final] } = await pool.query(`
    SELECT COUNT(*) FROM conversations
    WHERE assigned_agent IS NOT NULL AND assigned_agent != 'Unassigned'
  `);
  console.log(`\n📊 Conversations with agent (after): ${final.count}`);

  await pool.end();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
