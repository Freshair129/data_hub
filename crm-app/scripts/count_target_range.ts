import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const START_DATE = new Date('2026-01-01T00:00:00Z');

async function countTargetFB() {
    console.log(`🔍 Estimating total conversations since 2026-01-01...`);
    let url = `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/conversations?fields=id,updated_time&limit=250`;
    let totalInRange = 0;
    let stopCount = false;

    try {
        while (url && !stopCount) {
            const res = await axios.get(url, { params: { access_token: FB_PAGE_ACCESS_TOKEN } });
            const data = res.data.data || [];

            for (const conv of data) {
                if (new Date(conv.updated_time) >= START_DATE) {
                    totalInRange++;
                } else {
                    stopCount = true;
                    break;
                }
            }

            process.stdout.write(`\rFound ${totalInRange} conversations in range...`);
            url = res.data.paging?.next;

            if (totalInRange > 15000) break; // safety
        }
        console.log(`\n✅ Total target conversations (since 2025-01-01): ${totalInRange}`);
    } catch (error) {
        console.error('\n❌ Error:', error.response?.data || error.message);
    }
}

countTargetFB();
