export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { syncMarketingData, syncHourlyMarketingData } = await import('./services/marketingService');

        const cron = await import('node-cron');

        console.log('Starting Marketing Data Sync Scheduler (Cron Mode)...');

        // Schedule daily sync at the top of every hour (0 minutes past the hour)
        cron.schedule('0 * * * *', async () => {
            console.log(`[${new Date().toISOString()}] Running background daily marketing sync (Cron)...`);
            try {
                const result = await syncMarketingData(1); // Sync last 1 month primarily for updates
                console.log(`[${new Date().toISOString()}] Daily sync complete:`, result.message);
            } catch (err) {
                console.error(`[${new Date().toISOString()}] Daily sync failed:`, err);
            }
        });

        // Schedule hourly breakdown sync at 5 minutes past every hour
        cron.schedule('5 * * * *', async () => {
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
    }
}
