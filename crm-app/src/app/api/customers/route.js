import { NextResponse } from 'next/server';
import { getAllCustomers, upsertCustomer } from '@/lib/db';
import { readCacheList, writeCacheEntry, readCacheEntry } from '@/lib/cacheSync';
import { emitCacheSyncJob, emitRebuildIndex, emitRebuildSummary } from '@/workers/cacheSyncWorker';

/**
 * GET Customers - Now syncs with Facebook Leads automatically
 */
export async function GET(request) {
    try {
        const forceSync = searchParams.get('sync') === 'true';
        const useIndex = searchParams.get('index') === 'true';

        // ── 1. Cache-First: Return lightweight index if requested (unless forcing sync) ──
        if (useIndex && !forceSync) {
            const indexData = readCacheEntry('customer', '__index__');
            if (indexData) {
                console.log(`[Customers] 📋 Serving index (${indexData.total} entries)`);
                return NextResponse.json(indexData);
            }
        }

        // ── 2. Normal Cache-First: Return full profiles list (unless forcing sync) ──
        const cached = readCacheList('customer');
        if (cached.length > 0 && !forceSync) {
            console.log(`[Customers] 🗃 Serving ${cached.length} customers from local cache`);

            // Background refresh REMOVED - Now handled by Webhooks & Hourly Cron
            // setImmediate(() => _syncCustomersFromSources().catch(console.error));

            // Enrich with agent data from conversations (fast DB lookup)
            let agentMap = {};
            try {
                const { getPrisma } = await import('@/lib/db');
                const prisma = await getPrisma();
                if (prisma) {
                    const convs = await prisma.conversation.findMany({
                        where: { assignedAgent: { not: null } },
                        select: {
                            conversationId: true,
                            assignedAgent: true,
                            customer: { select: { customerId: true } }
                        },
                        orderBy: { updatedAt: 'desc' }
                    });

                    // ─── 1. Build Agent Map (ID -> Name) ─────────────────
                    convs.forEach(cv => {
                        // Priority 1: Use linked customer ID string
                        if (cv.customer?.customerId && !agentMap[cv.customer.customerId]) {
                            agentMap[cv.customer.customerId] = cv.assignedAgent;
                        }
                        // Priority 2: Use conversation ID directly (often matches for Facebook leads)
                        if (cv.conversationId && !agentMap[cv.conversationId]) {
                            agentMap[cv.conversationId] = cv.assignedAgent;
                        }
                    });

                    // ─── 2. Build Normalization Map (Alias -> Preferred) ──
                    let normalizationMap = {};
                    try {
                        const employees = await prisma.employee.findMany();
                        employees.forEach(emp => {
                            const preferredName = emp.nickName || emp.firstName;
                            normalizationMap[`${emp.firstName} ${emp.lastName}`] = preferredName;
                            normalizationMap[emp.firstName] = preferredName;
                            if (emp.nickName) normalizationMap[emp.nickName] = preferredName;

                            const aliases = emp.metadata?.aliases || [];
                            aliases.forEach(alias => {
                                normalizationMap[alias] = preferredName;
                            });
                        });
                    } catch (e) { console.warn('[Customers] Normalization map failed:', e.message); }

                    const normalize = (name) => normalizationMap[name] || name;

                    return NextResponse.json(cached.map(c => {
                        const cid = c.customerId || c.customer_id;
                        const convIdFallback = c.conversation_id || c.conversationId || (c.facebookId ? `t_${c.facebookId}` : null);

                        let dbAgent = agentMap[cid] || agentMap[convIdFallback];
                        if (!dbAgent && c.conversationIds && c.conversationIds.length > 0) {
                            for (const cId of c.conversationIds) {
                                if (agentMap[cId]) {
                                    dbAgent = agentMap[cId];
                                    break;
                                }
                            }
                        }

                        let rawAgent = dbAgent || c.profile?.agent || c.agent || c.intelligence?.agent || 'Unassigned';
                        if (rawAgent === 'The V School' && !dbAgent) rawAgent = 'Unassigned';
                        return { ...c, agent: normalize(rawAgent), _source: 'cache' };
                    }));
                }
            } catch (e) { console.error('[Customers] Agent enrichment failed:', e.message); }
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
        const convUrl = `https://graph.facebook.com/v19.0/${PAGE_ID}/conversations?fields=participants,updated_time,labels,messages.limit(100){from,message,created_time}&limit=100&access_token=${PAGE_ACCESS_TOKEN}`;
        const convRes = await fetch(convUrl);
        const convData = await convRes.json();

        if (convRes.ok && convData.data) {
            const { generateCustomerId, getOrigin } = await import('@/lib/idUtils');
            const { getAllCustomers, resolveAgentFromContent } = await import('@/lib/db');
            const allExisting = await getAllCustomers();

            for (const conv of convData.data) {
                const customer = conv.participants?.data?.[0] || { name: 'Unknown', id: '0' };
                const fbLabels = (conv.labels?.data || []).map(l => l.name);
                const rawMessages = conv.messages?.data || [];
                const hasStaffReply = rawMessages.some(m => m.from?.id === PAGE_ID);

                // [NEW] Use robust parsing for assigned agent
                const assignedFromContent = resolveAgentFromContent(rawMessages.map(m => ({ content: m.message })));
                const lastStaffName = rawMessages.find(m => m.from?.id === PAGE_ID)?.from?.name;
                const detectedAgent = assignedFromContent || lastStaffName || 'Unassigned';

                // Standard ID Resolution (TVS-CUS V7)
                let targetCustomer = allExisting.find(c =>
                    c.contact_info?.facebook_id === customer.id ||
                    c.facebookId === customer.id
                );

                const nameEn = customer.name.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '') || 'User';
                const origin = (fbLabels.length > 0) ? 'AD' : 'OG';

                // Extract source_ad_id from labels if present
                const adLabel = fbLabels.find(l => l.includes('ad_id.'));
                const sourceAdId = adLabel ? adLabel.split('ad_id.')[1] : null;

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
                        source_ad_id: sourceAdId || targetCustomer?.intelligence?.source_ad_id || null,
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
