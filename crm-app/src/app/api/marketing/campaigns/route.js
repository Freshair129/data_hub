import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * API Route to fetch all campaigns from the PostgreSQL Database
 * Replaces live Facebook API fetching with fast local DB queries.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const range = searchParams.get('range') || 'last_30d';
        const status = searchParams.get('status') || '';
        const since = searchParams.get('since');
        const until = searchParams.get('until');

        const prisma = await getPrisma();

        // ── Handle Date Bounds for Daily Metrics ──
        let startDate, endDate;
        if (since && until) {
            startDate = new Date(since);
            endDate = new Date(until);
            // Include entire end date
            endDate.setHours(23, 59, 59, 999);
        } else {
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
                endDate.setDate(0); // last day of previous month
                endDate.setHours(23, 59, 59, 999);
            } else if (range === 'last_30d') {
                startDate.setDate(now.getDate() - 30);
            } else if (range === 'last_90d') {
                startDate.setDate(now.getDate() - 90);
            } else {
                startDate = new Date('2000-01-01'); // maximum
            }
        }

        const buildStatusFilter = () => {
            if (!status) return undefined;
            const statuses = status.split(',').map(s => s.trim());
            return { in: statuses };
        };

        const campaigns = await prisma.campaign.findMany({
            where: {
                status: buildStatusFilter(),
            },
            include: {
                adSets: {
                    include: {
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
                }
            }
        });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Subquery: Find which ACTIVE campaigns have had any spend in the last 7 days
        const recentActiveMetrics = await prisma.campaign.findMany({
            where: { status: 'ACTIVE' },
            select: {
                campaignId: true,
                adSets: {
                    select: {
                        ads: {
                            select: {
                                dailyMetrics: {
                                    where: { date: { gte: sevenDaysAgo }, spend: { gt: 0 } },
                                    select: { id: true },
                                    take: 1
                                }
                            }
                        }
                    }
                }
            }
        });

        const activeCampaignsWithRecentSpend = new Set();
        recentActiveMetrics.forEach(c => {
            let hasSpend = false;
            for (const adSet of c.adSets) {
                for (const ad of adSet.ads) {
                    if (ad.dailyMetrics.length > 0) {
                        hasSpend = true;
                        break;
                    }
                }
                if (hasSpend) break;
            }
            if (hasSpend) activeCampaignsWithRecentSpend.add(c.campaignId);
        });

        const formattedCampaigns = campaigns.map(c => {
            let periodSpend = 0;
            let periodImpressions = 0;
            let periodClicks = 0;
            let periodLeads = 0;
            let periodPurchases = 0;

            // Aggregate metrics from all ads in all adsets belonging to this campaign
            c.adSets.forEach(adSet => {
                adSet.ads.forEach(ad => {
                    ad.dailyMetrics.forEach(m => {
                        periodSpend += m.spend;
                        periodImpressions += m.impressions;
                        periodClicks += m.clicks;
                        periodLeads += m.leads;
                        periodPurchases += m.purchases;
                    });
                });
            });

            // Filtering: Exclude ACTIVE campaigns that haven't spent anything in the last 7 days
            if (c.status === 'ACTIVE' && !activeCampaignsWithRecentSpend.has(c.campaignId)) {
                return null;
            }

            return {
                id: c.campaignId,
                name: c.name,
                status: c.status,
                objective: c.objective,
                start_time: c.startDate || c.createdAt,
                stop_time: c.endDate || null,
                isVisible: c.isVisible,

                // Returns aggregated insights instead of lifetime insights
                spend: periodSpend,
                impressions: periodImpressions,
                clicks: periodClicks,
                leads: periodLeads,
                purchases: periodPurchases,
            };
        }).filter(Boolean);

        // Find latest sync time among fetched campaigns
        let latestSync = new Date(0);
        campaigns.forEach(c => {
            if (c.updatedAt > latestSync) {
                latestSync = c.updatedAt;
            }
        });

        // Sort descending by spend
        formattedCampaigns.sort((a, b) => b.spend - a.spend);

        return NextResponse.json({
            success: true,
            lastSync: latestSync.toISOString(),
            data: formattedCampaigns
        });

    } catch (error) {
        console.error('Marketing API Route Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
