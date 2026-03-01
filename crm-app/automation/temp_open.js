const { chromium } = require('playwright');
async function run() {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = await context.newPage();
        await page.goto('https://business.facebook.com/latest/inbox/all', { waitUntil: 'domcontentloaded' });
        console.log('✅ เปิด Meta Inbox ใน Chrome เรียบร้อยครับ');
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
    } catch (e) {
        console.error('❌ ไม่สามารถเปิดหน้า Inbox ได้:', e.message);
    }
}
run();
