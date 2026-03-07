
import dotenv from 'dotenv';
import path from 'path';
import { getPrisma } from '../src/lib/db';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function checkLiveAds() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const recentMetrics = await prisma.adDailyMetric.findMany({
            where: {
                date: { gte: today }
            },
            include: { ad: true },
            orderBy: { spend: 'desc' }
        });

        const allStatuses = await prisma.ad.groupBy({
            by: ['deliveryStatus'],
            _count: { adId: true }
        });

        console.log('--- RECENT METRICS (TODAY) ---');
        if (recentMetrics.length === 0) {
            console.log('No ad metrics recorded for today yet.');
        } else {
            console.table(recentMetrics.map(m => ({
                ID: m.adId,
                Name: m.ad?.name || 'Unknown Ad',
                Spend: m.spend,
                Impressions: m.impressions,
                Leads: m.leads
            })));
        }

        console.log('\n--- ALL STATUS COUNTS ---');
        console.table(allStatuses.map(s => ({
            Status: s.deliveryStatus,
            Count: s._count.adId
        })));
        console.log('-----------------------');
    } catch (error) {
        console.error('Error fetching live ads:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkLiveAds();
