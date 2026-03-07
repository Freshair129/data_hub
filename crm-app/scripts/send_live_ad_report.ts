
import dotenv from 'dotenv';
import path from 'path';
import { getPrisma } from '../src/lib/db';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const LINE_API = 'https://api.line.me/v2/bot/message/push';
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const groupId = process.env.LINE_GROUP_ID;

async function sendLiveReport() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    if (!token || !groupId) {
        console.error('Missing LINE credentials in .env.local');
        process.exit(1);
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Fetch Active Ads
        const activeAds = await prisma.ad.findMany({
            where: {
                status: 'ACTIVE'
            },
            select: {
                adId: true,
                name: true,
                deliveryStatus: true
            }
        });

        if (activeAds.length === 0) {
            console.log('No active ads found to report.');
            return;
        }

        // 2. Fetch Todays Metrics for these ads
        const metrics = await prisma.adDailyMetric.findMany({
            where: {
                date: { gte: today },
                adId: { in: activeAds.map(a => a.adId) }
            }
        });

        const reportData = activeAds.map(ad => {
            const metric = metrics.find(m => m.adId === ad.adId);
            return {
                name: ad.name,
                spend: metric?.spend || 0,
                leads: metric?.leads || 0
            };
        }).sort((a, b) => b.spend - a.spend);

        const totalSpend = reportData.reduce((sum, d) => sum + d.spend, 0);
        const totalLeads = reportData.reduce((sum, d) => sum + d.leads, 0);

        const dateStr = new Date().toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        const flexMessage = {
            type: 'flex',
            altText: `🚀 Live Ad Report: ฿${totalSpend.toLocaleString()}`,
            contents: {
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        { type: 'text', text: '🚀 LIVE AD DELIVERY', weight: 'bold', color: '#ffffff', size: 'lg' },
                        { type: 'text', text: `Real-time Sync • ${dateStr}`, color: '#ffffff', size: 'xs' }
                    ],
                    backgroundColor: '#00b900'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'box',
                            layout: 'horizontal',
                            contents: [
                                {
                                    type: 'box',
                                    layout: 'vertical',
                                    contents: [
                                        { type: 'text', text: 'TOTAL SPEND', size: 'xs', color: '#aaaaaa' },
                                        { type: 'text', text: `฿${totalSpend.toLocaleString()}`, weight: 'bold', size: 'xl', color: '#111111' }
                                    ]
                                },
                                {
                                    type: 'box',
                                    layout: 'vertical',
                                    contents: [
                                        { type: 'text', text: 'LEADS', size: 'xs', color: '#aaaaaa', align: 'end' },
                                        { type: 'text', text: `${totalLeads}`, weight: 'bold', size: 'xl', color: '#00b900', align: 'end' }
                                    ]
                                }
                            ]
                        },
                        { type: 'separator', margin: 'lg' },
                        {
                            type: 'box',
                            layout: 'horizontal',
                            contents: [
                                { type: 'text', text: 'Active Ads', size: 'xs', color: '#aaaaaa', flex: 7 },
                                { type: 'text', text: 'Spend', size: 'xs', color: '#aaaaaa', align: 'end', flex: 3 }
                            ],
                            margin: 'md'
                        },
                        ...reportData.map(ad => ({
                            type: 'box',
                            layout: 'horizontal',
                            contents: [
                                { type: 'text', text: ad.name, size: 'sm', color: '#333333', flex: 7, wrap: true },
                                { type: 'text', text: `฿${ad.spend.toLocaleString()}`, size: 'sm', weight: 'bold', color: '#111111', align: 'end', flex: 3 }
                            ],
                            margin: 'sm'
                        }))
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        {
                            type: 'text',
                            text: 'ระบบกำลังนำส่งแอดเหล่านี้อยู่ ณ ขณะนี้ครับ',
                            size: 'xxs',
                            color: '#aaaaaa',
                            align: 'center'
                        }
                    ]
                }
            }
        };

        const res = await fetch(LINE_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                to: groupId,
                messages: [flexMessage]
            })
        });

        const result = await res.json();
        console.log('LINE Response:', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('Error sending live report:', error);
    } finally {
        await prisma.$disconnect();
    }
}

sendLiveReport();
