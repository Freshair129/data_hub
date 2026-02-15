import { NextResponse } from 'next/server';

/**
 * Facebook Webhook Handler
 * This route listens for events from the Facebook Graph API (Messages, Comments, etc.)
 */
export async function GET(req) {
    // 1. Webhook Verification (Required by Facebook)
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'your_secret_token';

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            return new Response(challenge, { status: 200 });
        } else {
            return new Response('Forbidden', { status: 403 });
        }
    }
}

export async function POST(req) {
    try {
        const body = await req.json();

        // 2. Security Check (Validate X-Hub-Signature if needed)

        // 3. Process Webhook Payload
        if (body.object === 'page') {
            body.entry.forEach(async (entry) => {
                const webhook_event = entry.messaging[0];
                console.log('Received FB Event:', webhook_event);

                const sender_psid = webhook_event.sender.id;
                const message_text = webhook_event.message?.text;

                // LOGIC: Map PSID to CRM Customer
                // In a real system, you would query your DB to find which customer 
                // has this Facebook PSID and then add to their Timeline.

                console.log(`Action: Adding chat log for PSID ${sender_psid}: "${message_text}"`);
            });

            return NextResponse.json({ status: 'EVENT_RECEIVED' });
        } else {
            return NextResponse.json({ error: 'Not a page event' }, { status: 404 });
        }
    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
