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
 *    --limit=9999              จำนวน conversation (default: 9999)
 *    --port=9222               CDP port (default: 9222)
 *    --mode=db                 ดึง conv IDs จาก CRM DB แทน sidebar scroll
 *    --from=YYYY-MM-DD         วันเริ่ม (ใช้กับ --mode=db)
 *    --to=YYYY-MM-DD           วันสิ้นสุด (ใช้กับ --mode=db)
 *    --force                   ทำซ้ำทุก thread แม้เคย cache แล้ว
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
const DELAY = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '0'); // Minutes between loops
const FORCE = args.includes('--force'); // ถ้าใส่ --force จะ re-process ทุก thread แม้เคย cache แล้ว
const MODE = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'sidebar'; // 'sidebar' | 'db'
const FROM = args.find(a => a.startsWith('--from='))?.split('=')[1] || '';  // เช่น 2026-02-01
const TO = args.find(a => a.startsWith('--to='))?.split('=')[1] || '';    // เช่น 2026-02-28
const PAGE_ID = args.find(a => a.startsWith('--page-id='))?.split('=')[1] || '';
const FILE_PATH = args.find(a => a.startsWith('--file='))?.split('=')[1] || ''; // โหลด Target ID จาก JSON file

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
const DISABLE_LOCAL_CACHE = process.env.DISABLE_LOCAL_CACHE === 'true';

function loadSyncCache() {
    if (DISABLE_LOCAL_CACHE) {
        console.log('   [Sync] DISABLE_LOCAL_CACHE is active. Local synced_threads.json will be bypassed for logic.');
        return {};
    }
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

function saveSyncCache(threadID, result, secondaryID = null) {
    if (DISABLE_LOCAL_CACHE) {
        // Log to flat file for auditing anyway, but skip JSON cache
        if (result.success) {
            const idStr = String(threadID).trim();
            const extra = secondaryID ? ` [Mapped: ${secondaryID}]` : '';
            const logEntry = `[${new Date().toISOString()}] Synced: ${idStr}${extra} | Agents: ${result.agents?.join(', ') || 'n/a'}\n`;
            fs.appendFileSync(SYNC_LOG_PATH, logEntry, 'utf8');
        }
        return;
    }
    try {
        const idStr = String(threadID).trim();
        const cache = loadSyncCache();
        const entry = {
            syncedAt: new Date().toISOString(),
            status: result.success ? 'success' : 'failed',
            agents: result.agents || []
        };
        cache[idStr] = entry;

        // If we learned a secondary ID (like UID redirected from PSID), save it too
        if (secondaryID && String(secondaryID) !== idStr) {
            cache[String(secondaryID)] = entry;
        }

        fs.writeFileSync(SYNC_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');

        // BATCH LOG: Append to flat file for auditing
        if (result.success) {
            const extra = secondaryID ? ` [Mapped: ${secondaryID}]` : '';
            const logEntry = `[${new Date().toISOString()}] Synced: ${idStr}${extra} | Agents: ${result.agents?.join(', ') || 'n/a'}\n`;
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
    await page.waitForSelector('a[href*="selected_item_id"]', { timeout: 20000 });
    await page.waitForTimeout(1000);

    const allThreads = new Map(); // threadID → { threadType, inboxID }
    let inboxID = null;

    // helper: ดึง threads ที่มองเห็นตอนนี้
    const scrapeVisible = async () => {
        const threads = await page.evaluate(() => {
            const results = [];
            // ดึงลิงก์แชททั้งแบบเก่า (มี href) และแบบใหม่ (มีแค่ role=row หรือ ._4bl9)
            const chatLinks = Array.from(document.querySelectorAll('a[href*="selected_item_id"], a[role="row"], ._4bl9 a'));

            chatLinks.forEach(el => {
                const href = el.getAttribute('href');
                if (href && href.includes('selected_item_id=')) {
                    const match = href.match(/selected_item_id=([^&]+)/);
                    if (match && match[1]) {
                        const typeMatch = href.match(/thread_type=([^&]+)/);
                        results.push({
                            threadID: match[1],
                            threadType: typeMatch ? typeMatch[1] : 'FB_MESSAGE',
                            inboxID: null
                        });
                    }
                } else {
                    // แบบใหม่ Meta ซ่อน ID ไว้ใน React Fiber แล้วให้หน้า UI เป็นแค่ "#"
                    const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
                    if (fk) {
                        let cur = el[fk];
                        for (let i = 0; i < 35 && cur; i++) {
                            const p = cur.memoizedProps || cur.pendingProps;
                            if (p?.threadID) {
                                results.push({
                                    threadID: p.threadID,
                                    threadType: p.threadType || 'FB_MESSAGE',
                                    inboxID: p.inboxID
                                });
                                break;
                            }
                            cur = cur.return;
                        }
                    }
                }
            });
            return results.map(r => ({ ...r, threadID: String(r.threadID).trim() }));
        });
        for (const t of threads) {
            if (!allThreads.has(t.threadID)) {
                allThreads.set(t.threadID, { threadType: t.threadType, inboxID: t.inboxID });
                if (!inboxID && t.inboxID) inboxID = t.inboxID;
            }
        }
    };

    // --- NEW SCROLL LOGIC: Mouse Wheel over the Navigation Sidebar ---
    // Instead of relying on keyboard focus (which Business Suite often traps), we explicitly dispatch wheel events
    console.log('   [Scroll] จำลองการเลื่อนเมาส์ (Mouse Wheel) ลงบน Sidebar...');

    // Find the sidebar container's bounds
    let sidebarX = 250, sidebarY = 400; // Hardcoded safe spot (chat list is usually 80px - 450px)
    // Removed dynamic center calculation because Facebook's aria-labels often wrap the ENTIRE dashboard.

    // Move mouse over sidebar to ensure wheel events target it
    console.log(`   [Scroll] พิกัดเลื่อนเมาส์เป้าหมาย: X=${sidebarX}, Y=${sidebarY}`);
    await page.mouse.move(sidebarX, sidebarY);
    await scrapeVisible();

    // Scroll by simulating mouse wheel
    for (let round = 0; round < 250; round++) { // limit rounds
        if (allThreads.size >= limit) break;

        const prevSize = allThreads.size;

        // Simulate 3 ticks of mouse wheel down
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(300);
        await page.mouse.wheel(0, 1500);

        await page.waitForTimeout(2500); // Wait for React lazy load
        await scrapeVisible();

        console.log(`   [Round ${round + 1}] Threads Found: ${allThreads.size} / Target: ${limit}`);

        if (allThreads.size === prevSize) {
            console.log('   ⏳ ไม่พบแชทใหม่ในรอบนี้ ลองปั่นเมาส์ลงแรงๆ...');
            await page.mouse.wheel(0, 5000);
            await page.waitForTimeout(4000);
            await scrapeVisible();

            if (allThreads.size === prevSize) {
                // Try one final aggressive wheel + small layout nudge
                await page.mouse.wheel(0, -100); // nudge up
                await page.waitForTimeout(100);
                await page.mouse.wheel(0, 6000); // pull down hard
                await page.waitForTimeout(3000);
                await scrapeVisible();

                if (allThreads.size === prevSize) {
                    console.log('   ⏹️  สุดขอบ sidebar หรือโหลดไม่ขึ้นแล้ว — หยุดการดึง (กำลังถ่ายภาพหน้าจอเพื่อตรวจสอบ...)');
                    try {
                        await page.screenshot({ path: require('path').join(process.cwd(), 'logs', 'stuck_sidebar_debug.png') });
                        console.log('   📸 บันทึกภาพหน้าจอไว้ที่ logs/stuck_sidebar_debug.png แล้ว');
                    } catch (e) { }
                    break;
                }
            }
        }
    }

    console.log(`\n   รวม ${allThreads.size} threads (จาก limit ${limit})`);
    return { threads: allThreads, inboxID };
}
// ─── ดึง "ส่งโดย" + message text จาก DOM โดยตรง ─────────────────────────────
// Strategy A: หา previousElementSibling ของ ancestors → text ก่อน label = message
// Strategy B: container innerText - labelText (fallback)
// ไม่ใช้ React Fiber
async function extractSenders(page) {
    const result = await page.evaluate(() => {
        const pairs = [];
        const seen = new Set();
        const debugInfo = { labelsFound: 0, skippedNoName: 0, skippedNoMsg: 0, extracted: 0, strategyA: 0, strategyB: 0, fiberHits: 0 };

        const SENT_BY = /^(?:ส่งโดย|Sent by)\s+/;
        const SKIP_NAMES = /ข้อความตอบกลับอัตโนมัติ|auto-reply|assigned this/i;
        const SKIP_LINE = /^(?:ก่อนหน้านี้|ปิด|เปิด|ถัดไป|ส่งโดย|Sent by|ดูรายละเอียด|See details|แชท|Inbox|All|ทั้งหมด|Label|Done|ปิดแล้ว|\d{1,2}:\d{2}(?:\s*[AP]M)?|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{1,2}\s*(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.).*|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d+.*|[จอพปสอศ]\.|[JFMASOND][a-z]+\.?\s*\d+)$/i;
        const HAS_CONTENT = /[ก-๙a-zA-Z0-9]/;

        // ── Phase 1: Fiber Extraction (Build text snippet -> msgId Map) ──
        const textToMsgIdMap = new Map();
        try {
            const bubbles = document.querySelectorAll('div[data-testid="mw_message_bubble"], [role="row"], [role="article"], ._4bl9, .x1n2onr6');
            for (const b of bubbles) {
                const fk = Object.keys(b).find(k => k.startsWith('__reactFiber'));
                if (!fk) continue;
                let cur = b[fk];
                for (let i = 0; i < 40 && cur; i++) {
                    const p = cur.memoizedProps || cur.pendingProps;
                    if (p?.message || p?.msg) {
                        const m = p.message || p.msg;
                        const msgId = m.message_id || m.id || m.messageId;
                        if (msgId) {
                            let txt = m.text || m.body || m.body_text || '';
                            if (!txt && m.payload?.text) txt = m.payload.text;

                            if (txt && typeof txt === 'string') {
                                const snippet1 = txt.trim().slice(0, 150);
                                const snippet2 = txt.trim().slice(0, 40);
                                if (snippet1.length > 2) textToMsgIdMap.set(snippet1, msgId);
                                if (snippet2.length > 2) textToMsgIdMap.set(snippet2, msgId);
                                debugInfo.fiberHits++;
                            }
                        }
                        break;
                    }
                    cur = cur.return;
                }
            }
        } catch (e) {
            // Ignore Fiber errors safely
        }

        const labels = Array.from(document.querySelectorAll('span, div, [role="gridcell"]')).filter(el => {
            const t = (el.textContent || '').trim();
            // Look for "ส่งโดย " or "Sent by " - be more liberal with the regex
            return /(?:ส่งโดย|sent\s+by)[:\s]*/i.test(t) && !SKIP_NAMES.test(t) && t.length < 100;
        });
        debugInfo.labelsFound = labels.length;

        for (const label of labels) {
            const labelText = (label.textContent || '').trim();
            const name = labelText.replace(SENT_BY, '').trim();
            if (!name || name.length < 2 || name.length > 60) { debugInfo.skippedNoName++; continue; }

            // ดึง Facebook profile URL จาก <a> ใน label (ใช้ match employee)
            const linkEl = label.querySelector('a[href*="facebook.com"]')
                || label.parentElement?.querySelector('a[href*="facebook.com"]');
            const fbProfile = linkEl ? (linkEl.getAttribute('data-hovercard') || linkEl.href || null) : null;
            // extract vanity name: facebook.com/jutamat.sangprakai → jutamat.sangprakai
            const fbVanity = fbProfile ? fbProfile.replace(/.*facebook\.com\//, '').replace(/[?#].*/, '') : null;

            // ── Strategy A: previousElementSibling walk — เก็บทุก admin msgText ──
            // DOM จริง: message bubble กับ "ส่งโดย" label เป็น siblings ของ parent เดียวกัน
            // ต้องเริ่มจาก label เอง (ไม่ใช่ label.parentElement) เพื่อจับ sibling ทันที
            // ไม่หยุดเมื่อเจอ label ก่อนหน้า → เดินย้อนกลับจนสุด conversation
            // ใช้ seen set กันไม่ให้ข้อความเดียวถูก attribute ซ้ำกับ label อื่น
            // (labels iterate ตาม DOM order บน→ล่าง = chronological → label แรกจับ msgs ต้น thread
            //  → seen lock → label ถัดไปจะข้ามไป → attribution ถูกต้องโดยอัตโนมัติ)
            const collectedTexts = [];
            let ancestor = label;
            for (let depth = 0; depth < 20 && ancestor; depth++) {
                let sib = ancestor.previousElementSibling;
                for (let s = 0; s < 10 && sib; s++) {
                    const t = (sib.innerText || sib.textContent || '').trim();
                    // ข้าม "ส่งโดย" label ที่เจอระหว่างทาง แต่ไม่หยุด — เดินต่อไปเรื่อยๆ
                    if (!SENT_BY.test(t) && t.length >= 4 && t.length <= 1000 && HAS_CONTENT.test(t)) {
                        const lines = t.split('\n')
                            .map(l => l.trim())
                            .filter(l => l.length >= 4 && !SKIP_LINE.test(l) && HAS_CONTENT.test(l));
                        lines.forEach(line => collectedTexts.push(line.slice(0, 150)));
                    }
                    sib = sib.previousElementSibling;
                }
                ancestor = ancestor.parentElement;
            }

            // ── Strategy B: container innerText - labelText (fallback เมื่อ Strategy A ไม่ได้เลย) ──
            if (collectedTexts.length === 0) {
                let cur = label.parentElement;
                let fallbackText = null;
                for (let depth = 0; depth < 15 && cur && !fallbackText; depth++) {
                    const containerText = (cur.innerText || '').trim();
                    if (!containerText) { cur = cur.parentElement; continue; }

                    const withoutLabel = containerText.replace(labelText, '').trim();
                    // เปิด max เป็น 800 (FB message อาจยาว) และ min ต้องมีเนื้อหา
                    if (withoutLabel.length >= 4 && withoutLabel.length <= 800 && HAS_CONTENT.test(withoutLabel) && !SENT_BY.test(withoutLabel)) {
                        const lines = withoutLabel.split('\n')
                            .map(l => l.trim())
                            .filter(l => l.length >= 4 && !SKIP_LINE.test(l) && HAS_CONTENT.test(l));
                        if (lines.length > 0) {
                            fallbackText = lines[0].slice(0, 150);
                            debugInfo.strategyB++;
                        }
                    }
                    cur = cur.parentElement;
                }
                if (fallbackText) collectedTexts.push(fallbackText);
            }

            // ต้องการ msg-level เท่านั้น — ถ้าไม่มี msgText เลย (เช่น sticker-only group) ข้ามไป
            if (collectedTexts.length === 0) { debugInfo.skippedNoMsg++; continue; }

            // push ทุก msgText ใน group ให้ชื่อเดียวกัน → message-sender API อัปเดตครบทุก message
            for (const mt of collectedTexts) {
                const key = `${name}|${mt.slice(0, 30)}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    const exactMsgId = textToMsgIdMap.get(mt) || textToMsgIdMap.get(mt.slice(0, 40)) || null;
                    // fbVanity = Facebook profile vanity name (e.g. "jutamat.sangprakai") — ใช้ match employee
                    pairs.push({ name, msgId: exactMsgId, msgText: mt, fbVanity: fbVanity || undefined });
                    debugInfo.strategyA++;
                    debugInfo.extracted++;
                }
            }
        }

        // ── Strategy C: Direct Bubbles (Ported from v4 & Expanded) ──────────────────────
        // If we still found no senders via labels, try scouring the message bubbles directly via Fiber
        if (pairs.length === 0) {
            const bubbles = document.querySelectorAll('div[data-testid="mw_message_bubble"], [role="row"], [role="article"], ._4bl9');
            let foundAny = false;
            for (const b of bubbles) {
                const fk = Object.keys(b).find(k => k.startsWith('__reactFiber'));
                let cur = b[fk];
                for (let i = 0; i < 40 && cur; i++) {
                    const p = cur.memoizedProps || cur.pendingProps;
                    if (p?.message) {
                        const m = p.message;
                        // For older chats, Facebook doesn't wrap it in "Sent by" at all
                        let rawName = m.sender_name || m.author_name || m.sender?.name || m.sender_name_text || 'Unknown Admin';
                        let name = rawName.trim().split('\n')[0].replace(/^(ส่งโดย|Sent by)[:\s]*/i, '').trim();

                        // If it's the customer, skip (unless we want to track customer msgs too, but logic expects Admin names)
                        if (name.length < 2 || SKIP_NAMES.test(name)) {
                            // Only skip if explicitly an auto-respond or invalid string.
                            // We don't skip "Unknown Admin"
                            if (name !== 'Unknown Admin') break;
                        }

                        let txt = m.text || m.body || m.body_text || '';
                        if (!txt && m.payload?.text) txt = m.payload.text;

                        // We only want admin/page messages, so we check if it is highly likely from the page.
                        // Usually, `m.sender_name` being missing in Action rows or having the Page Name implies Admin.
                        // For now, if we reach here and it's a valid message string, we capture it.
                        if (txt && typeof txt === 'string' && txt.length > 2) {
                            const msgId = m.message_id || m.id || m.messageId || null;
                            const key = `${name}|${String(txt).slice(0, 30)}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                pairs.push({ name, msgId: msgId, msgText: String(txt).slice(0, 150) });
                                debugInfo.strategyB++; // Count C towards B for stats
                                foundAny = true;
                            }
                        }
                        break;
                    }
                    cur = cur.return;
                }
            }

            // If even Fiber didn't find specific senders but we see obvious Chat Text on the page, 
            // construct a dummy payload so the thread is marked as synced.
            if (!foundAny) {
                try {
                    // Try to extract actual bubble texts that look like messages
                    const rawTexts = Array.from(document.querySelectorAll('div[dir="auto"]'))
                        .map(el => (el.textContent || '').trim())
                        .filter(t => t.length > 2 && t.length < 500 && !SKIP_LINE.test(t));

                    if (rawTexts.length > 0) {
                        // Take the last 3 visible messages just to have some proof of life
                        const sampleTexts = [...new Set(rawTexts)].slice(-3);
                        for (const text of sampleTexts) {
                            pairs.push({ name: 'Unknown Admin', msgId: null, msgText: text.slice(0, 150) });
                            debugInfo.strategyB++;
                        }
                    } else {
                        // Desperate fallback, just grab the whole container
                        const chatArea = document.querySelector('[aria-label*="Message list"]') || document.querySelector('div[role="main"]');
                        if (chatArea && chatArea.innerText.length > 50) {
                            const lines = chatArea.innerText.split('\n')
                                .map(l => l.trim())
                                .filter(l => l.length > 10 && !SKIP_LINE.test(l));
                            if (lines.length > 0) {
                                pairs.push({ name: 'Unknown Admin', msgId: null, msgText: lines[lines.length - 1].slice(0, 150) });
                                debugInfo.strategyB++;
                            }
                        }
                    }
                } catch (e) { }
            }
        }

        return { pairs, debugInfo };
    });

    // Log debug info เสมอ (สั้น) หรือเต็มถ้า DEBUG_SYNC
    const d = result.debugInfo;
    if (process.env.DEBUG_SYNC) {
        console.log(`   [extractSenders] labels=${d.labelsFound} extracted=${d.extracted} fiber=${d.fiberHits} noMsg=${d.skippedNoMsg} stratA=${d.strategyA} stratB=${d.strategyB}`);
        if (result.pairs.length > 0) {
            console.log('   [Sample]', JSON.stringify(result.pairs.slice(0, 2)));
        }

        // ถ้า labels=0 dump raw "ส่งโดย" occurrences จาก DOM เพื่อ diagnose
        if (d.labelsFound === 0) {
            const domDump = await page.evaluate(() => {
                const out = { sentByHits: [], chatSample: [] };

                // 1. หา "ส่งโดย"/"Sent by" แบบกว้าง — รวม partial match
                document.querySelectorAll('span, div, p').forEach(el => {
                    if (el.children.length > 5) return;
                    const t = (el.textContent || '').trim();
                    if ((t.includes('ส่งโดย') || t.includes('Sent by') || t.includes('sent by')) && t.length < 300) {
                        out.sentByHits.push({
                            tag: el.tagName,
                            text: t.slice(0, 100),
                            childrenCount: el.children.length,
                            charCodes: Array.from(t.slice(0, 15)).map(c => c.codePointAt(0)).join(',')
                        });
                    }
                });

                // 2. ดึง sample text จาก chat area (main content) — ช่วย identify ว่า FB ใช้คำอะไร
                const mainArea = document.querySelector('[role="main"]') || document.querySelector('[role="log"]') || document.body;
                const chatTexts = [];
                mainArea.querySelectorAll('span, div').forEach(el => {
                    if (el.children.length > 0) return; // leaf nodes only
                    const t = (el.textContent || '').trim();
                    if (t.length >= 3 && t.length <= 120) chatTexts.push(t);
                });
                // สุ่ม 40 จาก leaf texts ตรงกลาง (น่าจะเป็นส่วน chat จริง)
                const mid = Math.floor(chatTexts.length / 2);
                out.chatSample = chatTexts.slice(Math.max(0, mid - 20), mid + 20);

                return out;
            });

            if (domDump.sentByHits.length > 0) {
                console.log(`   [DOM "ส่งโดย" partial hits — ${domDump.sentByHits.length}]:`);
                domDump.sentByHits.forEach(h => console.log(`     ${h.tag} ch=${h.childrenCount} | "${h.text}" | cp=[${h.charCodes}]`));
            } else {
                console.log('   [DOM] ไม่มี "ส่งโดย"/"Sent by" ใน DOM เลย');
                console.log('   [Chat area sample texts]:');
                // แสดง 20 บรรทัดจาก sample เพื่อดู format จริง
                domDump.chatSample.slice(0, 20).forEach(t => console.log(`     · "${t}"`));
            }
        }
    } else if (d.labelsFound > 0 && d.extracted === 0) {
        // แสดงเตือนเมื่อเจอ label แต่ดึง text ไม่ได้ (ไม่ต้องใช้ DEBUG_SYNC)
        console.log(`   ⚠️  labels=${d.labelsFound} แต่ msgText=0 (noMsg=${d.skippedNoMsg}) — ลอง DEBUG_SYNC=1`);
    }

    return result.pairs;
}

// ─── DB Mode: ดึง conversation IDs จาก CRM API ───────────────────────────────
async function fetchConvsFromDB(from, to, limit) {
    return new Promise((resolve) => {
        const params = `from=${from}&to=${to}&limit=${limit}`;
        const req = http.request({
            hostname: 'localhost', port: 3000,
            path: `/api/conversations?${params}`, method: 'GET',
        }, (res) => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    const data = JSON.parse(raw);
                    resolve(data.conversations || []);
                } catch {
                    resolve([]);
                }
            });
        });
        req.on('error', e => {
            console.error('[DB Mode] ❌ ไม่สามารถดึง conversations จาก API:', e.message);
            resolve([]);
        });
        req.end();
    });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function syncAgents() {
    console.log('\n🚀 V School Agent Sync v2');
    console.log(`   โหมด : ${MODE === 'db' ? `DB-driven (${FROM} → ${TO})` : ATTACH ? `Attach (port ${PORT})` : HEADLESS ? 'Headless' : 'New browser'}`);
    console.log(`   Limit: ${LIMIT} conversations`);
    console.log(`   Loop : ${LOOP ? `Enabled (every ${DELAY}m)` : 'Disabled'}`);
    if (FORCE) console.log(`   Force: ✅ ทำซ้ำทุก thread แม้เคย cache แล้ว`);
    console.log();

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
        await page.goto('https://business.facebook.com/latest/inbox/all', { waitUntil: 'domcontentloaded', timeout: 30000 });
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

        // ── ดึง inboxID (ใช้เป็น asset_id ใน URL navigation) ───────────────────
        // Priority: --page-id flag > URL asset_id > navigate to inbox แล้วดึง
        let pageInboxID = PAGE_ID
            || new URLSearchParams(page.url().split('?')[1] || '').get('asset_id')
            || '';

        if (!pageInboxID) {
            // Auto-detect: navigate to inbox แล้วรอ URL มี asset_id
            console.log('🔍 Auto-detecting Page ID...');
            await page.goto('https://business.facebook.com/latest/inbox/all', { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForTimeout(3000);
            try {
                await page.waitForFunction(() => new URLSearchParams(window.location.search).get('asset_id'), { timeout: 10000 });
            } catch { /* ไม่ได้ก็ใช้ URL ปัจจุบัน */ }
            pageInboxID = new URLSearchParams(page.url().split('?')[1] || '').get('asset_id') || '';
            if (pageInboxID) console.log(`✅ Page ID: ${pageInboxID}`);
            else console.warn('⚠️  ไม่พบ Page ID — URL navigation อาจผิดพลาด ลองใส่ --page-id=XXXXXXX');
        }

        // ── Collect thread IDs: DB mode หรือ Sidebar mode ─────────────────────
        let allThreadsList = [];  // [threadID, { threadType, inboxID, participantId? }][]
        let totalFound = 0;

        if (FILE_PATH) {
            // ── JSON FILE Mode: โหลด conversation IDs จากไฟล์ (เช่น feb_threads.json) ─────────────
            console.log(`🗄️  FILE Mode: โหลด conversations จาก ${FILE_PATH}...`);
            const targetPath = path.resolve(process.cwd(), FILE_PATH);

            if (!fs.existsSync(targetPath)) {
                console.error(`❌ ไม่พบไฟล์: ${targetPath}`);
                console.error(`   (Current Working Directory: ${process.cwd()})`);
                process.exit(1);
            }

            const fileData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
            if (!fileData.length) {
                console.log(`⚠️  ไฟล์ ${FILE_PATH} ไม่มีข้อมูล (Array ว่าง)`);
                return;
            }

            console.log(`   พบ ${fileData.length} conversations ในไฟล์`);

            // แปลง File format → allThreadsList format
            for (const item of fileData) {
                if (!item.id && !item.convId) continue;

                const convIdFull = String(item._graphApiId || item.convId || item.id || ''); // e.g. t_X or FB_CHAT_X
                const psid = String(item.psid || item._psid || item.id || '');
                const convIdStrip = convIdFull.replace(/^(t_|FB_CHAT_)/, '');

                // threadType จาก file (FB_MESSAGE / IG_MESSAGE) หรือ auto-detect จาก PSID length
                const fileThreadType = item.threadType || (psid.length > 20 ? 'IG_MESSAGE' : 'FB_MESSAGE');

                const threadID = convIdFull;
                allThreadsList.push([threadID, {
                    threadType: fileThreadType,
                    inboxID: pageInboxID,
                    participantId: psid,
                    conversationId: convIdFull,
                    convIdStrip,
                }]);
            }
            totalFound = allThreadsList.length;

        } else if (MODE === 'db') {
            // ── DB Mode: ดึง conversation IDs ทั้งหมดจาก CRM DB ─────────────
            if (!FROM || !TO) {
                console.error('❌ --mode=db ต้องระบุ --from=YYYY-MM-DD และ --to=YYYY-MM-DD ด้วย');
                process.exit(1);
            }
            console.log(`🗄️  DB Mode: ดึง conversations ${FROM} → ${TO}...`);
            const dbConvs = await fetchConvsFromDB(FROM, TO, LIMIT);

            if (!dbConvs.length) {
                console.log('⚠️  ไม่พบ conversations จาก DB ในช่วงวันที่กำหนด');
                return;
            }

            console.log(`   พบ ${dbConvs.length} conversations จาก DB`);

            // แปลง DB format → allThreadsList format
            // selected_item_id ใน Business Suite URL = PSID (participantId)
            // ไม่ใช่ conversationId (t_XXXXX = thread ID ซึ่ง FB ไม่รับใน URL)
            for (const conv of dbConvs) {
                if (!conv.conversationId && !conv.participantId) continue;
                // ลอง 3 format ตามลำดับ: t_XXXXX (full), XXXXX (stripped), PSID
                // Business Suite URL selected_item_id อาจรับได้หลาย format
                const convIdFull = String(conv.conversationId || '');          // t_10163596802286505
                const convIdStrip = convIdFull.replace(/^t_/, '');              // 10163596802286505
                const psid = String(conv.participantId || '');           // 25726727506923789

                // เก็บทั้งหมดไว้ใน meta แล้วลองทีละ format ตอน navigate
                const threadID = convIdFull || psid; // ใช้ full convId เป็น key
                allThreadsList.push([threadID, {
                    threadType: 'FB_MESSAGE',
                    inboxID: pageInboxID,
                    participantId: psid,
                    conversationId: convIdFull,
                    convIdStrip,
                }]);
            }
            totalFound = allThreadsList.length;

        } else {
            // ── Sidebar Mode: Scroll sidebar เหมือนเดิม ──────────────────────
            const { threads, inboxID } = await collectAllThreadIds(page, LIMIT);

            if (threads.size === 0) {
                console.log('⚠️  ไม่พบ conversation — ตรวจสอบว่า Inbox โหลดแล้ว');
                return;
            }
            allThreadsList = [...threads.entries()].map(([id, meta]) => [id, { ...meta, inboxID: meta.inboxID || inboxID || pageInboxID }]);
            totalFound = allThreadsList.length;
        }

        // โหลดประวัติการรัน
        const syncCache = loadSyncCache();

        if (process.env.DEBUG_SYNC) {
            console.log('   [Debug] Threads in cache:', Object.keys(syncCache).length);
            console.log('   [Debug] Sample Threads found:', allThreadsList.slice(0, 3).map(([id]) => String(id)));
        }

        const alreadySyncedCount = allThreadsList.filter(([id]) => !!syncCache[String(id).trim()]).length;

        // [DeepSync] Process all found threads up to LIMIT
        // --force: ทำทุก thread แม้เคย cache แล้ว
        // หมายเหตุ: allThreadsList ถูกดึงจากบนลงล่าง (ล่าสุดไปเก่าสุด) ตามที่ผู้ใช้ต้องการแล้ว
        const eligibleThreads = FORCE
            ? allThreadsList
            : allThreadsList.filter(([id]) => !syncCache[String(id).trim()]);

        const convList = eligibleThreads.slice(0, LIMIT);

        let successCount = 0, totalUpdated = 0;

        console.log(`\n📊 พบทั้งหมด ${totalFound} conversations`);
        console.log(`⏭️  ข้ามที่เคยทำแล้ว ${alreadySyncedCount} รายการ${FORCE ? ' (FORCE: ไม่ข้าม)' : ' (Persistence Mode)'}`);
        console.log(`🔍 รอบนี้จะทำงาน ${convList.length} conversations${FORCE ? ' (--force mode)' : ''}\n`);

        // ── วนประมวลผลแต่ละ conversation ─────────────────────────────────────
        for (let i = 0; i < convList.length; i++) {
            const [threadID, { threadType, inboxID: convInboxID, participantId: dbParticipantId, conversationId: dbConvId, convIdStrip }] = convList[i];

            process.stdout.write(`[${String(i + 1).padStart(2)}/${convList.length}] ${threadID.slice(-12)} `);

            try {
                // [NEW] Scope variables for the whole thread iteration
                let learnedUid = null;
                let urlPsid = null;

                // [ANTI-BOT] Natural Click Strategy with Auto-Scroll Fallback
                // Reset sidebar scroll to top before searching to ensure we don't miss anything that scrolled up
                try {
                    await page.evaluate(() => {
                        const scroller = document.querySelector('div[role="tablist"]') || document.querySelector('div[role="navigation"]');
                        if (scroller) {
                            let el = scroller;
                            for (let i = 0; i < 5; i++) {
                                if (!el) break;
                                const s = getComputedStyle(el);
                                if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 20) {
                                    el.scrollTop = 0;
                                    return;
                                }
                                el = el.parentElement;
                            }
                        }
                    });
                } catch (ce) {
                    if (process.env.DEBUG_SYNC) console.log('   ⚠️ ข้ามช่วง Execution context error:', ce.message);
                }
                await page.waitForTimeout(500);

                let clicked = false;

                // [Optimization] If we are using an Offline Target List (FILE or DB), the thread is almost certainly NOT in the sidebar DOM.
                // Do not waste 20+ seconds trying to scroll the Meta UI. Jump straight to URL Navigation fallback.
                if (!FILE_PATH && MODE !== 'db') {
                    for (let retryScroll = 0; retryScroll < 40; retryScroll++) {
                        try {
                            clicked = await page.evaluate((targetID) => {
                                const rows = document.querySelectorAll('._4bl9 a[role="row"], div[role="presentation"]._at41, [role="row"]');
                                for (const row of rows) {
                                    const fk = Object.keys(row).find(k => k.startsWith('__reactFiber'));
                                    if (!fk) continue;
                                    let cur = row[fk];
                                    for (let j = 0; j < 50 && cur; j++) {
                                        const p = cur.memoizedProps || cur.pendingProps;
                                        const pid = p?.threadID || p?.threadId || p?.id || p?.selectedThreadID;
                                        if (pid && String(pid).trim() === targetID) {
                                            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
                                            row.focus?.();
                                            row.click();
                                            return true;
                                        }
                                        cur = cur.return;
                                    }
                                }
                                return false;
                            }, threadID);
                        } catch (ce) {
                            if (process.env.DEBUG_SYNC) console.log('   ⚠️ ข้ามการ Scroll เนื่องจาก Context Error:', ce.message);
                            break; // Exit scroll loop on context destruction
                        }

                        if (clicked) break;

                        // If not found in current view, scroll down to load more
                        try {
                            await page.evaluate(() => {
                                const scroller = document.querySelector('div[role="navigation"] div[data-testid="mw_chat_scroller"]') ||
                                    document.querySelector('.f98l6msc') ||
                                    document.querySelector('div[role="navigation"]') || window;
                                if (scroller === window) window.scrollBy(0, 800);
                                else scroller.scrollTop += 800;
                            });
                        } catch (ce) { /* ignore scroll errors */ }

                        if (retryScroll % 4 === 0) await page.keyboard.press('PageDown');
                        await page.waitForTimeout(1000);
                    }
                }

                if (!clicked) {
                    process.stdout.write('⚠️  URL nav... ');
                    const convInbox = convInboxID || pageInboxID;

                    // ลอง 3 format สำหรับ selected_item_id ตามลำดับ
                    // ปรับ: ให้ลำดับความสำคัญ ID 15 หลัก (UID) ก่อน ID 17 หลัก (PSID)
                    let idCandidates = [...new Set([convIdStrip, threadID, dbParticipantId].filter(Boolean))];
                    idCandidates.sort((a, b) => {
                        const aLen = String(a).length;
                        const bLen = String(b).length;
                        if (aLen === 15 && bLen !== 15) return -1;
                        if (aLen !== 15 && bLen === 15) return 1;
                        return 0;
                    });

                    let chatLoaded = false;

                    for (const candidate of idCandidates) {
                        const url = `https://business.facebook.com/latest/inbox/all?asset_id=${convInbox}&selected_item_id=${candidate}&mailbox_id=${convInbox}&thread_type=${threadType}`;
                        try {
                            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            // Wait for the URL to settle (FB often redirects or cleans params)
                            let settled = false;
                            for (let s = 0; s < 5; s++) {
                                const urlBefore = page.url();
                                await page.waitForTimeout(2000);
                                if (page.url() === urlBefore) { settled = true; break; }
                            }

                            // Double check it's not a completely empty page just in case
                            // Note: We check if candidate OR redirected UID is in URL
                            let isReal = false;
                            try {
                                isReal = await page.evaluate(() => {
                                    const main = document.querySelector('[aria-label*="Message list"]')
                                        || document.querySelector('div[role="main"]')
                                        || document.querySelector('[role="log"]');
                                    if (!main) return null;
                                    const t = (main.innerText || '').trim();
                                    return t.length > 50 && !t.includes('Messenger User');
                                });
                            } catch (ce) { /* ignore navigation error during check */ }

                            if (isReal) {
                                process.stdout.write(`[id:${candidate.slice(-8)}] `);
                                chatLoaded = true;
                                urlPsid = candidate;

                                // Capture actual UID from URL params after landing/settling
                                const finalUrl = page.url();
                                const actualIdMatch = finalUrl.match(/selected_item_id=([0-9]+)/);
                                if (actualIdMatch && actualIdMatch[1] !== candidate) {
                                    learnedUid = actualIdMatch[1];
                                    if (process.env.DEBUG_SYNC) {
                                        console.log(`   [Inbox] Actual UID resolved: ${learnedUid} (Redirected from ${candidate})`);
                                    }
                                }
                                break;
                            }
                        } catch (e) {
                            // Timeout or navigation error, move to next candidate
                        }
                    }

                    if (!chatLoaded) {
                        console.log('⊘  ไม่สามารถโหลด conversation ด้วย ID ทั้ง 3 format — ข้าม');
                        saveSyncCache(threadID, { success: true, agents: [] });
                        continue;
                    }
                }

                // [ANTI-BOT] Random wait หลัง navigate (ลดลงเพราะรอ container แล้ว)
                await randomWait(2000, 5000);

                // ── ดึง PSID จาก URL หลัง navigation ────────────────────────
                const currentUrl = page.url();
                const urlParams = new URLSearchParams(currentUrl.split('?')[1] || '');
                urlPsid = urlParams.get('selected_item_id') || '';
                if (process.env.DEBUG_SYNC) {
                    console.log(`   [URL] selected_item_id="${urlPsid}" | fiberID="${threadID}"`);
                }

                // รอให้ "ส่งโดย" ปรากฏ (timeout นานขึ้นเพราะต้อง scroll โหลด msg เก่า)
                try {
                    await page.waitForFunction(() => {
                        const all = document.querySelectorAll('span, div');
                        for (const el of all) {
                            const t = (el.textContent || '').trim();
                            if ((t.startsWith('ส่งโดย ') || t.startsWith('Sent by ')) && t.length < 120)
                                return true;
                        }
                        return false;
                    }, { timeout: 12000 });
                } catch {
                    // ไม่มี "ส่งโดย" ในหน้า — อาจเป็น conv ที่ไม่มีแอดมินตอบ
                    await randomWait(1000, 2000);
                }

                // [DeepSync] Scroll to top of message list (Cutoff: February 1st, 2026)
                console.log(`  📜 Scrolling up (Cutoff: Feb 1st, 2026)...`);
                try {
                    await page.evaluate(async () => {
                        const scrollContainer = document.querySelector('div[role="main"] div[data-testid="mw_chat_scroller"]')
                            || document.querySelector('[role="log"]')
                            || document.querySelector('[aria-label*="สนทนา"]')
                            || document.querySelector('[aria-label*="Message list"]')
                            || document.querySelector('div[role="main"] .f98l6msc') // New selector
                            || document.querySelector('div[role="main"] ._4sp8'); // Ancient selector

                        if (!scrollContainer) return;

                        let lastScrollTop = scrollContainer.scrollTop;
                        let sameCount = 0;

                        for (let i = 0; i < 50; i++) { // Max deep scan
                            const chatArea = document.querySelector('[aria-label*="Message list"]') || document.querySelector('div[role="main"]');
                            const allText = chatArea ? chatArea.innerText : '';
                            // Be more robust with date matching: handle ม.ค. 26, Jan 26, 2025, etc.
                            const reachCutoff = /ม\.ค\. 2026|Jan 2026|ม\.ค\. 26|Jan 26|2025|2024|2023/.test(allText);

                            if (reachCutoff) break;

                            scrollContainer.scrollTop = 0;
                            await new Promise(r => setTimeout(r, 1500)); // Slightly longer wait for content hydration

                            // If scrollTop didn't change, we might be at the very top or stuck
                            if (scrollContainer.scrollTop === lastScrollTop && scrollContainer.scrollTop === 0) {
                                sameCount++;
                                if (sameCount > 4) break;
                            } else {
                                sameCount = 0;
                            }
                            lastScrollTop = scrollContainer.scrollTop;
                        }
                    });
                    await randomWait(2000, 4000);
                } catch (scrollErr) {
                    console.log(`   ⚠️ ข้ามการ Scroll เนื่องจาก Context Error (กำลังดึงเท่าที่เห็น): ${scrollErr.message.split('\n')[0]}`);
                }

                // ดึง "ส่งโดย"
                let senders = [];
                try {
                    senders = await extractSenders(page);

                    // [Self-Healing] Retry once if empty (might be a render lag)
                    if (!senders.length) {
                        await page.waitForTimeout(3000);
                        senders = await extractSenders(page);
                    }
                } catch (extractErr) {
                    console.log(`   ⚠️ ข้ามช่วง Execution context error: ${extractErr.message.split('\n')[0]}`);
                    await page.waitForTimeout(3000);
                    try {
                        senders = await extractSenders(page);
                    } catch (retryErr) {
                        console.log(`   ❌ ข้าม conversation นี้เนื่องจาก error ซ้ำ: ${retryErr.message.split('\n')[0]}`);
                    }
                }

                // debug: แสดงผลที่ดึงได้
                if (process.env.DEBUG_SYNC) {
                    console.log('  DEBUG senders:', JSON.stringify(senders.slice(0, 3)));
                }

                if (!senders.length) {
                    console.log('⊘  ไม่พบ sender');
                    // Diagnostic: Dump top 500 chars of the chat area to help debug
                    const dump = await page.evaluate(() => {
                        const area = document.querySelector('[aria-label*="Message list"]') || document.querySelector('div[role="main"]') || document.body;
                        return area.innerText.slice(0, 800).replace(/\n+/g, ' | ');
                    }).catch(() => 'DUMP_FAILED');
                    console.log(`   [Diag] Chat Area Snippet: ${dump}`);
                    continue;
                }

                // ส่ง CRM API ผ่าน Node.js
                // normalize: DB เก็บ t_XXXXX แต่ Fiber คืน XXXXX ล้วน
                const normalizedId = 't_' + String(threadID).replace(/^(t_|FB_CHAT_)/, '');
                // PSID: ใช้จาก URL ก่อน, fallback ไป DB participantId (mode=db)
                const psidForLookup = (urlPsid && urlPsid !== String(threadID))
                    ? urlPsid
                    : (dbParticipantId || '');
                if (process.env.DEBUG_SYNC) {
                    console.log(`   [API] conversationId=${normalizedId} psid=${psidForLookup} senders=${JSON.stringify(senders.slice(0, 2))}`);
                }
                const result = await callCrmApi('/api/marketing/chat/message-sender', {
                    conversationId: normalizedId,
                    participantId: psidForLookup || undefined,
                    newConversationId: learnedUid,
                    senders
                });
                const names = [...new Set(senders.map(s => s.name))].join(', ');
                // result.updated = จำนวน messages ที่อัปเดต responder_id
                // result.convLevelAgent = ชื่อ agent ที่ set ใน conversation (Strategy 2 ทำเสมอ)
                const note = !result.success && result.error ? `api-err`
                    : result.updated > 0 ? `+${result.updated} msgs`
                        : result.convLevelAgent ? 'conv-only'
                            : 'no-match';
                if (process.env.DEBUG_SYNC && !(result.updated > 0)) {
                    // แสดง API result เสมอเมื่อไม่ได้ msg-level match (รวมกรณี error)
                    console.log(`   [API result] ${JSON.stringify(result)}`);
                }
                console.log(`✅ [${names}] (${note})`);

                // [Intelligence] บันทึกลง Cache ทันทีที่สำเร็จ (รองรับการ mapping UID)
                saveSyncCache(threadID, { success: true, agents: [...new Set(senders.map(s => s.name))] }, learnedUid);

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
            if (DELAY > 0) {
                console.log(`\n💤 Waiting ${DELAY} minutes for next sync round...`);
                await new Promise(resolve => setTimeout(resolve, DELAY * 60 * 1000));
            } else {
                console.log('\n🔄 ทำรอบต่อไปทันที...\n');
            }
        }
    } else {
        await syncAgents();
    }
}

run().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });
