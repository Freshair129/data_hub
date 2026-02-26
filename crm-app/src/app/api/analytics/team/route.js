import { NextResponse } from 'next/server';
import { getAllEmployees, getAllCustomers, getPrisma } from '@/lib/db';

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

        const dateFilterCRM = startDate ? {
            joinDate: {
                gte: startDate,
                ...(endDate ? { lte: endDate } : {})
            }
        } : {};

        const dateFilterAds = startDate ? {
            date: {
                gte: startDate,
                ...(endDate ? { lte: endDate } : {})
            }
        } : {};

        // 2. Load context data
        const employees = await getAllEmployees();
        const customerIndex = await getAllCustomers();

        // 3. Initialize aggregation map
        const agentStats = {};
        employees.forEach(emp => {
            if (emp.status === 'Active') {
                const name = emp.nickName || emp.firstName;
                agentStats[name] = {
                    id: emp.employeeId,
                    name: name,
                    fullName: `${emp.firstName} ${emp.lastName}`,
                    role: emp.role,
                    profilePicture: emp.profilePicture,
                    revenue: 0,
                    leads: 0,
                    customers: 0,
                    conversionRate: 0,
                    avgOrderValue: 0,
                    facebookName: emp.facebookName || '',
                    metadata: emp.metadata || {}
                };
            }
        });

        // 4. Aggregate from customer index (Filtered by Date)
        customerIndex.forEach(customer => {
            // Check date range
            const joinDate = new Date(customer.profile?.join_date || customer.createdAt || Date.now());
            if (startDate && joinDate < startDate) return;
            if (endDate && joinDate > endDate) return;

            let agent = customer.agent || 'Unassigned';

            // Consolidate aliases
            const matchingEmp = employees.find(e => {
                const nick = e.nickName || e.firstName;
                const full = `${e.firstName} ${e.lastName}`;
                const aliases = e.metadata?.aliases || [];
                const matches = [nick, full, e.firstName, e.facebookName, ...aliases].filter(Boolean).map(v => v.toLowerCase());
                const am = agent.toLowerCase();
                return matches.some(m => am === m || am.includes(m) || m.includes(am));
            });

            if (matchingEmp) agent = matchingEmp.nickName || matchingEmp.firstName;

            if (!agentStats[agent]) {
                agentStats[agent] = { id: 'ext', name: agent, role: 'Unknown', revenue: 0, leads: 0, customers: 0 };
            }

            const stats = agentStats[agent];
            stats.leads++;

            // Revenue calculation
            const orders = customer.orders || [];
            if (orders.length > 0) {
                const rev = orders.reduce((sum, o) => sum + (o.totalAmount || o.amount || 0), 0);
                if (rev > 0) {
                    stats.revenue += rev;
                    stats.customers++;
                }
            } else {
                const spend = customer.intelligence?.metrics?.total_spend || 0;
                if (spend > 0) {
                    stats.revenue += spend;
                    stats.customers++;
                }
            }
        });

        // 5. Incorporate Marketing Performance (Ad Insights Filtered by Date)
        const prisma = await getPrisma();
        let totalMarketingRevenue = 0;
        let totalMarketingSpend = 0;
        let totalMarketingPurchases = 0;
        let totalMarketingLeads = 0;
        let topAds = [];
        let liveDelivery = {
            activeAdsCount: 0,
            productsRunning: [],
            ads: []
        };

        if (prisma) {
            try {
                const dateFilterAds = startDate ? {
                    date: {
                        gte: startDate,
                        ...(endDate ? { lte: endDate } : {})
                    }
                } : {};

                const marketingMetricsAggregate = await prisma.adDailyMetric.aggregate({
                    where: dateFilterAds,
                    _sum: { revenue: true, spend: true, purchases: true, leads: true }
                });

                totalMarketingRevenue = marketingMetricsAggregate._sum.revenue || 0;
                totalMarketingSpend = marketingMetricsAggregate._sum.spend || 0;
                totalMarketingPurchases = marketingMetricsAggregate._sum.purchases || 0;
                totalMarketingLeads = marketingMetricsAggregate._sum.leads || 0;

                // --- ADVANCED LIVE DELIVERY LOGIC ---
                // We no longer rely strictly on 48h spend; we query the precise is_running_now flag
                // which is updated hourly by the Python worker if impressions delta > 0
                const liveStatuses = await prisma.adLiveStatus.findMany({
                    where: { isRunningNow: true },
                    include: {
                        ad: {
                            select: { name: true, deliveryStatus: true }
                        }
                    }
                });

                if (liveStatuses.length > 0) {
                    const uniqueAdIds = [...new Set(liveStatuses.map(s => s.adId))];

                    // We still want to show today's spend for these live ads if available
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const todayMetrics = await prisma.adDailyMetric.findMany({
                        where: {
                            adId: { in: uniqueAdIds },
                            date: { gte: today }
                        },
                        select: { adId: true, spend: true, impressions: true, leads: true, revenue: true }
                    });

                    const productMap = {
                        'Sushi': ['sushi', 'ซูชิ'],
                        'Ramen': ['ramen', 'ราเมน'],
                        'Dimsum': ['dimsum', 'ติ่มซำ'],
                        'Kids Camp': ['kids', 'เด็ก'],
                        'Full Course': ['full course', 'คอร์สปลา']
                    };

                    const categorizedProducts = new Set();

                    const formattedLiveAds = liveStatuses.map(ls => {
                        const adName = ls.ad.name || 'Unknown Ad';
                        const metric = todayMetrics.find(m => m.adId === ls.adId) || { spend: 0, impressions: 0, leads: 0, revenue: 0 };

                        let category = 'Other';
                        for (const [cat, keywords] of Object.entries(productMap)) {
                            if (keywords.some(k => adName.toLowerCase().includes(k))) {
                                category = cat;
                                break;
                            }
                        }
                        if (category !== 'Other') categorizedProducts.add(category);

                        return {
                            id: ls.adId,
                            name: adName,
                            category,
                            delivery_status: ls.ad.deliveryStatus || 'UNKNOWN',
                            spend: metric.spend,
                            impressions: metric.impressions,
                            leads: metric.leads,
                            revenue: metric.revenue
                        };
                    });

                    // Sort by highest spend today, then by impressions
                    liveDelivery.ads = formattedLiveAds.sort((a, b) => b.spend - a.spend || b.impressions - a.impressions);
                    liveDelivery.activeAdsCount = uniqueAdIds.length;
                    liveDelivery.productsRunning = Array.from(categorizedProducts);
                }

                // Get top performing ads
                const adMetrics = await prisma.adDailyMetric.groupBy({
                    by: ['adId'],
                    where: dateFilterAds,
                    _sum: { revenue: true, purchases: true },
                    orderBy: { _sum: { revenue: 'desc' } },
                    take: 10
                });

                const adDetails = await prisma.ad.findMany({
                    where: { adId: { in: adMetrics.map(m => m.adId) } },
                    select: { adId: true, name: true }
                });

                topAds = adMetrics.map(m => ({
                    id: m.adId,
                    name: adDetails.find(a => a.adId === m.adId)?.name || 'Unknown Ad',
                    revenue: m._sum.revenue || 0,
                    purchases: m._sum.purchases || 0
                }));

            } catch (e) { console.error('[Analytics] Marketing metrics failed:', e); }
        }

        // 6. Attribute and Finalize
        const totalCRMLeads = Object.values(agentStats).reduce((sum, s) => sum + s.leads, 0);
        const result = Object.values(agentStats).map(stats => {
            const leadShare = totalCRMLeads > 0 ? stats.leads / totalCRMLeads : 0;
            const attrRev = totalMarketingRevenue * leadShare;
            const attrPurchases = Math.round(totalMarketingPurchases * leadShare);
            const attrLeads = Math.round(totalMarketingLeads * leadShare);

            const finalRev = stats.revenue + attrRev;
            const finalLeads = stats.leads + attrLeads;
            const finalCust = stats.customers + attrPurchases;

            return {
                ...stats,
                revenue: finalRev,
                leads: finalLeads,
                customers: finalCust,
                attributed: { revenue: attrRev, customers: attrPurchases, ads: topAds.map(a => ({ ...a, share: a.revenue * leadShare })) },
                conversionRate: finalLeads > 0 ? (finalCust / finalLeads) * 100 : 0,
                avgOrderValue: finalCust > 0 ? finalRev / finalCust : 0
            };
        }).sort((a, b) => b.revenue - a.revenue);

        return NextResponse.json({
            success: true,
            data: result,
            summary: {
                totalRevenue: result.reduce((sum, s) => sum + s.revenue, 0),
                totalLeads: totalCRMLeads + totalMarketingLeads,
                totalCustomers: result.reduce((sum, s) => sum + s.customers, 0),
                marketingSpend: totalMarketingSpend,
                liveDelivery,
                timeframe
            }
        });

    } catch (error) {
        console.error('Team Analytics API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
