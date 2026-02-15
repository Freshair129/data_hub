import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../customer');

/**
 * GET Customers - Now syncs with Facebook Leads automatically
 */
export async function GET() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
        const AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;
        const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;
        const PAGE_ID = process.env.FB_PAGE_ID;

        // 1. Sync Customers from Facebook Conversations (Chat)
        if (PAGE_ACCESS_TOKEN && PAGE_ID) {
            try {
                // Step A: Fetch Page Admin names to auto-assign as agent
                let pageAdminName = 'The V School'; // Default fallback
                try {
                    const rolesUrl = `https://graph.facebook.com/v19.0/${PAGE_ID}/roles?access_token=${PAGE_ACCESS_TOKEN}`;
                    const rolesRes = await fetch(rolesUrl);
                    const rolesData = await rolesRes.json();
                    if (rolesRes.ok && rolesData.data?.length > 0) {
                        // Use the first admin found (primary responder)
                        pageAdminName = rolesData.data[0].name;
                        console.log(`[Agent] Page admin detected: ${pageAdminName}`);
                    }
                } catch (e) { console.error('Roles fetch error:', e.message); }

                // Step B: Fetch conversations with participant details
                const convUrl = `https://graph.facebook.com/v19.0/${PAGE_ID}/conversations?fields=participants,updated_time,messages.limit(3){from,message,created_time}&limit=100&access_token=${PAGE_ACCESS_TOKEN}`;
                const convRes = await fetch(convUrl);
                const convData = await convRes.json();

                if (convRes.ok && convData.data) {
                    let syncedCount = 0;
                    let updatedCount = 0;

                    convData.data.forEach(conv => {
                        const customer = conv.participants?.data?.find(p => p.id !== PAGE_ID);
                        if (!customer) return;

                        const customerId = `MSG-${customer.id}`;
                        const customerDir = path.join(DATA_DIR, customerId);
                        const filePath = path.join(customerDir, `profile_${customerId}.json`);

                        // Check if there's a staff reply (page replied)
                        const messages = conv.messages?.data || [];
                        const hasStaffReply = messages.some(m => m.from.id === PAGE_ID);
                        const assignedAgent = hasStaffReply ? pageAdminName : 'Unassigned';

                        if (!fs.existsSync(filePath)) {
                            // Create new customer profile
                            if (!fs.existsSync(customerDir)) fs.mkdirSync(customerDir, { recursive: true });

                            const customerProfile = {
                                customer_id: customerId,
                                profile: {
                                    first_name: customer.name?.split(' ')[0] || 'Facebook',
                                    last_name: customer.name?.split(' ').slice(1).join(' ') || 'User',
                                    nick_name: customer.name?.split(' ')[0] || '',
                                    status: 'Active',
                                    membership_tier: 'GENERAL',
                                    lifecycle_stage: hasStaffReply ? 'In Progress' : 'New Lead',
                                    agent: assignedAgent,
                                    join_date: conv.updated_time || new Date().toISOString()
                                },
                                contact_info: {
                                    facebook: customer.name,
                                    facebook_id: customer.id,
                                    lead_channel: 'Facebook'
                                },
                                intelligence: {
                                    metrics: { total_spend: 0, total_learning_hours: 0, total_point: 0, total_order: 0 },
                                    tags: ['Facebook Chat', hasStaffReply ? 'Contacted' : 'New Lead']
                                },
                                inventory: { coupons: [], learning_courses: [] },
                                wallet: { balance: 0, points: 0, currency: 'THB' },
                                timeline: [{
                                    id: `SYNC-${Date.now()}-${syncedCount}`,
                                    date: conv.updated_time || new Date().toISOString(),
                                    type: 'SYSTEM',
                                    summary: 'Synced from Facebook Messenger',
                                    details: { content: `Customer imported from Facebook Page conversation.` }
                                }]
                            };

                            fs.writeFileSync(filePath, JSON.stringify(customerProfile, null, 4));
                            syncedCount++;
                        } else {
                            // Update existing profiles: auto-assign agent if still 'Unassigned' and page replied
                            try {
                                const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                                const currentAgent = existing.profile?.agent || existing.agent;
                                if (hasStaffReply && (!currentAgent || currentAgent === 'Unassigned')) {
                                    if (existing.profile) {
                                        existing.profile.agent = assignedAgent;
                                        existing.profile.lifecycle_stage = existing.profile.lifecycle_stage === 'New Lead' ? 'In Progress' : existing.profile.lifecycle_stage;
                                    } else {
                                        existing.agent = assignedAgent;
                                    }
                                    fs.writeFileSync(filePath, JSON.stringify(existing, null, 4));
                                    updatedCount++;
                                }
                            } catch (e) { /* skip corrupt files */ }
                        }
                    });
                    if (syncedCount > 0) console.log(`[Sync] Imported ${syncedCount} new customers from Facebook Conversations.`);
                    if (updatedCount > 0) console.log(`[Sync] Auto-assigned agent "${pageAdminName}" to ${updatedCount} existing customers.`);
                }
            } catch (e) { console.error('Conversation Sync Error:', e.message); }
        }

        // 2. Fallback: Attempt to Sync Leads from Facebook Lead Forms (requires leads_retrieval permission)
        if (ACCESS_TOKEN && AD_ACCOUNT_ID) {
            try {
                const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/leads?fields=created_time,id,ad_id,ad_name,field_data&limit=50&access_token=${ACCESS_TOKEN}`;
                const response = await fetch(url);
                const data = await response.json();

                if (response.ok && data.data) {
                    data.data.forEach(lead => {
                        const mappedData = {};
                        lead.field_data.forEach(field => {
                            const name = field.name.toLowerCase();
                            const value = field.values?.[0] || '';
                            if (name.includes('name')) mappedData.name = value;
                            if (name.includes('email')) mappedData.email = value;
                            if (name.includes('phone')) mappedData.phone = value;
                        });

                        const customerId = `FB-${lead.id}`;
                        const customerDir = path.join(DATA_DIR, customerId);
                        const filePath = path.join(customerDir, `profile_${customerId}.json`);

                        if (!fs.existsSync(filePath)) {
                            if (!fs.existsSync(customerDir)) fs.mkdirSync(customerDir, { recursive: true });

                            const customerProfile = {
                                customer_id: customerId,
                                profile: {
                                    first_name: mappedData.name?.split(' ')[0] || 'Facebook',
                                    last_name: mappedData.name?.split(' ').slice(1).join(' ') || 'Lead',
                                    status: 'Active',
                                    membership_tier: 'GENERAL',
                                    lifecycle_stage: 'New Lead',
                                    agent: 'Unassigned',
                                    join_date: lead.created_time
                                },
                                contact_info: {
                                    email: mappedData.email || '',
                                    phone_primary: mappedData.phone || '',
                                    lead_channel: 'Facebook Ads'
                                },
                                intelligence: {
                                    metrics: { total_spend: 0, total_learning_hours: 0, total_point: 0 },
                                    tags: ['Facebook Lead'],
                                    attribution: { source: `Facebook Ads (${lead.ad_name || lead.ad_id})` }
                                },
                                inventory: { coupons: [], learning_courses: [] },
                                wallet: { balance: 0, points: 0, currency: 'THB' },
                                timeline: [{
                                    id: `LEAD-${Date.now()}`,
                                    date: lead.created_time,
                                    type: 'SYSTEM',
                                    summary: 'Lead Captured from Facebook Ads',
                                    details: { content: `Direct sync from Facebook Ads: ${lead.ad_name || lead.ad_id}` }
                                }]
                            };
                            fs.writeFileSync(filePath, JSON.stringify(customerProfile, null, 4));
                        }
                    });
                }
            } catch (syncError) {
                console.error('Lead Sync Error:', syncError.message);
            }
        }

        // 2. Read all customers from local storage
        const folders = fs.readdirSync(DATA_DIR).filter(f =>
            fs.statSync(path.join(DATA_DIR, f)).isDirectory()
        );

        const customers = folders.map(id => {
            const filePath = path.join(DATA_DIR, id, `profile_${id}.json`);
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
            return null;
        }).filter(Boolean);

        return NextResponse.json(customers);
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const customer = await request.json();
        const id = customer.customer_id;

        if (!id) return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 });

        const customerDir = path.join(DATA_DIR, id);
        if (!fs.existsSync(customerDir)) {
            fs.mkdirSync(customerDir, { recursive: true });
        }

        const filePath = path.join(customerDir, `profile_${id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(customer, null, 4));

        return NextResponse.json({ success: true, customer });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
