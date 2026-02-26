import { getPrisma } from '../lib/db.js';

console.log('[MarketingService] Using centralized Prisma Client from lib/db');

/**
 * Service to sync Facebook Ad insights to local storage.
 * @param {number} months Number of months to sync back.
 * @returns {Promise<{success: boolean, syncedCount: number, message?: string, error?: string}>}
 */
export async function syncMarketingData(months = 3) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('Could not initialize Prisma');

    try {
        const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
        const AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;

        if (!ACCESS_TOKEN || !AD_ACCOUNT_ID) {
            console.error('Facebook credentials not configured in environment');
            return { success: false, error: 'Facebook credentials not configured' };
        }

        // Adjust path based on execution context (Server vs API Route)
        // process.cwd() in Next.js usually points to project root
        // But let's be safe and use an absolute path relative to project root
        let totalSynced = 0;

        // Fetch in 30-day chunks
        for (let i = 0; i < Math.ceil(months * 30 / 30); i++) {
            const endOffset = i * 30;
            const startOffset = (i + 1) * 30;

            const timeRange = JSON.stringify({ since: getOffsetDate(startOffset), until: getOffsetDate(endOffset) });
            let url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/insights?fields=campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,reach,cpc,cpm,ctr,actions,action_values&time_range=${timeRange}&time_increment=1&level=ad&limit=500&access_token=${ACCESS_TOKEN}`;

            while (url) {
                const response = await fetch(url);
                const data = await response.json();

                if (!response.ok) {
                    console.error(`FB Sync Error at chunk ${i}:`, data);
                    break;
                }

                const adLevelData = data.data || [];

                for (const item of adLevelData) {
                    const date = item.date_start;
                    const adId = item.ad_id;

                    // Extract metrics
                    const spend = parseFloat(item.spend || 0);
                    const impressions = parseInt(item.impressions || 0);
                    const clicks = parseInt(item.clicks || 0);

                    const getAction = (type) => {
                        const action = (item.actions || []).find(a => a.action_type === type);
                        return action ? parseInt(action.value || 0) : 0;
                    };
                    // Sum common lead types
                    const leads = getAction('lead') ||
                        getAction('onsite_conversion.lead') ||
                        getAction('onsite_web_lead') ||
                        getAction('onsite_conversion.messaging_conversation_started_7d');

                    const getActionValue = (type) => {
                        const action = (item.action_values || []).find(a => a.action_type === type);
                        return action ? parseFloat(action.value || 0) : 0;
                    };
                    // Use omni_purchase as priority, fallback to specific types
                    const revenue = getActionValue('omni_purchase') ||
                        getActionValue('purchase') ||
                        getActionValue('onsite_conversion.purchase') ||
                        getActionValue('onsite_web_purchase');

                    const roas = spend > 0 ? revenue / spend : 0;

                    // Also capture purchase count for conversion rate stats
                    const purchases = getAction('purchase') ||
                        getAction('omni_purchase') ||
                        getAction('onsite_conversion.purchase');

                    // 1. Ensure Campaign exists
                    await prisma.campaign.upsert({
                        where: { campaignId: item.campaign_id },
                        create: {
                            campaignId: item.campaign_id,
                            name: item.campaign_name,
                            status: 'ACTIVE',
                            adAccountId: AD_ACCOUNT_ID
                        },
                        update: { name: item.campaign_name }
                    });

                    // 2. Ensure AdSet exists
                    await prisma.adSet.upsert({
                        where: { adSetId: item.adset_id },
                        create: {
                            adSetId: item.adset_id,
                            name: item.adset_name,
                            status: 'ACTIVE',
                            campaignId: item.campaign_id
                        },
                        update: { name: item.adset_name }
                    });

                    // 3. Ensure Ad exists
                    await prisma.ad.upsert({
                        where: { adId: item.ad_id },
                        create: {
                            adId: item.ad_id,
                            name: item.ad_name,
                            status: 'ACTIVE',
                            adSetId: item.adset_id
                        },
                        update: { name: item.ad_name }
                    });

                    // 4. Upsert Daily Metric
                    await prisma.adDailyMetric.upsert({
                        where: {
                            adId_date: {
                                adId: item.ad_id,
                                date: new Date(date)
                            }
                        },
                        create: {
                            adId: item.ad_id,
                            date: new Date(date),
                            spend,
                            impressions,
                            clicks,
                            leads,
                            purchases,
                            revenue,
                            roas
                        },
                        update: {
                            spend,
                            impressions,
                            clicks,
                            leads,
                            purchases,
                            revenue,
                            roas
                        }
                    });

                    totalSynced++;
                }

                url = data.paging?.next || null;
            }
        }

        return {
            success: true,
            syncedCount: totalSynced,
            message: `Deep sync to DB complete. Captured ${totalSynced} daily records across ${months} months.`
        };

    } catch (error) {
        console.error('Marketing Sync Service Error:', error);
        return { success: false, error: 'Internal Server Error' };
    }
}

function getOffsetDate(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() - daysOffset);
    return d.toISOString().split('T')[0];
}

/**
 * Service to sync hourly marketing data to the database.
 * @param {string} date Date string in YYYY-MM-DD format. Default is today.
 */
export async function syncHourlyMarketingData(date) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('Could not initialize Prisma');

    try {
        const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
        const AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;

        if (!ACCESS_TOKEN || !AD_ACCOUNT_ID) {
            throw new Error('Facebook credentials not configured');
        }

        const targetDate = date || new Date().toISOString().split('T')[0];

        // We need the last 24 hours. Because time zone differences and the way FB breakdown works,
        // querying yesterday and today with time_increment=1 ensures we get the full 24-hour spectrum of the current and previous day.
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const timeRange = JSON.stringify({ since: yesterdayStr, until: targetDate });

        const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/insights?level=ad&fields=ad_id,spend,impressions,clicks,actions,action_values&breakdowns=hourly_stats_aggregated_by_audience_time_zone&time_range=${timeRange}&time_increment=1&limit=500&access_token=${ACCESS_TOKEN}`;

        console.log(`[Hourly Sync] Fetching FB breakdown for ${yesterdayStr} to ${targetDate}...`);
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(`FB API Error: ${data.error?.message || 'Unknown error'}`);
        }

        const insights = data.data || [];
        let upsertedCount = 0;

        for (const item of insights) {
            const timeRangeStr = item.hourly_stats_aggregated_by_audience_time_zone || '00:00:00 - 00:59:59';
            const hour = parseInt(timeRangeStr.split(':')[0] || '0');
            const adId = item.ad_id;

            // Extract metrics
            const spend = parseFloat(item.spend || 0);
            const impressions = parseInt(item.impressions || 0);
            const clicks = parseInt(item.clicks || 0);

            // Helpers for actions
            const getAction = (type) => {
                const action = (item.actions || []).find(a => a.action_type === type);
                return action ? parseInt(action.value || 0) : 0;
            };

            const leads = getAction('lead') ||
                getAction('onsite_conversion.lead') ||
                getAction('onsite_web_lead') ||
                getAction('onsite_conversion.messaging_conversation_started_7d');

            // Extraction for Revenue / ROAS if available
            const getActionRev = (type) => {
                const action = (item.action_values || []).find(a => a.action_type === type);
                return action ? parseFloat(action.value || 0) : 0;
            };
            const revenue = getActionRev('omni_purchase') ||
                getActionRev('purchase') ||
                getActionRev('onsite_conversion.purchase') ||
                getActionRev('onsite_web_purchase');

            const purchases = getAction('purchase') ||
                getAction('omni_purchase') ||
                getAction('onsite_conversion.purchase');

            const roas = spend > 0 ? revenue / spend : 0;

            // Check if Ad exists (referential integrity)
            const adExists = await prisma.ad.findUnique({ where: { adId } });
            if (!adExists) {
                console.warn(`[Hourly Sync] Ad ${adId} not found in DB. Skipping hourly metric.`);
                continue;
            }

            // Extract the date from the item since we are querying multiple days
            // FB Insights returns date_start for the day of the breakdown
            const itemDate = item.date_start ? new Date(item.date_start) : new Date(targetDate);

            // Upsert into DB
            await prisma.adHourlyMetric.upsert({
                where: {
                    adId_date_hour: {
                        adId: adExists.adId,
                        date: itemDate,
                        hour: hour
                    }
                },
                update: {
                    spend,
                    impressions,
                    clicks,
                    leads,
                    purchases,
                    revenue,
                    roas
                },
                create: {
                    adId: adExists.adId,
                    date: itemDate,
                    hour: hour,
                    spend,
                    impressions,
                    clicks,
                    leads,
                    purchases,
                    revenue,
                    roas
                }
            });
            upsertedCount++;
        }

        console.log(`[Hourly Sync] Success. Upserted ${upsertedCount} hourly records for ${yesterdayStr} to ${targetDate}.`);
        return { success: true, count: upsertedCount };

    } catch (error) {
        console.error('[Hourly Sync] Error:', error);
        return { success: false, error: error.message };
    }
}
