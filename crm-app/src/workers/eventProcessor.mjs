
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { logAudit } from '../lib/auditLogger.js';
import { syncChat, applyFacebookLabel, sendFacebookMessage, logAiActionToTimeline } from '../lib/chatService.js';
import { createTask, getCustomerById, getAllEmployees } from '../lib/db.js';
import BusinessAnalyst from '../utils/BusinessAnalyst.js';
import { getOrCreatePersona } from '../lib/personaService.js';
import { sendLineNotify } from '../lib/lineService.js';
import { sendToGoogleSheet } from '../lib/googleSheetsService.js';
import { verifySlip } from '../lib/slipService.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OWNER_NAME = "คุณบอส (Owner)"; // 👈 เปลี่ยนเป็นชื่อคุณจริงได้ที่นี่
const OWNER_IMAGE = "https://raw.githubusercontent.com/google/material-design-icons/master/png/social/person/materialicons/48dp/1x/baseline_person_black_48dp.png"; // 👈 ใส่ URL รูปโปรไฟล์คุณจริง

const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
});
connection.on('error', (err) => {
    console.warn(`[Redis Worker] Connection error: ${err.message}`);
});

const analyst = GEMINI_API_KEY ? new BusinessAnalyst(GEMINI_API_KEY) : null;

/**
 * Event Processor Worker
 * Consumes jobs from 'fb-events' queue.
 */
const worker = new Worker('fb-events', async (job) => {
    const event = job.data;
    const senderId = event.sender?.id;
    // Map PSID to Conversation ID (Simple assumption for demo)
    const conversationId = `t_${senderId}`;

    const traceId = `TRACE-${job.id}`;

    logAudit({
        action: 'JOB_STARTED',
        actor: 'EventWorker',
        target: senderId || 'Unknown',
        status: 'PENDING',
        traceId,
        details: { jobId: job.id, eventType: 'message' }
    });

    if (!senderId) {
        throw new Error('Invalid Event: Missing Sender ID');
    }

    try {
        // 1. Reactive Sync: Pull latest chat history
        // Sanitize: strip 't_' prefix if present, we need the raw thread ID
        const sanitizedConvId = conversationId.startsWith('t_') ? conversationId.substring(2) : conversationId;

        console.log(`[Worker] Syncing chat for ${sanitizedConvId}...`);
        const chatResult = await syncChat(sanitizedConvId);

        if (chatResult.success) {
            console.log(`[Worker] Chat synced for ${sanitizedConvId}. Source: ${chatResult.source} | Count: ${chatResult.data?.length || 0}`);

            // 🔥 Publish Real-time Update to Redis
            await connection.publish('chat-updates', JSON.stringify({
                conversationId: sanitizedConvId,
                timestamp: new Date().toISOString()
            }));

            // 🤖 AI Proactive Logic (Task + Labels + Persona Reply)
            if (analyst && chatResult.data && chatResult.data.length > 0) {
                const customer = await getCustomerById(sanitizedConvId);
                const customerContext = {
                    name: customer?.profile?.first_name || 'Facebook User',
                    lifecycle_stage: customer?.profile?.lifecycle_stage || 'Lead'
                };

                // A. Task Generation
                console.log(`[Worker] AI analyzing context for proactive tasks...`);
                const suggestedTask = await analyst.suggestProactiveTasks(chatResult.data, customerContext);

                if (suggestedTask) {
                    console.log(`[Worker] AI Suggested Task: ${suggestedTask.title} | Priority: ${suggestedTask.priority}`);
                    const newTask = await createTask({
                        customerId: customer?.customerId || sanitizedConvId,
                        title: `[AI] ${suggestedTask.title}`,
                        description: `${suggestedTask.description}\n\n---\n💡 AI Justification: ${suggestedTask.justification}`,
                        type: suggestedTask.type,
                        priority: suggestedTask.priority,
                        aiGenerated: true,
                        aiContext: {
                            justification: suggestedTask.justification,
                            traceId,
                            actor: 'V-Insight (AI)'
                        }
                    });

                    // Notify UI about new task
                    if (newTask) {
                        await connection.publish('task-updates', JSON.stringify(newTask));
                    } else {
                        console.warn('[Worker] Task creation returned null, skipping Redis publish');
                    }

                    // 🔔 Notify LINE if Priority is HIGH
                    if (newTask && newTask.priority === 'HIGH') {
                        const lineMsg = `\n🚨 [งานด่วน!] พบลูกค้าสนใจสูง\n👤 คุณ: ${customerContext.name}\n📌 เรื่อง: ${newTask.title}\n💡 AI แนะนำ: ${suggestedTask.justification}\n🔗 ดูข้อมูล: ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}`;
                        await sendLineNotify(lineMsg);
                    }
                }

                // B. Label Generation & Push
                console.log(`[Worker] AI suggesting labels for Meta...`);
                const suggestedLabels = await analyst.suggestLabels(chatResult.data);
                if (suggestedLabels && suggestedLabels.length > 0) {
                    console.log(`[Worker] AI Suggested Labels: ${suggestedLabels.join(', ')}`);
                    for (const label of suggestedLabels) {
                        await applyFacebookLabel(sanitizedConvId, label);
                    }
                }

                // C. Persona Smart Reply (Drafting & Sending)
                // Logic: Only reply if the last message is from the customer and has high intent
                const lastMsg = chatResult.data[chatResult.data.length - 1];
                const isFromCustomer = lastMsg.from?.id === senderId;

                if (isFromCustomer && suggestedTask && suggestedTask.priority === 'HIGH') {
                    console.log(`[Worker] High Intent detected. Drafting Persona reply as ${OWNER_NAME}...`);
                    const replyText = await analyst.generateSmartReply(chatResult.data, OWNER_NAME, customerContext);

                    if (replyText) {
                        const personaId = await getOrCreatePersona(OWNER_NAME, OWNER_IMAGE);
                        const sendResult = await sendFacebookMessage(senderId, replyText, personaId);

                        if (sendResult.success) {
                            console.log(`[Worker] Persona reply sent successfully via ${personaId}`);
                            await logAiActionToTimeline(sanitizedConvId, `Auto-replied as "${OWNER_NAME}" via Persona API`);
                        }
                    }
                }

                // 📊 Export Lead Update to Google Sheet
                await sendToGoogleSheet({
                    type: 'LEAD_UPDATE',
                    customer_id: sanitizedConvId,
                    name: customerContext.name,
                    stage: customerContext.lifecycle_stage,
                    last_message: lastMsg?.message,
                    suggested_labels: suggestedLabels?.join(', '),
                    suggested_task: suggestedTask?.title
                });
            }
        } else {
            console.warn(`[Worker] Chat sync warning: ${chatResult.error}`);
        }

        // 2. Slip Detection
        if (event.attachments && event.attachments[0]?.type === 'image') {
            const imageUrl = event.attachments[0].payload.url;

            logAudit({
                action: 'SLIP_DETECTED',
                actor: 'EventWorker',
                target: senderId,
                status: 'PROCESSING',
                traceId,
                details: { imageUrl }
            });

            const verificationResult = await verifySlip(imageUrl);

            if (verificationResult.verified) {
                logAudit({
                    action: 'SLIP_VERIFIED',
                    actor: 'EventWorker',
                    target: senderId,
                    status: 'SUCCESS',
                    traceId,
                    details: verificationResult.data
                });
                console.log('[Worker] Slip Verified! (Simulated Database Update)');

                // 🔥 Publish Slip Update to Redis
                await connection.publish('slip-updates', JSON.stringify({
                    senderId,
                    verified: true,
                    data: verificationResult.data
                }));

                // 📊 Export Order/Slip to Google Sheet
                await sendToGoogleSheet({
                    type: 'PAYMENT_VERIFIED',
                    customer_id: senderId,
                    amount: verificationResult.data?.amount,
                    bank: verificationResult.data?.receiver?.bank,
                    date: verificationResult.data?.date,
                    status: 'SUCCESS'
                });
            } else {
                logAudit({
                    action: 'SLIP_REJECTED',
                    actor: 'EventWorker',
                    target: senderId,
                    status: 'FAILED',
                    traceId,
                    details: { error: verificationResult.error }
                });
            }
        }

        logAudit({
            action: 'JOB_COMPLETED',
            actor: 'EventWorker',
            target: senderId,
            status: 'SUCCESS',
            traceId
        });

        return { status: 'processed', sender: senderId };

    } catch (error) {
        logAudit({
            action: 'JOB_FAILED',
            actor: 'EventWorker',
            target: senderId,
            status: 'FAILED',
            traceId,
            details: { error: error.message }
        });
        throw error;
    }

}, { connection });

worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} finished!`);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed with ${err.message}`);
});

console.log('[Worker] Event Processor started. Listening for jobs...');
