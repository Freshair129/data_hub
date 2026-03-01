/**
 * LINE Daily Marketing Report Utility
 * ────────────────────────────────────
 * Sends Flex Message summaries to LINE Group
 * Uses ad_daily_metrics from PostgreSQL
 */

const LINE_API = 'https://api.line.me/v2/bot/message/push';

/**
 * Send a daily ad report to the configured LINE group
 * @param {string} baseUrl - CRM base URL for links
 * @param {string} [groupName] - Optional name of the group (e.g. 'MARKETING' looks for LINE_GROUP_MARKETING)
 */
export async function sendDailyAdReport(baseUrl, groupName = '') {
    // Resolve group ID based on name or fallback to default
    const envKey = groupName ? `LINE_GROUP_${groupName.toUpperCase()}` : 'LINE_GROUP_ID';
    const groupId = process.env[envKey] || process.env.LINE_GROUP_ID;
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!groupId || !token) {
        console.error(`[LINE] Missing LINE group ID (checked ${envKey}) or LINE_CHANNEL_ACCESS_TOKEN`);
        return { success: false, error: 'Missing LINE credentials' };
    }

    try {
        // Fetch today's ad data from our own API
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const sinceDate = formatDate(yesterday);
        const untilDate = formatDate(today);

        // Fetch from PostgreSQL directly to avoid needing baseUrl
        const { getPrisma } = await import('./db.js');
        const prisma = await getPrisma();
        if (!prisma) {
            return { success: false, error: 'Database not available' };
        }

        // Yesterday's metrics (completed day)
        const yesterdayMetrics = await prisma.adDailyMetric.findMany({
            where: {
                date: new Date(sinceDate),
                spend: { gt: 0 },
            },
            include: {
                ad: { select: { adId: true, name: true, status: true } }
            },
            orderBy: { spend: 'desc' }
        });

        // Aggregate
        const totalSpend = yesterdayMetrics.reduce((s, m) => s + m.spend, 0);
        const totalImpressions = yesterdayMetrics.reduce((s, m) => s + m.impressions, 0);
        const totalClicks = yesterdayMetrics.reduce((s, m) => s + m.clicks, 0);
        const totalLeads = yesterdayMetrics.reduce((s, m) => s + m.leads, 0);
        const activeAds = yesterdayMetrics.filter(m => m.ad?.status === 'ACTIVE');
        const pausedAds = yesterdayMetrics.filter(m => m.ad?.status !== 'ACTIVE');

        // Build Flex Message
        const flexMessage = buildFlexMessage({
            date: sinceDate,
            totalSpend,
            totalImpressions,
            totalClicks,
            totalLeads,
            deliveringCount: activeAds.length,
            totalAds: yesterdayMetrics.length,
            topAds: yesterdayMetrics.slice(0, 5),
            crmUrl: baseUrl || 'http://localhost:3000',
        });

        // Send to LINE
        const res = await fetch(LINE_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                to: groupId,
                messages: [flexMessage],
            }),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error('[LINE] Push failed:', res.status, errorText);
            return { success: false, error: `LINE API ${res.status}: ${errorText}` };
        }

        console.log(`[LINE] ✅ Daily report sent: ${yesterdayMetrics.length} ads, ฿${totalSpend.toFixed(0)} spend`);
        return {
            success: true,
            summary: {
                date: sinceDate,
                totalAds: yesterdayMetrics.length,
                deliveringCount: activeAds.length,
                totalSpend,
                totalImpressions,
                totalLeads,
            }
        };
    } catch (error) {
        console.error('[LINE] Report error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Build LINE Flex Message for daily ad report
 */
function buildFlexMessage({ date, totalSpend, totalImpressions, totalClicks, totalLeads, deliveringCount, totalAds, topAds, crmUrl }) {
    const fmt = (n) => Number(n).toLocaleString('th-TH');
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
    const cpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(0) : '-';

    // Top ads rows
    const adRows = topAds.map(m => ({
        type: 'box',
        layout: 'horizontal',
        contents: [
            {
                type: 'text',
                text: (m.ad?.name || 'Unknown').substring(0, 22),
                size: 'xxs',
                color: '#555555',
                flex: 5,
            },
            {
                type: 'text',
                text: `฿${fmt(m.spend)}`,
                size: 'xxs',
                color: '#111111',
                align: 'end',
                flex: 3,
                weight: 'bold',
            },
            {
                type: 'text',
                text: `${m.leads || 0}`,
                size: 'xxs',
                color: m.ad?.status === 'ACTIVE' ? '#06C755' : '#999999',
                align: 'end',
                flex: 2,
            },
        ],
        spacing: 'sm',
    }));

    return {
        type: 'flex',
        altText: `📊 Daily Ad Report ${date}`,
        contents: {
            type: 'bubble',
            size: 'giga',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            {
                                type: 'text',
                                text: '📊 Daily Marketing Report',
                                weight: 'bold',
                                color: '#FFFFFF',
                                size: 'md',
                                flex: 0,
                            },
                        ],
                    },
                    {
                        type: 'text',
                        text: `${date} • The V School`,
                        color: '#FFFFFF99',
                        size: 'xs',
                        margin: 'sm',
                    },
                ],
                backgroundColor: '#1A1A2E',
                paddingAll: '20px',
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    // KPI Row
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            buildKpiBox('Spend', `฿${fmt(totalSpend)}`, '#E63946'),
                            buildKpiBox('Impressions', fmt(totalImpressions), '#457B9D'),
                            buildKpiBox('Leads', `${totalLeads}`, '#2A9D8F'),
                        ],
                        spacing: 'md',
                    },
                    // Secondary KPIs
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            buildKpiBox('CTR', `${ctr}%`, '#E9C46A'),
                            buildKpiBox('CPL', cpl === '-' ? '-' : `฿${cpl}`, '#F4A261'),
                            buildKpiBox('Delivering', `${deliveringCount}/${totalAds}`, '#06C755'),
                        ],
                        spacing: 'md',
                        margin: 'md',
                    },
                    // Separator
                    { type: 'separator', margin: 'xl' },
                    // Top Ads Header
                    {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'text', text: 'Top Ads', size: 'xs', weight: 'bold', color: '#1A1A2E', flex: 5 },
                            { type: 'text', text: 'Spend', size: 'xxs', color: '#AAAAAA', align: 'end', flex: 3 },
                            { type: 'text', text: 'Leads', size: 'xxs', color: '#AAAAAA', align: 'end', flex: 2 },
                        ],
                        margin: 'xl',
                    },
                    { type: 'separator', margin: 'sm' },
                    // Ad rows
                    ...adRows,
                ],
                paddingAll: '20px',
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        action: {
                            type: 'uri',
                            label: '🔍 Open CRM Dashboard',
                            uri: crmUrl,
                        },
                        style: 'primary',
                        color: '#C9A34E',
                        height: 'sm',
                    },
                ],
                paddingAll: '15px',
            },
        },
    };
}

function buildKpiBox(label, value, color) {
    return {
        type: 'box',
        layout: 'vertical',
        contents: [
            { type: 'text', text: label, size: 'xxs', color: '#AAAAAA', weight: 'bold' },
            { type: 'text', text: value, size: 'sm', weight: 'bold', color },
        ],
        flex: 1,
        spacing: 'xs',
    };
}

function formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
