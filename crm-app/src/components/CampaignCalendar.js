import React, { useState, useEffect, useMemo } from 'react';

export default function CampaignCalendar() {
    const [viewDate, setViewDate] = useState(new Date());
    const [ads, setAds] = useState([]);
    const [loading, setLoading] = useState(true);

    // Navigation
    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));

    // Calculate Boundaries
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const { startOfMonth, endOfMonth, sinceDate, untilDate } = useMemo(() => {
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0);

        const formatDateObj = (date) => {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        return {
            startOfMonth: start,
            endOfMonth: end,
            sinceDate: formatDateObj(start),
            untilDate: formatDateObj(end)
        };
    }, [year, month]);


    useEffect(() => {
        let isMounted = true;
        async function fetchMonthData() {
            setLoading(true);
            try {
                // Fetch all ads for this month (ACTIVE and PAUSED) because they might have already delivered and spent budget
                const res = await fetch(`/api/marketing/ads?since=${sinceDate}&until=${untilDate}&status=ACTIVE,PAUSED`);
                const data = await res.json();
                if (!isMounted) return;

                if (data.success && data.data) {
                    // Pre-filter ads that actually ran in this month AND spent money
                    const overlapping = data.data.filter(c => {
                        // Crucial: Only show ads that actually delivered and spent budget
                        if (!c.spend || c.spend <= 0) return false;

                        if (!c.start_time) return false;
                        const start = new Date(c.start_time);
                        const end = c.stop_time ? new Date(c.stop_time) : new Date();
                        return start <= endOfMonth && end >= startOfMonth;
                    });

                    // Sort by spend descending to show top spenders first
                    overlapping.sort((a, b) => (b.spend || 0) - (a.spend || 0));
                    setAds(overlapping);
                } else {
                    setAds([]);
                }
            } catch (err) {
                console.error("Failed to fetch calendar data", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchMonthData();
        return () => { isMounted = false; };
    }, [sinceDate, untilDate, endOfMonth, startOfMonth]);

    // Calendar Grid Calculation
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = getDaysInMonth(year, month);

    // We want Monday = 0, Sunday = 6 for a standard business calendar
    const startOffset = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const calendarCells = [];
    // Empty cells before start of month
    for (let i = 0; i < startOffset; i++) {
        calendarCells.push({ day: null });
    }
    // Actual days
    for (let i = 1; i <= daysInMonth; i++) {
        calendarCells.push({ day: i });
    }

    // Stats
    const summarySpend = ads.reduce((sum, c) => sum + (c.spend || 0), 0);
    const summaryImpressions = ads.reduce((sum, c) => sum + (c.impressions || 0), 0);

    // Check if it's today
    const isToday = (day) => {
        const today = new Date();
        return day && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    };

    // Helper: Formats currency
    const fmt = (num) => Number(num).toLocaleString('th-TH', { maximumFractionDigits: 0 });

    const monthName = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Pre-calculate segments and assign rows for each campaign
    const adSegmentsMap = useMemo(() => {
        const map = new Map();
        const rows = []; // Track occupied days per row id

        ads.forEach((c) => {
            const start = new Date(c.start_time);
            const end = c.stop_time ? new Date(c.stop_time) : new Date();

            // Map the day indices where this campaign is active
            const activeDays = new Set();
            let firstDay = null;
            let lastDay = null;

            for (let d = 1; d <= daysInMonth; d++) {
                const currentDate = new Date(year, month, d);
                currentDate.setHours(0, 0, 0, 0);
                start.setHours(0, 0, 0, 0);

                let checkEnd = new Date(end);
                checkEnd.setHours(23, 59, 59, 999);

                if (currentDate >= start && currentDate <= checkEnd) {
                    activeDays.add(d);
                    if (firstDay === null) firstDay = d;
                    lastDay = d;
                }
            }
            if (activeDays.size === 0) return;

            // Find an available row (max 15 rows)
            let assignedRow = -1;
            for (let r = 0; r < 15; r++) {
                if (!rows[r]) Object.assign(rows, { [r]: new Set() });

                let overlap = false;
                for (let d = firstDay; d <= lastDay; d++) {
                    if (rows[r].has(d)) {
                        overlap = true;
                        break;
                    }
                }
                if (!overlap) {
                    assignedRow = r;
                    for (let d = firstDay; d <= lastDay; d++) {
                        rows[r].add(d);
                    }
                    break;
                }
            }

            map.set(c.id, { activeDays, assignedRow });
        });
        return map;
    }, [ads, year, month, daysInMonth]);

    const COLORS = [
        'bg-indigo-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400',
        'bg-blue-400', 'bg-purple-400', 'bg-cyan-400', 'bg-orange-400'
    ];

    return (
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8 animate-fade-in relative z-10 w-full overflow-hidden">
            {/* Header / Nav */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Campaign Calendar</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Monthly Activity & Exact Spend
                    </p>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    <button onClick={prevMonth} disabled={loading} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 transition-all font-black disabled:opacity-50">
                        <i className="fas fa-chevron-left text-sm"></i>
                    </button>
                    <div className="w-40 text-center text-lg font-black text-slate-700">
                        {monthName}
                    </div>
                    <button onClick={nextMonth} disabled={loading} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 transition-all font-black disabled:opacity-50">
                        <i className="fas fa-chevron-right text-sm"></i>
                    </button>
                </div>
            </div>

            {/* Dashboard Headers */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-indigo-50 to-slate-50 p-6 rounded-[1.5rem] border border-indigo-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-bullhorn text-6xl"></i></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-2">Total Ads</p>
                    <p className="text-3xl font-black text-slate-800">{loading ? '...' : ads.length}</p>
                    <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">Delivering this month</span>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-slate-50 p-6 rounded-[1.5rem] border border-amber-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-eye text-6xl"></i></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">Month&apos;s Impressions</p>
                    <p className="text-3xl font-black text-slate-800">{loading ? '...' : fmt(summaryImpressions)}</p>
                    <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">Total Views</span>
                </div>


                <div className="bg-gradient-to-br from-emerald-50 to-slate-50 p-6 rounded-[1.5rem] border border-emerald-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><i className="fas fa-fire text-6xl"></i></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">Actual Spend in {viewDate.toLocaleString('default', { month: 'short' })}</p>
                    <p className="text-3xl font-black text-slate-800">฿{loading ? '...' : fmt(summarySpend)}</p>
                    <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">Facebook Billing Data</span>
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
                        <div key={d} className="p-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Calendar Body */}
                <div className="grid grid-cols-7 bg-white">
                    {calendarCells.map((cell, idx) => {
                        const slots = Array(15).fill(null);
                        let hiddenCount = 0;

                        if (cell.day) {
                            ads.forEach(c => {
                                const info = adSegmentsMap.get(c.id);
                                if (info?.activeDays.has(cell.day)) {
                                    if (info.assignedRow !== -1) {
                                        slots[info.assignedRow] = c;
                                    } else {
                                        hiddenCount++;
                                    }
                                }
                            });
                        }

                        return (
                            <div key={idx} className={`min-h-[120px] border-b border-r border-slate-100 py-2 flex flex-col relative overflow-hidden ${cell.day ? 'bg-white' : 'bg-slate-50'}`}>
                                {cell.day && (
                                    <>
                                        <div className="w-full flex justify-center mb-1">
                                            <div className={`text-[10px] font-black inline-flex justify-center items-center w-6 h-6 rounded-full ${isToday(cell.day) ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500'}`}>
                                                {cell.day}
                                            </div>
                                        </div>

                                        {/* Ad Bars for this day */}
                                        <div className="flex-1 space-y-[2px] flex flex-col pt-1">
                                            {slots.map((c, sIdx) => {
                                                if (!c) {
                                                    return <div key={`empty-${sIdx}`} className="h-[18px]"></div>;
                                                }

                                                const info = adSegmentsMap.get(c.id);
                                                const isStart = !info?.activeDays.has(cell.day - 1);
                                                const isEnd = !info?.activeDays.has(cell.day + 1);

                                                const hash = c.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                                                const colorClass = COLORS[hash % COLORS.length];

                                                let paddingClass = '';
                                                if (isStart && isEnd) paddingClass = 'mx-1 rounded-md w-[calc(100%-0.5rem)]';
                                                else if (isStart) paddingClass = 'ml-1 rounded-l-md w-[calc(100%-0.25rem)]';
                                                else if (isEnd) paddingClass = 'mr-1 rounded-r-md w-[calc(100%-0.25rem)] border-l border-white/20';
                                                else paddingClass = 'w-full border-l border-white/20 border-r border-white/20';

                                                return (
                                                    <div
                                                        key={c.id}
                                                        title={`${c.name} | Spend this month: ฿${fmt(c.spend)} | Imp: ${fmt(c.impressions)}`}
                                                        className={`h-[18px] relative flex items-center px-1.5 text-[9px] font-bold text-white shadow-[0_1px_2px_rgba(0,0,0,0.1)] cursor-help transition-opacity hover:opacity-90 ${colorClass} ${paddingClass}`}
                                                        style={{ zIndex: 10 - sIdx }}
                                                    >
                                                        {isStart && <span className="truncate w-full drop-shadow-sm leading-none pt-px">{c.name}</span>}
                                                    </div>
                                                );
                                            })}
                                            {hiddenCount > 0 && (
                                                <div className="text-[9px] font-black text-slate-400 w-full text-right pr-2 mt-0.5">
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
        </div>
    );
}
