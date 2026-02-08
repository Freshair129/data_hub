'use client';

export default function IntelligencePanel({ intel }) {
    if (!intel) return null;

    const riskLevel = intel.metrics?.churn_risk_level || 'Low';
    const riskPercent = riskLevel === 'Low' ? 15 : riskLevel === 'Medium' ? 50 : 85;
    const riskColor = riskLevel === 'Low' ? 'text-green-500' : riskLevel === 'Medium' ? 'text-amber-500' : 'text-red-500';
    const riskBg = riskLevel === 'Low' ? 'bg-green-100' : riskLevel === 'Medium' ? 'bg-amber-100' : 'bg-red-100';

    return (
        <div className="grid grid-cols-1 gap-6">
            {/* Consolidated AI Insights & Pain Points Card - Compact */}
            <div className="bg-[#162A47]/80 backdrop-blur-md rounded-[1.5rem] p-5 shadow-lg border border-white/10">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shadow-sm">
                            <i className="fas fa-brain text-orange-500 text-sm"></i>
                        </div>
                        <h3 className="font-extrabold text-white text-lg tracking-tight">AI Engagement Insights</h3>
                    </div>
                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest bg-[#0A1A2F]/50 px-2.5 py-1 rounded-full border border-white/5">
                        V-Insight
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-5">
                    {/* Customer Goal - Compact */}
                    <div className="md:col-span-8 p-4 bg-[#162A47] rounded-xl border border-white/10 shadow-inner group/goal hover:bg-[#1F3A5F] transition-colors">
                        <p className="text-[8px] text-slate-400 font-black uppercase tracking-wider mb-2">Core Learning Objective</p>
                        <p className="text-white font-bold text-base leading-snug italic">
                            &quot;{intel.customer_goal_th || intel.customer_goal || '-'}&quot;
                        </p>
                    </div>

                    {/* Churn Risk - Compact */}
                    <div className="md:col-span-4 p-4 bg-[#162A47] rounded-xl border border-white/10 shadow-inner flex flex-col justify-center items-center text-center group/risk hover:bg-[#1F3A5F] transition-colors">
                        <p className="text-[8px] text-slate-400 font-black uppercase tracking-wider mb-2">Churn Probability</p>
                        <div className={`text-3xl font-black mb-1 ${riskColor} drop-shadow-sm`}>{riskPercent}%</div>
                        <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${riskBg} ${riskColor} border border-current/10`}>
                            {riskLevel}
                        </div>
                    </div>
                </div>

                {/* Pain Points - Compact */}
                {(intel.pain_points_th?.length > 0 || intel.pain_points?.length > 0) && (
                    <div className="mb-5 p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                        <div className="flex items-center gap-2 mb-3">
                            <i className="fas fa-exclamation-triangle text-red-400 text-[10px]"></i>
                            <h4 className="text-[8px] font-black text-red-500 uppercase tracking-widest">Active Pain Points</h4>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {(intel.pain_points_th || intel.pain_points).map((pain, i) => (
                                <div key={i} className="px-2.5 py-1.5 bg-[#0A1A2F]/40 text-slate-300 text-[10px] font-bold rounded-lg border border-red-500/10 flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-red-500"></div>
                                    {pain}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Strategic Recommendation - Compact */}
                <div className="p-5 bg-[#0A1A2F] rounded-[1.5rem] relative overflow-hidden group shadow-xl">
                    <div className="absolute top-0 right-0 p-4 opacity-5 transform translate-x-2 -translate-y-2 pointer-events-none">
                        <i className="fas fa-lightbulb text-[80px] text-white"></i>
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="bg-[#C9A34E] text-[#0A1A2F] px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.15em] shadow-md">
                                Recommended Action
                            </span>
                        </div>
                        <h4 className="text-white font-black text-xl mb-2 leading-tight tracking-tight">
                            {intel.next_best_action?.action_th || intel.next_best_action?.action || '-'}
                        </h4>
                        <p className="text-slate-400 text-xs font-bold leading-relaxed max-w-xl">
                            {intel.next_best_action?.reason_th || intel.next_best_action?.reason || ''}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
