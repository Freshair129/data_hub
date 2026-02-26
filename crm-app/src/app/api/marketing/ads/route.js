import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * API Route to fetch all ads from the PostgreSQL Database
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

        // ── Check for Single Ad Lookup ──
        const adId = searchParams.get('id');
        if (adId) {
            const ad = await prisma.ad.findUnique({
                where: { adId: adId },
                include: {
                    adSet: {
                        include: {
                            campaign: true
                        }
                    },
                    creative: true
                }
            });

            if (!ad) {
                return NextResponse.json({ success: false, error: 'Ad not found' }, { status: 404 });
            }

            return NextResponse.json({
                success: true,
                data: {
                    id: ad.adId,
                    name: ad.name,
                    status: ad.status,
                    campaign_name: ad.adSet?.campaign?.name,
                    adset_name: ad.adSet?.name,
                    thumbnail: ad.creative?.imageUrl,
                    image: ad.creative?.imageUrl
                }
            });
        }

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

        const ads = await prisma.ad.findMany({
            where: {
                status: buildStatusFilter(),
            },
            include: {
                adSet: {
                    include: {
                        campaign: true
                    }
                },
                creative: true,
                dailyMetrics: {
                    where: {
                        date: {
                            gte: startDate,
                            lte: endDate
                        }
                    }
                }
            },
            orderBy: {
                spend: 'desc'
            }
        });

        const formattedAds = ads.map(ad => {
            // Aggregate metrics for the requested period
            const periodSpend = ad.dailyMetrics.reduce((sum, m) => sum + m.spend, 0);
            const periodImpressions = ad.dailyMetrics.reduce((sum, m) => sum + m.impressions, 0);
            const periodClicks = ad.dailyMetrics.reduce((sum, m) => sum + m.clicks, 0);
            const periodLeads = ad.dailyMetrics.reduce((sum, m) => sum + m.leads, 0);
            const periodPurchases = ad.dailyMetrics.reduce((sum, m) => sum + m.purchases, 0);

            return {
                id: ad.adId,
                name: ad.name,
                status: ad.status,
                campaign_id: ad.adSet?.campaign?.campaignId,
                adset_id: ad.adSet?.adSetId,
                created_time: ad.createdAt,
                updated_time: ad.updatedAt,

                thumbnail: ad.creative?.imageUrl,
                image: ad.creative?.imageUrl,
                creative_name: ad.creative?.name,

                start_time: ad.adSet?.campaign?.startDate || ad.createdAt,
                stop_time: ad.adSet?.campaign?.endDate || null,

                // Returns aggregated insights instead of lifetime insights
                spend: periodSpend,
                impressions: periodImpressions,
                clicks: periodClicks,
                leads: periodLeads,
                purchases: periodPurchases,
            };
        });

        // Optional: Filter out ads that had 0 spend in this period if a specific period was requested?
        // Let's keep all matching status for now, the frontend will filter based on `.spend > 0`.

        return NextResponse.json({
            success: true,
            data: formattedAds
        });

    } catch (error) {
        console.error('Ads API Route Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
