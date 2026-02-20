import { NextResponse } from 'next/server';
import { getAllCustomers, upsertCustomer } from '@/lib/db';
import { readCacheList, writeCacheEntry, readCacheEntry } from '@/lib/cacheSync';
import { emitCacheSyncJob, emitRebuildIndex, emitRebuildSummary } from '@/workers/cacheSyncWorker';

/**
 * GET Customers - Now syncs with Facebook Leads automatically
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const useIndex = searchParams.get('index') === 'true';

        // ── 1. Cache-First: Return lightweight index if requested ──
        if (useIndex) {
            const indexData = readCacheEntry('customer', '__index__');
            if (indexData) {
                console.log(`[Customers] 📋 Serving index (${indexData.total} entries)`);
                return NextResponse.json(indexData);
            }
        }

        // ── 2. Normal Cache-First: Return full profiles list ──
        const cached = readCacheList('customer');
        if (cached.length > 0) {
            console.log(`[Customers] 🗃 Serving ${cached.length} customers from local cache`);

            // Background refresh: sync from DB & Facebook without blocking UI
            setImmediate(() => _syncCustomersFromSources().catch(console.error));

            return NextResponse.json(cached.map(c => ({ ...c, _source: 'cache' })));
        }

        // ── 2. Cache Miss: Fetch fresh from sources, cache result ──
        console.log('[Customers] Cache miss — fetching from DB/Facebook...');
        const customers = await _syncCustomersFromSources();
        return NextResponse.json(customers);

    } catch (error) {
        console.error('GET /api/customers error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * Internal: Sync customers from Facebook + DB, update cache.
 */
async function _syncCustomersFromSources() {
    const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
    const PAGE_ID = process.env.FB_PAGE_ID;

    try {
        // Step A: Fetch conversations with participant details and labels
        const convUrl = `https://graph.facebook.com/v19.0/${PAGE_ID}/conversations?fields=participants,updated_time,labels,messages.limit(3){from,message,created_time}&limit=100&access_token=${PAGE_ACCESS_TOKEN}`;
        const convRes = await fetch(convUrl);
        const convData = await convRes.json();

        if (convRes.ok && convData.data) {
            const { generateCustomerId, getOrigin } = await import('@/lib/idUtils');
            const allExisting = await getAllCustomers();

            for (const conv of convData.data) {
                const customer = conv.participants?.data?.[0] || { name: 'Unknown', id: '0' };
                const fbLabels = (conv.labels?.data || []).map(l => l.name);
                const hasStaffReply = (conv.messages?.data || []).some(m => m.from?.id === PAGE_ID);
                const detectedAgent = (conv.messages?.data || []).find(m => m.from?.id === PAGE_ID)?.from?.name || 'Unassigned';

                // Standard ID Resolution (TVS-CUS V7)
                let targetCustomer = allExisting.find(c =>
                    c.contact_info?.facebook_id === customer.id ||
                    c.facebookId === customer.id
                );

                const nameEn = customer.name.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '') || 'User';
                const origin = (fbLabels.length > 0) ? 'AD' : 'OG';

                let customerId = targetCustomer?.customer_id || targetCustomer?.customerId;

                if (!customerId) {
                    customerId = generateCustomerId('facebook', origin, nameEn, customer.id);
                    console.log(`[Sync] Assigning new standardized ID: ${customerId} for Facebook User ${customer.id}`);
                }

                const profileUpdate = {
                    customer_id: customerId,
                    conversation_id: conv.id,
                    profile: {
                        first_name: targetCustomer?.profile?.first_name || customer.name?.split(' ')[0] || 'Facebook',
                        last_name: targetCustomer?.profile?.last_name || customer.name?.split(' ').slice(1).join(' ') || 'User',
                        status: targetCustomer?.profile?.status || 'Active',
                        membership_tier: targetCustomer?.profile?.membership_tier || 'GENERAL',
                        lifecycle_stage: targetCustomer?.profile?.lifecycle_stage || (hasStaffReply ? 'In Progress' : 'New Lead'),
                        agent: targetCustomer?.profile?.agent && targetCustomer.profile.agent !== 'Unassigned' ? targetCustomer.profile.agent : detectedAgent,
                        join_date: targetCustomer?.profile?.join_date || conv.updated_time || new Date().toISOString()
                    },
                    contact_info: {
                        facebook: customer.name,
                        facebook_id: customer.id,
                        lead_channel: 'Facebook'
                    },
                    intelligence: {
                        metrics: targetCustomer?.intelligence?.metrics || { total_spend: 0, total_order: 0 },
                        tags: Array.from(new Set([...(targetCustomer?.intelligence?.tags || []), 'Facebook Chat', ...fbLabels]))
                    }
                };

                await upsertCustomer(profileUpdate);
            }
        }

        // Fetch all customers from DB
        const customers = await getAllCustomers();

        // Write each customer to local cache (Now using split-file structure)
        for (const customer of customers) {
            const cacheId = customer.customer_id || customer.customerId || customer.id;
            if (cacheId) {
                // This will now trigger writeCustomerCache via emitCacheSyncJob 
                // Or we can call it directly for the first-time migration
                emitCacheSyncJob('customer', cacheId, customer);
            }
        }

        // Rebuild lightweight index + analytics summary in background
        emitRebuildIndex(customers).catch(console.error);
        emitRebuildSummary(customers).catch(console.error);

        return customers;
    } catch (e) {
        console.error('[Sync] Conversation Sync Error:', e.message);
        return [];
    }
}


/**
 * POST /api/customers - Save or Update Customer
 */
export async function POST(request) {
    try {
        const customerData = await request.json();
        if (!customerData.customer_id) {
            return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 });
        }

        // 1. Write to DB first
        const result = await upsertCustomer(customerData);

        // 2. Emit cache sync job (async, non-blocking)
        const cacheId = result.customerId || customerData.customer_id;
        emitCacheSyncJob('customer', cacheId, result).catch(console.error);

        return NextResponse.json({ success: true, customer: result });

    } catch (error) {
        console.error('POST /api/customers error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
