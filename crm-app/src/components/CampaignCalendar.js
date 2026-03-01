import React, { useState, useEffect, useMemo } from 'react';

export default function CampaignCalendar() {
    const [viewDate, setViewDate] = useState(new Date());
    const [ads, setAds] = useState([]);
    const [loading, setLoading] = useState(true);

    // Navigation
    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));

    // Today in Thai timezone (YYYY-MM-DD)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

    // Calculate Boundaries
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const { sinceDate, untilDate } = useMemo(() => {
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0);
        const formatD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return { sinceDate: formatD(start), untilDate: formatD(end) };
    }, [year, month]);

    // Fetch ad daily metrics for the viewed month
    useEffect(() => {
        let isMounted = true;
        async function fetchData() {
            setLoading(true);
            try {
                const res = await fetch(`/api/marketing/ad-calendar?since=${sinceDate}&until=${untilDate}`);
                const data = await res.json();
                if (!isMounted) return;
                setAds(data.success ? (data.data || []) : []);
            } catch (err) {
                console.error('[CampaignCalendar] Fetch error:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        fetchData();
        return () => { isMounted = false; };
    }, [sinceDate, untilDate]);

    // Calendar Grid Calculation
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
    const startOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Mon=0

    const calendarCells = useMemo(() => {
        const cells = [];
        for (let i = 0; i < startOffset; i++) cells.push({ day: null });
        for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i });
        return cells;
    }, [startOffset, daysInMonth]);

    // Build ad segments: determine first and last delivery day for each ad
    // If ad is ACTIVE and has spend on the most recent recorded date, extend to today (live detection)
    const processedAds = useMemo(() => {
        return ads.map(ad => {
            const spendDays = (ad.days || [])
                .filter(d => d.spend > 0)
                .map(d => d.date)
                .sort();

            if (spendDays.length === 0) return null;

            const firstDay = spendDays[0]; // e.g. "2026-02-05"
            let lastDay = spendDays[spendDays.length - 1]; // e.g. "2026-02-26"

            // Live Detection: if ad is ACTIVE and last spend day is within the last 3 days (allow for sync delays)
            const todayTime = new Date(todayStr).getTime();
            const lastDayTime = new Date(lastDay).getTime();
            const daysSinceLastSpend = (todayTime - lastDayTime) / 86400000;
            const isDelivering = ad.status === 'ACTIVE' && daysSinceLastSpend <= 3;

            if (isDelivering) {
                lastDay = todayStr;
            }

            // Convert to day-of-month numbers for this month
            const firstDayNum = (() => {
                const d = new Date(firstDay);
                if (d.getFullYear() === year && d.getMonth() === month) return d.getDate();
                return 1; // started before this month
            })();

            const lastDayNum = (() => {
                const d = new Date(lastDay);
                if (d.getFullYear() === year && d.getMonth() === month) return d.getDate();
                return daysInMonth; // extends beyond this month
            })();

            // Build set of active days from firstDayNum to lastDayNum (continuous bar)
            const activeDays = new Set();
            for (let d = firstDayNum; d <= lastDayNum; d++) {
                activeDays.add(d);
            }

            return {
                ...ad,
                firstDayNum,
                lastDayNum,
                activeDays,
                isDelivering,
                daysActive: spendDays.length,
            };
        }).filter(Boolean);
    }, [ads, todayStr, year, month, daysInMonth]);

    // Row assignment for the calendar (avoid overlapping bars)
    const adSegmentsMap = useMemo(() => {
        const map = new Map();
        const rows = [];

        processedAds.forEach(ad => {
            let assignedRow = -1;
            for (let r = 0; r < 20; r++) {
                if (!rows[r]) rows[r] = new Set();
                let overlap = false;
                for (let d = ad.firstDayNum; d <= ad.lastDayNum; d++) {
                    if (rows[r].has(d)) { overlap = true; break; }
                }
                if (!overlap) {
                    assignedRow = r;
                    for (let d = ad.firstDayNum; d <= ad.lastDayNum; d++) {
                        rows[r].add(d);
                    }
                    break;
                }
            }
            map.set(ad.ad_id, { activeDays: ad.activeDays, assignedRow });
        });
        return map;
    }, [processedAds]);

    // Stats
    const summarySpend = processedAds.reduce((s, a) => s + (a.totalSpend || 0), 0);
    const summaryImpressions = processedAds.reduce((s, a) => s + (a.totalImpressions || 0), 0);
    const deliveringCount = processedAds.filter(a => a.isDelivering).length;

    const isToday = (day) => {
        const today = new Date();
        return day && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    };

    const fmt = (num) => Number(num).toLocaleString('th-TH', { maximumFractionDigits: 0 });
    const fmtDec = (num) => Number(num).toLocaleString('th-TH', { maximumFractionDigits: 2 });
    const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    const COLORS = [
        'bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
        'bg-blue-500', 'bg-purple-500', 'bg-cyan-500', 'bg-orange-500',
        'bg-teal-500', 'bg-pink-500', 'bg-lime-500', 'bg-violet-500'
    ];

    const DELIVERING_PULSE = 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-white';

    return (
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8 animate-fade-in relative z-10 w-full overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Campaign Calendar</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Individual Ad Delivery • Source: ad_daily_metrics
                    </p>
                </div>
                <div className="flex items-center gap-4 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <button onClick={prevMonth} disabled={loading} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 transition-all font-black disabled:opacity-50">
                        <i className="fas fa-chevron-left text-sm"></i>
                    </button>
                    <div className="w-40 text-center text-lg font-black text-slate-700">{monthName}</div>
                    <button onClick={nextMonth} disabled={loading} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 transition-all font-black disabled:opacity-50">
                        <i className="fas fa-chevron-right text-sm"></i>
                    </button>
                </div>
            </div>

            {/* KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {/* Delivering Now */}
                <div className="bg-gradient-to-br from-emerald-50 to-slate-50 p-5 rounded-[1.5rem] border border-emerald-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-satellite-dish text-5xl"></i></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Delivering Now</p>
                    <div className="flex items-end gap-2">
                        <p className="text-3xl font-black text-emerald-600">{loading ? '...' : deliveringCount}</p>
                        {!loading && deliveringCount > 0 && (
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mb-2"></div>
                        )}
                    </div>
                    <span className="text-[9px] text-emerald-600/50 font-bold">ACTIVE + Spend ≤ Yesterday</span>
                </div>

                {/* Total Ads */}
                <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-5 rounded-[1.5rem] border border-indigo-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-bullhorn text-5xl"></i></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Ads with Spend</p>
                    <p className="text-3xl font-black text-slate-800">{loading ? '...' : processedAds.length}</p>
                    <span className="text-[9px] text-slate-400 font-bold">Unique ads in {viewDate.toLocaleString('default', { month: 'short' })}</span>
                </div>

                {/* Total Impressions */}
                <div className="bg-gradient-to-br from-amber-50 to-slate-50 p-5 rounded-[1.5rem] border border-amber-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-eye text-5xl"></i></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">Impressions</p>
                    <p className="text-3xl font-black text-slate-800">{loading ? '...' : fmt(summaryImpressions)}</p>
                    <span className="text-[9px] text-slate-400 font-bold">Total views this month</span>
                </div>

                {/* Total Spend */}
                <div className="bg-gradient-to-br from-rose-50 to-slate-50 p-5 rounded-[1.5rem] border border-rose-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-fire text-5xl"></i></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1">Actual Spend</p>
                    <p className="text-3xl font-black text-slate-800">฿{loading ? '...' : fmt(summarySpend)}</p>
                    <span className="text-[9px] text-slate-400 font-bold">Facebook billing data</span>
                </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mb-4 px-1">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-emerald-500 rounded-sm ring-2 ring-emerald-400 ring-offset-1 ring-offset-white"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Delivering</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-3 bg-indigo-500 rounded-sm"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Completed / Paused</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-3 bg-indigo-500/30 rounded-sm border border-dashed border-indigo-400"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No Spend Day (gap)</span>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50 relative min-h-[400px]">
                {loading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {/* Day Headers */}
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/50">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                        <div key={d} className="p-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">{d}</div>
                    ))}
                </div>

                {/* Calendar Body */}
                <div className="grid grid-cols-7 bg-white">
                    {calendarCells.map((cell, idx) => {
                        const slots = Array(20).fill(null);
                        let hiddenCount = 0;

                        if (cell.day) {
                            processedAds.forEach(ad => {
                                const info = adSegmentsMap.get(ad.ad_id);
                                if (info?.activeDays.has(cell.day)) {
                                    if (info.assignedRow !== -1 && info.assignedRow < 20) {
                                        slots[info.assignedRow] = ad;
                                    } else {
                                        hiddenCount++;
                                    }
                                }
                            });
                        }

                        // Count how many slots are actually used
                        const maxUsedSlot = slots.reduce((max, s, i) => s ? i : max, -1);

                        return (
                            <div key={idx} className={`min-h-[100px] border-b border-r border-slate-100 py-1.5 flex flex-col relative overflow-hidden ${cell.day ? 'bg-white' : 'bg-slate-50/50'}`}>
                                {cell.day && (
                                    <>
                                        <div className="w-full flex justify-center mb-0.5">
                                            <div className={`text-[10px] font-black inline-flex justify-center items-center w-6 h-6 rounded-full ${isToday(cell.day) ? 'bg-indigo-600 text-white shadow-md shadow-indigo-300' : 'text-slate-400'}`}>
                                                {cell.day}
                                            </div>
                                        </div>

                                        <div className="flex-1 flex flex-col pt-0.5" style={{ gap: '1px' }}>
                                            {slots.slice(0, Math.max(maxUsedSlot + 1, 0)).map((ad, sIdx) => {
                                                if (!ad) {
                                                    return <div key={`empty-${sIdx}`} className="h-[16px]"></div>;
                                                }

                                                const info = adSegmentsMap.get(ad.ad_id);
                                                const isStart = !info?.activeDays.has(cell.day - 1);
                                                const isEnd = !info?.activeDays.has(cell.day + 1);

                                                const hash = (ad.ad_id || ad.name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
                                                const colorClass = ad.isDelivering ? 'bg-emerald-500' : COLORS[hash % COLORS.length];

                                                let roundClass = '';
                                                if (isStart && isEnd) roundClass = 'mx-0.5 rounded-md';
                                                else if (isStart) roundClass = 'ml-0.5 rounded-l-md';
                                                else if (isEnd) roundClass = 'mr-0.5 rounded-r-md';

                                                const ringClass = ad.isDelivering ? DELIVERING_PULSE : '';

                                                return (
                                                    <div
                                                        key={ad.ad_id}
                                                        title={`${ad.name}\nStatus: ${ad.status}${ad.isDelivering ? ' (DELIVERING)' : ''}\nSpend: ฿${fmtDec(ad.totalSpend)}\nImpressions: ${fmt(ad.totalImpressions)}\nClicks: ${fmt(ad.totalClicks)}\nActive ${ad.daysActive} day(s)`}
                                                        className={`h-[16px] relative flex items-center px-1 text-[8px] font-bold text-white shadow-sm cursor-help transition-all hover:brightness-110 ${colorClass} ${roundClass} ${ringClass}`}
                                                        style={{ zIndex: 10 - sIdx }}
                                                    >
                                                        {isStart && (
                                                            <span className="truncate w-full drop-shadow-sm leading-none">
                                                                {ad.name}
                                                            </span>
                                                        )}
                                                        {isEnd && !isStart && (
                                                            <span className="text-[7px] text-white/70 ml-auto whitespace-nowrap">
                                                                ฿{fmt(ad.totalSpend)}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {hiddenCount > 0 && (
                                                <div className="text-[8px] font-black text-slate-400 w-full text-right pr-1 mt-0.5">
                                                    +{hiddenCount} more
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Ad Summary Table */}
            {!loading && processedAds.length > 0 && (
                <div className="mt-8 border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                            <i className="fas fa-list-ul mr-2 text-indigo-400"></i>
                            Ad Delivery Summary • {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h4>
                    </div>
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/80 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="p-3 pl-6"></th>
                                <th className="p-3">Ad Name</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3 text-center">Days Active</th>
                                <th className="p-3 text-right">Spend</th>
                                <th className="p-3 text-right">Impressions</th>
                                <th className="p-3 text-right pr-6">Clicks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                            {processedAds.map((ad, i) => {
                                const hash = (ad.ad_id || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
                                const dotColor = ad.isDelivering ? 'bg-emerald-500 animate-pulse' : COLORS[hash % COLORS.length].replace('bg-', 'bg-');
                                return (
                                    <tr key={ad.ad_id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 pl-6">
                                            <div className={`w-3 h-3 rounded-full ${dotColor}`}></div>
                                        </td>
                                        <td className="p-3 max-w-[250px]">
                                            <p className="truncate font-black text-slate-800">{ad.name}</p>
                                            <p className="text-[9px] text-slate-400 font-bold">
                                                {ad.firstDayNum}–{ad.lastDayNum} {viewDate.toLocaleString('default', { month: 'short' })}
                                            </p>
                                        </td>
                                        <td className="p-3 text-center">
                                            {ad.isDelivering ? (
                                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                                    Delivering
                                                </span>
                                            ) : (
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${ad.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                                                    {ad.status}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center text-slate-500">{ad.daysActive}d</td>
                                        <td className="p-3 text-right font-black text-slate-800">฿{fmtDec(ad.totalSpend)}</td>
                                        <td className="p-3 text-right text-slate-600">{fmt(ad.totalImpressions)}</td>
                                        <td className="p-3 text-right pr-6 text-slate-500">{fmt(ad.totalClicks)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                            <tr className="text-xs font-black">
                                <td className="p-3 pl-6"></td>
                                <td className="p-3 text-slate-800 uppercase tracking-widest">Total</td>
                                <td className="p-3"></td>
                                <td className="p-3"></td>
                                <td className="p-3 text-right text-slate-800">฿{fmtDec(summarySpend)}</td>
                                <td className="p-3 text-right text-slate-600">{fmt(summaryImpressions)}</td>
                                <td className="p-3 text-right pr-6 text-slate-500">{fmt(processedAds.reduce((s, a) => s + (a.totalClicks || 0), 0))}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}
