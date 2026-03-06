const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Simulate Keyboard arrow down navigation!
    const sidebarLinks = page.locator('a[href*="selected_item_id"]');
    await sidebarLinks.first().waitFor();

    let count = await sidebarLinks.count();
    console.log("Initial Links:", count);

    // Click the very first one to focus the list
    await sidebarLinks.first().click();
    await page.waitForTimeout(1000);

    for (let i = 0; i < 20; i++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(500);

        const newCount = await sidebarLinks.count();
        if (newCount > count) {
            console.log(`Round ${i + 1}: Grew from ${count} to ${newCount}`);
            count = newCount;
        }
    }

    console.log(`Final Threads Visible via Keyboard:`, count);
    await browser.close();
})();
