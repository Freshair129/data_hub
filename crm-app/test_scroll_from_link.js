const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Find who has overflow using Javascript tree walking
    await page.evaluate(async () => {
        // Let's start from the first chat link!
        const firstLink = document.querySelector('a[href*="selected_item_id"]');
        if (!firstLink) {
            console.log("No links found");
            return;
        }

        // Walk up from the LINK itself, not the tablist
        let el = firstLink;
        let scroller = null;
        for (let i = 0; i < 25; i++) {
            if (!el) break;
            const style = getComputedStyle(el);
            if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
                // To make sure it's the sidebar, check width
                const box = el.getBoundingClientRect();
                if (box.width < 500 && box.left < 500) {
                    scroller = el;
                    break;
                }
            }
            el = el.parentElement;
        }

        if (scroller) {
            console.log("SUCCESS! Found scroller from Link Tree Walker");
            console.log("Classes:", scroller.className);
            console.log("ScrollHeight before:", scroller.scrollHeight);

            // Try to scroll it!
            scroller.scrollTop += 2000;
            await new Promise(r => setTimeout(r, 2000));
            console.log("ScrollHeight after scroll push:", scroller.scrollHeight);
            console.log("Visible chats now:", document.querySelectorAll('a[href*="selected_item_id"]').length);

            // Try Keyboard PageDown on it
            scroller.focus();
        } else {
            console.log("No sidebar scroller found from link ancestors");
        }
    });

    // Press pagedown just in case focus worked
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(2000);

    const finalCount = await page.evaluate(() => document.querySelectorAll('a[href*="selected_item_id"]').length);
    console.log("Final visible chats:", finalCount);

    await browser.close();
})();
