import axios from 'axios';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function compareIDs() {
    console.log('--- Fetching FB IDs (First 100) ---');
    try {
        const res = await axios.get(`https://graph.facebook.com/v19.0/${FB_PAGE_ID}/conversations?fields=id,updated_time&limit=100`, {
            params: { access_token: FB_PAGE_ACCESS_TOKEN }
        });
        const fbConversations = res.data.data || [];
        const fbIds = fbConversations.map(c => c.id);

        console.log(`FB returned ${fbIds.length} conversations.`);

        console.log('\n--- Fetching DB IDs ---');
        const dbConversations = await prisma.conversation.findMany({
            select: { conversationId: true }
        });
        const dbIds = dbConversations.map(c => c.conversationId);
        console.log(`DB has ${dbIds.length} conversations.`);

        const intersection = fbIds.filter(id => dbIds.includes(id));
        console.log(`\nIntersection (Matches): ${intersection.length}`);

        if (fbIds.length > 0) {
            console.log(`First FB ID: ${fbIds[0]} (Updated: ${fbConversations[0].updated_time})`);
        }

        const newIds = fbIds.filter(id => !dbIds.includes(id));
        console.log(`New IDs (Not in DB): ${newIds.length}`);
        if (newIds.length > 0) {
            console.log(`Example New ID: ${newIds[0]}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    } finally {
        await prisma.$disconnect();
    }
}

compareIDs();
