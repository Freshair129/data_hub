import { NextResponse } from 'next/server';
import { sendDailyAdReport } from '@/lib/lineReport';

export const dynamic = 'force-dynamic';

/**
 * POST /api/line/send-report
 * Manually trigger LINE daily marketing report
 */
export async function POST(request) {
    try {
        // Read optional groupName from request body
        let groupName = '';
        try {
            const body = await request.json();
            if (body.groupName) groupName = body.groupName;
        } catch (e) {
            // Body might be empty, that's fine
        }

        // Get the base URL for CRM link in the Flex Message
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;

        const result = await sendDailyAdReport(baseUrl, groupName);

        if (result.success) {
            return NextResponse.json({
                success: true,
                message: '✅ Daily ad report sent to LINE group',
                summary: result.summary,
            });
        } else {
            return NextResponse.json({
                success: false,
                error: result.error,
            }, { status: 500 });
        }
    } catch (error) {
        console.error('[LINE API] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
        }, { status: 500 });
    }
}

/**
 * GET /api/line/send-report
 * Preview what would be sent (dry run)
 */
export async function GET() {
    try {
        const groupId = process.env.LINE_GROUP_ID;
        const hasToken = !!process.env.LINE_CHANNEL_ACCESS_TOKEN;

        return NextResponse.json({
            success: true,
            config: {
                groupId: groupId ? `${groupId.substring(0, 8)}...` : 'NOT SET',
                hasToken,
                endpoint: 'POST /api/line/send-report',
                description: 'Sends daily ad report Flex Message to LINE group',
            }
        });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
