/**
 * sync_agents_v4_unified.js — V School Agent Sync (Unified Edition)
 *
 * ระบบดึงชื่อแอดมินที่ตอบแชทจาก Facebook Business Suite (FB + Instagram)
 * รวมความสามารถจาก V2 (React Fiber Scraping) และ V3 (Network Interception + Local Logging)
 *
 * ── วิธีรัน ──────────────────────────────────────────────────────────────────
 *  1. เปิด Chrome CRM (ที่มีการ Login ค้างไว้)
 *  2. node automation/sync_agents_v4_unified.js --attach
 *
 *  ตัวเลือก:
 *    --attach        เชื่อมต่อ Chrome ที่เปิดไว้ (พอร์ต 9222)
 *    --limit=9999    จำนวน conversation ที่จะสแกน
 *    --loop          รันต่อเนื่องเรื่อยๆ
 *    --delay=60      เวลาพักระหว่างรอบ (นาที)
 *    --force         รันซ้ำแม้จะเคยดึงไปแล้ว
 *    --file=json     ดึงตามลิสต์ในไฟล์ JSON (เช่น ผลลัพธ์จาก Graph API)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

// --- Configuration ---
const LOG_DIR = path.join(__dirname, 'logs');
const SYNC_CACHE_PATH = path.join(__dirname, '..', 'cache', 'synced_threads.json');
const SYNC_LOG_PATH = path.join(process.cwd(), 'logs', 'synced_threads.log');

// Ensure directories exist
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(path.join(process.cwd(), 'logs'))) fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true });

// CLI Arguments
const args = process.argv.slice(2);
const ATTACH = args.includes('--attach');
const HEADLESS = args.includes('--headless');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '9999');
const PORT = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '9222');
const LOOP = args.includes('--loop') || args.includes('--continuous');
const FORCE = args.includes('--force');
const DELAY = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '60');
const FILE_PATH = args.find(a => a.startsWith('--file='))?.split('=')[1];

// ─── Helper: Random Wait (Anti-Bot) ──────────────────────────────────────────
function randomWait(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1) + min);
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Persistence & Logging ──────────────────────────────────────────────────
function loadSyncCache() {
    try {
        if (fs.existsSync(SYNC_CACHE_PATH)) {
            const data = fs.readFileSync(SYNC_CACHE_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) { }
    return {};
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
    } catch (e) { console.error('⚠️  Error saving sync cache:', e.message); }
}

function saveToLocal(threadID, data) {
    const today = new Date().toISOString().split('T')[0];
    const jsonPath = path.join(LOG_DIR, `sync_data_${today}.json`);

    let threads = [];
    if (fs.existsSync(jsonPath)) {
        try { threads = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch (e) { threads = []; }
    }

    const index = threads.findIndex(t => t.threadID === threadID);
    const newEntry = {
        threadID,
        senders: data.senders,
        source: data.source,
        lastSeen: new Date().toLocaleString('th-TH')
    };

    if (index !== -1) threads[index] = newEntry;
    else threads.push(newEntry);

    fs.writeFileSync(jsonPath, JSON.stringify(threads, null, 2));
}

// ─── Scraper Core ──────────────────────────────────────────────────────

/**
 * 1. Collect Thread IDs from Metadata Sidebar
 */
async function collectAllThreadIds(page, limit) {
    console.log('📜 Sidebar scanning...');
    await page.waitForSelector('._4bl9, [role="row"]', { timeout: 10000 }).catch(() => { });

    const allThreads = new Map();
    let scanInboxID = null;

    const scrapeVisible = async () => {
        const results = await page.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('div[role="presentation"]._at41, [role="row"], ._4bl9 a[role="row"]');
            rows.forEach(el => {
                const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
                if (!fk) return;
                let cur = el[fk];
                for (let i = 0; i < 60 && cur; i++) {
                    const p = cur.memoizedProps || cur.pendingProps;
                    const tid = p?.threadID || p?.threadId || p?.id || p?.selectedThreadId;
                    if (tid && /^[0-9]+$|^t_/.test(String(tid)) && String(tid).length > 5) {
                        results.push({ threadID: String(tid).replace('t_', ''), threadType: p.threadType || 'FB_MESSAGE', inboxID: p.inboxID });
                        break;
                    }
                    cur = cur.return;
                }
            });
            return results;
        });
        results.forEach(t => {
            if (!allThreads.has(t.threadID)) {
                allThreads.set(t.threadID, { threadType: t.threadType, inboxID: t.inboxID });
                if (!scanInboxID && t.inboxID) scanInboxID = t.inboxID;
            }
        });
    };

    await scrapeVisible();
    return { threads: allThreads, inboxID: scanInboxID };
}

/**
 * 2. Extract Sender Attribution from Chat Log
 */
async function extractSenders(page) {
    return page.evaluate(() => {
        const pairs = [];
        const seen = new Set();
        const sentByRegex = /(?:ส่งโดย|sent\s+by)[:\s]*/i;
        const autoReplyRegex = /ข้อความตอบกลับอัตโนมัติ|auto-reply|assigned\s+this/i;

        const coerceId = (id) => {
            if (!id) return null;
            const s = String(id).trim();
            if (s.length < 5 || /^[A-Z]/.test(s)) return null;
            return s;
        };

        const findText = (obj, depth = 0) => {
            if (!obj || depth > 5) return null;
            if (typeof obj === 'string') return obj;
            const candidates = ['text', 'body', 'snippet', 'body_text'];
            for (const key of candidates) {
                if (typeof obj[key] === 'string' && obj[key].length > 0) return obj[key];
            }
            const sub = obj.message || obj.payload;
            if (sub && typeof sub === 'object') return findText(sub, depth + 1);
            return null;
        };

        const sanitizeName = (n) => {
            if (!n) return null;
            let res = n.trim().split('\n')[0].split('  ')[0];
            if (res.length > 40 || res.length < 2 || /[?!฿]/.test(res)) return null;
            return res;
        };

        // Strategy 1: Labels
        const labels = Array.from(document.querySelectorAll('span, div')).filter(el => {
            const txt = (el.textContent || '').trim();
            return sentByRegex.test(txt) && !autoReplyRegex.test(txt);
        });

        for (const el of labels) {
            const raw = (el.textContent || '').replace(sentByRegex, '').trim();
            const name = sanitizeName(raw);
            if (!name) continue;

            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            let cur = el[fk];
            let mid = null, txt = null, pid = null;

            for (let i = 0; i < 40 && cur; i++) {
                const p = cur.memoizedProps || cur.pendingProps;
                if (p?.message) {
                    mid = coerceId(p.message.id || p.message.message_id);
                    txt = findText(p.message);
                    pid = coerceId(p.message.sender?.id || p.message.author_id);
                    break;
                }
                cur = cur.return;
            }

            if (name) {
                const key = `${name}|${mid || txt || Math.random()}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    pairs.push({ name, msgId: mid, msgText: txt, participantId: pid });
                }
            }
        }

        // Strategy 2: Direct Bubbles
        const bubbles = document.querySelectorAll('div[data-testid="mw_message_bubble"], [role="row"], [role="article"]');
        for (const b of bubbles) {
            const fk = Object.keys(b).find(k => k.startsWith('__reactFiber'));
            let cur = b[fk];
            for (let i = 0; i < 30 && cur; i++) {
                const p = cur.memoizedProps || cur.pendingProps;
                if (p?.message) {
                    const m = p.message;
                    const rName = m.sender_name || m.author_name || m.sender?.name;
                    const name = sanitizeName(rName);
                    if (name) {
                        const mid = coerceId(m.id || m.message_id);
                        const txt = findText(m);
                        const key = `${name}|${mid || txt || Math.random()}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            pairs.push({ name, msgId: mid, msgText: txt, participantId: coerceId(m.sender?.id || m.author_id) });
                        }
                    }
                    break;
                }
                cur = cur.return;
            }
        }
        return pairs;
    });
}

/**
 * 3. Verify if UI shows the target thread
 */
async function verifyActiveThread(page, threadID, customerName = null) {
    const tid = String(threadID).trim();
    return await page.evaluate(({ targetID, targetName }) => {
        // 1. URL
        if (window.location.href.includes(targetID)) return { success: true, logs: ['Match URL'] };
        // 2. Header
        const header = document.querySelector('div[role="main"] header, [role="banner"] h2');
        if (targetName && header?.innerText.includes(targetName)) return { success: true, logs: ['Match Name'] };
        // 3. Fiber
        const active = document.querySelector('._2tms, [aria-selected="true"]');
        if (active) {
            const fk = Object.keys(active).find(k => k.startsWith('__reactFiber'));
            let cur = active[fk];
            for (let i = 0; i < 40 && cur; i++) {
                const p = cur.memoizedProps || cur.pendingProps;
                const pid = String(p?.threadID || p?.threadId || p?.id || '');
                if (pid.includes(targetID)) return { success: true, logs: ['Match Fiber'] };
                cur = cur.return;
            }
        }
        return { success: false, logs: ['No match'] };
    }, { targetID: tid, targetName: customerName });
}

/**
 * 4. Search Fallback
 */
async function searchForThread(page, name) {
    if (!name) return false;
    console.log(`   🔎 Searching for "${name}"...`);
    try {
        const input = await page.waitForSelector('input[aria-label*="Search"], input[placeholder*="Search"]', { timeout: 5000 });
        await input.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await input.fill(name);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);
        return true;
    } catch (e) { return false; }
}

// ─── Main Logic ─────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🚀 [${new Date().toLocaleTimeString()}] Starting v4 Unified Sync...`);
    let browser, context, page;

    try {
        if (ATTACH) {
            browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
            context = browser.contexts()[0];
            page = context.pages().find(p => p.url().includes('business.facebook.com')) || context.pages()[0];
        } else {
            context = await chromium.launchPersistentContext(USER_DATA, { headless: HEADLESS });
            page = await context.newPage();
            await page.goto(META_INBOX);
        }

        let threadsToProcess = new Map();
        if (FILE_PATH) {
            console.log(`📂 Loading from: ${FILE_PATH}`);
            const list = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
            list.forEach(item => {
                const id = String(item.convId || item.id || item.psid).replace('t_', '');
                threadsToProcess.set(id, { customerName: item.customerName, psid: item.psid });
            });
        } else {
            const { threads } = await collectAllThreadIds(page, LIMIT);
            threadsToProcess = threads;
        }

        const syncCache = loadSyncCache();
        const eligible = [...threadsToProcess.entries()].filter(([id]) => FORCE || !syncCache[id]);

        console.log(`📊 Found ${threadsToProcess.size}. Processing ${eligible.length} threads.`);
        const febDir = path.join(LOG_DIR, 'feb_2026_chats');
        if (!fs.existsSync(febDir)) fs.mkdirSync(febDir, { recursive: true });

        for (let i = 0; i < eligible.length; i++) {
            const [id, info] = eligible[i];
            const name = info.customerName;
            process.stdout.write(`[${i + 1}/${eligible.length}] ${id.slice(-8)} (${name || 'No Name'}) `);

            try {
                // Try direct URL first
                const targetUrl = `https://business.facebook.com/latest/inbox/all?selected_item_id=${id}`;
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });

                let ready = false;
                for (let r = 0; r < 3; r++) {
                    await page.waitForTimeout(3000);
                    const v = await verifyActiveThread(page, id, name);
                    if (v.success) { ready = true; break; }
                    if (r === 1 && name) await searchForThread(page, name);
                }

                if (!ready) { console.log('❌ Skip'); continue; }

                // Scroll Up
                await page.evaluate(async () => {
                    const s = document.querySelector('div[role="main"] div[data-testid="mw_chat_scroller"], [role="log"], .scrollable');
                    if (!s) return;
                    for (let j = 0; j < 15; j++) {
                        s.scrollTop = 0;
                        await new Promise(r => setTimeout(r, 1200));
                        if (document.body.innerText.includes('2024')) break;
                    }
                });

                const senders = await extractSenders(page);
                const unique = [];
                const seen = new Set();
                senders.forEach(s => {
                    const k = `${s.name}|${String(s.msgText).slice(0, 20)}`;
                    if (!seen.has(k)) { seen.add(k); unique.push(s); }
                });

                if (unique.length > 0) {
                    const data = { threadID: id, psid: info.psid, customerName: name, senders: unique, syncedAt: new Date().toISOString() };
                    fs.writeFileSync(path.join(febDir, `${id}.json`), JSON.stringify(data, null, 2));
                    saveToLocal(id, { senders: unique, source: 'v4_unified' });
                    saveSyncCache(id, { success: true, agents: [...new Set(unique.map(u => u.name))] });
                    console.log(`✅ [${[...new Set(unique.map(u => u.name))].join(', ')}]`);
                } else {
                    console.log('⊘ Empty');
                }
            } catch (e) { console.log(`❌ ${e.message.slice(0, 30)}`); }
        }
    } finally {
        if (!ATTACH) await context.close();
    }
}

main().catch(e => console.error(e));
