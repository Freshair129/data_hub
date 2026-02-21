import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const DATABASE_URL = process.env.DATABASE_URL;

const SYNC_START_DATE = new Date('2026-01-01T00:00:00Z');

if (!FB_PAGE_ACCESS_TOKEN || !FB_PAGE_ID || !DATABASE_URL) {
    console.error('❌ Missing required environment variables (FB_PAGE_ACCESS_TOKEN, FB_PAGE_ID, DATABASE_URL)');
    process.exit(1);
}

console.log(`🔗 Connecting to database: ${DATABASE_URL.split('@')[1] || 'Unknown'}`);

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function getFBProfile(psid: string) {
    try {
        const res = await axios.get(`https://graph.facebook.com/v19.0/${psid}`, {
            params: {
                access_token: FB_PAGE_ACCESS_TOKEN,
                fields: 'id,first_name,last_name,profile_pic,gender,locale,timezone'
            }
        });
        return res.data;
    } catch (error) {
        console.warn(`  ⚠️ Could not fetch profile for PSID ${psid}:`, error.response?.data?.error?.message || error.message);
        return null;
    }
}

async function syncConversations() {
    console.log(`🚀 Starting Facebook Conversation Sync to Supabase for Page: ${FB_PAGE_ID}...`);

    try {
        let url = `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/conversations?fields=id,updated_time,participants&limit=50`;
        let totalConversations = 0;
        let stopSync = false;

        while (url) {
            const res = await axios.get(url, { params: { access_token: FB_PAGE_ACCESS_TOKEN } });
            const conversations = res.data.data || [];

            for (const conv of conversations) {
                const updatedTime = new Date(conv.updated_time);
                if (updatedTime < SYNC_START_DATE) {
                    stopSync = true;
                    break;
                }

                const participants = conv.participants?.data || [];
                const customerFB = participants.find(p => p.id !== FB_PAGE_ID);

                if (!customerFB) continue;

                const psid = customerFB.id;
                const customerName = customerFB.name;
                const customerProfileId = `FB_CHAT_${psid}`;

                console.log(`👤 Processing Customer: ${customerName} (${psid})`);

                // 1. Fetch/Update Customer Profile
                const profile = await getFBProfile(psid);

                // ID Logic Helpers
                const sanitizeName = (name: string) => (name || '').replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '') || 'User';
                const nameEn = sanitizeName(profile?.first_name || customerName.split(' ')[0]);

                // Determine Origin (Simplified check for now)
                const adData = conv.metadata?.ads_context_data || {};
                const origin = (adData.ad_id || adData.campaign_id) ? 'AD' : 'OG';
                const channel = 'FB';

                const prettyCustomerId = `TVS_${channel}_${origin}_${nameEn}_${psid}`;

                const customer = await prisma.customer.upsert({
                    where: { facebookId: psid }, // Use stable unique key
                    update: {
                        customerId: customerProfileId,
                        firstName: profile?.first_name || customerName.split(' ')[0],
                        lastName: profile?.last_name || customerName.split(' ').slice(1).join(' '),
                        profilePicture: profile?.profile_pic,
                        facebookId: psid,
                        facebookName: customerName,
                        intelligence: {
                            ...profile,
                            pretty_id: prettyCustomerId,
                            source: 'Facebook Messenger',
                            origin: origin
                        }
                    },
                    create: {
                        customerId: customerProfileId,
                        firstName: profile?.first_name || customerName.split(' ')[0],
                        lastName: profile?.last_name || customerName.split(' ').slice(1).join(' '),
                        profilePicture: profile?.profile_pic,
                        facebookId: psid,
                        facebookName: customerName,
                        status: 'Active',
                        intelligence: {
                            ...profile,
                            pretty_id: prettyCustomerId,
                            source: 'Facebook Messenger',
                            origin: origin
                        },
                        walletBalance: 0,
                        walletPoints: 0,
                        walletCurrency: 'THB'
                    }
                });
                console.log(`  ✅ Customer Upserted: ${customer.id}`);

                const prettyConvId = `${channel}_TVS_${origin}_${new Date(conv.updated_time).getTime().toString().slice(-6)}_${psid}`;

                // 2. Sync Conversation Node
                const dbConv = await prisma.conversation.upsert({
                    where: { conversationId: conv.id },
                    update: {
                        lastMessageAt: new Date(conv.updated_time),
                        participantName: customerName,
                        participantId: psid,
                        customer: { connect: { id: customer.id } }
                    },
                    create: {
                        conversationId: conv.id,
                        channel: 'facebook',
                        participantName: customerName,
                        participantId: psid,
                        lastMessageAt: new Date(conv.updated_time),
                        customer: { connect: { id: customer.id } }
                    }
                });
                console.log(`  ✅ Conversation Upserted: ${dbConv.id}`);

                // 3. Fetch Messages for this conversation (paginated — all pages)
                console.log(`  📥 Fetching messages for ${conv.id}...`);
                let allMessages: any[] = [];
                let msgUrl: string | null = `https://graph.facebook.com/v19.0/${conv.id}/messages`;
                let msgParams: Record<string, string> = {
                    access_token: FB_PAGE_ACCESS_TOKEN!,
                    fields: 'id,created_time,from,to,message,attachments{id,mime_type,image_data,video_data,file_url}',
                    limit: '100'
                };

                while (msgUrl) {
                    const msgRes = await axios.get(msgUrl, { params: msgParams });
                    allMessages = [...allMessages, ...(msgRes.data.data || [])];
                    const nextPage = msgRes.data.paging?.next;
                    msgUrl = nextPage || null;
                    msgParams = {};
                }

                // Sort messages CHRONOLOGICALLY (Oldest First) for session boundary calculation
                allMessages.sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime());

                let currentSessionId = "";
                let lastMsgTime: Date | null = null;
                let lastAdId: string | null = null;
                let totalMsgSynced = 0;

                const { generateSessionId } = require('../src/lib/idUtils');

                for (const msg of allMessages) {
                    const msgTime = new Date(msg.created_time);
                    const currentAdId = adData.ad_id || null;

                    // Session Logic: 30-minute inactivity timeout OR Ad ID change
                    const isTimedOut = lastMsgTime && (msgTime.getTime() - lastMsgTime.getTime()) > 30 * 60 * 1000;
                    const isNewIntent = currentAdId !== lastAdId && lastAdId !== null;

                    if (!lastMsgTime || isTimedOut || isNewIntent) {
                        currentSessionId = generateSessionId(psid, msg.created_time);
                        const reason = isTimedOut ? "Timeout" : (isNewIntent ? "New Intent/Ad" : "First Message");
                        console.log(`    🆕 New Session Started: ${currentSessionId} (Reason: ${reason})`);
                    }

                    const fromId = msg.from?.id;
                    const attachment = msg.attachments?.data?.[0];

                    await prisma.message.upsert({
                        where: { messageId: msg.id },
                        update: {
                            sessionId: currentSessionId,
                            metadata: {
                                customer_id: prettyCustomerId,
                                conversation_id: prettyConvId,
                                agent_id: dbConv.assignedAgent,
                                lead_id: prettyCustomerId,
                                channel: channel,
                                origin: origin,
                                ad_id: adData.ad_id,
                                campaign_id: adData.campaign_id,
                                ad_set_id: adData.ad_set_id
                            }
                        },
                        create: {
                            messageId: msg.id,
                            conversation: { connect: { id: dbConv.id } },
                            sessionId: currentSessionId,
                            fromId: fromId,
                            fromName: msg.from?.name,
                            content: msg.message,
                            hasAttachment: !!attachment,
                            attachmentId: attachment?.id,
                            attachmentType: attachment?.mime_type,
                            attachmentUrl: attachment?.image_data?.url || attachment?.video_data?.url || attachment?.file_url,
                            createdAt: msgTime,
                            metadata: {
                                customer_id: prettyCustomerId,
                                conversation_id: prettyConvId,
                                agent_id: dbConv.assignedAgent,
                                lead_id: prettyCustomerId,
                                channel: channel,
                                origin: origin,
                                ad_id: adData.ad_id,
                                campaign_id: adData.campaign_id,
                                ad_set_id: adData.ad_set_id
                            }
                        }
                    });
                    totalMsgSynced++;
                    lastMsgTime = msgTime;
                    lastAdId = currentAdId;
                }

                console.log(`  ✅ Synced ${totalMsgSynced} messages (all pages).`);

                totalConversations++;

                if (totalConversations % 5 === 0) {
                    const currentConvCount = await prisma.conversation.count();
                    const currentMsgCount = await prisma.message.count();

                    // Raw SQL check to bypass any potential Prisma caching or driver oddities
                    const rawConvCount = await pool.query('SELECT COUNT(*) FROM conversations');
                    const rawMsgCount = await pool.query('SELECT COUNT(*) FROM messages');

                    console.log(`📊 Prisma Progress: ${currentConvCount} conversations, ${currentMsgCount} messages.`);
                    console.log(`📊 SQL Progress: ${rawConvCount.rows[0].count} conversations, ${rawMsgCount.rows[0].count} messages.`);
                }
            }

            url = res.data.paging?.next;
            if (stopSync) {
                console.log(`⏹️ Reached messages older than ${SYNC_START_DATE.toISOString()}. Stopping sync.`);
                url = null;
            }
        }

        console.log(`\n✨ Sync Completed! Processed ${totalConversations} conversations.`);
    } catch (error) {
        console.error('❌ Sync Failed:', error.response?.data || error.message);
    }
}

syncConversations()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
