import { NextResponse } from 'next/server';

/**
 * API Route to fetch daily Facebook Ads insights for trend charts
 */
export async function GET() {
    try {
        const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
        const AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;

        if (!ACCESS_TOKEN || !AD_ACCOUNT_ID) {
            return NextResponse.json({ error: 'Facebook credentials not configured' }, { status: 400 });
        }

        const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/insights?fields=spend,impressions,clicks,reach,cpc,cpm,ctr&date_preset=last_30d&time_increment=1&access_token=${ACCESS_TOKEN}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error('Facebook Daily Insights API Error:', data);
            return NextResponse.json({ error: data.error?.message || 'Failed to fetch daily insights' }, { status: 500 });
        }

        const daily = (data.data || []).map(day => ({
            date: day.date_start,
            spend: parseFloat(day.spend || 0),
            impressions: parseInt(day.impressions || 0),
            clicks: parseInt(day.clicks || 0),
            reach: parseInt(day.reach || 0),
            cpc: parseFloat(day.cpc || 0),
            cpm: parseFloat(day.cpm || 0),
            ctr: parseFloat(day.ctr || 0),
        }));

        return NextResponse.json({
            success: true,
            data: daily
        });

    } catch (error) {
        console.error('Daily Insights API Route Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
