import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// โหลด sync cache
const cachePath = path.join(__dirname, 'cache', 'synced_threads.json');
const cache = fs.existsSync(cachePath)
  ? JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  : {};

const cacheIds = Object.keys(cache);
console.log('Cache IDs count  :', cacheIds.length);
console.log('Sample cache IDs :', cacheIds.slice(0, 3));

// ดึง sample จาก DB
const { rows: sample } = await pool.query(
  'SELECT conversation_id FROM conversations ORDER BY last_message_at DESC LIMIT 5'
);
console.log('\nSample DB conv IDs:', sample.map(r => r.conversation_id));

// เช็ค format — DB ใช้ t_XXXXX, cache ใช้ XXXXX หรือเปล่า
const dbIds = (await pool.query('SELECT conversation_id FROM conversations')).rows
  .map(r => r.conversation_id);

let exactMatch = 0;
let withPrefix = 0;  // cache = XXXXX, DB = t_XXXXX
let noMatch    = 0;

for (const id of cacheIds) {
  if (dbIds.includes(id)) {
    exactMatch++;
  } else if (dbIds.includes('t_' + id)) {
    withPrefix++;
  } else {
    noMatch++;
  }
}

console.log('\n── Format check ──────────────────');
console.log('Exact match (same format) :', exactMatch);
console.log('Match with t_ prefix      :', withPrefix, '← cache ขาด t_');
console.log('No match at all           :', noMatch);

if (withPrefix > 0) {
  console.log('\n⚠️  sync_agents_v2.js ส่ง threadID ไม่มี t_ แต่ DB เก็บ t_XXXXX');
  console.log('   API endpoint ต้องแปลง conversationId ก่อน match');
}
if (exactMatch > 0) {
  console.log('\n✅ Format ตรงกัน — ส่งได้ตรง');
}

await pool.end();
