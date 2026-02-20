import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { readCacheList } from '@/lib/cacheSync';
import { getPrisma } from '@/lib/db';

/**
 * GET /api/marketing/daily
 * Returns daily marketing performance metrics (Trend Data)
 * Source: Cache (ads_logs/daily) with DB fallback
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '30');

        // 1. Try to read from Cache first
        let dailyData = readCacheList('ad_logs/daily');

        // 2. If cache is empty or stale, or we need more data, fallback to DB
        if (!dailyData || dailyData.length === 0) {
            console.log('[API/Marketing/Daily] 🗃 Cache miss, fetching from DB...');
            const prisma = await getPrisma();
            if (prisma) {
                const metrics = await prisma.adDailyMetric.findMany({
                    where: {
                        date: {
                            gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
                        }
                    },
                    orderBy: { date: 'desc' }
                });

                // Group by date for consistency with cache structure
                const byDate = metrics.reduce((acc, m) => {
                    const d = m.date.toISOString().split('T')[0];
                    if (!acc[d]) acc[d] = { date: d, spend: 0, impressions: 0, clicks: 0, leads: 0, purchases: 0, revenue: 0, roas: 0 };
                    acc[d].spend += m.spend;
                    acc[d].impressions += m.impressions;
                    acc[d].clicks += m.clicks;
                    acc[d].leads += m.leads;
                    acc[d].purchases += m.purchases;
                    acc[d].revenue += m.revenue;
                    return acc;
                }, {});

                for (const d in byDate) {
                    byDate[d].roas = byDate[d].spend > 0 ? byDate[d].revenue / byDate[d].spend : 0;
                }

                dailyData = Object.values(byDate);
            }
        }

        // Sort by date ascending for charts
        const sortedData = (dailyData || []).sort((a, b) => new Date(a.date) - new Date(b.date));

        return NextResponse.json({
            success: true,
            count: sortedData.length,
            data: sortedData
        });

    } catch (error) {
        console.error('[API/Marketing/Daily] ❌ Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
