import { NextResponse } from 'next/server';
import crypto from 'crypto';

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;

export async function POST(request) {
    console.log('📬 [LINE Webhook] Request received...');
    try {
        const signature = request.headers.get('x-line-signature');
        const textBody = await request.text();

        if (!textBody) {
            console.log('⚠️ [LINE Webhook] Empty body received');
            return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        let body;
        try {
            body = JSON.parse(textBody);
        } catch (e) {
            console.warn('⚠️ [LINE Webhook] Malformed JSON');
            return NextResponse.json({ status: 'ok' }, { status: 200 });
        }

        // Verify LINE Signature
        if (LINE_CHANNEL_SECRET && signature) {
            const expectedSignature = crypto
                .createHmac('sha256', LINE_CHANNEL_SECRET)
                .update(textBody)
                .digest('base64');

            if (signature !== expectedSignature) {
                console.warn('[LINE Webhook] Invalid signature mismatch');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        }

        console.log('\n💬 [LINE Webhook] Event Received!');

        // Process events
        if (body.events && Array.isArray(body.events)) {
            for (const event of body.events) {
                // We're specifically looking for group/room IDs
                const source = event.source || {};
                const sourceType = source.type;
                const userId = source.userId;
                const groupId = source.groupId;
                const roomId = source.roomId;

                let locationMsg = `Source: ${sourceType.toUpperCase()}`;

                if (sourceType === 'group') {
                    locationMsg += ` | 🎯 GROUP ID: ${groupId}`;
                    // This is the ID we need for targeted messaging
                    console.log('\n' + '='.repeat(50));
                    console.log(`📌 THE BOT IS IN A GROUP!\nCopy this ID to use for notifications:\n👉 ${groupId}`);
                    console.log('='.repeat(50) + '\n');
                } else if (sourceType === 'room') {
                    locationMsg += ` | ROOM ID: ${roomId}`;
                } else if (sourceType === 'user') {
                    locationMsg += ` | USER ID: ${userId}`;
                }

                console.log(`Type: ${event.type} | ${locationMsg}`);

                if (event.type === 'message' && event.message) {
                    console.log(`Message: "${event.message.text}"`);
                }
            }
        }

        // Always return 200 OK fast to pass the LINE Developers Console verify test
        return NextResponse.json({ status: 'success' }, { status: 200 });

    } catch (error) {
        console.error('[LINE Webhook] Error processing event:', error);
        // Even on internal errors, it's safer to return 200 to prevent LINE from disabling the bot
        return NextResponse.json({ error: 'Processed with errors' }, { status: 200 });
    }
}
