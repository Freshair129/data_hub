import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'vschool_crm_2026';

const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
});
connection.on('error', () => { /* Silence connection errors */ });

const eventQueue = new Queue('fb-events', { connection });

/**
 * GET - Facebook Webhook Verification
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[Webhook] Verification successful');
        return new Response(challenge, { status: 200 });
    }
    console.error('[Webhook] Verification failed');
    return new Response('Verification failed', { status: 403 });
}

/**
 * POST - Receive Webhook Events
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const signature = request.headers.get('x-hub-signature-256');

        // Optional: Validate signature if FB_APP_SECRET is set
        if (FB_APP_SECRET && signature) {
            const expectedSignature = crypto
                .createHmac('sha256', FB_APP_SECRET)
                .update(JSON.stringify(body))
                .digest('hex');

            if (signature !== `sha256=${expectedSignature}`) {
                console.warn('[Webhook] Invalid signature');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        }

        console.log('[Webhook] Event Received:', JSON.stringify(body, null, 2));

        // 1. Process Page Events (Messenger)
        if (body.object === 'page') {
            for (const entry of body.entry) {
                const messagingEvent = entry.messaging?.[0];
                if (messagingEvent) {
                    // Queue for async processing to respond to FB quickly
                    await eventQueue.add('message', messagingEvent, {
                        removeOnComplete: true,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 1000 }
                    });
                }
            }
        }

        // 2. Process LeadGen Events
        // (Implementation for leadgen webhook if needed)

        // Always respond with 200 OK within 3 seconds
        return NextResponse.json({ status: 'EVENT_RECEIVED' });

    } catch (error) {
        console.error('[Webhook] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
