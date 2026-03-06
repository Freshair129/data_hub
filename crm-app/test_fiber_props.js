const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Dump props logic
    const domDump = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="selected_item_id"]'));
        if (!links.length) return "No links found";

        let el = links[0];
        const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
        let cur = el[fk];

        const dump = [];
        for (let i = 0; i < 35 && cur; i++) {
            const p = cur.memoizedProps || cur.pendingProps;
            if (p) {
                const keys = Object.keys(p);
                dump.push({ depth: i, keys: keys, threadID: p.threadID });
            }
            cur = cur.return;
        }
        return dump;
    });

    console.log(JSON.stringify(domDump, null, 2));
    await browser.close();
})();
