/**
 * graph_api_attribution.js — Graph API Agent Attribution (No Browser Required)
 *
 * ดึง message senders โดยตรงจาก Facebook Graph API
 * → ไม่ต้องใช้ browser / Business Suite UI เลย
 * → แก้ปัญหา ID Namespace Mismatch ได้สมบูรณ์ (ใช้ conversationId ตรงๆ)
 *
 * ── วิธีรัน ──────────────────────────────────────────────────────────────────
 *   node automation/graph_api_attribution.js --from=2026-02-01 --to=2026-02-28
 *   node automation/graph_api_attribution.js --from=2026-02-01 --to=2026-02-28 --limit=50
 *   node automation/graph_api_attribution.js --from=2026-02-01 --to=2026-02-28 --dry-run
 *   node automation/graph_api_attribution.js --from=2026-02-01 --to=2026-02-28 --force
 *   node automation/graph_api_attribution.js --conv=t_10163596802286505  (ทดสอบ 1 conv)
 *
 *  ตัวเลือก:
 *    --from=YYYY-MM-DD     วันเริ่ม (ต้องระบุ เว้นแต่ใช้ --conv)
 *    --to=YYYY-MM-DD       วันสิ้นสุด
 *    --limit=N             จำนวน conversations สูงสุด (default: 500)
 *    --dry-run             แสดงผลแต่ไม่เขียนลง DB
 *    --force               ทำซ้ำแม้เคย cache แล้ว
 *    --conv=t_XXXXX        ทดสอบ conversation เดียว
 *    --delay=MS            delay ระหว่างแต่ละ Graph API call (ms, default: 300)
 *    --msg-limit=N         จำนวน messages ต่อ conversation (default: 50)
 *    --verbose             แสดง log ละเอียด
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Env vars ที่ต้องการ (อ่านจาก crm-app/.env อัตโนมัติ):
 *   FB_PAGE_ACCESS_TOKEN   — Page Access Token (จาก .env)
 *   FB_PAGE_ID             — Facebook Page ID
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── โหลด .env จาก crm-app/ ──────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const m = line.match(/^([A-Z_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
        if (m) process.env[m[1]] = process.env[m[1]] || m[2].trim();
    }
}

const FB_TOKEN   = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FB_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID || '170707786504';
const CRM_PORT   = 3000;

if (!FB_TOKEN) {
    console.error('❌ ไม่พบ FB_PAGE_ACCESS_TOKEN ใน .env');
    process.exit(1);
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const FROM    = args.find(a => a.startsWith('--from='))?.split('=')[1] || '';
const TO      = args.find(a => a.startsWith('--to='))?.split('=')[1] || '';
const LIMIT   = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '500');
const DRY_RUN       = args.includes('--dry-run');
const FORCE         = args.includes('--force');
const VERBOSE       = args.includes('--verbose');
const RETRY_NO_ADMIN = args.includes('--retry-no-admin'); // re-run เฉพาะ no-admin cached
const CONV    = args.find(a => a.startsWith('--conv='))?.split('=')[1] || '';
const DELAY   = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '300');
const MSG_LIM = parseInt(args.find(a => a.startsWith('--msg-limit='))?.split('=')[1] || '50');

if (!CONV && (!FROM || !TO)) {
    console.error('❌ ต้องระบุ --from=YYYY-MM-DD และ --to=YYYY-MM-DD (หรือ --conv=t_XXXXX)');
    process.exit(1);
}

// ─── Persistence Cache ────────────────────────────────────────────────────────
const CACHE_PATH = path.join(__dirname, '..', 'cache', 'graph_synced_convs.json');

function loadCache() {
    try {
        if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch {}
    return {};
}

function saveCache(convId, result) {
    try {
        const cache = loadCache();
        cache[convId] = { syncedAt: new Date().toISOString(), ...result };
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    } catch (e) {
        console.error('⚠️  saveCache error:', e.message);
    }
}

// ─── Facebook Graph API call ──────────────────────────────────────────────────
function fbGet(path) {
    return new Promise((resolve, reject) => {
        const url = `https://graph.facebook.com/v19.0${path}${path.includes('?') ? '&' : '?'}access_token=${FB_TOKEN}`;
        if (VERBOSE) console.log('   [Graph API]', url.replace(FB_TOKEN, '***TOKEN***'));

        https.get(url, (res) => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    const data = JSON.parse(raw);
                    if (data.error) reject(new Error(`FB API Error ${data.error.code}: ${data.error.message}`));
                    else resolve(data);
                } catch (e) {
                    reject(new Error('JSON parse error: ' + raw.slice(0, 200)));
                }
            });
        }).on('error', reject);
    });
}

// ─── CRM API call ─────────────────────────────────────────────────────────────
function callCrmApi(endpoint, body) {
    return new Promise((resolve) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost', port: CRM_PORT,
            path: endpoint, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ success: false }); } });
        });
        req.on('error', e => resolve({ success: false, error: e.message }));
        req.write(data);
        req.end();
    });
}

// ─── ดึง conversations จาก CRM DB ────────────────────────────────────────────
function fetchConvsFromDB(from, to, limit) {
    return new Promise((resolve) => {
        const params = `from=${from}&to=${to}&limit=${limit}`;
        const req = http.request({
            hostname: 'localhost', port: CRM_PORT,
            path: `/api/conversations?${params}`, method: 'GET',
        }, (res) => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve({ conversations: [] }); }
            });
        });
        req.on('error', e => { console.error('[DB] Error:', e.message); resolve({ conversations: [] }); });
        req.end();
    });
}

// ─── ดึง participants ของ conversation → หา customer PSID ────────────────────
// ใช้เมื่อ participantId ว่างเปล่า (เช่น --conv= mode)
async function fetchConvParticipants(convId) {
    try {
        const data = await fbGet(`/${convId}?fields=participants`);
        const parts = data.participants?.data || [];
        // customer = participant ที่ไม่ใช่ page
        const customer = parts.find(p => String(p.id) !== String(FB_PAGE_ID));
        if (VERBOSE && customer) console.log(`   [participants] customer PSID: ${customer.id}`);
        return customer?.id || null;
    } catch (e) {
        if (VERBOSE) console.log(`   ⚠️  fetchConvParticipants failed: ${e.message}`);
        return null;
    }
}

// ─── ดึง messages ของ conversation จาก Graph API (รวม pagination) ────────────
async function fetchConvMessages(convId) {
    const fields = 'message,from,created_time';
    const allMessages = [];
    let url = `/${convId}/messages?fields=${fields}&limit=${MSG_LIM}`;

    try {
        // ดึงหน้าแรก (newest-first จาก FB)
        const data = await fbGet(url);
        allMessages.push(...(data.data || []));

        // ถ้า MSG_LIM เยอะพอ (≥50) ดึงหน้าต่อไปด้วย — เพื่อให้ได้ข้อความเก่าพอที่มี assignment msg
        if (data.paging?.next && allMessages.length >= MSG_LIM) {
            // ดึงอีกไม่เกิน 2 หน้า (รวม ~150 messages) เพื่อหา assignment messages ที่อาจอยู่ข้างล่าง
            for (let page = 0; page < 2; page++) {
                const cursor = data.paging?.cursors?.after;
                if (!cursor) break;
                const nextData = await fbGet(`/${convId}/messages?fields=${fields}&limit=${MSG_LIM}&after=${cursor}`);
                allMessages.push(...(nextData.data || []));
                if (!nextData.paging?.next) break;
                await new Promise(r => setTimeout(r, 200));
            }
        }

        return allMessages;
    } catch (e) {
        if (VERBOSE) console.log(`   ⚠️  Graph API failed for ${convId}: ${e.message}`);
        return null; // null = API error
    }
}

// ─── Regex patterns สำหรับ assignment messages (เหมือน db.js) ───────────────
const ASSIGN_PATTERNS = [
    /กำหนดการสนทนานี้ให้กับ\s+(.+?)(?:\s+ผ่าน|\s*$)/,
    /ระบบมอบหมายแชทนี้ให้กับ\s+(.+?)\s+ผ่านระบบอัตโนมัติ/,
    /assigned this conversation to\s+(.+?)(?:\s+via|\s*$)/i,
];

function extractAssignedAgent(text) {
    for (const pattern of ASSIGN_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            const name = match[1].trim().split('\n')[0].trim();
            if (name.length >= 2 && name.length <= 60) return name;
        }
    }
    return null;
}

// ─── สร้าง senders list ด้วย Temporal Inference ──────────────────────────────
//
// หลักการ: Graph API คืน from.name = "The V School" สำหรับทุกข้อความแอดมิน
// แต่ใน message text มีข้อความ assignment เช่น:
//   "ระบบมอบหมายแชทนี้ให้กับ Jutamat ผ่านระบบอัตโนมัติ"
//   "พรพล กำหนดการสนทนานี้ให้กับ Satabongkot"
//
// Algorithm:
//   1. เรียง messages ตาม created_time (เก่า → ใหม่)
//   2. Track activeAgent: seed จาก DB assignedAgent ก่อน, override ด้วย assignment messages
//   3. ทุก admin message → attribute ให้ activeAgent (แม้ไม่มี assignment message ใน conv)
//
// initialAgent: conv.assignedAgent จาก DB — ใช้เป็น fallback เมื่อไม่มี assignment msg
// ผลลัพธ์: [{ name, msgText }] — ส่งให้ message-sender API ต่อ
function buildSenders(messages, participantId, initialAgent) {
    if (!messages.length) return [];

    // เรียงจากเก่าไปใหม่ (Graph API ส่งมาแบบ newest-first)
    const sorted = [...messages].sort((a, b) =>
        new Date(a.created_time) - new Date(b.created_time)
    );

    const psidStr = String(participantId);
    // seed ด้วย assignedAgent จาก DB — ถ้า conv ไม่มี assignment msg ก็ยังระบุได้
    let activeAgent = (initialAgent && initialAgent !== 'Unassigned') ? initialAgent : null;
    const senders = [];
    const seen = new Set();

    for (const msg of sorted) {
        const msgText = (msg.message || '').trim();
        const fromId  = String(msg.from?.id || '');
        const fromName = (msg.from?.name || '').trim();

        if (!msgText) continue;

        // ── ตรวจสอบ assignment message ──────────────────────────────────────
        const assignedAgent = extractAssignedAgent(msgText);
        if (assignedAgent) {
            activeAgent = assignedAgent;

            // assignment message เองก็เพิ่มเป็น sender (สำหรับ conv-level update)
            const key = `${activeAgent}|assign|${msgText.slice(0, 20)}`;
            if (!seen.has(key)) {
                seen.add(key);
                senders.push({ name: activeAgent, msgText: msgText.slice(0, 150) });
            }
            continue;
        }

        // ── ข้อความจากลูกค้า → ข้าม ────────────────────────────────────────
        if (psidStr && fromId === psidStr) continue;

        // ── ข้อความจาก Page / แอดมิน ────────────────────────────────────────
        // ข้าม "The V School" messages ถ้าไม่รู้ว่าใครส่ง
        const isPageMsg = /the v school|v school/i.test(fromName) || fromId === FB_PAGE_ID;

        if (isPageMsg) {
            // ถ้ารู้ว่าใครรับผิดชอบ conversation นี้ → attribute ให้ activeAgent
            if (activeAgent && msgText.length >= 3) {
                const key = `${activeAgent}|${msgText.slice(0, 30)}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    senders.push({ name: activeAgent, msgText: msgText.slice(0, 150) });
                }
            }
            continue;
        }

        // ── Persona message (from.name = ชื่อแอดมินจริง) → ใช้โดยตรง ─────
        // ถ้า psid ว่าง (ยังไม่รู้ว่า ID ไหนคือลูกค้า) → ข้าม non-page messages ทั้งหมด
        // เพราะอาจเป็นข้อความลูกค้าที่ไม่รู้จะแยกได้
        if (!psidStr && !isPageMsg) continue;

        if (!fromName || fromName.length < 2) continue;
        if (/auto.?reply|ข้อความตอบกลับอัตโนมัติ/i.test(msgText)) continue;

        const key = `${fromName}|${msgText.slice(0, 30)}`;
        if (!seen.has(key)) {
            seen.add(key);
            senders.push({ name: fromName, msgText: msgText.slice(0, 150) });
            activeAgent = fromName; // อัปเดต activeAgent จาก persona ด้วย
        }
    }

    return senders;
}

// ─── อ่าน senders จาก chathistory cache (fallback เมื่อ temporal inference ไม่ได้ผล) ───
// ใช้เมื่อ scraper เคยอัปเดต fromName ไว้แล้ว (fromId=PAGE_ID แต่ fromName≠The V School)
function buildSendersFromCache(convId, psid) {
    const cacheDir  = path.join(__dirname, '..', 'cache', 'customer');
    const chatFile  = path.join(cacheDir, `FB_CHAT_${psid}`, 'chathistory', `${convId}.json`);

    if (!fs.existsSync(chatFile)) return null;

    try {
        const d    = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
        const msgs = d.messages || [];
        const senders = [];
        const seen    = new Set();

        for (const m of msgs) {
            const fromId   = String(m.fromId || '');
            const fromName = (m.fromName || '').trim();
            const content  = (m.content  || '').trim();

            // หา page messages ที่ scraper อัปเดต fromName เป็นชื่อแอดมินแล้ว
            if (fromId === FB_PAGE_ID
                && fromName
                && !/the v school/i.test(fromName)
                && content.length >= 3) {
                const key = `${fromName}|${content.slice(0, 30)}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    senders.push({ name: fromName, msgText: content.slice(0, 150) });
                }
            }
        }

        return senders.length ? senders : null;
    } catch (e) {
        if (VERBOSE) console.log(`   ⚠️  cache read error: ${e.message}`);
        return null;
    }
}

// ─── ประมวลผล 1 conversation ─────────────────────────────────────────────────
async function processConversation(conv, index, total) {
    const convId      = String(conv.conversationId || '').trim();
    const psid        = String(conv.participantId  || '').trim();
    const assignedTo  = conv.assignedAgent || '';

    const label = convId || psid || '(no-id)';
    process.stdout.write(`[${String(index).padStart(3)}/${total}] ${label.slice(-18).padStart(18)} `);

    if (!convId) {
        console.log('⊘  ไม่มี conversationId — ข้าม');
        return { skipped: true };
    }

    // ─── ถ้าไม่มี psid → ดึงจาก Graph API participants ──────────────────────
    let resolvedPsid = psid;
    if (!resolvedPsid) {
        resolvedPsid = await fetchConvParticipants(convId) || '';
        if (resolvedPsid && VERBOSE) console.log(`   [resolved] psid=${resolvedPsid}`);
    }

    // ─── ดึง messages จาก Graph API ─────────────────────────────────────────
    const messages = await fetchConvMessages(convId, resolvedPsid);

    if (messages === null) {
        console.log('❌  Graph API error — ข้าม');
        return { error: true };
    }

    if (messages.length === 0) {
        console.log('⊘  ไม่มี messages — ข้าม');
        saveCache(convId, { status: 'empty', senders: [] });
        return { empty: true };
    }

    // ─── สร้าง senders list ──────────────────────────────────────────────────
    // ส่ง assignedTo จาก DB เป็น initialAgent — ช่วย conv ที่ไม่มี assignment message
    const senders = buildSenders(messages, resolvedPsid, assignedTo);

    if (VERBOSE) {
        console.log(`\n   messages=${messages.length} adminMsgs=${senders.length}`);
        senders.slice(0, 3).forEach(s => console.log(`   ↳ [${s.name}] "${s.msgText.slice(0, 50)}"`));
    }

    if (!senders.length && resolvedPsid) {
        // Fallback: อ่านจาก chathistory cache — scraper อาจอัปเดต fromName ไว้แล้ว
        const cacheSenders = buildSendersFromCache(convId, resolvedPsid);
        if (cacheSenders) {
            if (VERBOSE) console.log(`   [cache fallback] ${cacheSenders.length} senders จาก chathistory`);
            senders.push(...cacheSenders);
        }
    }

    if (!senders.length) {
        // ลูกค้าพูดฝ่ายเดียว ไม่มีแอดมินตอบ — OK
        console.log('⊘  ไม่มีข้อความจากแอดมิน');
        saveCache(convId, { status: 'no-admin', senders: [] });
        return { noAdmin: true };
    }

    if (DRY_RUN) {
        const names = [...new Set(senders.map(s => s.name))].join(', ');
        console.log(`🔍 [DRY-RUN] ${senders.length} senders: ${names}`);
        return { dryRun: true, senders };
    }

    // ─── ส่ง CRM API ─────────────────────────────────────────────────────────
    const result = await callCrmApi('/api/marketing/chat/message-sender', {
        conversationId: convId,
        participantId:  psid || undefined,
        senders,
    });

    const names = [...new Set(senders.map(s => s.name))].join(', ');
    const note = !result.success && result.error ? `api-err: ${result.error?.slice(0,40)}`
               : result.updated > 0               ? `+${result.updated} msgs`
               : result.convLevelAgent            ? 'conv-only'
               :                                    'no-match';

    console.log(`✅ [${names}] (${note})`);

    if (VERBOSE && !(result.updated > 0)) {
        console.log('   [API result]', JSON.stringify(result).slice(0, 200));
    }

    saveCache(convId, {
        status: result.updated > 0 ? 'updated' : 'conv-only',
        senders: [...new Set(senders.map(s => s.name))],
        updated: result.updated || 0,
    });

    return { success: true, updated: result.updated || 0, senders: senders.length };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n🚀 V School Graph API Attribution');
    console.log(`   Token  : ${FB_TOKEN.slice(0, 20)}...`);
    console.log(`   Page ID: ${FB_PAGE_ID}`);
    console.log(`   Range  : ${CONV ? `conv=${CONV}` : `${FROM} → ${TO}`}`);
    console.log(`   Limit  : ${LIMIT} | MsgLimit: ${MSG_LIM} | Delay: ${DELAY}ms`);
    if (DRY_RUN)        console.log('   Mode   : DRY-RUN (ไม่เขียนลง DB)');
    if (FORCE)          console.log('   Force  : ✅ ทำซ้ำทุก conv แม้เคย cache แล้ว');
    if (RETRY_NO_ADMIN) console.log('   Mode   : RETRY-NO-ADMIN (เฉพาะ conv ที่เคย no-admin)');
    console.log();

    // ─── โหลด conversations ─────────────────────────────────────────────────
    let conversations = [];

    if (CONV) {
        // ทดสอบ 1 conversation
        conversations = [{ conversationId: CONV, participantId: '', assignedAgent: '' }];
    } else {
        console.log(`📦 ดึง conversations จาก CRM DB (${FROM} → ${TO})...`);
        const dbResult = await fetchConvsFromDB(FROM, TO, LIMIT);
        conversations = dbResult.conversations || [];

        if (!conversations.length) {
            console.error('❌ ไม่พบ conversations จาก DB — ตรวจสอบว่า CRM server รันอยู่ (npm run dev)');
            process.exit(1);
        }
        console.log(`   พบ ${conversations.length} conversations จาก DB\n`);
    }

    // ─── กรอง cache ─────────────────────────────────────────────────────────
    const cache = loadCache();
    const total = conversations.length;

    const eligible = FORCE
        ? conversations
        : RETRY_NO_ADMIN
            // เฉพาะ conv ที่ cache บอกว่า no-admin → ลองใหม่ด้วย initialAgent fix
            ? conversations.filter(c => {
                const entry = cache[String(c.conversationId || '').trim()];
                return entry?.status === 'no-admin';
              })
            : conversations.filter(c => !cache[String(c.conversationId || '').trim()]);

    const skippedByCache = total - eligible.length;

    console.log(`📊 ทั้งหมด ${total} | ข้าม cache ${skippedByCache} | จะทำ ${eligible.length} conversations\n`);

    // ─── วนประมวลผล ──────────────────────────────────────────────────────────
    let stats = { success: 0, noAdmin: 0, empty: 0, error: 0, totalUpdated: 0 };

    for (let i = 0; i < eligible.length; i++) {
        const conv = eligible[i];
        const result = await processConversation(conv, i + 1, eligible.length);

        if (result.success)   { stats.success++; stats.totalUpdated += result.updated || 0; }
        else if (result.noAdmin) stats.noAdmin++;
        else if (result.empty)   stats.empty++;
        else if (result.error)   stats.error++;

        // Rate limit: delay ระหว่าง Graph API calls
        if (i < eligible.length - 1) {
            await new Promise(r => setTimeout(r, DELAY));
        }

        // Progress checkpoint ทุก 50 conversations
        if ((i + 1) % 50 === 0) {
            console.log(`\n   📍 Checkpoint ${i + 1}/${eligible.length}: updated=${stats.totalUpdated} msgs, errors=${stats.error}\n`);
        }
    }

    // ─── Summary ──────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(60));
    console.log('📊 สรุปผล Graph API Attribution');
    console.log('═'.repeat(60));
    console.log(`   ✅ ส่ง CRM API สำเร็จ   : ${stats.success} conversations`);
    console.log(`   📝 อัปเดตข้อความ         : ${stats.totalUpdated} messages`);
    console.log(`   ⊘  ไม่มีแอดมินตอบ       : ${stats.noAdmin} conversations`);
    console.log(`   ⊘  ไม่มีข้อความ          : ${stats.empty} conversations`);
    console.log(`   ❌ Graph API errors       : ${stats.error} conversations`);
    console.log(`   ⏭️  ข้าม (cache)          : ${skippedByCache} conversations`);
    console.log('═'.repeat(60) + '\n');

    if (DRY_RUN) {
        console.log('   ℹ️  DRY-RUN mode — ไม่มีการเขียนลง DB\n');
    }
}

main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
});
