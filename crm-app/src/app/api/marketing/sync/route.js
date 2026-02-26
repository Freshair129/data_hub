import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { runPython } from '@/lib/pythonBridge';
import { emitRebuildMarketing, emitRebuildSummary } from '@/workers/cacheSyncWorker';
import { getAllCustomers } from '@/lib/db';

/**
 * POST /api/marketing/sync
 * Triggers the Python bulk sync script and then regenerates local cache.
 */
/**
 * Shared Sync Handler
 */
async function handleSync(request) {
    try {
        const { searchParams } = new URL(request.url);
        const months = searchParams.get('months') || '3';
        console.log(`[MarketingSync] 🚀 Triggering manual hybrid sync (${months} months)...`);

        // 1. Run Python Bulk Sync (Marketing API -> DB)
        const pythonResult = await runPython('marketing_sync.py', { months });

        if (!pythonResult.success) {
            console.error('[MarketingSync] ❌ Python sync failed:', pythonResult.error);
            return NextResponse.json({
                success: false,
                error: 'Python marketing sync failed',
                details: pythonResult.error
            }, { status: 500 });
        }

        console.log('[MarketingSync] ✅ Python sync complete. Triggering cache rebuild...');

        // 2. Trigger cache rebuilds in background
        await emitRebuildMarketing();

        const customers = await getAllCustomers();
        await emitRebuildSummary(customers);

        return NextResponse.json({
            success: true,
            message: 'Hybrid marketing sync triggered successfully',
            python: pythonResult
        });

    } catch (error) {
        console.error('[MarketingSync] ❌ API Route Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request) {
    return handleSync(request);
}

export async function GET(request) {
    return handleSync(request);
}
