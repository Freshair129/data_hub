import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * T11 Fix: Migrated from live Facebook Graph API to Prisma DB
 * Eliminates dependency on FB_ACCESS_TOKEN for adset data
 * Pattern follows campaigns/route.js (DB-first with daily metric aggregation)
 */
export async function GET(request) {
    try {
        const prisma = await getPrisma();
        if (!prisma) {
            return NextResponse.json({ error: 'Database not available' }, { status: 503 });
        }

        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || 'last_30d';
        const status = searchParams.get('status') || '';

        // Date range calculation (same pattern as campaigns/route.js)
        let startDate, endDate;
        const now = new Date();
        endDate = new Date(now);
        startDate = new Date(now);

        if (range === 'today') {
            startDate.setHours(0, 0, 0, 0);
        } else if (range === 'yesterday') {
            startDate.setDate(now.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(now.getDate() - 1);
            endDate.setHours(23, 59, 59, 999);
        } else if (range === 'this_month') {
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
        } else if (range === 'last_month') {
            startDate.setMonth(now.getMonth() - 1);
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setDate(0);
            endDate.setHours(23, 59, 59, 999);
        } else if (range === 'last_30d') {
            startDate.setDate(now.getDate() - 30);
        } else if (range === 'last_90d') {
            startDate.setDate(now.getDate() - 90);
        } else {
            startDate = new Date('2000-01-01'); // maximum
        }

        const statusFilter = status ? { status: { in: status.split(',').map(s => s.trim()) } } : {};

        const adSets = await prisma.adSet.findMany({
            where: statusFilter,
            include: {
                campaign: {
                    select: { campaignId: true }
                },
                ads: {
                    include: {
                        dailyMetrics: {
                            where: {
                                date: {
                                    gte: startDate,
                                    lte: endDate
                                }
                            }
                        }
                    }
                }
            }
        });

        const formatted = adSets.map(as => {
            let spend = 0, impressions = 0, clicks = 0, leads = 0, purchases = 0, revenue = 0;

            as.ads.forEach(ad => {
                ad.dailyMetrics.forEach(m => {
                    spend += m.spend;
                    impressions += m.impressions;
                    clicks += m.clicks;
                    leads += m.leads;
                    purchases += m.purchases;
                    revenue += m.revenue;
                });
            });

            return {
                id: as.adSetId,                         // FB adset ID (not cuid)
                name: as.name,
                status: as.status,
                campaign_id: as.campaign?.campaignId,    // FB campaign ID (not cuid)
                optimization_goal: null,                 // Not stored in DB
                daily_budget: as.dailyBudget,
                lifetime_budget: null,                   // Not stored in DB
                spend,
                impressions,
                clicks,
                reach: 0,                                // Not stored in DB
                cpc: clicks > 0 ? spend / clicks : 0,
                cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
                ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
                actions: [],                             // Frontend aggregates from ads level
                action_values: [],
                cost_per_action_type: [],
            };
        }).filter(as => as.spend > 0 || as.status === 'ACTIVE');

        // Sort by spend descending
        formatted.sort((a, b) => b.spend - a.spend);

        return NextResponse.json({
            success: true,
            data: formatted
        });

    } catch (error) {
        console.error('[Adsets] API Route Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
