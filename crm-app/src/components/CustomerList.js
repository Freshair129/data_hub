'use client';

import React, { useState, useMemo, useEffect } from 'react';

// ─── Data Normalizer ──────────────────────────────────────
// Handles both flat camelCase (DB/cache) and nested profile.* (legacy) shapes
function normalize(c) {
    if (!c) return c;
    const p = c.profile || {};
    return {
        _raw: c, // keep original for onSelectCustomer callback
        id: c.customer_id || c.customerId || c.id,
        firstName: c.firstName || p.first_name || p.firstName || '',
        lastName: c.lastName || p.last_name || p.lastName || '',
        nickName: c.nickName || p.nick_name || p.nickName || '',
        memberId: c.memberId || p.member_id || p.memberId || '',
        agent: c.agent || p.agent || c.intelligence?.agent || 'Unassigned',
        status: c.status || 'New Lead',
        lifecycleStage: c.lifecycleStage || p.lifecycle_stage || p.lifecycleStage || 'Lead',
        membershipTier: c.membershipTier || p.membership_tier || p.membershipTier || 'MEMBER',
        email: c.email || c.contact_info?.email || p.email || '',
        phone: c.phonePrimary || c.contact_info?.phone_primary || p.phone_primary || '',
        facebookId: c.facebookId || c.contact_info?.facebook_id || p.facebook_id || '',
        intelligence: c.intelligence || {},
        totalSpend: c.intelligence?.metrics?.total_spend || 0,
        learningHours: c.intelligence?.metrics?.total_learning_hours || 0,
        internship: c.intelligence?.metrics?.internship_completed || false,
        aiScore: c.intelligence?.score,
        aiIntent: c.intelligence?.intent || '',
        tags: c.intelligence?.tags || c.intelligence?.behavioral?.behavioral_tags || [],
        timeline: c.timeline || [],
        orders: c.orders || [],
        wallet: c.wallet || { balance: 0, points: 0, currency: 'THB' },
        cart: c.cart || { items: [] },
    };
}

export default function CustomerList({ customers, onSelectCustomer, onGoToChat }) {
    // ─── Normalize all customers once ─────────────────────────
    const normalizedCustomers = useMemo(() => (customers || []).map(normalize), [customers]);

    // ─── State ────────────────────────────────────────────────
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'
    const [sortBy, setSortBy] = useState('revenue_desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Filters
    const [filterTier, setFilterTier] = useState(null);
    const [filterLifecycle, setFilterLifecycle] = useState(null);
    const [filterAgent, setFilterAgent] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // ─── Tier Config ──────────────────────────────────────────
    const tierConfig = {
        L1: { label: 'General', color: 'bg-slate-400/10 text-slate-400 border-slate-400/20', barColor: 'bg-slate-400', icon: 'fa-certificate' },
        L2: { label: 'Silver', color: 'bg-zinc-300/10 text-zinc-300 border-zinc-300/20', barColor: 'bg-zinc-300', icon: 'fa-medal' },
        L3: { label: 'Gold', color: 'bg-amber-400/10 text-amber-400 border-amber-400/20', barColor: 'bg-amber-400', icon: 'fa-crown' },
        L4: { label: 'Platinum', color: 'bg-cyan-400/10 text-cyan-400 border-cyan-400/20', barColor: 'bg-cyan-400', icon: 'fa-gem' },
        L5: { label: 'Elite', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20', barColor: 'bg-rose-500', icon: 'fa-fire' }
    };

    const getTierKey = (c) => {
        const totalSpend = c.totalSpend || c.intelligence?.metrics?.total_spend || 0;
        const learningHours = c.learningHours || c.intelligence?.metrics?.total_learning_hours || 0;
        const internshipFlag = c.internship || c.intelligence?.metrics?.internship_completed || false;

        // T14 Fix: Validate internship recency via inventory if available
        let internship = internshipFlag;
        if (internshipFlag) {
            const courses = c._raw?.inventory?.learning_courses || c.inventory?.learning_courses || [];
            const internshipCourse = courses.find(course =>
                (course.name || '').toLowerCase().match(/internship|ฝึกงาน/)
            );
            if (internshipCourse?.enrolled_at) {
                const daysSince = (Date.now() - new Date(internshipCourse.enrolled_at).getTime()) / (1000 * 60 * 60 * 24);
                internship = daysSince <= 730; // 2 years
            }
        }

        if (totalSpend >= 250000 && learningHours >= 100 && internship) return 'L5';
        if (totalSpend >= 125000 && learningHours >= 30) return 'L4';
        if (totalSpend >= 50000) return 'L3';
        if (totalSpend >= 15000) return 'L2';
        return 'L1';
    };

    const fmt = (val, decimals = 0) => (Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    // ─── Fetch Employee List for Agent Filter ─────────────────
    const [employeeAgents, setEmployeeAgents] = useState([]);
    useEffect(() => {
        fetch('/api/employees')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const names = data
                        .filter(e => e.status === 'Active')
                        .map(e => e.nickName || `${e.firstName} ${e.lastName}`.trim())
                        .filter(Boolean);
                    setEmployeeAgents(names);
                }
            })
            .catch(() => { });
    }, []);

    // ─── Computed Data ────────────────────────────────────────
    const { kpis, tierDistribution, uniqueAgents, uniqueStatuses } = useMemo(() => {
        let totalRevenue = 0, activeLeads = 0;
        const tiers = { L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 };
        const agents = new Set();
        const statuses = new Set();

        normalizedCustomers.forEach(c => {
            totalRevenue += c.totalSpend;
            if (c.lifecycleStage === 'Lead') activeLeads++;
            tiers[getTierKey(c)]++;
            if (c.agent && c.agent !== 'Unassigned') agents.add(c.agent);
            if (c.status) statuses.add(c.status);
        });

        // Merge employee names so the dropdown always has staff available
        employeeAgents.forEach(name => agents.add(name));

        return {
            kpis: {
                total: normalizedCustomers.length,
                activeLeads,
                totalRevenue,
                avgSpend: normalizedCustomers.length > 0 ? totalRevenue / normalizedCustomers.length : 0
            },
            tierDistribution: tiers,
            uniqueAgents: [...agents].sort(),
            uniqueStatuses: [...statuses].sort()
        };
    }, [normalizedCustomers, employeeAgents]);

    // ─── Filter + Sort + Search ───────────────────────────────
    const processedCustomers = useMemo(() => {
        let result = [...normalizedCustomers];

        // Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(c => {
                const text = `${c.firstName} ${c.lastName} ${c.nickName} ${c.memberId} ${c.id}`.toLowerCase();
                return text.includes(term);
            });
        }

        // Tier Filter
        if (filterTier) {
            result = result.filter(c => getTierKey(c) === filterTier);
        }

        // Lifecycle Filter
        if (filterLifecycle) {
            result = result.filter(c => c.lifecycleStage === filterLifecycle);
        }

        // Agent Filter
        if (filterAgent) {
            result = result.filter(c => c.agent === filterAgent);
        }

        // Status Filter
        if (filterStatus) {
            result = result.filter(c => c.status === filterStatus);
        }

        // Sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'revenue_desc':
                    return b.totalSpend - a.totalSpend;
                case 'revenue_asc':
                    return a.totalSpend - b.totalSpend;
                case 'score_desc':
                    return (b.aiScore || 0) - (a.aiScore || 0);
                case 'name_asc':
                    return (a.firstName || '').localeCompare(b.firstName || '');
                case 'hours_desc':
                    return b.learningHours - a.learningHours;
                case 'recent':
                    return new Date(b.timeline?.[0]?.date || 0) - new Date(a.timeline?.[0]?.date || 0);
                default:
                    return 0;
            }
        });

        return result;
    }, [normalizedCustomers, searchTerm, filterTier, filterLifecycle, filterAgent, filterStatus, sortBy]);

    // ─── Pagination ───────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(processedCustomers.length / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const pagedCustomers = processedCustomers.slice((safePage - 1) * pageSize, safePage * pageSize);

    const activeFilterCount = [filterTier, filterLifecycle, filterAgent, filterStatus].filter(Boolean).length;

    const clearAllFilters = () => {
        setFilterTier(null);
        setFilterLifecycle(null);
        setFilterAgent('');
        setFilterStatus('');
        setSearchTerm('');
        setCurrentPage(1);
    };

    // ─── Lifecycle options ────────────────────────────────────
    const lifecycleOptions = ['Lead', 'Prospect', 'Customer', 'VIP', 'Churned'];

    // ─── Render ───────────────────────────────────────────────
    return (
        <div className="animate-fade-in space-y-6">
            {/* ═══ KPI Dashboard ═══ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Customers', value: fmt(kpis.total), icon: 'fa-users', gradient: 'from-blue-600/20 to-blue-500/5', iconColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
                    { label: 'Active Leads', value: fmt(kpis.activeLeads), icon: 'fa-fire', gradient: 'from-orange-600/20 to-orange-500/5', iconColor: 'text-orange-400', borderColor: 'border-orange-500/20' },
                    { label: 'Total Revenue', value: `฿${fmt(kpis.totalRevenue)}`, icon: 'fa-coins', gradient: 'from-emerald-600/20 to-emerald-500/5', iconColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' },
                    { label: 'Avg. Spend', value: `฿${fmt(kpis.avgSpend)}`, icon: 'fa-chart-line', gradient: 'from-purple-600/20 to-purple-500/5', iconColor: 'text-purple-400', borderColor: 'border-purple-500/20' }
                ].map((kpi, i) => (
                    <div key={i} className={`bg-gradient-to-br ${kpi.gradient} border ${kpi.borderColor} rounded-2xl p-5 backdrop-blur-md group hover:scale-[1.02] transition-all duration-300`}>
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">{kpi.label}</p>
                                <p className="text-2xl font-black text-white tracking-tight">{kpi.value}</p>
                            </div>
                            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${kpi.iconColor} group-hover:scale-110 transition-transform`}>
                                <i className={`fas ${kpi.icon}`}></i>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ═══ Tier Distribution Bar ═══ */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Tier Distribution</p>
                    {filterTier && (
                        <button onClick={() => { setFilterTier(null); setCurrentPage(1); }} className="text-[9px] font-bold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1">
                            <i className="fas fa-times"></i> Clear Tier Filter
                        </button>
                    )}
                </div>
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                    {Object.entries(tierDistribution).map(([key, count]) => {
                        if (count === 0) return null;
                        const pct = (count / customers.length) * 100;
                        const tc = tierConfig[key];
                        return (
                            <div
                                key={key}
                                onClick={() => { setFilterTier(filterTier === key ? null : key); setCurrentPage(1); }}
                                className={`${tc.barColor} cursor-pointer hover:opacity-80 transition-all relative group/tier ${filterTier && filterTier !== key ? 'opacity-30' : ''}`}
                                style={{ width: `${pct}%`, minWidth: count > 0 ? '20px' : '0' }}
                                title={`${tc.label}: ${count} (${pct.toFixed(0)}%)`}
                            >
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] font-bold px-2 py-1 rounded-md opacity-0 group-hover/tier:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                    {tc.label}: {count}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="flex items-center gap-4 mt-2">
                    {Object.entries(tierDistribution).map(([key, count]) => (
                        <button
                            key={key}
                            onClick={() => { setFilterTier(filterTier === key ? null : key); setCurrentPage(1); }}
                            className={`flex items-center gap-1.5 text-[9px] font-bold transition-all ${filterTier === key ? 'text-white' : 'text-white/30 hover:text-white/60'}`}
                        >
                            <div className={`w-2 h-2 rounded-full ${tierConfig[key].barColor}`}></div>
                            {tierConfig[key].label} ({count})
                        </button>
                    ))}
                </div>
            </div>

            {/* ═══ Controls Bar: Search + Filters + Sort + View Toggle ═══ */}
            <div className="flex flex-col lg:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1 group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <i className="fas fa-search text-[#C9A34E] text-sm group-focus-within:scale-110 transition-transform"></i>
                    </div>
                    <input
                        type="text"
                        placeholder="Search name, nickname, or Member ID..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[#C9A34E]/50 focus:border-[#C9A34E] transition-all"
                    />
                </div>

                {/* Filters Row */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Lifecycle */}
                    <select
                        value={filterLifecycle || ''}
                        onChange={(e) => { setFilterLifecycle(e.target.value || null); setCurrentPage(1); }}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white/70 focus:outline-none focus:border-[#C9A34E]/50 transition-all appearance-none cursor-pointer min-w-[120px]"
                    >
                        <option value="">All Lifecycle</option>
                        {lifecycleOptions.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>

                    {/* Agent */}
                    <select
                        value={filterAgent}
                        onChange={(e) => { setFilterAgent(e.target.value); setCurrentPage(1); }}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white/70 focus:outline-none focus:border-[#C9A34E]/50 transition-all appearance-none cursor-pointer min-w-[120px]"
                    >
                        <option value="">All Agents</option>
                        {uniqueAgents.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>

                    {/* Status */}
                    <select
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white/70 focus:outline-none focus:border-[#C9A34E]/50 transition-all appearance-none cursor-pointer min-w-[120px]"
                    >
                        <option value="">All Statuses</option>
                        {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* Sort */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white/70 focus:outline-none focus:border-[#C9A34E]/50 transition-all appearance-none cursor-pointer min-w-[140px]"
                    >
                        <option value="revenue_desc">Revenue ↓</option>
                        <option value="revenue_asc">Revenue ↑</option>
                        <option value="score_desc">AI Score ↓</option>
                        <option value="recent">Recent Activity</option>
                        <option value="name_asc">Name A-Z</option>
                        <option value="hours_desc">Hours ↓</option>
                    </select>

                    {/* Clear Filters */}
                    {activeFilterCount > 0 && (
                        <button
                            onClick={clearAllFilters}
                            className="flex items-center gap-1.5 px-3 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all"
                        >
                            <i className="fas fa-filter-circle-xmark text-[10px]"></i>
                            Clear ({activeFilterCount})
                        </button>
                    )}

                    {/* View Toggle */}
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden ml-auto">
                        <button
                            onClick={() => setViewMode('table')}
                            className={`px-3.5 py-3 text-xs transition-all ${viewMode === 'table' ? 'bg-[#C9A34E] text-[#0A1A2F]' : 'text-white/40 hover:text-white/70'}`}
                        >
                            <i className="fas fa-table-list"></i>
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`px-3.5 py-3 text-xs transition-all ${viewMode === 'grid' ? 'bg-[#C9A34E] text-[#0A1A2F]' : 'text-white/40 hover:text-white/70'}`}
                        >
                            <i className="fas fa-grid-2"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ Results Info ═══ */}
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                    Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, processedCustomers.length)} of {processedCustomers.length} results
                    {processedCustomers.length !== customers.length && ` (filtered from ${customers.length})`}
                </p>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Per page:</span>
                    {[10, 25, 50].map(size => (
                        <button
                            key={size}
                            onClick={() => { setPageSize(size); setCurrentPage(1); }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${pageSize === size ? 'bg-[#C9A34E] text-[#0A1A2F]' : 'bg-white/5 text-white/30 hover:text-white/60'}`}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </div>

            {/* ═══ TABLE VIEW ═══ */}
            {viewMode === 'table' && (
                <div className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl backdrop-blur-md">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/5">
                                    <th className="px-6 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Student</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Tier</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Spend</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest">AI Score</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Agent</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest">Lifecycle</th>
                                    <th className="px-6 py-5 text-[10px] font-black text-white/40 uppercase tracking-widest text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {pagedCustomers.map((c) => {
                                    const tierKey = getTierKey(c);
                                    const tier = tierConfig[tierKey];
                                    return (
                                        <tr key={c.id} className="hover:bg-white/5 transition-all group cursor-pointer" onClick={() => onSelectCustomer(c._raw)}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-[#C9A34E]/10 flex items-center justify-center text-[#C9A34E] font-black text-sm shrink-0">
                                                        {(c.firstName || 'C')[0]}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-white group-hover:text-[#C9A34E] transition-colors truncate">{c.firstName} {c.lastName}</p>
                                                        <p className="text-[10px] font-bold text-white/30 truncate">{c.nickName || c.memberId || c.id}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${tier.color}`}>
                                                    <i className={`fas ${tier.icon} text-[8px]`}></i>
                                                    {tier.label}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-black text-white">฿{fmt(c.totalSpend)}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                {c.aiScore !== undefined ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${c.aiScore > 70 ? 'bg-green-500/20 text-green-400' : c.aiScore > 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-white/30'}`}>
                                                            {c.aiScore}
                                                        </div>
                                                        {c.aiIntent && (
                                                            <span className="text-[9px] font-bold text-white/30">{c.aiIntent}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-white/20">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-bold text-white/60">{c.agent}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-black text-white/40 uppercase tracking-widest group-hover:bg-[#C9A34E]/10 group-hover:text-[#C9A34E] group-hover:border-[#C9A34E]/20 transition-all">
                                                    {c.lifecycleStage}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onGoToChat && onGoToChat(c._raw); }}
                                                        className="w-8 h-8 rounded-lg bg-[#C9A34E]/10 text-[#C9A34E] flex items-center justify-center hover:bg-[#C9A34E] hover:text-[#0A1A2F] transition-all text-xs"
                                                        title="Chat"
                                                    >
                                                        <i className="fab fa-facebook-messenger"></i>
                                                    </button>
                                                    <button className="w-8 h-8 rounded-lg bg-white/5 text-white/30 flex items-center justify-center hover:bg-[#C9A34E] hover:text-[#0A1A2F] transition-all text-xs">
                                                        <i className="fas fa-chevron-right"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══ CARD GRID VIEW ═══ */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {pagedCustomers.map((c) => {
                        const tierKey = getTierKey(c);
                        const tier = tierConfig[tierKey];

                        return (
                            <div
                                key={c.id}
                                onClick={() => onSelectCustomer(c._raw)}
                                className="bg-white/5 border border-white/10 rounded-2xl p-5 cursor-pointer group hover:bg-white/[0.08] hover:border-[#C9A34E]/30 hover:shadow-xl hover:shadow-[#C9A34E]/5 transition-all duration-300"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Avatar */}
                                    <div className="w-14 h-14 rounded-2xl bg-[#C9A34E]/10 flex items-center justify-center text-[#C9A34E] font-black text-lg shrink-0 group-hover:scale-105 transition-transform">
                                        {(c.firstName || 'C')[0]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between">
                                            <div className="min-w-0">
                                                <p className="font-black text-white text-sm group-hover:text-[#C9A34E] transition-colors truncate">{c.firstName} {c.lastName}</p>
                                                <p className="text-[10px] font-bold text-white/30 truncate">{c.nickName || c.id}</p>
                                            </div>
                                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[8px] font-black uppercase ${tier.color} shrink-0`}>
                                                <i className={`fas ${tier.icon}`}></i>
                                                {tier.label}
                                            </div>
                                        </div>

                                        {/* Stats Row */}
                                        <div className="flex items-center gap-4 mt-3">
                                            <div>
                                                <p className="text-xs font-black text-white">฿{fmt(c.totalSpend)}</p>
                                                <p className="text-[8px] font-bold text-white/20 uppercase">Spend</p>
                                            </div>
                                            <div className="w-px h-6 bg-white/10"></div>
                                            <div>
                                                <p className="text-xs font-black text-white">{c.learningHours}h</p>
                                                <p className="text-[8px] font-bold text-white/20 uppercase">Hours</p>
                                            </div>
                                            {c.aiScore !== undefined && (
                                                <>
                                                    <div className="w-px h-6 bg-white/10"></div>
                                                    <div>
                                                        <p className={`text-xs font-black ${c.aiScore > 70 ? 'text-green-400' : c.aiScore > 40 ? 'text-amber-400' : 'text-white/30'}`}>{c.aiScore}%</p>
                                                        <p className="text-[8px] font-bold text-white/20 uppercase">AI Score</p>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Bottom Row */}
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${c.status === 'Won / Enrolled' ? 'bg-green-500' : 'bg-[#C9A34E] animate-pulse'}`}></div>
                                                <span className="text-[9px] font-bold text-white/40">{c.agent}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onGoToChat && onGoToChat(c._raw); }}
                                                    className="w-7 h-7 rounded-md bg-[#C9A34E]/10 text-[#C9A34E] flex items-center justify-center hover:bg-[#C9A34E] hover:text-[#0A1A2F] transition-all text-[10px]"
                                                >
                                                    <i className="fab fa-facebook-messenger"></i>
                                                </button>
                                                <button className="w-7 h-7 rounded-md bg-white/5 text-white/30 flex items-center justify-center hover:bg-[#C9A34E] hover:text-[#0A1A2F] transition-all text-[10px]">
                                                    <i className="fas fa-arrow-right"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══ Pagination ═══ */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <button
                        onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                        disabled={safePage <= 1}
                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/40 flex items-center justify-center hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs"
                    >
                        <i className="fas fa-chevron-left"></i>
                    </button>

                    {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                        let page;
                        if (totalPages <= 7) {
                            page = i + 1;
                        } else if (safePage <= 4) {
                            page = i + 1;
                        } else if (safePage >= totalPages - 3) {
                            page = totalPages - 6 + i;
                        } else {
                            page = safePage - 3 + i;
                        }
                        return (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-9 h-9 rounded-xl text-xs font-black flex items-center justify-center transition-all ${page === safePage
                                    ? 'bg-[#C9A34E] text-[#0A1A2F] shadow-lg shadow-[#C9A34E]/20'
                                    : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                                    }`}
                            >
                                {page}
                            </button>
                        );
                    })}

                    <button
                        onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                        disabled={safePage >= totalPages}
                        className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-white/40 flex items-center justify-center hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all text-xs"
                    >
                        <i className="fas fa-chevron-right"></i>
                    </button>
                </div>
            )}

            {/* Empty State */}
            {pagedCustomers.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                        <i className="fas fa-filter text-3xl text-white/10"></i>
                    </div>
                    <p className="text-white/30 text-sm font-bold mb-1">No customers match your filters</p>
                    <p className="text-white/15 text-xs mb-4">Try adjusting your search or filter criteria</p>
                    <button onClick={clearAllFilters} className="px-4 py-2 bg-[#C9A34E]/10 text-[#C9A34E] border border-[#C9A34E]/20 rounded-xl text-xs font-bold hover:bg-[#C9A34E]/20 transition-all">
                        <i className="fas fa-undo mr-2"></i>Clear All Filters
                    </button>
                </div>
            )}
        </div>
    );
}
