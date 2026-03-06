import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

/**
 * GET /api/conversations?from=2026-02-01&to=2026-02-28&limit=500
 *
 * ใช้โดย sync_agents_v2.js --mode=db
 * คืนค่า conversationId + participantId ทุกรายการในช่วงวันที่กำหนด
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const from  = searchParams.get('from');
    const to    = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '500');

    if (!from || !to) {
        return NextResponse.json({ error: 'Missing from/to params (e.g. ?from=2026-02-01&to=2026-02-28)' }, { status: 400 });
    }

    const fromDate = new Date(from + 'T00:00:00.000Z');
    const toDate   = new Date(to   + 'T23:59:59.999Z');

    if (isNaN(fromDate) || isNaN(toDate)) {
        return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    try {
        const prisma = await getPrisma();

        const convs = await prisma.conversation.findMany({
            where: {
                lastMessageAt: {
                    gte: fromDate,
                    lte: toDate,
                },
            },
            select: {
                id:             true,
                conversationId: true,
                participantId:  true,
                lastMessageAt:  true,
                assignedAgent:  true,
            },
            orderBy: { lastMessageAt: 'desc' },
            take: limit,
        });

        return NextResponse.json({
            total: convs.length,
            from,
            to,
            conversations: convs,
        });

    } catch (err) {
        console.error('[/api/conversations] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
