const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    console.log("Locating search box...");
    const searchInputs = await page.locator('input[type="text"][placeholder*="Search"], input[type="text"][aria-label*="Search"]').all();
    console.log("Found search inputs:", searchInputs.length);

    if (searchInputs.length > 0) {
        // Assume the first one is the global sidebar search
        const searchBox = searchInputs[0];
        await searchBox.fill('Feb');
        await page.waitForTimeout(2000);

        const threads = await page.evaluate(() => {
            return document.querySelectorAll('a[href*="selected_item_id"]').length;
        });

        console.log("Visible chats after search for 'Feb':", threads);
    }

    await browser.close();
})();
