/**
 * rebuild_cache_from_db.js
 * ─────────────────────────────────────────────────────────────
 * Sync DB → JSON cache สำหรับ conversations ที่ cache ขาดหาย
 *
 * Usage:
 *   cd crm-app
 *   node scripts/rebuild_cache_from_db.js
 *   node scripts/rebuild_cache_from_db.js --from 2026-02-21 --to 2026-03-03
 *   node scripts/rebuild_cache_from_db.js --all
 *
 * What it does:
 *   1. Query Conversation + Messages จาก local PostgreSQL ตาม date range
 *   2. เขียน / อัปเดต JSON cache (cache/customer/{key}/chathistory/{convId}.json)
 *   3. แสดง distribution ของ lastMessageAt หลัง rebuild เสร็จ
 * ─────────────────────────────────────────────────────────────
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// ─── Config ─────────────────────────────────────────────────
const CACHE_ROOT = path.join(__dirname, '../cache/customer');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in .env');
    process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const isAll = args.includes('--all');
const fromIdx = args.indexOf('--from');
const toIdx = args.indexOf('--to');
const dryRun = args.includes('--dry-run');

const FROM_DATE = fromIdx !== -1 ? args[fromIdx + 1] : '2026-02-21';
const TO_DATE   = toIdx   !== -1 ? args[toIdx + 1]   : '2026-03-03';

// ─── Helpers ─────────────────────────────────────────────────
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeJSON(filePath, data) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getCacheModTime(filePath) {
    try { return fs.statSync(filePath).mtimeMs; }
    catch { return 0; }
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
    console.log('\n🔄 rebuild_cache_from_db.js');
    console.log('━'.repeat(55));
    if (dryRun) console.log('🔍 DRY RUN — ไม่มีการเขียนไฟล์จริง\n');

    if (isAll) {
        console.log('📦 Mode: REBUILD ALL conversations');
    } else {
        console.log(`📅 Range: ${FROM_DATE} → ${TO_DATE}`);
    }

    const pool = new Pool({ connectionString: DATABASE_URL });

    try {
        // ── Step 1: Count total in DB ──────────────────────────
        const { rows: [{ count: totalInDB }] } = await pool.query(
            `SELECT COUNT(*) FROM conversations`
        );
        console.log(`📊 Total conversations in DB: ${totalInDB}`);

        // ── Step 2: Query conversations in range ───────────────
        let convQuery, convParams;
        if (isAll) {
            convQuery = `
                SELECT c.*,
                       cu.customer_id AS "customerId", cu.first_name AS "firstName",
                       cu.last_name AS "lastName", cu.membership_tier AS "membershipTier",
                       cu.facebook_id AS "facebookId"
                FROM conversations c
                LEFT JOIN customers cu ON cu.id = c.customer_id
                ORDER BY c.last_message_at DESC NULLS LAST
            `;
            convParams = [];
        } else {
            convQuery = `
                SELECT c.*,
                       cu.customer_id AS "customerId", cu.first_name AS "firstName",
                       cu.last_name AS "lastName", cu.membership_tier AS "membershipTier",
                       cu.facebook_id AS "facebookId"
                FROM conversations c
                LEFT JOIN customers cu ON cu.id = c.customer_id
                WHERE c.last_message_at >= $1
                  AND c.last_message_at <= $2
                ORDER BY c.last_message_at DESC
            `;
            convParams = [FROM_DATE + 'T00:00:00Z', TO_DATE + 'T23:59:59Z'];
        }

        const { rows: conversations } = await pool.query(convQuery, convParams);
        console.log(`✅ Found ${conversations.length} conversations in DB for range\n`);

        if (conversations.length === 0) {
            console.log('⚠️  No conversations found in DB for this range.');
            console.log('   ตรวจสอบว่า lastMessageAt ใน DB ตรงกับ range ที่กำหนด');
            await pool.end();
            return;
        }

        // ── Step 3: Process each conversation ─────────────────
        let created = 0, updated = 0, skipped = 0, errors = 0;

        for (const conv of conversations) {
            try {
                const psid = conv.participant_id || conv.conversation_id.replace('t_', '');
                const convId = conv.conversation_id;

                // Cache folder key — ใช้ customerId ถ้ามี ไม่งั้นใช้ FB_CHAT_{psid}
                const cacheKey = conv.customerId || `FB_CHAT_${psid}`;
                const chatPath = path.join(CACHE_ROOT, cacheKey, 'chathistory', `${convId}.json`);

                // Check freshness
                const cacheModTime = getCacheModTime(chatPath);
                const dbUpdatedMs = new Date(conv.updated_at || conv.last_message_at || 0).getTime();

                if (!isAll && cacheModTime > 0 && cacheModTime >= dbUpdatedMs) {
                    skipped++;
                    continue;
                }

                const isNew = cacheModTime === 0;

                if (!dryRun) {
                    // ── Fetch messages for this conversation ──────
                    const { rows: messages } = await pool.query(
                        `SELECT m.id, m.message_id, m.conversation_id, m.from_name, m.from_id,
                                m.content, m.has_attachment, m.attachment_type, m.attachment_url,
                                m.attachment_id, m.session_id, m.episode_id, m.metadata, m.created_at,
                                m.responder_id
                         FROM messages m
                         WHERE m.conversation_id = $1
                         ORDER BY m.created_at ASC`,
                        [conv.id]
                    );

                    const payload = {
                        _cachedAt: new Date().toISOString(),
                        _source: 'db',
                        id: conv.id,
                        conversationId: convId,
                        customerId: conv.customer_id || null,
                        channel: conv.channel || 'facebook',
                        participantName: conv.participant_name || conv.firstName || null,
                        participantId: psid,
                        assignedAgent: conv.assigned_agent || null,
                        assignedEmployeeId: conv.assigned_employee_id || null,
                        lastMessageAt: conv.last_message_at ? new Date(conv.last_message_at).toISOString() : null,
                        unreadCount: conv.unread_count || 0,
                        createdAt: conv.created_at ? new Date(conv.created_at).toISOString() : null,
                        updatedAt: conv.updated_at ? new Date(conv.updated_at).toISOString() : null,
                        messages: messages.map(m => ({
                            id: m.id,
                            messageId: m.message_id,
                            conversationId: m.conversation_id,
                            attachmentId: m.attachment_id || null,
                            sessionId: m.session_id || null,
                            episodeId: m.episode_id || null,
                            metadata: m.metadata || null,
                            fromName: m.from_name,
                            fromId: m.from_id,
                            content: m.content || '',
                            hasAttachment: m.has_attachment || false,
                            attachmentType: m.attachment_type || null,
                            attachmentUrl: m.attachment_url || null,
                            responderId: m.responder_id || null,
                            createdAt: m.created_at ? new Date(m.created_at).toISOString() : null,
                        }))
                    };

                    writeJSON(chatPath, payload);
                }

                if (isNew) {
                    created++;
                    const name = conv.participant_name || conv.firstName || psid;
                    const lma = conv.last_message_at ? new Date(conv.last_message_at).toISOString().slice(0,10) : '?';
                    console.log(`  ➕ [${lma}] ${convId}  ${name}`);
                } else {
                    updated++;
                }

            } catch (err) {
                errors++;
                console.error(`  ❌ ${conv.conversationId}: ${err.message}`);
            }
        }

        // ── Step 4: Date distribution from DB ─────────────────
        console.log('\n' + '━'.repeat(55));
        console.log('📊 SUMMARY');
        console.log(`  ➕ Created (new):   ${created}`);
        console.log(`  🔄 Updated (stale): ${updated}`);
        console.log(`  ⏭  Skipped (fresh): ${skipped}`);
        console.log(`  ❌ Errors:          ${errors}`);

        // ── Step 5: Full date distribution ────────────────────
        console.log('\n📅 Distribution ของ lastMessageAt จาก DB (range นี้):');
        const byDate = {};
        for (const conv of conversations) {
            if (!conv.last_message_at) continue;
            const d = new Date(conv.last_message_at).toISOString().slice(0, 10);
            byDate[d] = (byDate[d] || 0) + 1;
        }
        const maxCount = Math.max(...Object.values(byDate));
        for (const [date, count] of Object.entries(byDate).sort()) {
            const bar = '█'.repeat(Math.round((count / maxCount) * 30));
            const marker = count === maxCount ? ' ◄ PEAK' : '';
            console.log(`  ${date}: ${String(count).padStart(3)}  ${bar}${marker}`);
        }

        console.log('\n' + '━'.repeat(55));
        console.log('✅ Done.');

    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
