/**
 * sync_agents_v2.js — V School Agent Sync
 *
 * อ่าน "ส่งโดย [ชื่อ]" จาก Facebook Business Suite (FB + Instagram)
 * แล้วบันทึกลง CRM
 *
 * ── วิธีรัน ──────────────────────────────────────────────────────────────────
 *  1. ดับเบิ้ลคลิก "เปิด_Chrome_CRM.command" → login → เปิด Inbox
 *  2. node automation/sync_agents_v2.js --attach
 *
 *  ตัวเลือก:
 *    --limit=9999    จำนวน conversation (default: 9999)
 *    --port=9222   CDP port (default: 9222)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DOM Strategy (Business Suite ใช้ virtual list):
 *   - ดึง threadID จาก React fiber props ของ ._4bl9 a[role="row"]
 *   - scroll container คือ div[overflowY=auto] ที่อยู่เหนือ ._4bl9
 *   - navigate แต่ละ conversation ด้วย URL:
 *     ?asset_id=PAGE_ID&selected_item_id=THREAD_ID&mailbox_id=PAGE_ID&thread_type=THREAD_TYPE
 */

const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const CRM_API = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const META_INBOX = 'https://business.facebook.com/latest/inbox/all';
const USER_DATA = process.env.CHROME_PROFILE_PATH || path.join(__dirname, 'user_data');

const args = process.argv.slice(2);
const ATTACH = args.includes('--attach');
const HEADLESS = args.includes('--headless');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '9999');
const PORT = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '9222');
const LOOP = args.includes('--loop') || args.includes('--continuous');
const DELAY = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '60'); // Minutes between loops

// ─── Helper: Random Wait (Anti-Bot) ──────────────────────────────────────────
function randomWait(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Node.js http call → CRM (ไม่ผ่าน browser context เพื่อหลีกเลี่ยง CORS) ──
function callCrmApi(endpoint, body) {
    return new Promise((resolve) => {
        const data = JSON.stringify(body);
        const req = http.request({
            hostname: 'localhost', port: 3000,
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

// ─── Persistence: Synced Threads Cache ──────────────────────────────────────
const SYNC_CACHE_PATH = path.join(__dirname, '..', 'cache', 'synced_threads.json');

function loadSyncCache() {
    try {
        if (process.env.DEBUG_SYNC) console.log('   [Debug] Loading cache from:', SYNC_CACHE_PATH);
        if (fs.existsSync(SYNC_CACHE_PATH)) {
            const data = fs.readFileSync(SYNC_CACHE_PATH, 'utf8');
            const parsed = JSON.parse(data);
            if (process.env.DEBUG_SYNC) console.log('   [Debug] Cache loaded, keys:', Object.keys(parsed).length);
            return parsed;
        }
    } catch (e) {
        console.error('⚠️  Error loading sync cache:', e.message);
    }
    return {};
}

const SYNC_LOG_PATH = path.join(process.cwd(), 'logs', 'synced_threads.log');

// Ensure logs directory exists
if (!fs.existsSync(path.join(process.cwd(), 'logs'))) {
    fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });
}

function saveSyncCache(threadID, result) {
    try {
        const idStr = String(threadID).trim();
        const cache = loadSyncCache();
        cache[idStr] = {
            syncedAt: new Date().toISOString(),
            status: result.success ? 'success' : 'failed',
            agents: result.agents || []
        };
        fs.writeFileSync(SYNC_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

        // BATCH LOG: Append to flat file for auditing
        if (result.success) {
            const logEntry = `[${new Date().toISOString()}] Synced: ${idStr} | Agents: ${result.agents?.join(', ') || 'n/a'}\n`;
            fs.appendFileSync(SYNC_LOG_PATH, logEntry, 'utf8');
        }
    } catch (e) {
        console.error('⚠️  Error saving sync cache:', e.message);
    }
}

// ─── ดึง threadID จาก React fiber (virtual list — ไม่มี href จริง) ──────────
function extractThreadIdFromFiber(el) {
    const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
    if (!fk) return null;
    let cur = el[fk];
    for (let i = 0; i < 35 && cur; i++) {
        const p = cur.memoizedProps || cur.pendingProps;
        if (p?.threadID) return { threadID: p.threadID, threadType: p.threadType || 'FB_MESSAGE', inboxID: p.inboxID };
        cur = cur.return;
    }
    return null;
}

// ─── Collect thread IDs โดย scroll sidebar ───────────────────────────────────
async function collectAllThreadIds(page, limit) {
    console.log('📜 Scroll sidebar เก็บ thread IDs...');

    // รอให้ sidebar โหลด
    await page.waitForSelector('._4bl9', { timeout: 20000 });
    await page.waitForTimeout(1000);

    const allThreads = new Map(); // threadID → { threadType, inboxID }
    let inboxID = null;

    // helper: ดึง threads ที่มองเห็นตอนนี้
    const scrapeVisible = async () => {
        const threads = await page.evaluate(() => {
            const results = [];
            document.querySelectorAll('._4bl9 a[role="row"]').forEach(el => {
                const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
                if (!fk) return;
                let cur = el[fk];
                for (let i = 0; i < 35 && cur; i++) {
                    const p = cur.memoizedProps || cur.pendingProps;
                    if (p?.threadID) {
                        results.push({ threadID: p.threadID, threadType: p.threadType || 'FB_MESSAGE', inboxID: p.inboxID });
                        break;
                    }
                    cur = cur.return;
                }
            });
            return results.map(r => ({
                ...r,
                threadID: String(r.threadID).trim()
            }));
        });
        for (const t of threads) {
            if (!allThreads.has(t.threadID)) {
                allThreads.set(t.threadID, { threadType: t.threadType, inboxID: t.inboxID });
                if (!inboxID && t.inboxID) inboxID = t.inboxID;
            }
        }
    };

    // หา scroll container (พยายามหาใน Navigation Sidebar ก่อน)
    const scrollContainer = await page.evaluateHandle(() => {
        // Selector ชุดที่ 1: ตรวจหาจาก ARIA role
        const nav = document.querySelector('div[role="navigation"] div[data-testid="mw_chat_scroller"]');
        if (nav) return nav;

        // Selector ชุดที่ 2: ไล่จากแชทที่เห็น
        const link = document.querySelector('._4bl9 a[role="row"]') || document.querySelector('div[role="navigation"] a');
        if (link) {
            let el = link;
            for (let i = 0; i < 25; i++) {
                el = el?.parentElement;
                if (!el) break;
                const s = getComputedStyle(el);
                if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
                    // มั่นใจว่าเป็น Sidebar ไม่ใช่ Chat Main
                    if (el.getBoundingClientRect().left < 500) return el;
                }
            }
        }

        // Selector ชุดที่ 3: Class เจาะจงสำหรับ sidebar ใน Business Suite
        const sidebarMain = document.querySelector('.f98l6msc') || document.querySelector('div[role="navigation"]');
        return sidebarMain;
    });

    // เก็บ batch แรก
    await scrapeVisible();

    // Scroll ลงทีละ 800px จนกว่าจะได้ครบ limit หรือไม่มีใหม่
    for (let round = 0; round < 250; round++) { // Increased rounds
        if (allThreads.size >= limit) break;

        const prevSize = allThreads.size;

        await page.evaluate((el) => {
            if (el) {
                el.scrollTop += 1500; // Aggressive scroll
            } else {
                window.scrollBy(0, 1000);
            }
        }, scrollContainer);

        // Anti-bot & Lazy load trigger: Use keyboard keys
        if (round % 4 === 0) await page.keyboard.press('PageDown');

        await page.waitForTimeout(2500); // Wait longer for render
        await scrapeVisible();

        console.log(`   [Round ${round + 1}] Threads Found: ${allThreads.size} / Target: Feb 2026+`);

        if (allThreads.size === prevSize) {
            // Try deep scroll before giving up
            console.log('   ⏳ Still stuck at existing count, trying aggressive deep scroll (End key)...');
            await page.keyboard.press('End');
            await page.waitForTimeout(5000);
            await scrapeVisible();

            if (allThreads.size === prevSize) {
                // LAST STAND: Force scroll to specific height
                await page.evaluate((el) => {
                    if (el) el.scrollTop = el.scrollHeight;
                }, scrollContainer);
                await page.waitForTimeout(3000);
                await scrapeVisible();

                if (allThreads.size === prevSize) {
                    console.log('   ⏹️  No new threads discovered after 3 attempts — stopping sidebar scan.');
                    break;
                }
            }
        }
    }

    console.log(`\n   รวม ${allThreads.size} threads (จาก limit ${limit})`);
    return { threads: allThreads, inboxID };
}

// ─── ดึง "ส่งโดย" + message text ที่อยู่ด้วยกัน ──────────────────────────────
// Strategy: หา sibling text ของ "ส่งโดย" ใน parent chain
// ผลลัพธ์: [{ name, msgText }] — ใช้ msgText เพื่อ match ข้อความใน DB
async function extractSenders(page) {
    return page.evaluate(() => {
        const pairs = [];
        const seen = new Set();

        const elements = Array.from(document.querySelectorAll('span, div')).filter(el => {
            const text = (el.textContent || '').trim();
            // Skip Auto Replies!
            return (text.startsWith('ส่งโดย ') || text.startsWith('Sent by ')) &&
                !text.includes('ข้อความตอบกลับอัตโนมัติ') &&
                !text.includes('assigned this');
        });

        for (const el of elements) {
            const text = (el.textContent || '').trim();
            if (el.children.length > 2 || text.length > 120) continue;
            const name = text.replace(/^ส่งโดย |^Sent by /, '').trim();
            if (!name || name.length > 80) continue;

            let foundId = null;
            let foundText = null;

            // Dig into React Fiber to find responseId and consumerText
            let cur = el;
            for (let i = 0; i < 20; i++) { // Max 20 DOM levels
                if (!cur) break;
                const key = Object.keys(cur).find(k => k.startsWith('__reactFiber')); // Fix: remove $ suffix
                if (key) {
                    let node = cur[key];
                    for (let j = 0; j < 15; j++) { // Max 15 fiber levels up
                        if (!node) break;
                        if (node.memoizedProps) {
                            const p = node.memoizedProps;

                            // 1. Look for ID
                            if (!foundId) {
                                if (p.responseId) foundId = p.responseId;
                                else if (p.messageId) foundId = p.messageId;
                                else if (p.message && p.message.message_id) foundId = p.message.message_id;
                                else if (p.message && p.message.id) foundId = p.message.id;
                            }

                            // 2. Look for Text
                            if (!foundText) {
                                if (p.responseText) foundText = p.responseText;
                                else if (p.consumerText) foundText = p.consumerText;
                                else if (p.message && p.message.text) foundText = p.message.text;
                                else if (p.text) foundText = p.text;
                            }
                        }
                        if (foundId && foundText) break; // found both!
                        node = node.return;
                    }
                }
                if (foundId && foundText) break;
                cur = cur.parentElement; // Walk up DOM tree
            }

            // Clean up text
            let msgText = null;
            if (foundText && typeof foundText === 'string') {
                msgText = foundText.slice(0, 100);
            }

            // Fallback: If no Fiber info found, try to grab regular text sibling like before
            if (!msgText && !foundId) {
                const THAI_DAY = /^[จอพพศส]\./;
                const TIME_RE = /^\d{1,2}:\d{2}/;
                const SKIP_TEXTS = ['ส่งโดย', 'Sent by', 'ระบบมอบหมาย', 'assigned', 'ก่อนหน้านี้', 'ปิด', 'ถัดไป', 'ก่อนหน้านี้ปิดถัดไป'];

                let curSib = el;
                for (let d = 0; d < 6 && !msgText; d++) {
                    const parent = curSib?.parentElement;
                    if (!parent) break;
                    for (const sib of parent.children) {
                        if (sib === curSib) continue;
                        const sibText = (sib.textContent || '').trim();
                        if (sibText.length < 4 || sibText.length > 400) continue;
                        if (THAI_DAY.test(sibText) || TIME_RE.test(sibText)) continue;
                        if (SKIP_TEXTS.some(s => sibText.startsWith(s))) continue;
                        msgText = sibText.slice(0, 100);
                        break;
                    }
                    curSib = parent;
                }
            }

            // Create unique key using ID if available, else use text
            const key = foundId ? `${name}|ID|${foundId}` : `${name}|TXT|${msgText || 'none'}`;
            if (!seen.has(key)) {
                seen.add(key);
                pairs.push({
                    name,
                    msgId: foundId,
                    msgText: msgText
                });
            }
        }

        // fallback: ถ้าไม่มีอะไรเลย คืนแค่ชื่อ (ระดับ Conv-level)
        if (pairs.length === 0) {
            const namesFound = new Set();
            elements.forEach(el => {
                const text = (el.textContent || '').trim();
                const name = text.replace(/^ส่งโดย |^Sent by /, '').trim();
                if (name && name.length <= 80) namesFound.add(name);
            });
            namesFound.forEach(name => pairs.push({ name, msgId: null, msgText: null }));
        }

        return pairs;
    });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function syncAgents() {
    console.log('\n🚀 V School Agent Sync v2');
    console.log(`   โหมด : ${ATTACH ? `Attach (port ${PORT})` : HEADLESS ? 'Headless' : 'New browser'}`);
    console.log(`   Limit: ${LIMIT} conversations`);
    console.log(`   Loop : ${LOOP ? `Enabled (every ${DELAY}m)` : 'Disabled'}\n`);

    let browser = null, context = null, page = null, ownsBrowser = false;

    if (ATTACH) {
        try {
            browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
        } catch {
            console.error(`❌ ไม่พบ Chrome ที่ port ${PORT} — รัน "เปิด_Chrome_CRM.command" ก่อน`);
            process.exit(1);
        }
        context = browser.contexts()[0];
        page = context.pages().find(p => p.url().includes('business.facebook.com'))
            || context.pages()[0];
        if (!page) { console.error('❌ ไม่พบ tab Business Suite'); process.exit(1); }
        console.log(`✅ เชื่อมต่อสำเร็จ`);
        console.log(`📌 Tab: ${page.url()}\n`);
    } else {
        ownsBrowser = true;
        context = await chromium.launchPersistentContext(USER_DATA, {
            headless: HEADLESS, viewport: { width: 1440, height: 900 },
            args: ['--disable-blink-features=AutomationControlled']
        });
        page = await context.newPage();
        await page.goto(META_INBOX, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        if (page.url().includes('login')) {
            console.log('⚠️  กรุณา login...');
            await page.waitForURL('**/inbox/**', { timeout: 300000 });
        }
    }

    try {
        // ── ตรวจสอบว่าอยู่บน Business Suite Inbox ────────────────────────────
        if (!page.url().includes('business.facebook.com')) {
            console.error('❌ Tab ไม่ใช่ Business Suite');
            process.exit(1);
        }

        // ── Collect all thread IDs via React fiber + scroll ───────────────────
        const { threads, inboxID } = await collectAllThreadIds(page, LIMIT);

        if (threads.size === 0) {
            console.log('⚠️  ไม่พบ conversation — ตรวจสอบว่า Inbox โหลดแล้ว');
            return;
        }

        // โหลดประวัติการรัน
        const syncCache = loadSyncCache();
        const threadsKeys = [...threads.keys()];

        if (process.env.DEBUG_SYNC) {
            console.log('   [Debug] Threads in cache:', Object.keys(syncCache).length);
            console.log('   [Debug] Sample Threads found:', threadsKeys.slice(0, 3).map(id => String(id)));
        }

        const alreadySyncedCount = threadsKeys.filter(id => {
            const idStr = String(id).trim();
            const isMatch = !!syncCache[idStr];
            return isMatch;
        }).length;

        // ถ้าไม่ได้ inboxID จาก fiber ให้ดึงจาก URL
        const pageInboxID = inboxID || new URLSearchParams(page.url().split('?')[1] || '').get('asset_id') || '';
        const allThreadsList = [...threads.entries()];
        const totalFound = allThreadsList.length;

        // [DeepSync] Process all found threads up to LIMIT (9999)
        const eligibleThreads = allThreadsList.filter(([id]) => {
            const idStr = String(id).trim();
            return !syncCache[idStr];
        });

        const convList = eligibleThreads.slice(0, LIMIT);

        let successCount = 0, totalUpdated = 0;

        console.log(`\n📊 พบทั้งหมด ${totalFound} conversations`);
        console.log(`⏭️  ข้ามที่เคยทำแล้ว ${alreadySyncedCount} รายการ (Persistence Mode)`);
        console.log(`🔍 รอบนี้จะทำงาน ${convList.length} conversations (Full Sync Mode)\n`);

        // ── วนประมวลผลแต่ละ conversation ─────────────────────────────────────
        for (let i = 0; i < convList.length; i++) {
            const [threadID, { threadType, inboxID: convInboxID }] = convList[i];

            process.stdout.write(`[${String(i + 1).padStart(2)}/${convList.length}] ${threadID.slice(-12)} `);

            try {
                // [ANTI-BOT] Natural Click Strategy
                const clicked = await page.evaluate((targetID) => {
                    const rows = document.querySelectorAll('._4bl9 a[role="row"]');
                    for (const row of rows) {
                        const fk = Object.keys(row).find(k => k.startsWith('__reactFiber'));
                        if (!fk) continue;
                        let cur = row[fk];
                        for (let j = 0; j < 35 && cur; j++) {
                            const p = cur.memoizedProps || cur.pendingProps;
                            if (p?.threadID === targetID) {
                                row.focus();
                                row.click();
                                return true;
                            }
                            cur = cur.return;
                        }
                    }
                    return false;
                }, threadID);

                if (!clicked) {
                    console.log('⚠️  ไม่พบแถวใน Sidebar (อาจต้องรีโหลดหน้า)');
                    // Fallback to URL navigation ONLY if click fails
                    const convInbox = convInboxID || pageInboxID;
                    const url = `https://business.facebook.com/latest/inbox/all?asset_id=${convInbox}&selected_item_id=${threadID}&mailbox_id=${convInbox}&thread_type=${threadType}`;
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                }

                // [ANTI-BOT] Random wait after switching (5-12s)
                await randomWait(5000, 12000);

                // รอให้ chat area โหลด
                try {
                    await page.waitForFunction(() => {
                        const all = document.querySelectorAll('span, div');
                        for (const el of all) {
                            const t = (el.textContent || '').trim();
                            if ((t.startsWith('ส่งโดย ') || t.startsWith('Sent by ')) && t.length < 120)
                                return true;
                        }
                        return false;
                    }, { timeout: 6000 });
                } catch {
                    await randomWait(1000, 3000);
                }

                // [DeepSync] Scroll to top of message list (Cutoff: February 1st, 2026)
                console.log(`  📜 Scrolling up (Cutoff: Feb 1st, 2026)...`);
                await page.evaluate(async () => {
                    const scrollContainer = document.querySelector('div[role="main"] div[data-testid="mw_chat_scroller"]')
                        || document.querySelector('[role="log"]')
                        || document.querySelector('[aria-label*="สนทนา"]')
                        || document.querySelector('[aria-label*="Message list"]');
                    if (!scrollContainer) return;

                    let lastScrollTop = scrollContainer.scrollTop;
                    let sameCount = 0;

                    for (let i = 0; i < 40; i++) { // Max deep scan
                        // Match "Jan 2026", "ม.ค. 2026", "2025" etc. only in the main chat area
                        const chatArea = document.querySelector('div[role="main"]');
                        const allText = chatArea ? chatArea.innerText : '';
                        const reachCutoff = /ม\.ค\. 2026|Jan 2026|2025|2024/.test(allText);

                        if (reachCutoff) {
                            console.log('    🛑 Reached January 2026 or older — stopping scroll.');
                            break;
                        }

                        scrollContainer.scrollTop = 0;
                        await new Promise(r => setTimeout(r, 1200));
                        if (scrollContainer.scrollTop === lastScrollTop) {
                            sameCount++;
                            if (sameCount > 3) break;
                        } else {
                            sameCount = 0;
                        }
                        lastScrollTop = scrollContainer.scrollTop;
                    }
                });
                await randomWait(2000, 4000);

                // ดึง "ส่งโดย"
                let senders = await extractSenders(page);

                // [Self-Healing] Retry once if empty (might be a render lag)
                if (!senders.length) {
                    await page.waitForTimeout(3000);
                    senders = await extractSenders(page);
                }

                // debug: แสดงผลที่ดึงได้
                if (process.env.DEBUG_SYNC) {
                    console.log('  DEBUG senders:', JSON.stringify(senders.slice(0, 3)));
                }

                if (!senders.length) {
                    console.log('⊘  ไม่พบ sender (ลองเลื่อนซ้ำหรือแชทนี้ไม่มีแอดมินตอบ?)');
                    continue;
                }

                // ส่ง CRM API ผ่าน Node.js
                const result = await callCrmApi('/api/marketing/chat/message-sender', { conversationId: threadID, senders });
                const names = [...new Set(senders.map(s => s.name))].join(', ');
                const note = result.updated > 0 ? `+${result.updated} msgs` : 'conv-level';
                console.log(`✅ [${names}] (${note})`);

                // [Intelligence] บันทึกลง Cache ทันทีที่สำเร็จ
                saveSyncCache(threadID, { success: true, agents: [...new Set(senders.map(s => s.name))] });

                successCount++;
                totalUpdated += result.updated || 0;

            } catch (err) {
                console.log(`❌ ${err.message.slice(0, 70)}`);
            }
        }

        console.log('\n' + '─'.repeat(52));
        console.log(`✅ ${successCount}/${convList.length} conversations สำเร็จ`);
        console.log(`📊 อัปเดตข้อความ: ${totalUpdated} รายการ`);
        console.log('─'.repeat(52) + '\n');

    } finally {
        if (ownsBrowser && context) await context.close();
        else if (ATTACH && browser) await browser.close();
    }
}

async function run() {
    if (LOOP) {
        while (true) {
            await syncAgents();
            console.log(`\n💤 Waiting ${DELAY} minutes for next sync round...`);
            await new Promise(resolve => setTimeout(resolve, DELAY * 60 * 1000));
        }
    } else {
        await syncAgents();
    }
}

run().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });
