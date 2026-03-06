#!/usr/bin/env node
/**
 * Backfill Agent Mapping
 * ──────────────────────
 * Reads conversation participant_ids from the database (Feb 2026),
 * navigates to each conversation in Business Suite,
 * and runs the extractSenders + admin mapping pipeline.
 *
 * Usage:
 *   node backfill_agent_mapping.js --month=2026-02 --limit=10
 *   node backfill_agent_mapping.js --month=2026-02 --all
 *   node backfill_agent_mapping.js --ids=25570885055945173,26408061705468666
 */

const { chromium } = require('playwright');
const pg = require('pg');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const MONTH = args.find(a => a.startsWith('--month='))?.split('=')[1] || '2026-02';
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '999');
const ALL = args.includes('--all');
const IDS = args.find(a => a.startsWith('--ids='))?.split('=')[1]?.split(',') || [];
const PORT = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '9222');
const DRY_RUN = args.includes('--dry');
const ASSET_ID = '170707786504';
const DB_URL = 'postgresql://postgres:password123@localhost:5432/vschool_crm';
const CRM_BASE = 'http://localhost:3000';

const LOG_DIR = path.join(__dirname, 'logs');
const BACKFILL_LOG = path.join(LOG_DIR, `backfill_${MONTH}.json`);

// ─── DB Query ──────────────────────────────────────────────────────────────────
async function getTargetConversations() {
    const pool = new pg.Pool({ connectionString: DB_URL });
    try {
        let query, params;

        if (IDS.length > 0) {
            query = `
                SELECT conversation_id, participant_id, participant_name, assigned_agent, channel,
                       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as msg_count
                FROM conversations c
                WHERE participant_id = ANY($1)
                ORDER BY last_message_at DESC`;
            params = [IDS];
        } else {
            const [year, month] = MONTH.split('-');
            const startDate = `${year}-${month}-01`;
            const endDate = new Date(parseInt(year), parseInt(month), 1).toISOString().slice(0, 10);

            query = `
                SELECT DISTINCT c.conversation_id, c.participant_id, c.participant_name, 
                       c.assigned_agent, c.channel,
                       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as msg_count
                FROM conversations c
                JOIN messages m ON m.conversation_id = c.id
                WHERE m.created_at >= $1 AND m.created_at < $2
                ORDER BY c.participant_name
                LIMIT $3`;
            params = [startDate, endDate, ALL ? 9999 : LIMIT];
        }

        const result = await pool.query(query, params);
        return result.rows;
    } finally {
        await pool.end();
    }
}

// ─── Extract Senders (reused from v4_unified) ──────────────────────────────────
async function extractSenders(page) {
    return page.evaluate(() => {
        const pairs = [];
        const seen = new Set();
        const sentByRegex = /(?:ส่งโดย|sent\s+by)[:\s]*/i;

        const coerceId = (id) => {
            if (!id || typeof id === 'object' && !Array.isArray(id)) return null;
            const s = Array.isArray(id) ? id.join('') : String(id).trim();
            if (s.length < 5) return s;
            if (/^[A-Z][a-zA-Z0-9]+(Wrapper|Section|Component|Container|Row|Cell)$/.test(s)) return null;
            return s;
        };

        const findText = (obj, depth = 0) => {
            if (!obj || depth > 6) return null;
            if (typeof obj === 'string') return obj;
            const candidates = ['text', 'body', 'responseText', 'consumerText', 'snippet', 'body_text', 'preview_text'];
            for (const key of candidates) {
                const val = obj[key];
                if (typeof val === 'string' && val.trim().length > 0) return val;
                if (val && typeof val === 'object') {
                    const nested = findText(val, depth + 1);
                    if (nested) return nested;
                }
            }
            const sub = obj.message || obj.story || obj.payload;
            if (sub && typeof sub === 'object' && depth < 3) return findText(sub, depth + 1);
            return null;
        };

        const sanitizeName = (rawName) => {
            if (!rawName) return null;
            let name = rawName.trim();
            if (/(?:ไม่อยู่จนถึงเวลา|Away\s+until|ระบบมอบหมาย|assigned\s+this|คะ|ค่ะ|เรียน)/i.test(name)) {
                name = name.split(/(?:\s+|เรียน|คะ|ค่ะ)/)[0].trim();
            }
            if (sentByRegex.test(name)) {
                const parts = name.split(sentByRegex);
                name = parts[parts.length - 1].trim();
            }
            name = name.split(/\n|\r/)[0].trim().split('  ')[0];
            if (name.length > 40 || name.length < 2) return null;
            return name;
        };

        // Strategy 1: "Sent by" labels
        const labels = Array.from(document.querySelectorAll('span, div')).filter(el => {
            const text = (el.textContent || '').trim();
            return sentByRegex.test(text) && !/ข้อความตอบกลับอัตโนมัติ|auto-reply|assigned\s+this/i.test(text);
        });

        for (const el of labels) {
            const fullText = (el.textContent || '').trim();
            const match = fullText.match(sentByRegex);
            if (!match) continue;
            const rawName = fullText.slice(match.index + match[0].length).trim();
            const name = sanitizeName(rawName);
            if (!name) continue;

            const findIdRecursive = (obj, depth = 0) => {
                if (!obj || depth > 8) return null;
                const idKeys = ['id', 'author_id', 'sender_id', 'actor_id', 'fbid', 'threadID', 'participantId', 'author', 'sender'];
                for (const key of idKeys) {
                    const val = obj[key];
                    if (typeof val === 'string' && /^\d{14,17}$/.test(val)) return val;
                    if (val && typeof val === 'object' && depth < 4) {
                        const nested = findIdRecursive(val, depth + 1);
                        if (nested) return nested;
                    }
                }
                return null;
            };

            let foundId = null, foundText = null, foundPid = null;
            let cur = el;
            // Tighten parent search to 15 (was 35) to keep it local to the message block
            for (let i = 0; i < 15 && cur; i++) {
                const key = Object.keys(cur).find(k => k.startsWith('__reactFiber'));
                if (key) {
                    let node = cur[key];
                    // Tighten node traversal to 30 (was 60) to avoid jumping to thread-level meta
                    for (let j = 0; j < 30 && node; j++) {
                        const p = node.memoizedProps || node.pendingProps;
                        if (p) {
                            if (!foundId) foundId = coerceId(p.responseId || p.messageId || p.message?.message_id || p.message?.id || p.id);
                            if (!foundText) foundText = findText(p.message) || findText(p);
                            if (!foundPid) {
                                foundPid = coerceId(p.message?.sender?.id || p.message?.author_id || p.sender?.id || p.author?.id || p.author_id || p.fbid || p.actor_id);
                                if (!foundPid && p.message) foundPid = findIdRecursive(p.message);
                                if (!foundPid) foundPid = findIdRecursive(p);
                            }
                        }
                        if (foundId && foundText && foundPid) break;
                        node = node.return;
                    }
                }
                if (foundId && foundText && foundPid) break;
                cur = cur.parentElement;
            }

            const msgText = (typeof foundText === 'string') ? foundText.replace(sentByRegex, '').slice(0, 250).trim() : null;
            const key = foundId ? `${name}|ID|${foundId}` : `${name}|TXT|${msgText || 'none'}`;
            if (!seen.has(key)) {
                seen.add(key);
                pairs.push({ name, msgId: foundId, msgText, participantId: foundPid });
            }
        }

        // Strategy 2: Deep Probe Bubbles
        const bubbles = document.querySelectorAll('div[data-testid="mw_message_bubble"], ._4tdt, div[role="row"], [role="article"]');
        for (const bubble of bubbles) {
            const bk = Object.keys(bubble).find(k => k.startsWith('__reactFiber'));
            if (!bk) continue;
            let bnode = bubble[bk];
            // Tighten traversal to 25 (was 65) to stay within the specific message node
            for (let k = 0; k < 25 && bnode; k++) {
                const p = bnode.memoizedProps || bnode.pendingProps;
                if (p?.message) {
                    const m = p.message;
                    const rawName = m.author_name || m.sender?.name || m.sender_name || m.author?.name;
                    const name = sanitizeName(rawName);
                    if (!name) { bnode = bnode.return; continue; }
                    const mid = coerceId(m.message_id || m.id || m.offline_threading_id);
                    const txt = findText(m);
                    const pid = coerceId(m.sender?.id || m.author_id || m.author?.id || m.fbid || m.actor_id);
                    const key = mid ? `${name}|ID|${mid}` : `${name}|TXT|${(txt || '').slice(0, 60)}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        pairs.push({ name, msgId: mid, msgText: txt ? txt.replace(sentByRegex, '').slice(0, 250).trim() : null, participantId: pid });
                    }
                }
                bnode = bnode.return;
            }
        }
        return pairs;
    });
}

// ─── CRM API Call ──────────────────────────────────────────────────────────────
async function callCrmApi(endpoint, body) {
    try {
        const res = await fetch(`${CRM_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        console.error(`   ⚠️ API Error: ${e.message.slice(0, 50)}`);
        return null;
    }
}

// ─── Main Backfill ─────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n🔄 Backfill Agent Mapping — ${MONTH}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const conversations = await getTargetConversations();
    console.log(`📋 Found ${conversations.length} conversations to process\n`);

    if (conversations.length === 0) {
        console.log('❌ No conversations found.');
        return;
    }

    if (DRY_RUN) {
        conversations.forEach((c, i) => {
            console.log(`${i + 1}. ${c.participant_name} | PID: ${c.participant_id}`);
        });
        return;
    }

    let browser, context, page;
    try {
        browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
        context = browser.contexts()[0];
        page = context.pages().find(p => p.url().includes('business.facebook.com')) || context.pages()[0];
        console.log(`✅ Connected to Chrome: ${page.url().slice(0, 60)}...\n`);
    } catch (e) {
        console.error(`❌ Cannot connect to Chrome on port ${PORT}.`);
        return;
    }

    let backfillLog = [];
    if (fs.existsSync(BACKFILL_LOG)) backfillLog = JSON.parse(fs.readFileSync(BACKFILL_LOG, 'utf8'));
    const processed = new Set(backfillLog.map(b => b.participantId));

    for (let i = 0; i < conversations.length; i++) {
        const conv = conversations[i];
        const pid = conv.participant_id;

        if (processed.has(pid)) {
            process.stdout.write(`[${i + 1}/${conversations.length}] ${conv.participant_name.slice(0, 20)} — ⏭️ Skip\n`);
            continue;
        }

        process.stdout.write(`[${i + 1}/${conversations.length}] ${conv.participant_name.slice(0, 25).padEnd(25)} `);

        try {
            // Strategy 1: URL
            const url = `https://business.facebook.com/latest/inbox/all?asset_id=${ASSET_ID}&selected_item_id=${pid}&mailbox_id=${ASSET_ID}`;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(5000);

            const hasErr = await page.evaluate(() => document.body.innerText.includes('เกิดข้อผิดพลาดขึ้น') || document.body.innerText.includes('Something went wrong'));

            let found = false;
            if (hasErr) {
                console.log(`⚠️ URL error. Trying Sidebar/Search...`);
                // Strategy 2: Sidebar
                found = await page.evaluate(async (targetPid) => {
                    const sb = document.querySelector('div[role="navigation"] div[style*="overflow-y: auto"]') || document.querySelector('div[role="navigation"]');
                    if (!sb) return false;
                    for (let s = 0; s < 10; s++) {
                        const rows = Array.from(document.querySelectorAll('div[role="row"]'));
                        for (const r of rows) {
                            const bk = Object.keys(r).find(k => k.startsWith('__reactFiber'));
                            if (!bk) continue;
                            let n = r[bk];
                            while (n) {
                                const p = n.memoizedProps || n.pendingProps;
                                if (p?.threadID === targetPid || p?.id === targetPid || p?.participantId === targetPid) { r.click(); return true; }
                                n = n.return;
                            }
                        }
                        sb.scrollTop += 800;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                    return false;
                }, pid);

                if (!found) {
                    console.log(`🔍 Try Search: "${conv.participant_name}"`);
                    const input = await page.$('input[placeholder*="ค้นหา"], input[placeholder*="Search"]');
                    if (input) {
                        await input.click();
                        await page.keyboard.press('Meta+A'); await page.keyboard.press('Backspace');
                        await page.keyboard.type(conv.participant_name);
                        await page.waitForTimeout(3000);
                        found = await page.evaluate((targetPid) => {
                            const res = Array.from(document.querySelectorAll('div[role="row"]'));
                            for (const r of res) {
                                const bk = Object.keys(r).find(k => k.startsWith('__reactFiber'));
                                if (!bk) continue;
                                let n = r[bk];
                                while (n) {
                                    const p = n.memoizedProps || n.pendingProps;
                                    if (p?.threadID === targetPid || p?.id === targetPid || p?.participantId === targetPid) { r.click(); return true; }
                                    n = n.return;
                                }
                            }
                            if (res[0]) { res[0].click(); return true; }
                            return false;
                        }, pid);
                    }
                }
            } else { found = true; }

            if (found) {
                await page.waitForTimeout(5000);
                // Ensure scroller is ready
                await page.evaluate(async () => {
                    const sc = document.querySelector('div[role="main"] div[data-testid="mw_chat_scroller"]') || document.querySelector('[role="log"]') || document.querySelector('div[role="main"] div[style*="overflow-y: auto"]');
                    if (sc) { for (let j = 0; j < 15; j++) { sc.scrollTop = 0; await new Promise(r => setTimeout(r, 1200)); } }
                });
                const senders = await extractSenders(page);
                if (senders.length > 0) {
                    const unique = []; const seenK = new Set();
                    for (const s of senders) { const k = `${s.name}|${s.msgText}`; if (!seenK.has(k)) { seenK.add(k); unique.push(s); } }
                    await callCrmApi('/api/marketing/chat/message-sender', { conversationId: pid, senders: unique });
                    const ags = [...new Set(unique.map(s => s.name))];
                    console.log(`✅ ${ags.join(', ')}`);
                    backfillLog.push({ participantId: pid, participantName: conv.participant_name, agents: ags, msgCount: unique.length, timestamp: new Date().toISOString() });
                } else { console.log(`⊘ No senders`); backfillLog.push({ participantId: pid, participantName: conv.participant_name, agents: [], msgCount: 0, timestamp: new Date().toISOString() }); }
            } else { console.log(`❌ Not found`); }

            fs.writeFileSync(BACKFILL_LOG, JSON.stringify(backfillLog, null, 2));
            await page.waitForTimeout(1000);
        } catch (err) { console.log(`❌ ${err.message.slice(0, 30)}`); }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
