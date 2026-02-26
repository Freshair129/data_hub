'use client';

import { useState, useEffect } from 'react';

export default function TeamKPI({ customers = [] }) {
    const [stats, setStats] = useState([]);
    const [summary, setSummary] = useState({
        totalRevenue: 0,
        totalLeads: 0,
        totalCustomers: 0,
        marketingRevenue: 0,
        marketingPurchases: 0,
        marketingLeads: 0
    });
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('lifetime'); // today, weekly, monthly, lifetime
    const [selectedAgentDetail, setSelectedAgentDetail] = useState(null); // { agent, type: 'sales' | 'customers' }

    useEffect(() => {
        fetchStats();
    }, [timeframe]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/analytics/team?timeframe=${timeframe}`);
            const result = await res.json();
            if (result.success) {
                setStats(result.data);
                setSummary(result.summary);
            }
        } catch (err) {
            console.error('Failed to fetch team stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val) => new Intl.NumberFormat('th-TH').format(val);

    const getLinkedData = (agentName) => {
        if (!agentName) return { assignedCustomers: [], sales: [] };

        // Resolve Date Range for prop filtering
        const now = new Date();
        let startDate = null;
        if (timeframe === 'today') startDate = new Date(now.setHours(0, 0, 0, 0));
        else if (timeframe === 'weekly') startDate = new Date(now.setDate(now.getDate() - 7));
        else if (timeframe === 'monthly') startDate = new Date(now.getFullYear(), now.getMonth(), 1);

        // Find the employee object to get aliases and FB names for mapping
        const emp = stats.find(s => s.name === agentName);
        if (!emp) return { assignedCustomers: [], sales: [] };

        const nameKeys = [emp.name, emp.fullName, emp.firstName, emp.facebookName, ...(emp.metadata?.aliases || [])].filter(Boolean).map(v => v.toLowerCase());

        const assignedCustomers = customers.filter(c => {
            // Apply Date Filter
            const joinDate = new Date(c.profile?.join_date || c.createdAt || Date.now());
            if (startDate && joinDate < startDate) return false;

            const agent = (c.agent || c.intelligence?.agent || 'Unassigned').toLowerCase();
            return nameKeys.includes(agent) ||
                nameKeys.some(k => agent.includes(k) || k.includes(agent));
        });

        const sales = assignedCustomers.flatMap(c => {
            const orderList = c.orders || [];
            const timelineOrders = (c.timeline || [])
                .filter(t => t.type === 'ORDER')
                .map(t => ({
                    orderId: t.title,
                    date: t.date,
                    totalAmount: t.details?.total || 0,
                    status: t.details?.status || 'Completed',
                    items: t.details?.items || []
                }));

            const seen = new Set();
            return [...orderList, ...timelineOrders].filter(o => {
                const id = o.orderId || o.id;
                if (seen.has(id)) return false;

                // Apply Date Filter to orders
                const oDate = new Date(o.date);
                if (startDate && oDate < startDate) return false;

                seen.add(id);
                return true;
            });
        });

        return { assignedCustomers, sales };
    };

    return (
        <div className="animate-fade-in space-y-8 pb-10">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-black text-[#F8F8F6] tracking-tight mb-2 uppercase">Team Performance</h2>
                    <p className="text-[#C9A34E] text-xs font-black uppercase tracking-[0.2em]">REVENUE & CONVERSION ANALYTICS</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-[#0A1A2F]/80 p-1 rounded-2xl border border-white/10 backdrop-blur-sm">
                        {['today', 'weekly', 'monthly', 'lifetime'].map((tf) => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeframe === tf
                                    ? 'bg-[#C9A34E] text-[#0A1A2F] shadow-lg shadow-[#C9A34E]/20'
                                    : 'text-white/40 hover:text-white'
                                    }`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={fetchStats}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl text-[#C9A34E] hover:bg-white/10 transition-all"
                    >
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            {/* Summary Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0A1A2F]/50 border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-white"><i className="fas fa-coins text-6xl"></i></div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">{timeframe} Revenue</p>
                    <p className="text-4xl font-black text-[#C9A34E]">฿{formatCurrency(summary.totalRevenue)}</p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-emerald-400">
                        <i className="fas fa-caret-up"></i>
                        <span>Target: ฿{(summary.marketingSpend * 3).toLocaleString()}</span>
                    </div>
                </div>
                <div className="bg-[#0A1A2F]/50 border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-white"><i className="fas fa-users text-6xl"></i></div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Leads Managed</p>
                    <p className="text-4xl font-black text-white">{summary.totalLeads}</p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-white/20">
                        <span>Current Cycle: 2026-02</span>
                    </div>
                </div>
                <div className="bg-[#0A1A2F]/50 border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-white"><i className="fas fa-percentage text-6xl"></i></div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Avg. Conversion Rate</p>
                    <p className="text-4xl font-black text-emerald-400">
                        {summary.totalLeads > 0 ? ((summary.totalCustomers / summary.totalLeads) * 100).toFixed(1) : 0}%
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-white/20">
                        <span>Goal: 15%</span>
                    </div>
                </div>
            </div>

            {/* Agent Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Visual Ranking (8 Units) */}
                <div className="lg:col-span-8 bg-[#0A1A2F]/50 border border-white/10 rounded-[2.5rem] p-8 relative">
                    <h3 className="font-black text-white text-xl tracking-tight mb-10 flex items-center gap-3">
                        <i className="fas fa-trophy text-[#C9A34E]"></i> Revenue Leaderboard
                    </h3>

                    <div className="space-y-8">
                        {stats.map((agent, i) => {
                            const maxRev = Math.max(...stats.map(s => s.revenue), 1);
                            const percent = (agent.revenue / maxRev) * 100;

                            return (
                                <div key={i} className="group cursor-default">
                                    <div className="flex justify-between items-end mb-3 px-2">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-[#C9A34E] text-[#0A1A2F]' : 'bg-white/10 text-white/40'
                                                }`}>
                                                #{i + 1}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white group-hover:text-[#C9A34E] transition-colors">{agent.name}</p>
                                                <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">{agent.role}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex items-center gap-6">
                                            <div
                                                onClick={() => setSelectedAgentDetail({ agent, type: 'customers' })}
                                                className="cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-all border border-transparent hover:border-white/10"
                                            >
                                                <p className="text-sm font-black text-white group-hover:text-[#C9A34E] transition-colors">{agent.customers} Customers</p>
                                                <p className="text-[8px] text-white/20 font-bold uppercase tracking-widest">Click for list</p>
                                            </div>
                                            <div
                                                onClick={() => setSelectedAgentDetail({ agent, type: 'sales' })}
                                                className="cursor-pointer hover:bg-white/5 p-2 rounded-xl transition-all border border-transparent hover:border-[#C9A34E]/30"
                                            >
                                                <p className="text-sm font-black text-[#C9A34E]">฿{formatCurrency(agent.revenue)}</p>
                                                <p className="text-[8px] text-[#C9A34E]/40 font-bold uppercase tracking-widest">Click for details</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden hover:bg-white/10 transition-colors">
                                        <div
                                            style={{ width: `${percent}%` }}
                                            className={`h-full rounded-full relative transition-all duration-1000 ${i === 0 ? 'bg-gradient-to-r from-amber-600 to-[#C9A34E]' : 'bg-white/20'
                                                }`}
                                        >
                                            {i === 0 && <div className="absolute top-0 right-0 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_#fff]"></div>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Performance Cards (4 Units) */}
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-gradient-to-br from-indigo-900/40 to-[#0A1A2F] border border-white/10 rounded-[2.5rem] p-8">
                        <h3 className="font-black text-white text-lg tracking-tight mb-6">Efficiency Leader</h3>
                        {(() => {
                            const bestConv = [...stats].sort((a, b) => b.conversionRate - a.conversionRate)[0];
                            if (!bestConv) return null;
                            return (
                                <div>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-3xl font-black">
                                            {bestConv.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-black text-white text-xl">{bestConv.name}</p>
                                            <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Efficiency King</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Conv. Rate</p>
                                            <p className="text-xl font-black text-emerald-400">{bestConv.conversionRate.toFixed(1)}%</p>
                                        </div>
                                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Total Leads</p>
                                            <p className="text-xl font-black text-white">{bestConv.leads}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    <div className="bg-gradient-to-br from-[#C9A34E]/20 to-[#0A1A2F] border border-white/10 rounded-[2.5rem] p-8">
                        <h3 className="font-black text-white text-lg tracking-tight mb-6">Deal Value Leader</h3>
                        {(() => {
                            const bestAOV = [...stats].sort((a, b) => b.avgOrderValue - a.avgOrderValue)[0];
                            if (!bestAOV) return null;
                            return (
                                <div>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-16 h-16 rounded-[1.5rem] bg-[#C9A34E]/20 border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E] text-3xl font-black">
                                            {bestAOV.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-black text-white text-xl">{bestAOV.name}</p>
                                            <p className="text-xs text-[#C9A34E] font-bold uppercase tracking-widest">High-Ticket closer</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Avg. Order Value (AOV)</p>
                                        <p className="text-2xl font-black text-[#C9A34E]">฿{formatCurrency(bestAOV.avgOrderValue)}</p>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
            {/* Detail Modal */}
            {selectedAgentDetail && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#0A1A2F]/80 backdrop-blur-md" onClick={() => setSelectedAgentDetail(null)}></div>
                    <div className="relative bg-gradient-to-br from-[#1A2F4F] to-[#0A1A2F] border border-white/10 w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-scale-up p-12">
                        <button
                            onClick={() => setSelectedAgentDetail(null)}
                            className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"
                        >
                            <i className="fas fa-times text-2xl"></i>
                        </button>

                        <div className="mb-8">
                            <h3 className="text-2xl font-black text-white mb-2 leading-none uppercase tracking-tight">
                                {selectedAgentDetail.agent.name} • {selectedAgentDetail.type === 'sales' ? 'Order History' : 'Assigned Customers'}
                            </h3>
                            <p className="text-[#C9A34E] text-[10px] font-black uppercase tracking-[0.2em]">
                                DRILL-DOWN PERFORMANCE DATA
                            </p>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {selectedAgentDetail.type === 'customers' ? (
                                <>
                                    {getLinkedData(selectedAgentDetail.agent.name).assignedCustomers.length > 0 ? (
                                        getLinkedData(selectedAgentDetail.agent.name).assignedCustomers.map(c => (
                                            <div key={c.id} className="flex justify-between items-center p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-white/20 transition-all">
                                                <div>
                                                    <p className="text-sm font-bold text-white">{c.profile?.first_name} {c.profile?.last_name} {c.profile?.nick_name ? `(${c.profile.nick_name})` : ''}</p>
                                                    <p className="text-[9px] text-white/40 uppercase tracking-widest">{c.customer_id}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-black text-[#C9A34E]">฿{(c.intelligence?.metrics?.total_spend || 0).toLocaleString()}</p>
                                                    <p className="text-[9px] text-white/20 font-bold uppercase">{c.profile?.status || 'Active'}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-12 text-center text-white/20 italic">No assigned leads found for this agent in this period.</div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-6">
                                    {/* CRM Section */}
                                    <div>
                                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <i className="fas fa-database"></i> CRM Recorded Orders (฿{formatCurrency(selectedAgentDetail.agent.crmRevenue || 0)})
                                        </p>
                                        <div className="space-y-3">
                                            {getLinkedData(selectedAgentDetail.agent.name).sales.length > 0 ? (
                                                getLinkedData(selectedAgentDetail.agent.name).sales.sort((a, b) => new Date(b.date) - new Date(a.date)).map((s, idx) => (
                                                    <div key={idx} className="p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-[#C9A34E]/30 transition-all">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <p className="text-[10px] font-black text-[#C9A34E] uppercase tracking-widest">{s.orderId}</p>
                                                                <p className="text-[9px] text-white/20 font-bold uppercase">{new Date(s.date).toLocaleDateString()}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-white">฿{s.totalAmount?.toLocaleString()}</p>
                                                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${s.status === 'Completed' || s.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                                                                    }`}>
                                                                    {s.status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="text-[9px] text-white/40 leading-relaxed italic">
                                                            {Array.isArray(s.items) ? s.items.join(', ') : 'Direct Item Purchase'}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="py-8 text-center text-white/10 text-xs italic bg-white/5 rounded-2xl border border-dashed border-white/10">No CRM sales in this period.</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Attribution Section */}
                                    <div>
                                        <p className="text-[10px] font-black text-[#C9A34E] uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <i className="fab fa-facebook"></i> Meta Ads Attribution (฿{formatCurrency(selectedAgentDetail.agent.attributed?.revenue || 0)})
                                        </p>
                                        <div className="space-y-3">
                                            {(selectedAgentDetail.agent.attributed?.ads || []).map((ad, idx) => (
                                                <div key={idx} className="p-5 bg-[#C9A34E]/5 rounded-2xl border border-[#C9A34E]/10 flex justify-between items-center group hover:bg-[#C9A34E]/10 transition-all">
                                                    <div className="max-w-[70%]">
                                                        <p className="text-[11px] font-black text-white group-hover:text-[#C9A34E] transition-colors">{ad.name}</p>
                                                        <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Source: Meta Ads Manager</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-black text-[#C9A34E]">฿{formatCurrency(ad.share)}</p>
                                                        <p className="text-[8px] text-[#C9A34E]/40 font-black uppercase">Statistically Attributed</p>
                                                    </div>
                                                </div>
                                            ))}
                                            {(selectedAgentDetail.agent.attributed?.ads || []).length === 0 && (
                                                <div className="py-8 text-center text-white/10 text-xs italic bg-white/5 rounded-2xl border border-dashed border-white/10">No marketing attribution available for this period.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-10 p-6 rounded-3xl bg-indigo-500/5 border border-indigo-500/10 text-center">
                            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest leading-loose">
                                <i className="fas fa-shield-alt mr-2"></i> Hybrid attribution system: Direct CRM matches + Statistical Meta Ads distribution.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
