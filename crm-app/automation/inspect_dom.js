/**
 * inspect_dom.js — ตรวจหา selector ที่ใช้ได้จริงใน Business Suite
 * รัน: node automation/inspect_dom.js
 */
const { chromium } = require('playwright');

async function inspect() {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const pages = context.pages();
    const page = pages.find(p => p.url().includes('business.facebook.com')) || pages[0];

    console.log('🔍 URL:', page.url());
    console.log('\n── ค้นหา selector ที่ใช้ได้ ──\n');

    const result = await page.evaluate(() => {
        const report = {};

        // 1. หา container ของ conversation list
        const candidates = [
            '[role="listitem"]',
            '[role="list"]',
            '[role="navigation"]',
            'a[href*="selected_item_id"]',
            'a[href*="inbox"]',
            '[data-testid*="chat"]',
            '[data-testid*="conversation"]',
            '[data-testid*="thread"]',
            '[aria-label*="สนทนา"]',
            '[aria-label*="conversation"]',
            '[aria-label*="inbox"]',
        ];

        for (const sel of candidates) {
            const els = document.querySelectorAll(sel);
            if (els.length > 0) {
                report[sel] = {
                    count: els.length,
                    sample: els[0].tagName + ' | ' + (els[0].getAttribute('aria-label') || els[0].textContent?.slice(0, 60))
                };
            }
        }

        // 2. หา "ส่งโดย" ใน DOM ตอนนี้
        const sentBy = [];
        document.querySelectorAll('span, div').forEach(el => {
            const t = (el.textContent || '').trim();
            if ((t.startsWith('ส่งโดย ') || t.startsWith('Sent by ')) && t.length < 120 && el.children.length <= 2) {
                // เก็บ path ของ element
                const path = [];
                let cur = el;
                for (let i = 0; i < 5; i++) {
                    if (!cur) break;
                    path.unshift(`${cur.tagName}[class="${(cur.className||'').slice(0,30)}"]`);
                    cur = cur.parentElement;
                }
                sentBy.push({ text: t, path: path.join(' > ') });
            }
        });
        report['__sentBy__'] = sentBy.slice(0, 5);

        // 3. โครงสร้าง DOM ของ first conversation link
        const firstLink = document.querySelector('a[href*="selected_item_id"]');
        if (firstLink) {
            report['__firstLink__'] = {
                href: firstLink.href,
                parentTag: firstLink.parentElement?.tagName,
                parentRole: firstLink.parentElement?.getAttribute('role'),
                grandParentRole: firstLink.parentElement?.parentElement?.getAttribute('role'),
            };
        }

        return report;
    });

    console.log(JSON.stringify(result, null, 2));
    await browser.close();
}

inspect().catch(e => console.error('Error:', e.message));
