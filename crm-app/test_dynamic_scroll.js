const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Refresh the DOM reference EVERY loop to survive React node swapping!
    for (let round = 0; round < 10; round++) {
        const visibleLinks = await page.evaluate(() => {
            // Find whoever has overflow
            let scroller = null;
            const links = document.querySelectorAll('a[href*="selected_item_id"]');
            if (links.length > 0) {
                let el = links[links.length - 1]; // bottom most link
                for (let i = 0; i < 20; i++) {
                    if (!el) break;
                    const style = getComputedStyle(el);
                    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > 100) {
                        scroller = el;
                        break;
                    }
                    el = el.parentElement;
                }
            }

            if (scroller) {
                scroller.scrollTop += 3000;
            } else {
                // Fallback to Window
                window.scrollBy(0, 3000);
            }
            return links.length;
        });

        console.log(`Round ${round + 1}, Found Links: ${visibleLinks}`);
        await page.waitForTimeout(2000); // let React hydrate the new nodes
    }

    // Final check
    const threads = await page.evaluate(() => document.querySelectorAll('a[href*="selected_item_id"]').length);
    console.log("Final visible chats after re-query scrolling:", threads);

    await browser.close();
})();
