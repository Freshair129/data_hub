'use client';

import { useState, useEffect } from 'react';

export default function AdminPerformance() {
    const [performanceData, setPerformanceData] = useState([]);
    const [summary, setSummary] = useState({
        totalMessages: 0,
        totalConversations: 0,
        avgResponseTimeMinutes: 0
    });
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('weekly'); // today, weekly, monthly, lifetime
    const [sortBy, setSortBy] = useState('speed'); // speed or volume

    useEffect(() => {
        fetchPerformance();
    }, [timeframe]);

    const fetchPerformance = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/analytics/admin-performance?timeframe=${timeframe}`);
            const result = await res.json();
            if (result.success) {
                setPerformanceData(result.data);
                setSummary(result.summary);
            }
        } catch (err) {
            console.error('Failed to fetch admin performance:', err);
        } finally {
            setLoading(false);
        }
    };

    // Sort the data
    const sortedData = [...performanceData].sort((a, b) => {
        if (sortBy === 'speed') {
            // Lower response time is better, but put 0 records at the bottom
            const aRt = a.stats.avgResponseTimeMinutes > 0 ? a.stats.avgResponseTimeMinutes : Infinity;
            const bRt = b.stats.avgResponseTimeMinutes > 0 ? b.stats.avgResponseTimeMinutes : Infinity;
            return aRt - bRt;
        } else {
            return b.stats.messages - a.stats.messages;
        }
    });

    return (
        <div className="animate-fade-in space-y-8 pb-10">
            {/* Header & Filter */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-black text-[#F8F8F6] tracking-tight mb-2 uppercase">Chat Performance</h2>
                    <p className="text-[#C9A34E] text-xs font-black uppercase tracking-[0.2em]">ADMIN RESPONSIVENESS & VOLUME</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 mr-4">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Sort:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-[#0A1A2F]/80 p-2 rounded-xl border border-white/10 text-[10px] font-black uppercase text-white tracking-widest outline-none cursor-pointer"
                        >
                            <option value="speed">Fastest Response</option>
                            <option value="volume">Highest Volume</option>
                        </select>
                    </div>

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
                        onClick={fetchPerformance}
                        className="p-3 bg-white/5 border border-white/10 rounded-2xl text-[#C9A34E] hover:bg-white/10 transition-all"
                    >
                        <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
                    </button>
                </div>
            </div>

            {/* Global Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0A1A2F]/50 border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-emerald-400"><i className="fas fa-stopwatch text-6xl"></i></div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Team Avg. Response</p>
                    <p className="text-4xl font-black text-emerald-400">{summary.avgResponseTimeMinutes.toFixed(1)} <span className="text-lg">min</span></p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-emerald-400">
                        <i className="fas fa-check-circle"></i>
                        <span>First-reply speed</span>
                    </div>
                </div>
                <div className="bg-[#0A1A2F]/50 border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-white"><i className="fas fa-comment-dots text-6xl"></i></div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total System Messages</p>
                    <p className="text-4xl font-black text-white">{(summary.totalMessages || 0).toLocaleString()}</p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-white/20">
                        <span>Outbound only</span>
                    </div>
                </div>
                <div className="bg-[#0A1A2F]/50 border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-white"><i className="fas fa-users-cog text-6xl"></i></div>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Unique Convs Handled</p>
                    <p className="text-4xl font-black text-[#C9A34E]">{(summary.totalConversations || 0).toLocaleString()}</p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-white/20">
                        <span>Across all active channels</span>
                    </div>
                </div>
            </div>

            {/* Individual Admin Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {loading ? (
                    <div className="col-span-1 lg:col-span-2 py-20 flex justify-center items-center">
                        <div className="text-[#C9A34E] text-2xl animate-pulse"><i className="fas fa-spinner fa-spin"></i> Loading Data...</div>
                    </div>
                ) : sortedData.length === 0 ? (
                    <div className="col-span-1 lg:col-span-2 py-20 flex justify-center items-center bg-white/5 border border-dashed border-white/10 rounded-[2.5rem]">
                        <div className="text-white/30 text-sm font-black uppercase tracking-widest text-center">
                            <i className="fas fa-inbox text-4xl mb-4 block"></i>
                            No admin activity found for this period.
                        </div>
                    </div>
                ) : (
                    sortedData.map((admin, index) => {
                        // Max value for progress bars
                        const maxMessages = Math.max(...sortedData.map(a => a.stats.messages), 1);
                        const msgPercent = (admin.stats.messages / maxMessages) * 100;

                        let rtColor = "text-emerald-400";
                        if (admin.stats.avgResponseTimeMinutes > 15) rtColor = "text-amber-400";
                        if (admin.stats.avgResponseTimeMinutes > 60) rtColor = "text-rose-400";

                        const isTopPerformer = index === 0;

                        return (
                            <div key={admin.id} className="bg-gradient-to-br from-[#0A1A2F] to-[#112240] border border-white/10 rounded-[2rem] p-6 hover:border-white/20 transition-all group relative overflow-hidden">
                                {isTopPerformer && (
                                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#C9A34E]/10 rounded-full blur-2xl"></div>
                                )}

                                <div className="flex items-center justify-between mb-6 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            {admin.profilePicture ? (
                                                <img src={admin.profilePicture} alt={admin.name} className="w-14 h-14 rounded-2xl object-cover border border-white/10" />
                                            ) : (
                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#C9A34E] to-amber-600 flex items-center justify-center border border-white/10">
                                                    <span className="text-white font-black text-xl">{admin.name.charAt(0)}</span>
                                                </div>
                                            )}
                                            {isTopPerformer && (
                                                <div className="absolute -bottom-2 -right-2 bg-[#C9A34E] text-[#0A1A2F] text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shadow-lg">
                                                    MVP
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white tracking-tight">{admin.fullName}</h3>
                                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{admin.role}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-2 justify-end mb-1">
                                            <i className="fas fa-clock text-white/30 text-xs"></i>
                                            <span className={`text-xl font-black ${rtColor}`}>{admin.stats.avgResponseTimeMinutes > 0 ? admin.stats.avgResponseTimeMinutes.toFixed(1) : 'N/A'} <span className="text-xs">min</span></span>
                                        </div>
                                        <p className="text-[8px] text-white/30 uppercase font-black tracking-widest">Avg Response Time</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                        <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mb-1">Messages Sent</p>
                                        <p className="text-xl font-black text-white">{admin.stats.messages.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                        <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mb-1">Chats Handled</p>
                                        <p className="text-xl font-black text-[#C9A34E]">{admin.stats.conversationsHandled.toLocaleString()}</p>
                                    </div>
                                </div>

                                {/* Volume Progress Bar */}
                                <div className="space-y-1 relative z-10">
                                    <div className="flex justify-between text-[9px] font-black uppercase text-white/40 tracking-widest">
                                        <span>Volume Distribution</span>
                                        <span>{msgPercent.toFixed(0)}% of Max</span>
                                    </div>
                                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-600 to-indigo-400 rounded-full"
                                            style={{ width: `${msgPercent}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
