const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;

if (!FB_PAGE_ACCESS_TOKEN || !FB_PAGE_ID) {
    console.error('❌ Error: FB_PAGE_ACCESS_TOKEN or FB_PAGE_ID is missing in .env files.');
    process.exit(1);
}

async function runFullSync() {
    console.log('🚀 Starting Full Initial Sync from Facebook...');
    console.log('--------------------------------------------------');

    try {
        // 1. Sync Customers & Conversations
        console.log('📬 Phase 1: Syncing Conversations & Leads...');
        const convUrl = `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/conversations?fields=participants,updated_time,labels,messages.limit(5){from,message,created_time}&limit=50&access_token=${FB_PAGE_ACCESS_TOKEN}`;
        
        const convRes = await axios.get(convUrl);
        const conversations = convRes.data.data || [];
        console.log(`✅ Found ${conversations.length} active conversations.`);

        // In a real script, we would call the internal API or DB lib here.
        // To ensure it works without complex path aliases, we'll trigger the local API endpoint.
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        console.log(`🔗 Triggering CRM reconciliation via ${baseUrl}/api/customers...`);
        
        try {
            const apiRes = await axios.get(`${baseUrl}/api/customers`);
            const count = Array.isArray(apiRes.data) ? apiRes.data.length : 0;
            console.log(`✅ CRM Sync API Response: ${count} customers processed/loaded.`);
        } catch (apiErr) {
            console.warn('⚠️  Could not reach local API. Make sure "npm run dev" is running.');
            console.warn('   (Proceeding with script termination as API is required for processing)');
        }

        // 2. Sync Marketing Data
        console.log('\n📈 Phase 2: Syncing Marketing Insights...');
        if (FB_AD_ACCOUNT_ID) {
            try {
                const marketingRes = await axios.get(`${baseUrl}/api/marketing/sync?range=last_30d`);
                console.log(`✅ Marketing Sync Result: ${marketingRes.data.message || 'Success'}`);
            } catch (mErr) {
                console.warn('⚠️  Marketing Sync API unreachable.');
            }
        } else {
            console.log('⏭️  Skipping Marketing Sync (No AD_ACCOUNT_ID found).');
        }

        console.log('\n--------------------------------------------------');
        console.log('✨ Full Sync Execution Attempted.');

    } catch (error) {
        console.error('❌ Sync Failed:', error.response?.data || error.message);
    }
}

runFullSync();
