import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/line/webhook
 * LINE Developers Console requests a GET to verify the webhook URL.
 */
export async function GET() {
    return new Response('OK', { status: 200 });
}

/**
 * POST /api/line/webhook
 * Receive Webhook events from LINE.
 */
export async function POST(request) {
    try {
        const body = await request.json();

        // LINE sends an array of events
        if (body.events && body.events.length > 0) {
            for (const event of body.events) {
                console.log('\n========================================');
                console.log('🔔 [LINE Webhook] Received Event:');
                console.log(`- Type: ${event.type}`);

                if (event.source) {
                    console.log(`- Source Type: ${event.source.type}`);
                    if (event.source.groupId) {
                        console.log(`\n🎉🎉🎉 FOUND GROUP ID: ${event.source.groupId} 🎉🎉🎉`);
                        console.log('👉 Copy this value and put it in your .env.local as LINE_GROUP_ID\n');
                    } else if (event.source.userId) {
                        console.log(`- User ID: ${event.source.userId}`);
                    }
                }

                if (event.message) {
                    console.log(`- Message: ${event.message.text}`);
                }
                console.log('========================================\n');
            }
        }

        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('[LINE Webhook] Error:', error);
        return new Response('Error', { status: 500 });
    }
}
