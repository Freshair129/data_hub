'use client';

import React, { useState, useEffect } from 'react';
import AIAnalytics from './AIAnalytics';

export default function FacebookAds() {
    const [campaigns, setCampaigns] = useState([]);
    const [adsets, setAdsets] = useState([]);
    const [daily, setDaily] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedCampaign, setExpandedCampaign] = useState(null);
    const [chartMetric, setChartMetric] = useState('spend');

    const fmt = (val, decimals = 0) => (Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            setError(null);
            try {
                const [campRes, adsetRes, dailyRes] = await Promise.all([
                    fetch('/api/marketing/campaigns'),
                    fetch('/api/marketing/adsets'),
                    fetch('/api/marketing/daily'),
                ]);
                const [campData, adsetData, dailyData] = await Promise.all([
                    campRes.json(), adsetRes.json(), dailyRes.json(),
                ]);

                if (campData.success) setCampaigns(campData.data || []);
                if (adsetData.success) setAdsets(adsetData.data || []);
                if (dailyData.success) setDaily(dailyData.data || []);

                if (!campData.success && !dailyData.success) {
                    setError(campData.error || dailyData.error || 'Failed to load data');
                }
            } catch (err) {
                console.error('FacebookAds fetch error:', err);
                setError('Failed to connect to API');
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    // Metric Helpers
    const getActionValue = (campaign, actionType) => {
        const action = campaign.action_values?.find(a => a.action_type === actionType);
        return action ? parseFloat(action.value) : 0;
    };

    const getActionCount = (campaign, actionType) => {
        const action = campaign.actions?.find(a => a.action_type === actionType);
        return action ? parseInt(action.value) : 0;
    };

    // KPI Totals
    const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0);
    const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalReach = campaigns.reduce((s, c) => s + c.reach, 0);

    // Advanced KPIs
    const totalPurchaseValue = campaigns.reduce((s, c) => s + getActionValue(c, 'purchase'), 0);
    const totalPurchases = campaigns.reduce((s, c) => s + getActionCount(c, 'purchase'), 0);
    const totalMessages = campaigns.reduce((s, c) => s + (getActionCount(c, 'onsite_conversion.messaging_conversation_started_7d') || getActionCount(c, 'onsite_conversion.messaging_first_reply')), 0);
    const totalResults = campaigns.reduce((s, c) => s + (c.actions ? c.actions.reduce((a, x) => a + parseInt(x.value), 0) : 0), 0);

    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const avgCPC = totalClicks > 0 ? (totalSpend / totalClicks) : 0;
    const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0;

    const avgROAS = totalSpend > 0 ? (totalPurchaseValue / totalSpend) : 0;
    const avgCPP = totalPurchases > 0 ? (totalSpend / totalPurchases) : 0;
    const avgCostPerMsg = totalMessages > 0 ? (totalSpend / totalMessages) : 0;
    const avgCPR = totalResults > 0 ? (totalSpend / totalResults) : 0;

    const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length;

    // Chart data
    const chartData = daily.map(d => d[chartMetric] || 0);
    const maxChart = Math.max(...chartData, 1);

    // Status badge
    const statusBadge = (status) => {
        const map = {
            'ACTIVE': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
            'PAUSED': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            'DELETED': 'bg-red-500/20 text-red-400 border-red-500/30',
            'ARCHIVED': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        };
        return map[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    };

    // Objective label
    const objectiveLabel = (obj) => {
        const map = {
            'OUTCOME_ENGAGEMENT': 'Engagement',
            'OUTCOME_AWARENESS': 'Awareness',
            'OUTCOME_TRAFFIC': 'Traffic',
            'OUTCOME_LEADS': 'Leads',
            'OUTCOME_SALES': 'Sales',
            'OUTCOME_APP_PROMOTION': 'App Promotion',
            'LINK_CLICKS': 'Link Clicks',
            'POST_ENGAGEMENT': 'Engagement',
            'REACH': 'Reach',
            'BRAND_AWARENESS': 'Awareness',
            'CONVERSIONS': 'Conversions',
            'MESSAGES': 'Messages',
            'VIDEO_VIEWS': 'Video Views',
            'LEAD_GENERATION': 'Lead Gen',
        };
        return map[obj] || obj?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || 'N/A';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="relative w-20 h-20 mx-auto mb-6">
                        <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
                        <i className="fab fa-facebook text-blue-500 text-2xl absolute inset-0 flex items-center justify-center"></i>
                    </div>
                    <p className="text-white/60 text-sm font-bold uppercase tracking-widest">Loading Facebook Ads Data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center bg-red-500/10 border border-red-500/30 rounded-3xl p-10 max-w-md">
                    <i className="fas fa-exclamation-triangle text-red-400 text-4xl mb-4"></i>
                    <h3 className="text-white font-black text-xl mb-2">Connection Error</h3>
                    <p className="text-white/60 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <i className="fab fa-facebook-f text-white text-2xl"></i>
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Facebook Ads</h1>
                        <p className="text-sm text-white/40 font-bold">
                            Last 30 Days Performance • {campaigns.length} Campaign{campaigns.length !== 1 ? 's' : ''} Tracked
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="px-5 py-2.5 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600/30 transition-all"
                >
                    <i className="fas fa-sync-alt mr-2"></i> Refresh
                </button>
            </div>

            {/* AI Analytics */}
            <AIAnalytics campaigns={campaigns} />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Spend', value: `฿${fmt(totalSpend, 2)}`, icon: 'fa-money-bill-wave', color: 'from-blue-600 to-blue-500', iconBg: 'bg-blue-500/20 text-blue-400' },
                    { label: 'ROAS', value: `${fmt(avgROAS, 2)}x`, icon: 'fa-chart-line', color: 'from-[#C9A34E] to-amber-500', iconBg: 'bg-[#C9A34E]/20 text-[#C9A34E]' },
                    { label: 'Purchases', value: fmt(totalPurchases), icon: 'fa-shopping-cart', color: 'from-emerald-600 to-emerald-500', iconBg: 'bg-emerald-500/20 text-emerald-400' },
                    { label: 'Cost / Purchase', value: `฿${fmt(avgCPP, 0)}`, icon: 'fa-tag', color: 'from-rose-600 to-rose-500', iconBg: 'bg-rose-500/20 text-rose-400' },
                ].map((kpi, i) => (
                    <div key={i} className="bg-[#0A1A2F]/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden group hover:border-white/20 transition-all">
                        <div className={`absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r ${kpi.color}`}></div>
                        <div className="flex items-start justify-between mb-3">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{kpi.label}</p>
                            <div className={`w-8 h-8 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                                <i className={`fas ${kpi.icon} text-xs`}></i>
                            </div>
                        </div>
                        <p className="text-2xl font-black text-white tracking-tight">{kpi.value}</p>
                    </div>
                ))}
                {[
                    { label: 'Cost / Message', value: `฿${fmt(avgCostPerMsg, 0)}`, icon: 'fa-comment-dollar', iconBg: 'bg-blue-500/20 text-blue-400', color: 'from-blue-600 to-cyan-500' },
                    { label: 'Cost / Result', value: `฿${fmt(avgCPR, 2)}`, icon: 'fa-poll', iconBg: 'bg-indigo-500/20 text-indigo-400', color: 'from-indigo-600 to-indigo-500' },
                    { label: 'CTR', value: `${fmt(avgCTR, 2)}%`, icon: 'fa-percentage', iconBg: 'bg-purple-500/20 text-purple-400', color: 'from-purple-600 to-purple-500' },
                    { label: 'Active Campaigns', value: activeCampaigns.toString(), icon: 'fa-bullhorn', iconBg: 'bg-slate-500/20 text-slate-400', color: 'from-slate-600 to-slate-500' },
                ].map((kpi, i) => (
                    <div key={i + 4} className="bg-[#0A1A2F]/60 border border-white/10 rounded-2xl p-5 relative overflow-hidden group hover:border-white/20 transition-all">
                        <div className={`absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r ${kpi.color}`}></div>
                        <div className="flex items-start justify-between mb-3">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{kpi.label}</p>
                            <div className={`w-8 h-8 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                                <i className={`fas ${kpi.icon} text-xs`}></i>
                            </div>
                        </div>
                        <p className="text-2xl font-black text-white tracking-tight">{kpi.value}</p>
                    </div>
                ))}
            </div>

            {/* Daily Trend Chart */}
            <div className="bg-[#0A1A2F]/60 border border-white/10 rounded-[2rem] p-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="font-black text-white text-xl tracking-tight">Daily Performance</h2>
                        <p className="text-xs text-white/40 font-bold mt-1">30-Day Trend</p>
                    </div>
                    <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                        {[
                            { key: 'spend', label: 'Spend' },
                            { key: 'impressions', label: 'Impr.' },
                            { key: 'clicks', label: 'Clicks' },
                            { key: 'reach', label: 'Reach' },
                        ].map(m => (
                            <button
                                key={m.key}
                                onClick={() => setChartMetric(m.key)}
                                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${chartMetric === m.key
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                                    : 'text-white/40 hover:text-white/60'
                                    }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {daily.length > 0 ? (
                    <div className="relative">
                        {/* Y-axis labels */}
                        <div className="absolute left-0 top-0 bottom-8 w-16 flex flex-col justify-between text-[9px] font-bold text-white/30">
                            <span>{chartMetric === 'spend' ? `฿${fmt(maxChart)}` : fmt(maxChart)}</span>
                            <span>{chartMetric === 'spend' ? `฿${fmt(maxChart / 2)}` : fmt(maxChart / 2)}</span>
                            <span>0</span>
                        </div>
                        {/* Bars */}
                        <div className="ml-16 flex items-end gap-1 h-52">
                            {daily.map((d, i) => {
                                const val = d[chartMetric] || 0;
                                const height = (val / maxChart) * 100;
                                const dateStr = new Date(d.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center group relative" style={{ minWidth: 0 }}>
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#162A47] text-white text-[9px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 border border-white/10 shadow-xl pointer-events-none">
                                            <p className="font-black">{chartMetric === 'spend' ? `฿${fmt(val, 2)}` : fmt(val)}</p>
                                            <p className="text-white/40">{dateStr}</p>
                                        </div>
                                        <div
                                            style={{ height: `${Math.max(height, 1)}%` }}
                                            className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-sm transition-all duration-300 group-hover:from-[#C9A34E] group-hover:to-amber-300 cursor-pointer"
                                        ></div>
                                    </div>
                                );
                            })}
                        </div>
                        {/* X-axis labels */}
                        <div className="ml-16 flex justify-between mt-3">
                            {daily.length > 0 && (
                                <>
                                    <span className="text-[8px] font-bold text-white/30">
                                        {new Date(daily[0].date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                    </span>
                                    {daily.length > 15 && (
                                        <span className="text-[8px] font-bold text-white/30">
                                            {new Date(daily[Math.floor(daily.length / 2)].date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                        </span>
                                    )}
                                    <span className="text-[8px] font-bold text-white/30">
                                        {new Date(daily[daily.length - 1].date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-52 text-white/20">
                        <div className="text-center">
                            <i className="fas fa-chart-bar text-4xl mb-3"></i>
                            <p className="text-xs font-bold uppercase tracking-widest">No daily data available</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Campaign Performance Table */}
            <div className="bg-[#0A1A2F]/60 border border-white/10 rounded-[2rem] overflow-hidden">
                <div className="p-8 pb-0">
                    <h2 className="font-black text-white text-xl tracking-tight mb-1">Campaign Performance</h2>
                    <p className="text-xs text-white/40 font-bold mb-6">Click a campaign row to see its ad sets</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white/5 text-[9px] font-black text-white/40 uppercase tracking-widest">
                                <th className="p-4 pl-8">Campaign</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Spend</th>
                                <th className="p-4 text-right">ROAS</th>
                                <th className="p-4 text-right">Results</th>
                                <th className="p-4 text-right">Cost/Result</th>
                                <th className="p-4 text-right">CTR</th>
                                <th className="p-4 text-right pr-8">CPC</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-bold text-white divide-y divide-white/5">
                            {campaigns.map((c, i) => {
                                const campAdsets = adsets.filter(a => a.campaign_id === c.id);
                                const isExpanded = expandedCampaign === c.id;

                                const purchaseValue = getActionValue(c, 'purchase');
                                const purchaseCount = getActionCount(c, 'purchase');
                                const roas = c.spend > 0 ? (purchaseValue / c.spend) : 0;
                                const costPerResult = c.actions?.length > 0 ? (c.spend / c.actions.reduce((sum, a) => sum + parseInt(a.value), 0)) : 0;

                                return (
                                    <React.Fragment key={c.id || i}>
                                        <tr
                                            onClick={() => setExpandedCampaign(isExpanded ? null : c.id)}
                                            className={`cursor-pointer transition-all ${isExpanded ? 'bg-blue-600/10' : 'hover:bg-white/5'}`}
                                        >
                                            <td className="p-4 pl-8">
                                                <div className="flex items-center gap-3">
                                                    <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-[8px] text-white/30 w-3 transition-transform`}></i>
                                                    <div className="min-w-0">
                                                        <p className="font-black text-white truncate max-w-[200px]">{c.name}</p>
                                                        <p className="text-[9px] text-white/30 mt-0.5">
                                                            {objectiveLabel(c.objective)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${statusBadge(c.status)}`}>
                                                    {c.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right text-white/80">฿{fmt(c.spend, 2)}</td>
                                            <td className="p-4 text-right">
                                                <span className={roas >= 4 ? 'text-[#C9A34E]' : roas >= 2 ? 'text-emerald-400' : 'text-white/30'}>
                                                    {fmt(roas, 2)}x
                                                </span>
                                            </td>
                                            <td className="p-4 text-right text-white/60">
                                                {c.actions?.length > 0 ? c.actions.reduce((sum, a) => sum + parseInt(a.value), 0).toLocaleString() : '-'}
                                                {purchaseCount > 0 && <span className="block text-[8px] text-emerald-400">{purchaseCount} purchases</span>}
                                            </td>
                                            <td className="p-4 text-right text-white/60">
                                                {costPerResult > 0 ? `฿${fmt(costPerResult, 2)}` : '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className={c.ctr > 1 ? 'text-emerald-400' : c.ctr > 0 ? 'text-amber-400' : 'text-white/30'}>
                                                    {fmt(c.ctr, 2)}%
                                                </span>
                                            </td>
                                            <td className="p-4 text-right pr-8 text-white/80">฿{fmt(c.cpc, 2)}</td>
                                        </tr>

                                        {/* Expanded Ad Sets */}
                                        {isExpanded && campAdsets.length > 0 && campAdsets.map((adset, j) => {
                                            const asPurchaseValue = getActionValue(adset, 'purchase');
                                            const asRoas = adset.spend > 0 ? (asPurchaseValue / adset.spend) : 0;

                                            return (
                                                <tr key={adset.id || j} className="bg-blue-600/5 border-l-2 border-blue-500/50">
                                                    <td className="p-3 pl-16">
                                                        <div className="flex items-center gap-2">
                                                            <i className="fas fa-layer-group text-[8px] text-blue-400/60"></i>
                                                            <p className="text-[11px] text-white/70 truncate max-w-[180px]">{adset.name}</p>
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${statusBadge(adset.status)}`}>
                                                            {adset.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right text-white/50 text-[11px]">฿{fmt(adset.spend, 2)}</td>
                                                    <td className="p-3 text-right text-[11px]">
                                                        <span className={asRoas >= 4 ? 'text-[#C9A34E]' : asRoas >= 2 ? 'text-emerald-400/70' : 'text-white/30'}>
                                                            {fmt(asRoas, 2)}x
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right text-white/40 text-[11px]">
                                                        {adset.actions?.reduce((sum, a) => sum + parseInt(a.value), 0) || 0}
                                                    </td>
                                                    <td className="p-3 text-right text-white/40 text-[11px]">
                                                        {adset.actions?.length > 0 ? `฿${fmt(adset.spend / adset.actions.reduce((sum, a) => sum + parseInt(a.value), 0), 2)}` : '-'}
                                                    </td>
                                                    <td className="p-3 text-right text-[11px]">
                                                        <span className={adset.ctr > 1 ? 'text-emerald-400/70' : 'text-white/30'}>
                                                            {fmt(adset.ctr, 2)}%
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right pr-8 text-white/50 text-[11px]">฿{fmt(adset.cpc, 2)}</td>
                                                </tr>
                                            )
                                        })}
                                        {isExpanded && campAdsets.length === 0 && (
                                            <tr className="bg-blue-600/5">
                                                <td colSpan={9} className="p-4 pl-16 text-center text-white/20 text-[10px] font-bold uppercase tracking-widest">
                                                    No ad sets found for this campaign
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {campaigns.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-12 text-center text-white/20">
                                        <i className="fas fa-bullhorn text-4xl mb-3 block"></i>
                                        <p className="text-xs font-bold uppercase tracking-widest">No campaigns found</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Actions Summary */}
            {campaigns.some(c => c.actions?.length > 0) && (
                <div className="bg-[#0A1A2F]/60 border border-white/10 rounded-[2rem] p-8">
                    <h2 className="font-black text-white text-xl tracking-tight mb-6">Campaign Actions / Results</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {campaigns.filter(c => c.actions?.length > 0).map((c, i) => (
                            <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:bg-white/10 transition-colors">
                                <p className="text-xs font-black text-white truncate mb-3">{c.name}</p>
                                <div className="space-y-2">
                                    {c.actions.slice(0, 5).map((action, j) => (
                                        <div key={j} className="flex justify-between items-center">
                                            <span className="text-[10px] text-white/50 font-bold capitalize">
                                                {action.action_type?.replace(/_/g, ' ') || 'Action'}
                                            </span>
                                            <span className="text-xs font-black text-[#C9A34E]">{fmt(action.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="text-center py-4">
                <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
                    Data sourced from Facebook Marketing API • Ad Account: {campaigns.length > 0 ? 'Connected' : 'Pending'}
                </p>
            </div>
        </div>
    );
}
