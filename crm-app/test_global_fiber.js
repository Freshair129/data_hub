const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Attempt 3: Let's find any element that has React props with a threadID
    const threads = await page.evaluate(() => {
        const results = [];

        // Let's just blindly check all divs and links and spans inside the sidebar
        const sidebar = document.querySelector('div[role="tablist"]')?.parentElement?.parentElement || document.body;
        const allElements = Array.from(sidebar.querySelectorAll('*'));

        allElements.forEach(el => {
            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (!fk) return;
            let cur = el[fk];
            for (let i = 0; i < 20 && cur; i++) {
                const p = cur.memoizedProps || cur.pendingProps;
                if (p?.threadID) {
                    if (!results.find(r => r.threadID === p.threadID)) {
                        results.push({
                            threadID: p.threadID,
                            threadType: p.threadType,
                            inboxID: p.inboxID,
                            tagOfHoster: el.tagName
                        });
                    }
                    break;
                }
                cur = cur.return;
            }
        });

        return results;
    });

    console.log(`Found ${threads.length} unique threads using global React Fiber scan`);
    console.log(threads.slice(0, 5));

    await browser.close();
})();
