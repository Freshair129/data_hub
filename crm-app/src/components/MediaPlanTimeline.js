import React, { useState, useMemo } from 'react';

export default function MediaPlanTimeline({ campaigns }) {
    // Current viewed month (defaults to current month)
    const [viewDate, setViewDate] = useState(new Date());

    // Navigate months
    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));

    // Calculate month boundaries
    const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);

    // Filter campaigns that overlap with the current viewed month
    const monthCampaigns = useMemo(() => {
        return campaigns.filter(c => {
            if (!c.start_time) return false;
            const start = new Date(c.start_time);
            const end = c.stop_time ? new Date(c.stop_time) : new Date(); // If no stop time, assume ongoing

            // Overlap condition rules:
            // Campaign start <= end of month AND Campaign end >= start of month
            return start <= endOfMonth && end >= startOfMonth;
        }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }, [campaigns, viewDate]);

    // Calculate total layout budget for the month
    const totalBudget = monthCampaigns.reduce((sum, c) => {
        // Approximate budget calculation if exact monthly budget is not available
        return sum + (c.lifetime_budget || (c.daily_budget ? c.daily_budget * 30 : 0));
    }, 0);
    const usedBudget = monthCampaigns.reduce((sum, c) => sum + (c.spend || 0), 0);
    const leftBudget = Math.max(0, totalBudget - usedBudget);

    // Helper: Formats budget number
    const fmt = (num) => Number(num).toLocaleString('th-TH', { maximumFractionDigits: 0 });

    // Helper: Determine week blocks (Wk1, Wk2, Wk3, Wk4) overlapping
    // Assumes simple division: Wk1 (1-7), Wk2 (8-14), Wk3 (15-21), Wk4 (22-end)
    const getWeekOverlap = (start, end) => {
        const activeWeeks = { w1: false, w2: false, w3: false, w4: false };

        const cStart = start < startOfMonth ? 1 : start.getDate();
        const cEnd = end > endOfMonth ? endOfMonth.getDate() : end.getDate();

        if (cStart <= 7 && cEnd >= 1) activeWeeks.w1 = true;
        if (cStart <= 14 && cEnd >= 8) activeWeeks.w2 = true;
        if (cStart <= 21 && cEnd >= 15) activeWeeks.w3 = true;
        if (cStart <= 31 && cEnd >= 22) activeWeeks.w4 = true;

        return activeWeeks;
    };

    const monthName = viewDate.toLocaleString('default', { month: 'short', year: 'numeric' });

    return (
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 animate-fade-in relative z-10 w-full overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Media Plan Timeline</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Campaign Schedule Overview
                    </p>
                </div>

                {/* Month Navigation */}
                <div className="flex items-center gap-4 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                    <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 transition-all font-black">
                        <i className="fas fa-chevron-left text-xs"></i>
                    </button>
                    <div className="w-32 text-center text-sm font-black text-slate-700">
                        {monthName}
                    </div>
                    <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-400 hover:text-indigo-600 transition-all font-black">
                        <i className="fas fa-chevron-right text-xs"></i>
                    </button>
                </div>
            </div>

            {/* Top Summary Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-center">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Total Budget</p>
                    <p className="text-xl font-black text-slate-800">฿{fmt(totalBudget)}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-center">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Actual Spend</p>
                    <p className="text-xl font-black text-slate-800">฿{fmt(usedBudget)}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-center">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Left Budget</p>
                    <p className="text-xl font-black text-[#C9A34E]">฿{fmt(leftBudget)}</p>
                </div>
            </div>

            {/* Gantt Chart Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                        <tr>
                            <th className="bg-indigo-900 border-r border-indigo-800 text-white p-3 text-xs font-black text-center w-24">Platform</th>
                            <th className="bg-indigo-900 border-r border-indigo-800 text-white p-3 text-xs font-black text-center w-20">% Budget</th>
                            <th className="bg-indigo-900 border-r border-indigo-800 text-white p-3 text-xs font-black">Campaign / Content</th>
                            <th className="bg-indigo-900 border-r border-indigo-800 text-white p-3 text-xs font-black text-center w-32">Objective</th>
                            <th className="bg-indigo-900 border-r border-indigo-800 text-white p-3 text-xs font-black text-center w-32">Period</th>
                            <th className="bg-indigo-900 border-r border-indigo-800 text-white p-3 text-xs font-black text-right w-28">Budget</th>
                            <th colSpan="4" className="bg-indigo-900 text-white p-0">
                                <div className="text-xs font-black text-center border-b border-indigo-800 py-1">
                                    {monthName}
                                </div>
                                <div className="flex w-full">
                                    <div className="flex-1 text-center py-1 text-[10px] font-bold border-r border-indigo-800">Wk1</div>
                                    <div className="flex-1 text-center py-1 text-[10px] font-bold border-r border-indigo-800">Wk2</div>
                                    <div className="flex-1 text-center py-1 text-[10px] font-bold border-r border-indigo-800">Wk3</div>
                                    <div className="flex-1 text-center py-1 text-[10px] font-bold">Wk4</div>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {monthCampaigns.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="p-8 text-center text-slate-400 font-bold text-sm bg-slate-50">
                                    <i className="fas fa-folder-open block text-2xl mb-2 text-slate-300"></i>
                                    No campaigns running in {monthName}
                                </td>
                            </tr>
                        ) : (
                            monthCampaigns.map((c, i) => {
                                const start = new Date(c.start_time);
                                const end = c.stop_time ? new Date(c.stop_time) : new Date();

                                const pStart = start < startOfMonth ? '1' : start.getDate();
                                const pEnd = end > endOfMonth ? 'Ongoing' : end.getDate();
                                const periodStr = `${pStart} - ${pEnd} ${viewDate.toLocaleString('default', { month: 'short' })}`;

                                const cBudget = c.lifetime_budget || (c.daily_budget ? c.daily_budget * 30 : 0);
                                const budgetPct = totalBudget > 0 ? ((cBudget / totalBudget) * 100).toFixed(0) : 0;

                                const overlap = getWeekOverlap(start, end);

                                // Color logic: generic logic based on index or parsing name
                                const highlightColor = c.name.toLowerCase().includes('google') ? 'bg-yellow-200' : 'bg-orange-200';

                                return (
                                    <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors text-sm text-slate-700">
                                        {i === 0 && (
                                            <td rowSpan={monthCampaigns.length} className="bg-blue-200/50 border-r border-slate-200 font-black text-center align-middle">
                                                Facebook
                                            </td>
                                        )}
                                        <td className="p-2 border-r border-slate-100 text-center font-bold text-slate-500 bg-slate-50/50">
                                            {budgetPct}%
                                        </td>
                                        <td className="p-2 border-r border-slate-100 font-bold max-w-[200px] truncate" title={c.name}>
                                            {c.name}
                                        </td>
                                        <td className="p-2 border-r border-slate-100 text-center text-xs text-slate-500">
                                            {c.objective || 'Message'}
                                        </td>
                                        <td className="p-2 border-r border-slate-100 text-center text-xs font-bold">
                                            {periodStr}
                                        </td>
                                        <td className="p-2 border-r border-slate-100 text-right font-black text-slate-800">
                                            {fmt(cBudget)}
                                        </td>

                                        {/* Timeline cells */}
                                        <td className="border-r border-slate-100 p-0 relative">
                                            {overlap.w1 && <div className={`absolute inset-0.5 rounded-sm ${highlightColor}`}></div>}
                                        </td>
                                        <td className="border-r border-slate-100 p-0 relative">
                                            {overlap.w2 && <div className={`absolute inset-0.5 rounded-sm ${highlightColor}`}></div>}
                                        </td>
                                        <td className="border-r border-slate-100 p-0 relative">
                                            {overlap.w3 && <div className={`absolute inset-0.5 rounded-sm ${highlightColor}`}></div>}
                                        </td>
                                        <td className="p-0 relative">
                                            {overlap.w4 && <div className={`absolute inset-0.5 rounded-sm ${highlightColor}`}></div>}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
