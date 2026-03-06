const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Find the ACTUAL scrolling wrapper by finding who listens to scroll events or has overflow
    await page.evaluate(async () => {
        const tabList = document.querySelector('div[role="tablist"]');
        if (!tabList) return;

        let el = tabList;
        let scroller = null;
        for (let i = 0; i < 15; i++) {
            if (!el) break;
            const style = getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > 100) {
                scroller = el;
                break;
            }
            el = el.parentElement;
        }

        if (scroller) {
            console.log("Found scroller:", scroller.className);
            for (let i = 0; i < 5; i++) {
                scroller.scrollTop += 1500;
                await new Promise(r => setTimeout(r, 1500));
                console.log("Threads visible:", document.querySelectorAll('a[href*="selected_item_id"]').length);
            }
        } else {
            console.log("No scroller found!");
        }
    });

    await browser.close();
})();
