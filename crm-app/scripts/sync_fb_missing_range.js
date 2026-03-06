/**
 * sync_fb_missing_range.js
 * ─────────────────────────────────────────────────────────────
 * ดึง conversations จาก Facebook API ที่หายไปช่วง Feb 20-25
 * แล้ว save ลง DB + JSON cache
 *
 * Usage:
 *   cd crm-app
 *   node scripts/sync_fb_missing_range.js
 *   node scripts/sync_fb_missing_range.js --from 2026-02-20 --to 2026-02-26
 *   node scripts/sync_fb_missing_range.js --dry-run
 * ─────────────────────────────────────────────────────────────
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const CACHE_ROOT = path.join(__dirname, '../cache/customer');

if (!FB_PAGE_ACCESS_TOKEN || !FB_PAGE_ID) {
    console.error('❌ FB_PAGE_ACCESS_TOKEN หรือ FB_PAGE_ID ไม่ได้ตั้งค่าใน .env');
    process.exit(1);
}
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL ไม่ได้ตั้งค่าใน .env');
    process.exit(1);
}

// ─── CLI Args ────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const fromIdx = args.indexOf('--from');
const toIdx   = args.indexOf('--to');

// Default range: Feb 20-26 (ช่วงที่ missing ตาม DB check)
const FROM_DATE = new Date(fromIdx !== -1 ? args[fromIdx + 1] : '2026-02-20T00:00:00+07:00');
const TO_DATE   = new Date(toIdx   !== -1 ? args[toIdx + 1]   : '2026-02-26T23:59:59+07:00');

// ─── Helpers ─────────────────────────────────────────────────
function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJSON(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function fbGet(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`FB API: ${data.error.message} (code ${data.error.code})`);
    return data;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
    console.log('\n🚀 sync_fb_missing_range.js');
    console.log('━'.repeat(55));
    console.log(`📅 Range: ${FROM_DATE.toISOString().slice(0,10)} → ${TO_DATE.toISOString().slice(0,10)}`);
    if (dryRun) console.log('🔍 DRY RUN — ไม่บันทึกจริง\n');

    const pool = new Pool({ connectionString: DATABASE_URL });

    let pageUrl = `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/conversations` +
        `?fields=id,updated_time,participants` +
        `&limit=100&access_token=${FB_PAGE_ACCESS_TOKEN}`;

    let totalScanned = 0;
    let inRange = 0;
    let saved = 0;
    let errors = 0;
    let stopPaging = false;

    console.log('🔍 Scanning Facebook conversations...\n');

    while (pageUrl && !stopPaging) {
        const page = await fbGet(pageUrl);
        const convs = page.data || [];

        for (const conv of convs) {
            const updatedAt = new Date(conv.updated_time);
            totalScanned++;

            // ถ้าผ่าน range แล้ว หยุด pagination
            if (updatedAt < FROM_DATE) {
                stopPaging = true;
                break;
            }

            // ถ้าเกิน TO_DATE ข้ามไปก่อน (ยังอยู่ใน page ที่ต้อง scan)
            if (updatedAt > TO_DATE) continue;

            inRange++;
            const fbConvId = conv.id; // เช่น "t_10163762743139256"
            const participant = conv.participants?.data?.find(p => p.id !== FB_PAGE_ID);
            const psid = participant?.id || fbConvId.replace('t_', '');
            const participantName = participant?.name || null;

            process.stdout.write(`  [${inRange}] ${fbConvId}  ${participantName || psid}  (${updatedAt.toISOString().slice(0,10)})\n`);

            if (dryRun) continue;

            try {
                // ── ดึง messages ──────────────────────────────
                const msgUrl = `https://graph.facebook.com/v19.0/${fbConvId}` +
                    `?fields=messages.limit(100){id,message,from,created_time,attachments{id,mime_type,name,file_url,image_data,url}}` +
                    `&access_token=${FB_PAGE_ACCESS_TOKEN}`;
                const msgData = await fbGet(msgUrl);
                const fbMessages = msgData.messages?.data || [];

                // ── Upsert Conversation ใน DB ─────────────────
                const convResult = await pool.query(`
                    INSERT INTO conversations
                        (id, conversation_id, channel, participant_name, participant_id,
                         last_message_at, created_at, updated_at)
                    VALUES
                        (gen_random_uuid(), $1, 'facebook', $2, $3, $4, NOW(), NOW())
                    ON CONFLICT (conversation_id) DO UPDATE SET
                        participant_name = COALESCE(EXCLUDED.participant_name, conversations.participant_name),
                        participant_id   = COALESCE(EXCLUDED.participant_id, conversations.participant_id),
                        last_message_at  = GREATEST(EXCLUDED.last_message_at, conversations.last_message_at),
                        updated_at       = NOW()
                    RETURNING id, conversation_id
                `, [fbConvId, participantName, psid, updatedAt]);

                const dbConvId = convResult.rows[0].id;

                // ── Upsert Messages ───────────────────────────
                for (const msg of fbMessages.reverse()) { // oldest first
                    const fromId = msg.from?.id;
                    const fromName = msg.from?.name;
                    const content = msg.message || '';
                    const msgCreatedAt = new Date(msg.created_time);
                    const hasAttach = !!(msg.attachments?.data?.length);
                    const attachType = msg.attachments?.data?.[0]?.mime_type || null;
                    const attachUrl  = msg.attachments?.data?.[0]?.file_url ||
                                       msg.attachments?.data?.[0]?.image_data?.url || null;

                    await pool.query(`
                        INSERT INTO messages
                            (id, message_id, conversation_id, from_name, from_id,
                             content, has_attachment, attachment_type, attachment_url, created_at)
                        VALUES
                            (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (message_id) DO NOTHING
                    `, [msg.id, dbConvId, fromName, fromId, content,
                        hasAttach, attachType, attachUrl, msgCreatedAt]);
                }

                // ── Write JSON cache ──────────────────────────
                // ใช้ customer_id จาก DB ถ้ามี
                const custResult = await pool.query(
                    `SELECT c.customer_id FROM customers c
                     JOIN conversations cv ON cv.customer_id = c.id
                     WHERE cv.id = $1 LIMIT 1`,
                    [dbConvId]
                );
                const cacheKey = custResult.rows[0]?.customer_id || `FB_CHAT_${psid}`;
                const chatPath = path.join(CACHE_ROOT, cacheKey, 'chathistory', `${fbConvId}.json`);

                // Build messages for cache
                const cacheMessages = fbMessages.reverse().map(msg => ({
                    messageId: msg.id,
                    fromName: msg.from?.name || null,
                    fromId: msg.from?.id || null,
                    content: msg.message || '',
                    hasAttachment: !!(msg.attachments?.data?.length),
                    attachmentType: msg.attachments?.data?.[0]?.mime_type || null,
                    attachmentUrl: msg.attachments?.data?.[0]?.file_url ||
                                   msg.attachments?.data?.[0]?.image_data?.url || null,
                    createdAt: new Date(msg.created_time).toISOString(),
                }));

                writeJSON(chatPath, {
                    _cachedAt: new Date().toISOString(),
                    _source: 'fb_sync',
                    conversationId: fbConvId,
                    participantName,
                    participantId: psid,
                    lastMessageAt: updatedAt.toISOString(),
                    messages: cacheMessages,
                });

                saved++;
                await sleep(150); // rate limit safety

            } catch (err) {
                errors++;
                console.error(`  ❌ ${fbConvId}: ${err.message}`);
            }
        }

        // Next page
        pageUrl = stopPaging ? null : (page.paging?.next || null);
        if (!stopPaging && pageUrl) {
            process.stdout.write(`  ... page scanned (${totalScanned} total so far)\n`);
            await sleep(300);
        }
    }

    // ── Summary ───────────────────────────────────────────────
    console.log('\n' + '━'.repeat(55));
    console.log('📊 SUMMARY');
    console.log(`  Scanned from FB:      ${totalScanned}`);
    console.log(`  In Feb 20-26 range:   ${inRange}`);
    console.log(`  Saved to DB + cache:  ${saved}`);
    console.log(`  Errors:               ${errors}`);
    console.log('━'.repeat(55));

    if (!dryRun && saved > 0) {
        console.log('\n✅ Done! รัน check_db_feb_distribution.js อีกครั้งเพื่อยืนยัน\n');
    } else if (dryRun) {
        console.log(`\n🔍 Dry run เสร็จ — มี ${inRange} conversations ในช่วงนี้`);
        console.log('   รัน node scripts/sync_fb_missing_range.js เพื่อ save จริง\n');
    }

    await pool.end();
}

main().catch(err => {
    console.error('\n❌ Fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
});
