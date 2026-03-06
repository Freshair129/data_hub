const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Simulate real human Interaction
    const sidebarLinks = page.locator('a[href*="selected_item_id"]');
    await sidebarLinks.first().waitFor();

    console.log("Initial Links:", await sidebarLinks.count());

    // Hover over the sidebar
    const box = await sidebarLinks.nth(1).boundingBox();
    if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

        // Scroll the mouse wheel 10 times
        for (let i = 0; i < 10; i++) {
            await page.mouse.wheel(0, 5000);
            await page.waitForTimeout(1000);
            console.log(`Round ${i + 1} Links:`, await sidebarLinks.count());
        }
    } else {
        console.log("Could not find bounding box for sidebar");
    }

    await browser.close();
})();
