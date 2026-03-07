const https = require('https');
require('dotenv').config({ path: '../.env.local' });

const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
// REPLACE THIS with a real message ID you just sent from Business Suite
const MESSAGE_ID = process.argv[2];

if (!MESSAGE_ID) {
    console.error('Usage: node test_fb_admin.js <MESSAGE_ID>');
    process.exit(1);
}

function testGraphApi(messageId) {
    const url = `https://graph.facebook.com/v19.0/${messageId}?fields=from,message,created_time&access_token=${PAGE_ACCESS_TOKEN}`;

    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            const result = JSON.parse(data);
            console.log('--- API Result ---');
            console.log(JSON.stringify(result, null, 2));

            if (result.from) {
                console.log(`\n✅ Sender Name: ${result.from.name}`);
                console.log(`✅ Sender ID: ${result.from.id}`);
            } else {
                console.log('\n❌ Failed to identify sender details.');
            }
        });
    }).on('error', (err) => {
        console.error('Error:', err.message);
    });
}

testGraphApi(MESSAGE_ID);
