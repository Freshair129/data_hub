import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const timeframe = searchParams.get('timeframe') || 'lifetime';
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        // 1. Resolve Date Range
        const now = new Date();
        let startDate = null;
        let endDate = null;

        if (from) {
            startDate = new Date(from);
            if (to) endDate = new Date(to);
        } else if (timeframe === 'today') {
            startDate = new Date(now.setHours(0, 0, 0, 0));
        } else if (timeframe === 'weekly') {
            startDate = new Date(now.setDate(now.getDate() - 7));
        } else if (timeframe === 'monthly') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const prisma = await getPrisma();
        if (!prisma) {
            return NextResponse.json({ success: false, error: 'Database connection unavailable' }, { status: 503 });
        }

        // Active Admins Look-up
        const activeAdmins = await prisma.employee.findMany({
            where: {
                status: 'Active',
                OR: [
                    { role: 'Agent' },
                    { role: 'Admin' },
                    { role: 'Manager' },
                    { role: 'Management' }
                ]
            },
            select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
                nickName: true,
                role: true,
                profilePicture: true,
                facebookId: true
            }
        });

        // Date String for Raw Query
        const startDateStr = startDate ? startDate.toISOString().slice(0, 10) : '2000-01-01';
        const endDateStr = endDate ? endDate.toISOString().slice(0, 10) : new Date(new Date().setFullYear(new Date().getFullYear() + 10)).toISOString().slice(0, 10);

        const reports = [];
        let totalSystemMessages = 0;
        let totalSystemConvs = new Set();
        let globalResponseTimes = [];

        for (const emp of activeAdmins) {
            // Metrics Query
            // We use raw query here because of the complex participant vs responder logic needed
            const metricsResult = await prisma.$queryRaw`
                SELECT 
                    COUNT(*) as total_outbound_messages,
                    COUNT(DISTINCT conversation_id) as conversations_handled,
                    COUNT(DISTINCT DATE(created_at)) as active_days
                FROM messages
                WHERE (responder_id = ${emp.id} OR (from_id = ${emp.facebookId} AND from_id IS NOT NULL))
                  AND created_at >= ${new Date(startDateStr)} AND created_at < ${new Date(endDateStr)}
            `;

            const stats = metricsResult[0];
            const messages = Number(stats.total_outbound_messages || 0);

            if (messages === 0) continue; // Skip if they didn't do anything

            // Average Response Time Query 
            // USING WINDOW FUNCTIONS for massive performance improvement.
            // 1. Order all messages by time within each conversation.
            // 2. Use LAG to look at the immediate previous message.
            // 3. Find transitions where the previous message was from the Customer, and the current is from the Admin.
            // 4. Exclude gaps > 24 hours (treating them as new engagements).
            const rtResult = await prisma.$queryRaw`
                WITH ordered_msgs AS (
                    SELECT 
                        m.conversation_id,
                        m.created_at,
                        m.from_id,
                        m.responder_id,
                        c.participant_id,
                        LAG(m.from_id) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at ASC) as prev_from_id,
                        LAG(m.created_at) OVER (PARTITION BY m.conversation_id ORDER BY m.created_at ASC) as prev_time
                    FROM messages m
                    JOIN conversations c ON m.conversation_id = c.id
                    WHERE m.created_at >= ${new Date(startDateStr)} AND m.created_at < ${new Date(endDateStr)}
                )
                SELECT AVG(EXTRACT(EPOCH FROM (created_at - prev_time))) / 60 as avg_rt_minutes
                FROM ordered_msgs
                WHERE from_id != participant_id -- Any admin replied
                  AND prev_from_id = participant_id -- The previous message was a customer
                  AND (responder_id = ${emp.id} OR (from_id = ${emp.facebookId} AND from_id IS NOT NULL))
                  AND (created_at - prev_time) <= INTERVAL '24 hours'
            `;

            const avgRtMinutes = rtResult[0]?.avg_rt_minutes ? Number(rtResult[0].avg_rt_minutes) : 0;
            const convsHandled = Number(stats.conversations_handled || 0);

            totalSystemMessages += messages;
            if (avgRtMinutes > 0) {
                // Weight the response time by the number of conversations they handled in this timeframe
                globalResponseTimes.push({ time: avgRtMinutes, weight: convsHandled });
            }

            reports.push({
                id: emp.id,
                employeeId: emp.employeeId,
                name: emp.nickName || emp.firstName,
                fullName: `${emp.firstName} ${emp.lastName}`,
                role: emp.role,
                profilePicture: emp.profilePicture,
                stats: {
                    messages,
                    conversationsHandled: convsHandled,
                    activeDays: Number(stats.active_days || 0),
                    avgResponseTimeMinutes: avgRtMinutes
                }
            });
        }

        // Calculate Global Avg Response Time (Weighted by conversation volume)
        let totalWeight = 0;
        let weightedSum = 0;
        globalResponseTimes.forEach(g => {
            weightedSum += (g.time * g.weight);
            totalWeight += g.weight;
        });
        const systemAvgResponseTime = totalWeight > 0 ? weightedSum / totalWeight : 0;

        // Total System Unique Convs
        const totalConvsResult = await prisma.$queryRaw`
            SELECT COUNT(DISTINCT conversation_id) as total_convs
            FROM messages
            WHERE created_at >= ${new Date(startDateStr)} AND created_at < ${new Date(endDateStr)}
              AND (responder_id IS NOT NULL OR from_id NOT IN (SELECT participant_id FROM conversations WHERE id = conversation_id))
        `;
        const totalSystemConversations = Number(totalConvsResult[0]?.total_convs || 0);

        // Sort by Volume as default
        reports.sort((a, b) => b.stats.messages - a.stats.messages);

        return NextResponse.json({
            success: true,
            data: reports,
            summary: {
                totalMessages: totalSystemMessages,
                totalConversations: totalSystemConversations,
                avgResponseTimeMinutes: systemAvgResponseTime,
                timeframe
            }
        });

    } catch (error) {
        console.error('Admin Performance API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
