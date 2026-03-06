
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: '.env.local' });

const LINE_API = 'https://api.line.me/v2/bot/message/push';
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const groupId = process.env.LINE_GROUP_ID;

const adsToday = [
    { name: "Food Stylist 3", spend: 176.82 },
    { name: "Dimsum Clip", spend: 173.57 },
    { name: "Kids Camp SS2", spend: 235.14 },
    { name: "Package Sushi", spend: 22.69 }
];

const totalSpend = adsToday.reduce((sum, ad) => sum + ad.spend, 0);

async function sendRealtimeReport() {
    if (!token || !groupId) {
        console.error('Missing LINE credentials');
        return;
    }

    const flexMessage = {
        type: 'flex',
        altText: '🚀 Real-time Ad Delivery Report',
        contents: {
            type: 'bubble',
            styles: { header: { backgroundColor: '#FFD700' } },
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: '🚀 Real-time Delivery (Today)', weight: 'bold', size: 'lg' },
                    { type: 'text', text: '6 Mar 2026 • Live Sync', size: 'xs', color: '#666666' }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    { type: 'text', text: `Total Spend: ฿${totalSpend.toFixed(2)}`, weight: 'bold', size: 'md', color: '#E63946' },
                    { type: 'separator', margin: 'md' },
                    ...adsToday.map(ad => ({
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'sm',
                        contents: [
                            { type: 'text', text: ad.name, size: 'xs', flex: 7 },
                            { type: 'text', text: `฿${ad.spend.toFixed(2)}`, size: 'xs', weight: 'bold', flex: 3, align: 'end' }
                        ]
                    })),
                    { type: 'separator', margin: 'lg' },
                    { type: 'text', text: 'ระบบกำลังนำส่งแอดทั้ง 4 ตัวนี้อยู่ ณ ขณะนี้ครับ', size: 'xxs', color: '#AAAAAA', margin: 'md', wrap: true }
                ]
            }
        }
    };

    try {
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

        const data = await res.json();
        console.log('LINE Response:', data);
    } catch (e) {
        console.error('Error sending:', e);
    }
}

sendRealtimeReport();
