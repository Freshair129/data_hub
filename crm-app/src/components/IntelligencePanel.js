'use client';

export default function IntelligencePanel({ intel }) {
    if (!intel) return null;

    const riskLevel = intel.metrics?.churn_risk_level || 'Low';
    const riskPercent = riskLevel === 'Low' ? 15 : riskLevel === 'Medium' ? 50 : 85;
    const riskColor = riskLevel === 'Low' ? 'text-green-500' : riskLevel === 'Medium' ? 'text-amber-500' : 'text-red-500';
    const riskBg = riskLevel === 'Low' ? 'bg-green-100' : riskLevel === 'Medium' ? 'bg-amber-100' : 'bg-red-100';

    return (
        <div className="grid grid-cols-1 gap-6">
            {/* Consolidated AI Insights & Pain Points Card */}
            <div className="bg-white/80 backdrop-blur-md rounded-[2rem] p-8 shadow-xl border border-white/20">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center shadow-sm">
                            <i className="fas fa-brain text-orange-500 text-lg"></i>
                        </div>
                        <h3 className="font-extrabold text-slate-900 text-xl tracking-tight">AI Engagement Insights</h3>
                    </div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100/50 px-3 py-1 rounded-full border border-slate-200/50">
                        Powered by V-Insight
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
                    {/* Customer Goal - Aligned with Wallet Style */}
                    <div className="md:col-span-8 p-6 bg-[#162A47] rounded-2xl border border-white/10 shadow-inner group/goal hover:bg-[#1F3A5F] transition-colors">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-3">Core Learning Objective</p>
                        <p className="text-white font-bold text-lg leading-relaxed italic">
                            &quot;{intel.customer_goal_th || intel.customer_goal || '-'}&quot;
                        </p>
                    </div>

                    {/* Churn Risk - Aligned with Wallet Style */}
                    <div className="md:col-span-4 p-6 bg-[#162A47] rounded-2xl border border-white/10 shadow-inner flex flex-col justify-center items-center text-center group/risk hover:bg-[#1F3A5F] transition-colors">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-3">Churn Probability</p>
                        <div className={`text-5xl font-black mb-2 ${riskColor} drop-shadow-sm`}>{riskPercent}%</div>
                        <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${riskBg} ${riskColor} border border-current/10`}>
                            {riskLevel} Risk
                        </div>
                    </div>
                </div>

                {/* Integrated Pain Points Section */}
                {(intel.pain_points_th?.length > 0 || intel.pain_points?.length > 0) && (
                    <div className="mb-8 p-6 bg-red-50/30 rounded-2xl border border-red-100/50">
                        <div className="flex items-center gap-2 mb-4">
                            <i className="fas fa-exclamation-triangle text-red-400 text-xs"></i>
                            <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest">Active Pain Points</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(intel.pain_points_th || intel.pain_points).map((pain, i) => (
                                <div key={i} className="px-3 py-2 bg-white/60 text-slate-700 text-[11px] font-bold rounded-xl border border-red-100 flex items-center gap-2 shadow-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div>
                                    {pain}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Strategic Recommendation - Closing Section */}
                <div className="p-8 bg-[#0A1A2F] rounded-[2.5rem] relative overflow-hidden group shadow-2xl">
                    <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-700">
                        <i className="fas fa-lightbulb text-[120px] text-white"></i>
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="bg-[#C9A34E] text-[#0A1A2F] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
                                <i className="fas fa-star mr-2"></i> Strategic Recommendation
                            </span>
                        </div>
                        <h4 className="text-white font-black text-2xl mb-3 leading-tight tracking-tight">
                            {intel.next_best_action?.action_th || intel.next_best_action?.action || '-'}
                        </h4>
                        <p className="text-slate-400 text-sm font-bold leading-relaxed max-w-2xl">
                            {intel.next_best_action?.reason_th || intel.next_best_action?.reason || ''}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
