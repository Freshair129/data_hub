const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Evaluate the Tablist dimensions
    const tablistProps = await page.evaluate(() => {
        const tabList = document.querySelector('div[role="tablist"]');
        if (!tabList) return "Tablist not found";

        // Let's trace back from the tablist to see which one is ACTUALLY scrollable
        const wrappers = [];
        let el = tabList;
        for (let i = 0; i < 10; i++) {
            if (!el) break;
            const style = getComputedStyle(el);
            wrappers.push({
                tag: el.tagName,
                className: el.className,
                role: el.getAttribute('role'),
                overflowY: style.overflowY,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                isScrollable: el.scrollHeight > el.clientHeight
            });
            el = el.parentElement;
        }
        return wrappers;
    });

    console.log(JSON.stringify(tablistProps, null, 2));
    await browser.close();
})();
