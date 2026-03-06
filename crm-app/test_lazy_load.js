const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Simulate natural mouse wheel scrolling on the tablist
    await page.evaluate(async () => {
        const tabList = document.querySelector('div[role="tablist"]');
        if (!tabList) return;

        // Dispatch synthetic wheel events to trick Meta's React listeners into lazy loading
        for (let i = 0; i < 10; i++) {
            const event = new WheelEvent('wheel', {
                deltaY: 1500,
                bubbles: true,
                cancelable: true
            });
            tabList.dispatchEvent(event);

            // Also try to scroll its parents just in case
            let el = tabList;
            for (let j = 0; j < 10 && el; j++) {
                if (el.scrollTop !== undefined) el.scrollTop += 1500;
                el = el.parentElement;
            }

            await new Promise(r => setTimeout(r, 800));
            console.log("Links found:", document.querySelectorAll('a[href*="selected_item_id"]').length);
        }
    });

    const threads = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="selected_item_id"]').length;
    });

    console.log(`Final Threads Visible:`, threads);
    await browser.close();
})();
