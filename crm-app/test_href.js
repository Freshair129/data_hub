const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Extract via href
    const threads = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="selected_item_id"]'));
        return links.map(el => {
            const href = el.getAttribute('href');
            let threadID = null;
            if (href) {
                const match = href.match(/selected_item_id=([^&]+)/);
                if (match) threadID = match[1];
            }
            return threadID;
        }).filter(id => id);
    });

    console.log(`Extracted via href:`, threads);
    await browser.close();
})();
