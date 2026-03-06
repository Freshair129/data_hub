const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));
    if (!page) { console.log('No inbox page found'); process.exit(1); }

    const fibers = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="selected_item_id"]'));
        const linkProps = links.map(el => Object.keys(el).find(k => k.startsWith('__reactFiber')));

        // Find ALL elements with __reactFiber in the first link's ancestors
        let el = links[0];
        const ancestors = [];
        for (let i = 0; el && i < 10; i++) {
            ancestors.push({
                tag: el.tagName,
                class: el.className,
                hasFiber: !!Object.keys(el).find(k => k.startsWith('__reactFiber'))
            });
            el = el.parentElement;
        }
        return { linkHasFiber: linkProps, ancestors };
    });
    console.log(JSON.stringify(fibers, null, 2));
    await browser.close();
})();
