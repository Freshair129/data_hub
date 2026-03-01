const { chromium } = require('playwright');

(async () => {
    let browser;
    try {
        console.log("Connecting to Chrome (port 9222)...");
        browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];

        const page = context.pages().find(p => p.url().includes('business.facebook.com'));
        if (!page) { console.log("No inbox found"); process.exit(1); }

        console.log("Attached!");
        const results = await page.evaluate(() => {
            const senders = [];
            const elements = Array.from(document.querySelectorAll('span, div')).filter(el => {
                const t = (el.textContent || '').trim();
                // We want to skip Auto Replies to find real admin replies
                return /^(ส่งโดย|Sent by) /.test(t) && !t.includes('ข้อความตอบกลับอัตโนมัติ');
            });

            for (const el of elements.slice(0, 3)) { // Check top 3 REAL admin responses
                let foundMsgId = null;
                let availableProps = []; // collect keys just in case it's named something else
                let cur = el;
                for (let i = 0; i < 20; i++) { // Max 20 DOM levels
                    if (!cur) break;
                    const key = Object.keys(cur).find(k => k.startsWith('__reactFiber$'));
                    if (key) {
                        let node = cur[key];
                        for (let j = 0; j < 15; j++) { // Max 15 fiber levels
                            if (!node) break;
                            if (node.memoizedProps) {
                                const p = node.memoizedProps;
                                // log top-level keys
                                availableProps.push(Object.keys(p).join(','));

                                if (p.messageId) foundMsgId = p.messageId;
                                else if (p.message && p.message.message_id) foundMsgId = p.message.message_id;
                                else if (p.message && p.message.id) foundMsgId = p.message.id;
                            }
                            if (foundMsgId) break;
                            node = node.return;
                        }
                    }
                    if (foundMsgId) break;
                    cur = cur.parentElement;
                }
                const name = (el.textContent || '').replace(/^(ส่งโดย|Sent by) /, '').trim();
                // Filter and clean availableProps array for uniqueness
                availableProps = [...new Set(availableProps.join(',').split(','))].filter(k => k && k !== 'children');

                senders.push({
                    name,
                    foundMsgId: foundMsgId || 'NOT_FOUND',
                    propsFound: foundMsgId ? 'HIDDEN (success)' : availableProps.slice(0, 15).join(', ') // show only first few if failed
                });
            }
            return senders;
        });

        console.log("Results:");
        console.log(JSON.stringify(results, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        if (browser) await browser.close();
        process.exit(0);
    }
})();
