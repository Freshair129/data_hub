import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;

async function countTotalFB() {
    console.log(`🔍 Counting total conversations for Page ${FB_PAGE_ID}...`);
    let url = `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/conversations?fields=id&limit=100`;
    let total = 0;

    try {
        while (url) {
            const res = await axios.get(url, { params: { access_token: FB_PAGE_ACCESS_TOKEN } });
            const count = res.data.data?.length || 0;
            total += count;
            process.stdout.write(`\rFound ${total}...`);
            url = res.data.paging?.next;

            // Safety break just in case of infinite loop or too many
            if (total > 10000) {
                console.log('\n⚠️ Reached 10,000 safety limit.');
                break;
            }
        }
        console.log(`\n✅ Total Conversations on FB: ${total}`);
    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);
    }
}

countTotalFB();
