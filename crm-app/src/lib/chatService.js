
import fs from 'fs';
import path from 'path';
import BusinessAnalyst from '../utils/BusinessAnalyst.js';
import { getAllEmployees } from './db.js';

const DATA_DIR = path.join(process.cwd(), 'cache', 'customer');
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

/**
 * Chat Service
 * Handles fetching and persisting chat messages.
 */

// 1. Fetch Messages (Live -> Cache + DB)
export async function syncChat(conversationId) {
    if (!conversationId) return { success: false, error: 'Missing Conversation ID' };

    let messages = [];
    const sanitizedConvId = conversationId.replace('t_', ''); // Handle 't_' prefix for FB threads

    // Try Facebook API
    try {
        if (PAGE_ACCESS_TOKEN) {
            const url = `https://graph.facebook.com/v19.0/${sanitizedConvId}/messages?fields=id,message,from,created_time,attachments{id,mime_type,name,file_url,image_data,url}&limit=50&access_token=${PAGE_ACCESS_TOKEN}`;
            const response = await fetch(url);
            const data = await response.json();

            if (response.ok) {
                // Facebook returns newest first
                messages = data.data || [];

                // 1. Save to Local Cache (JSON)
                await saveChatToCache(sanitizedConvId, messages);

                // 2. Sync to DB (Supabase/Prisma) if configured
                const { getPrisma } = await import('./db.js');
                const { generateSessionId, generateMessageId, mapChannel, getOrigin } = await import('./idUtils.js');
                const prisma = await getPrisma();
                if (prisma) {
                    try {
                        console.log(`[ChatService] Syncing ${messages.length} messages to DB for ${sanitizedConvId}...`);

                        // Find conversation to get ID mapping
                        let dbConv = await prisma.conversation.findUnique({
                            where: { conversationId: sanitizedConvId },
                            include: { customer: true }
                        });

                        if (dbConv) {
                            const lastMessage = await prisma.message.findFirst({
                                where: { conversation: { id: dbConv.id } },
                                orderBy: { createdAt: 'desc' }
                            });

                            const channel = mapChannel(dbConv.channel || 'facebook');
                            const origin = getOrigin(dbConv.metadata);

                            // Process messages (FB returns newest first)
                            // We need to decide sessionId for EACH message potentially, 
                            // but usually they come in a batch that belongs together.
                            // Let's iterate chronologically for consistent logic.
                            const sortedMessages = [...messages].sort((a, b) => new Date(a.created_time) - new Date(b.created_time));

                            let currentSessionId = lastMessage?.sessionId;
                            let lastMsgTime = lastMessage?.createdAt ? new Date(lastMessage.createdAt) : null;
                            const lastAdId = lastMessage?.metadata?.ad_id || null;

                            for (const msg of sortedMessages) {
                                const msgTime = new Date(msg.created_time);
                                const currentAdId = dbConv.metadata?.ad_id || null;

                                // Boundary Check: 30 minutes OR Ad ID change OR missing session
                                const isTimedOut = lastMsgTime && (msgTime - lastMsgTime) > 30 * 60 * 1000;
                                const isNewIntent = currentAdId !== lastAdId && lastAdId !== null;

                                if (!currentSessionId || isTimedOut || isNewIntent) {
                                    currentSessionId = generateSessionId(dbConv.participantId || sanitizedConvId, msg.created_time);
                                    console.log(`[ChatService] New Session Created: ${currentSessionId} (Reason: ${isTimedOut ? 'Timeout' : (isNewIntent ? 'Ad Shift' : 'Init')})`);
                                }

                                const attachment = msg.attachments?.data?.[0];

                                await prisma.message.upsert({
                                    where: { messageId: msg.id },
                                    update: {
                                        sessionId: currentSessionId,
                                        metadata: {
                                            customer_id: dbConv.customerId,
                                            agent_id: dbConv.assignedAgent,
                                            lead_id: dbConv.customerId,
                                            channel: channel,
                                            origin: origin,
                                            ad_id: dbConv.metadata?.ad_id,
                                            campaign_id: dbConv.metadata?.campaign_id,
                                            ad_set_id: dbConv.metadata?.ad_set_id
                                        }
                                    },
                                    create: {
                                        messageId: msg.id,
                                        conversation: { connect: { id: dbConv.id } },
                                        sessionId: currentSessionId,
                                        fromId: msg.from?.id,
                                        fromName: msg.from?.name,
                                        content: msg.message,
                                        hasAttachment: !!attachment,
                                        attachmentId: attachment?.id,
                                        attachmentType: attachment?.mime_type,
                                        attachmentUrl: attachment?.image_data?.url || attachment?.video_data?.url || attachment?.file_url,
                                        createdAt: msgTime,
                                        metadata: {
                                            customer_id: dbConv.customerId,
                                            agent_id: dbConv.assignedAgent,
                                            lead_id: dbConv.customerId,
                                            channel: channel,
                                            origin: origin,
                                            ad_id: dbConv.metadata?.ad_id,
                                            campaign_id: dbConv.metadata?.campaign_id,
                                            ad_set_id: dbConv.metadata?.ad_set_id
                                        }
                                    }
                                });
                                lastMsgTime = msgTime;
                            }

                            // Update lastMessageAt
                            if (messages.length > 0) {
                                await prisma.conversation.update({
                                    where: { id: dbConv.id },
                                    data: { lastMessageAt: new Date(messages[0].created_time) }
                                });
                            }
                        }
                    } catch (dbError) {
                        console.error('[ChatService] DB Sync Error:', dbError.message);
                    }
                }

                return { success: true, data: messages.slice().reverse(), source: 'facebook' };
            } else {
                console.warn(`FB API Error (${sanitizedConvId}):`, data.error?.message);
            }
        }
    } catch (error) {
        console.error('FB Fetch Error:', error);
    }

    // [New] Full Integration: Auto-detect Agent Mentions
    if (messages.length > 0) {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (apiKey) {
                const analyst = new BusinessAnalyst(apiKey);
                const allEmployees = await getAllEmployees();
                const staffNames = allEmployees.map(e => e.nickName || e.firstName);

                // Last 10 messages for context
                const contextMessages = messages.slice(0, 10).map(m => ({
                    sender: m.from?.name || 'Customer',
                    text: m.message
                }));

                const result = await analyst.detectAgentFromChat(contextMessages, staffNames);
                if (result.suggested_agent) {
                    console.log(`[AI] Auto-detected Assignment: ${result.suggested_agent} | Reason: ${result.justification}`);

                    // Logic to update assignment (Self-calling a local assignment function)
                    await performAgentAssignment(sanitizedConvId, result.suggested_agent, true);
                }
            }
        } catch (aiErr) {
            console.error('[AI] Assignment Detection Error:', aiErr);
        }
    }

    // Fallback to Local Cache
    return getLocalChat(sanitizedConvId);
}

/**
 * Helper to perform agent assignment in DB and Cache
 */
async function performAgentAssignment(conversationId, agentName, isAuto = false) {
    try {
        const { getPrisma } = await import('./db.js');
        const prisma = await getPrisma();
        const DATA_DIR = path.join(process.cwd(), 'cache', 'customer');

        // 1. Find Customer Folder
        let customerFolder = conversationId;
        if (!fs.existsSync(path.join(DATA_DIR, customerFolder))) {
            customerFolder = `MSG-${conversationId}`;
        }
        const customerDir = path.join(DATA_DIR, customerFolder);
        if (!fs.existsSync(customerDir)) return;

        // 2. Update DB
        if (prisma) {
            await prisma.conversation.update({
                where: { conversationId },
                data: { assignedAgent: agentName }
            });
        }

        // 3. Update Profile JSON
        const profilePath = path.join(customerDir, `profile_${customerFolder}.json`);
        if (fs.existsSync(profilePath)) {
            const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            if (profile.profile) profile.profile.agent = agentName;
            else profile.agent = agentName;

            if (!profile.timeline) profile.timeline = [];
            profile.timeline.push({
                id: `AUTO-ASSIGN-${Date.now()}`,
                date: new Date().toISOString(),
                type: 'SYSTEM',
                summary: isAuto ? 'Agent Assigned Automatically (AI)' : 'Agent Assigned Manually',
                details: { content: `Agent "${agentName}" was assigned based on chat content analysis.` }
            });
            fs.writeFileSync(profilePath, JSON.stringify(profile, null, 4));
        }

        // 4. Update Chat History JSON
        const historyDir = path.join(customerDir, 'chathistory');
        const convFile = path.join(historyDir, `conv_${conversationId}.json`);
        if (fs.existsSync(convFile)) {
            const convData = JSON.parse(fs.readFileSync(convFile, 'utf8'));
            convData.agent = agentName;
            fs.writeFileSync(convFile, JSON.stringify(convData, null, 4));
        }

    } catch (e) {
        console.error('Failed to perform agent assignment:', e);
    }
}

/**
 * Sends a Facebook message with optional Persona ID
 */
export async function sendFacebookMessage(recipientId, text, personaId = null) {
    if (!PAGE_ACCESS_TOKEN) return { success: false, error: 'Missing FB Config' };

    try {
        const payload = {
            recipient: { id: recipientId },
            message: { text: text }
        };

        if (personaId) {
            payload.persona_id = personaId;
            console.log(`[FB/Send] Sending message as Persona: ${personaId}`);
        }

        const res = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        return { success: !!data.message_id, data };
    } catch (e) {
        console.error('[FB/Send] Error sending message:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Applies a label (tag) to a Facebook conversation
 */
export async function applyFacebookLabel(conversationId, labelName) {
    if (!PAGE_ACCESS_TOKEN || !process.env.FB_PAGE_ID) return { success: false, error: 'Missing FB Config' };
    const sanitizedConvId = conversationId.replace('t_', '');

    try {
        // 1. Get or Create Label ID
        const listUrl = `https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/labels?fields=id,name&access_token=${PAGE_ACCESS_TOKEN}`;
        const listRes = await fetch(listUrl);
        const listData = await listRes.json();

        let labelId = listData.data?.find(l => l.name === labelName)?.id;

        if (!labelId) {
            console.log(`[FB/Label] Creating new label: ${labelName}`);
            const createRes = await fetch(`https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/labels?access_token=${PAGE_ACCESS_TOKEN}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: labelName })
            });
            const createData = await createRes.json();
            labelId = createData.id;
        }

        if (labelId) {
            // 2. Associate Label with Conversation
            console.log(`[FB/Label] Applying label ${labelName} (${labelId}) to ${sanitizedConvId}`);
            const applyRes = await fetch(`https://graph.facebook.com/v19.0/${labelId}/users?access_token=${PAGE_ACCESS_TOKEN}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/event-stream' },
                body: JSON.stringify({ user: sanitizedConvId })
            });
            const applyData = await applyRes.json();

            // 3. Log to Customer Timeline in CRM
            if (applyData.success) {
                await logAiActionToTimeline(sanitizedConvId, `Labeled as "${labelName}" on Facebook`);
            }

            return { success: applyData.success || false };
        }
    } catch (e) {
        console.error('[FB/Label] Error applying label:', e.message);
    }
    return { success: false };
}

/**
 * Helper to log AI actions to the customer's timeline
 */
export async function logAiActionToTimeline(conversationId, message) {
    try {
        const { getPrisma, getCustomerById } = await import('./db.js');
        const prisma = await getPrisma();
        if (prisma) {
            const customer = await prisma.customer.findFirst({
                where: { OR: [{ conversationId }, { facebookId: conversationId }] }
            });
            if (customer) {
                await prisma.timelineEvent.create({
                    data: {
                        eventId: `AI-LOG-${Date.now()}`,
                        customer: { connect: { id: customer.id } },
                        type: 'SYSTEM',
                        date: new Date(),
                        summary: `[AI] ${message}`,
                        details: { actor: 'V-Insight (AI)', platform: 'Facebook' }
                    }
                });
            }
        }
    } catch (e) { console.error('Timeline log error:', e); }
}

// 2. Save to Cache
async function saveChatToCache(conversationId, messages) {
    if (!fs.existsSync(DATA_DIR)) return;

    const folders = fs.readdirSync(DATA_DIR);
    for (const folder of folders) {
        const historyDir = path.join(DATA_DIR, folder, 'chathistory');
        // Check for standard naming or prefixed naming
        const possibleFiles = [
            path.join(historyDir, `conv_${conversationId}.json`),
            path.join(historyDir, `conv_t_${conversationId}.json`) // Some might have 't_' prefix
        ];

        for (const convFile of possibleFiles) {
            if (fs.existsSync(convFile)) {
                try {
                    const existing = JSON.parse(fs.readFileSync(convFile, 'utf8'));
                    // Update content
                    existing.messages = { data: messages }; // Save newest first (raw FB format)
                    existing.updated_time = new Date().toISOString();
                    fs.writeFileSync(convFile, JSON.stringify(existing, null, 4));
                    console.log(`[ChatService] Cached ${messages.length} messages for ${conversationId}`);
                    return;
                } catch (e) {
                    console.error('Cache Write Error:', e);
                }
            }
        }
    }
    // If not found, we currently don't create new files here (that's done by the sync/profile creation logic)
    // In a full implementation, we might want to create the folder structure if missing.
}

// 3. Read Local Cache
function getLocalChat(conversationId) {
    if (!fs.existsSync(DATA_DIR)) return { success: false, error: 'No Data Directory' };

    const folders = fs.readdirSync(DATA_DIR);
    for (const folder of folders) {
        const historyDir = path.join(DATA_DIR, folder, 'chathistory');
        const possibleFiles = [
            path.join(historyDir, `conv_${conversationId}.json`),
            path.join(historyDir, `conv_t_${conversationId}.json`)
        ];

        for (const filePath of possibleFiles) {
            if (fs.existsSync(filePath)) {
                try {
                    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    return {
                        success: true,
                        data: (content.messages?.data || []).slice().reverse(),
                        source: 'local'
                    };
                } catch (e) {
                    return { success: false, error: 'Corrupt Cache File' };
                }
            }
        }
    }
    return { success: false, error: 'Chat not found' };
}
