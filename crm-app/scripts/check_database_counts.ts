
import dotenv from 'dotenv';
import path from 'path';
import { getPrisma } from '../src/lib/db';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function checkCounts() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    try {
        const counts = {
            Campaigns: await prisma.campaign.count(),
            AdSets: await prisma.adSet.count(),
            Ads: await prisma.ad.count(),
            Metrics: await prisma.adDailyMetric.count(),
            LiveStatus: await prisma.adLiveStatus.count(),
            Customers: await prisma.customer.count(),
            Orders: await prisma.order.count(),
            Employees: await prisma.employee.count()
        };

        console.log('--- DATABASE COUNTS ---');
        console.table(counts);
        console.log('-----------------------');
    } catch (error) {
        console.error('Error fetching counts:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkCounts();
