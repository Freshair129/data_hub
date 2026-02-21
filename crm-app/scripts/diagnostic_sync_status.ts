import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkSyncStatus() {
    console.log('--- Database Sync Status ---');
    try {
        const conversationCount = await prisma.conversation.count();
        const messageCount = await prisma.message.count();
        const customerCount = await prisma.customer.count({
            where: { customerId: { startsWith: 'FB_CHAT_' } }
        });

        console.log(`Conversations in DB: ${conversationCount}`);
        console.log(`Messages in DB: ${messageCount}`);
        console.log(`Facebook Customers in DB: ${customerCount}`);

        console.log('\n--- Facebook API Status ---');
        const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/conversations`, {
            params: {
                access_token: FB_PAGE_ACCESS_TOKEN,
                summary: 'true',
                limit: 1
            }
        });

        // Facebook summary might not always be accurate or present, but it's a start
        const totalFB = fbRes.data.summary?.total_count;
        console.log(`Total Conversations on FB (estimated): ${totalFB !== undefined ? totalFB : 'Unknown'}`);

        if (totalFB !== undefined) {
            if (conversationCount >= totalFB) {
                console.log('\n✅ Sync appears to be complete based on counts.');
            } else {
                console.log(`\n⚠️ Sync incomplete: ${conversationCount}/${totalFB} conversations pulled.`);
            }
        } else {
            console.log('\n❓ Could not determine total count from FB API summary.');
            // Check if there are more via paging
            if (fbRes.data.paging?.next) {
                console.log('ℹ️ There are more than 1 conversation on FB (paging exists).');
            }
        }

    } catch (error) {
        console.error('❌ Error checking status:', error.response?.data || error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkSyncStatus();
