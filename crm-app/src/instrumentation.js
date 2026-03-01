export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { syncMarketingData, syncHourlyMarketingData } = await import('./services/marketingService');
        // Lazy load the customer sync function
        const cron = await import('node-cron');

        console.log('Starting CRM Background Schedulers (Cron Mode)...');

        // 1. Full Customer & Conversation Sync (Hourly Reconciliation)
        // Runs at minute 10 of every 4th hour (e.g., 00:10, 04:10, 08:10...)
        cron.schedule('10 */4 * * *', async () => {
            console.log(`[${new Date().toISOString()}] Running hourly CRM reconciliation...`);
            try {
                // We call the existing customer API logic but as a service
                // For simplicity, we can fetch the internal API or refactor the logic into a service
                const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/customers?sync=true`);
                if (response.ok) {
                    console.log(`[${new Date().toISOString()}] CRM reconciliation complete.`);
                }
            } catch (err) {
                console.error(`[${new Date().toISOString()}] CRM reconciliation failed:`, err);
            }
        });

        // 2. Daily Marketing Data Sync (Hourly updates for last 1 month)
        // Schedule daily sync at the top of every 4th hour (0 minutes past the hour)
        cron.schedule('0 */4 * * *', async () => {
            console.log(`[${new Date().toISOString()}] Running background daily marketing sync (Cron)...`);
            try {
                const result = await syncMarketingData(1); // Sync last 1 month primarily for updates
                console.log(`[${new Date().toISOString()}] Daily sync complete:`, result.message);
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Daily sync failed:`, err);
            }
        });

        // 3. Hourly Marketing Breakdown Sync
        // Schedule hourly breakdown sync at 5 minutes past every 4th hour
        cron.schedule('5 */4 * * *', async () => {
            console.log(`[${new Date().toISOString()}] Running background hourly breakdown sync (Cron)...`);
            try {
                const result = await syncHourlyMarketingData();
                if (result.success) {
                    console.log(`[${new Date().toISOString()}] Hourly sync complete: Upserted ${result.count} records.`);
                } else {
                    console.error(`[${new Date().toISOString()}] Hourly sync failed:`, result.error);
                }
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Hourly sync error:`, err);
            }
        });

        // 4. LINE Daily Marketing Report (Every day at 09:00 Bangkok Time = 02:00 UTC)
        cron.schedule('0 2 * * *', async () => {
            console.log(`[${new Date().toISOString()}] Sending LINE daily marketing report...`);
            try {
                const { sendDailyAdReport } = await import('./lib/lineReport.js');
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
                const result = await sendDailyAdReport(baseUrl);
                if (result.success) {
                    console.log(`[${new Date().toISOString()}] LINE report sent: ${result.summary.totalAds} ads, ฿${result.summary.totalSpend.toFixed(0)}`);
                } else {
                    console.error(`[${new Date().toISOString()}] LINE report failed:`, result.error);
                }
            } catch (err) {
                console.error(`[${new Date().toISOString()}] LINE report error:`, err);
            }
        });
    }
}
