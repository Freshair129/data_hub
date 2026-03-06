/**
 * fetch_all_conversations.js
 * 
 * ดึง conversation_id ทั้งหมดจาก Facebook Graph API
 * ใช้ pagination (paging.next) วน loop จนหมด
 * กรอง updated_time >= Feb 1, 2026
 * สร้าง target file สำหรับ sync_agents_v2.js --file= mode
 * 
 * Usage: node scripts/fetch_all_conversations.js
 */

import fs from 'fs';
import https from 'https';

// ─── Config ───────────────────────────────────────────────────────────────────
const envLocal = fs.readFileSync('.env.local', 'utf8');
const PAGE_ID = envLocal.match(/FB_PAGE_ID=["']?([^"'\n]+)["']?/)?.[1];
const TOKEN = envLocal.match(/FB_PAGE_ACCESS_TOKEN=["']?([^"'\n]+)["']?/)?.[1];

if (!PAGE_ID || !TOKEN) {
    console.error('❌ FB_PAGE_ID หรือ FB_PAGE_ACCESS_TOKEN ไม่พบใน .env.local');
    process.exit(1);
}

const API_VERSION = 'v19.0';
const CUTOFF_DATE = new Date('2026-02-01T00:00:00Z');
const OUTPUT_FILE = 'cache/feb_threads_full.json';
const SLEEP_MS = 1000; // delay ระหว่าง page เพื่อกัน rate limit

console.log(`🔍 ดึง conversations จาก Page ${PAGE_ID}`);
console.log(`📅 Cutoff: ${CUTOFF_DATE.toISOString()}`);
console.log(`📝 Output: ${OUTPUT_FILE}\n`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(new Error(`JSON parse error: ${raw.slice(0, 200)}`));
                }
            });
        }).on('error', reject);
    });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const allConversations = [];
    let stoppedEarly = false;
    let page = 1;

    // First URL: ดึงเฉพาะ Messenger conversations (ไม่รวม IG DM)
    // platform=MESSENGER กรองเฉพาะ FB Messenger เท่านั้น
    let url = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/conversations?fields=id,updated_time,participants&platform=MESSENGER&limit=100&access_token=${TOKEN}`;

    while (url) {
        console.log(`📄 Page ${page}...`);
        const data = await fetchJSON(url);

        if (data.error) {
            console.error('❌ API Error:', JSON.stringify(data.error, null, 2));
            break;
        }

        const conversations = data.data || [];
        if (conversations.length === 0) {
            console.log('   ไม่มี conversation เพิ่ม — จบ');
            break;
        }

        let addedThisPage = 0;
        for (const conv of conversations) {
            const updatedAt = new Date(conv.updated_time);

            // ถ้า updated_time เก่ากว่า cutoff → หยุด (API เรียงจากใหม่ → เก่า)
            if (updatedAt < CUTOFF_DATE) {
                console.log(`   ⏹️  เจอ conversation เก่ากว่า ${CUTOFF_DATE.toISOString().slice(0, 10)} — หยุด`);
                stoppedEarly = true;
                break;
            }

            // ดึง PSID ของลูกค้า (ไม่ใช่ Page ID)
            const participants = conv.participants?.data || [];
            const customer = participants.find(p => p.id !== PAGE_ID);
            const customerPsid = customer?.id || null;
            const customerName = customer?.name || 'Unknown';

            if (!customerPsid) {
                console.log(`   ⚠️  ข้าม ${conv.id} — ไม่มี participant (อาจเป็น group chat)`);
                continue;
            }

            // IG PSID ยาวมาก (>20 หลัก เช่น 39 หลัก) vs FB PSID (16-17 หลัก)
            const isInstagram = customerPsid.length > 20;
            const threadType = isInstagram ? 'IG_MESSAGE' : 'FB_MESSAGE';

            allConversations.push({
                graphApiId: conv.id,           // t_384160711505 (internal thread ID - ใช้ API)
                psid: customerPsid,            // 100040899003775 (PSID - ใช้ navigate Business Suite)
                customerName: customerName,
                threadType: threadType,        // FB_MESSAGE or IG_MESSAGE
                updated_time: conv.updated_time
            });
            addedThisPage++;
        }

        console.log(`   ✅ +${addedThisPage} conversations (รวม: ${allConversations.length})`);

        if (stoppedEarly) break;

        // Pagination: ใช้ paging.next ถ้ามี
        url = data.paging?.next || null;
        page++;

        if (url) {
            await sleep(SLEEP_MS); // กัน rate limit
        }
    }

    // ─── สร้าง Target File สำหรับ Scraper ───────────────────────────────────

    // Merge กับ synced_threads.json เพื่อใช้ UID ที่ scraper เรียนรู้แล้ว (ถ้ามี)
    let syncedThreads = {};
    try {
        syncedThreads = JSON.parse(fs.readFileSync('cache/synced_threads.json', 'utf8'));
    } catch (e) { /* ไม่มีก็ไม่เป็นไร */ }

    // สร้าง target list — ใช้ learned UID ก่อน, ไม่มีก็ใช้ PSID จาก API
    const targetList = allConversations.map(conv => {
        const psid = conv.psid;
        // เช็คว่า synced_threads มี UID ที่ scraper เรียนรู้แล้วไหม
        const cached = syncedThreads[psid] || syncedThreads[`t_${psid}`];
        // UID (15 หลัก) ที่ scraper เรียนรู้ = navigate ได้ดีกว่า PSID
        const bestId = cached?.learnedUid || psid;

        return {
            id: bestId,
            threadType: conv.threadType,    // FB_MESSAGE or IG_MESSAGE
            // เก็บข้อมูลเพิ่มเติมเพื่อ debug
            _psid: psid,
            _graphApiId: conv.graphApiId,
            _customerName: conv.customerName,
            _updatedTime: conv.updated_time,
            _source: cached ? 'synced_cache' : 'graph_api'
        };
    });

    // เขียนไฟล์
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(targetList, null, 2));

    // ─── Summary ────────────────────────────────────────────────────────────
    const fromCache = targetList.filter(t => t._source === 'synced_cache').length;
    const fromApi = targetList.filter(t => t._source === 'graph_api').length;

    console.log(`\n${'─'.repeat(60)}`);
    const fbCount = targetList.filter(t => t.threadType === 'FB_MESSAGE').length;
    const igCount = targetList.filter(t => t.threadType === 'IG_MESSAGE').length;

    console.log(`📊 สรุป:`);
    console.log(`   Conversations ทั้งหมด (updated >= Feb 2026): ${allConversations.length}`);
    console.log(`   📱 Facebook Messenger: ${fbCount}`);
    console.log(`   📸 Instagram DM: ${igCount}`);
    console.log(`   มี UID จาก scraper cache แล้ว: ${fromCache}`);
    console.log(`   ใหม่จาก Graph API (ใช้ PSID navigate): ${fromApi}`);
    console.log(`   📝 เขียนไฟล์: ${OUTPUT_FILE}`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`\n🚀 รันขั้นตอนถัดไป:`);
    console.log(`   node automation/sync_agents_v2.js --file=${OUTPUT_FILE} --force\n`);
}

main().catch(e => {
    console.error('❌ Fatal:', e.message);
    process.exit(1);
});
