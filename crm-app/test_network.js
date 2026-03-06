const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const context = browser.contexts()[0];
    const page = context.pages().find(p => p.url().includes('business.facebook.com/latest/inbox'));

    // Inject a network interceptor to listen for the thread load!
    console.log("Listening for GraphQL Thread List queries...");

    // Refresh the page so we can catch the initial load
    let graphqlUrl = null;
    let graphqlReqBody = null;
    let headers = null;

    page.on('request', request => {
        const url = request.url();
        if (url.includes('graphql') && request.postData()?.includes('inbox_threads')) {
            graphqlUrl = url;
            graphqlReqBody = request.postData();
            headers = request.headers();
        }
    });

    await page.reload({ waitUntil: 'networkidle' });

    if (graphqlReqBody) {
        console.log("Found GraphQL request!");
        console.log("Body snippet:", graphqlReqBody.slice(0, 500));
    } else {
        console.log("No inbox_threads GraphQL request intercepted. Meta uses a different mechanism.");
    }

    await browser.close();
})();
