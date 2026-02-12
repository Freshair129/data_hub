'use client';

import React, { useState, useEffect } from 'react';

export default function AIAnalytics({ campaigns }) {
    const [report, setReport] = useState(null);

    useEffect(() => {
        if (!campaigns || campaigns.length === 0) return;
        analyzeDeepDive(campaigns);
    }, [campaigns]);

    const analyzeDeepDive = (data) => {
        // 1. Find the "Bleeding" Campaign (Highest Priority)
        const activeCampaigns = data.filter(c => c.status === 'ACTIVE');
        if (activeCampaigns.length === 0) return;

        // Score campaigns by "Urgency" (Spend * Severity of Bad Metrics)
        const scoredCampaigns = activeCampaigns.map(c => {
            let score = c.spend || 0;
            const roas = c.spend > 0 ? ((c.action_values?.find(a => a.action_type === 'purchase')?.value || 0) / c.spend) : 0;
            const ctr = c.ctr || 0;

            if (roas < 1.5) score *= 2; // High urgency if losing money
            if (ctr < 0.5) score *= 1.5; // Creative issue
            return { ...c, urgencyScore: score, roas };
        });

        // Get Top 1
        const target = scoredCampaigns.sort((a, b) => b.urgencyScore - a.urgencyScore)[0];
        if (!target) return;

        // 2. Generate the Report
        const spend = target.spend || 0;
        const purchaseValue = target.action_values?.find(a => a.action_type === 'purchase')?.value || 0;
        const impressions = target.impressions || 0;
        const clicks = target.clicks || 0;
        const ctr = target.ctr || 0;
        const actions = target.actions || [];
        const messages = (actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d')?.value || 0) +
            (actions.find(a => a.action_type === 'onsite_conversion.messaging_first_reply')?.value || 0);
        const purchases = actions.find(a => a.action_type === 'purchase')?.value || 0;

        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
        const cpc = clicks > 0 ? (spend / clicks) : 0;
        const costPerMsg = messages > 0 ? (spend / messages) : 0;
        const roas = target.roas;

        // Language Generation Logic
        const badPoints = [];
        const goodPoints = [];
        let summary = '';
        let advice = '';

        // Bad Points Analysis
        if (ctr < 1) badPoints.push(`คนเห็นแล้วผ่านเลย (CTR ต่ำมาก ${ctr.toFixed(2)}%): รูปภาพ หรือ พาดหัว ไม่ดึงดูดใจ คนเห็นแล้วเลื่อนผ่าน`);
        if (costPerMsg > 100) badPoints.push(`ต้นทุนต่อแชทแพง (฿${costPerMsg.toFixed(0)}): เพราะคนกดน้อย หรือกลุ่มเป้าหมายกว้างเกินไป`);
        if (messages > 10 && purchases === 0) badPoints.push(`ปิดการขายยาก (Conversion ต่ำ): มีคนทักมา ${messages} คน แต่ปิดยอดไม่ได้เลย เช็กการตอบแชทด่วน`);
        else if (roas < 1.5) badPoints.push(`ยอดขายไม่คุ้มทุน (ROAS ${roas.toFixed(2)}x): กำไรบางมาก หรือขาดทุน`);

        // Good Points Analysis
        if (cpm < 100) goodPoints.push(`ค่าโฆษณาถูก (CPM ฿${cpm.toFixed(0)}): Facebook นำส่งหาคนจำนวนมากได้ในราคาถูก แสดงว่ากลุ่มเป้าหมายกว้างดี`);
        if (ctr > 1.5) goodPoints.push(`รูปน่าสนใจ (CTR ${ctr.toFixed(2)}%): คนหยุดดูและกดเยอะ ถือว่าคอนเทนต์ดีแล้ว`);
        if (roas > 3) goodPoints.push(`กำไรดี (ROAS ${roas.toFixed(2)}x): แคมเปญนี้ทำเงินได้ดี ควรเพิ่มงบ`);

        // Summary Narrative
        if (badPoints.length > 2) summary = 'คนเห็นเยอะ แต่ไม่ค่อยกด และปิดโจทย์ยาก';
        else if (goodPoints.length > 2) summary = 'แอดตัวนี้นางฟ้า! คนชอบ ยอดขายดี';
        else summary = 'ทรงๆ ทรุดๆ ต้องปรับปรุงบางจุด';

        // Actionable Advice
        if (ctr < 1) advice = 'เปลี่ยนรูป/วิดีโอ ด่วน: ทำคอนเทนต์ใหม่ที่ "กระแทกตา" กว่าเดิม';
        else if (messages > 10 && purchases === 0) advice = 'เช็กบทสนทนา: ลองไล่อ่านแชทดูว่าติดเรื่องราคา หรือตอบช้า?';
        else if (roas < 1.5) advice = 'ลดงบ หรือ ปิดแอด: ถ้าแก้คอนเทนต์แล้วไม่ดีขึ้น ให้หยุดก่อน';
        else advice = 'อัดงบเพิ่ม (Scale): แอดกำลังทำเงิน เติมเงินเข้าไปเลย';

        setReport({
            campaignName: target.name,
            summary,
            badPoints,
            goodPoints,
            advice,
            spend,
            revenue: purchaseValue,
            roas
        });
    };

    if (!report) return null;

    return (
        <div className="bg-gradient-to-br from-indigo-900/60 to-violet-900/60 border border-indigo-500/30 rounded-[2rem] p-8 animate-fade-in mb-8 shadow-2xl shadow-indigo-900/20">
            <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 relative">
                    <i className="fas fa-robot text-white text-2xl"></i>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full border-2 border-[#0A1A2F] animate-pulse"></div>
                </div>
                <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">AI Deep Dive Analysis</h2>
                    <p className="text-sm text-indigo-200/60 font-medium">วิเคราะห์เจาะลึก: <span className="text-white font-bold">{report.campaignName}</span> (Lifetime Data)</p>
                </div>
            </div>

            <div className="space-y-8">
                {/* 1. Overview */}
                <div>
                    <h3 className="text-indigo-300 font-black text-xs uppercase tracking-widest mb-3">📊 ภาพรวม</h3>
                    <p className="text-xl font-bold text-white">"{report.summary}"</p>
                    <div className="mt-4 flex gap-4 text-sm">
                        <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/5">
                            <span className="text-white/40 block text-xs">ใช้เงินไป</span>
                            <span className="font-mono text-white">฿{report.spend.toLocaleString()}</span>
                        </div>
                        <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/5">
                            <span className="text-white/40 block text-xs">ยอดขายกลับมา</span>
                            <span className="font-mono text-emerald-400">฿{report.revenue.toLocaleString()}</span>
                        </div>
                        <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/5">
                            <span className="text-white/40 block text-xs">ROAS</span>
                            <span className={`font-mono ${report.roas >= 2 ? 'text-emerald-400' : 'text-rose-400'}`}>{report.roas.toFixed(2)}x</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* 2. Urgent / Bad Points */}
                    {report.badPoints.length > 0 && (
                        <div>
                            <h3 className="text-rose-400 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                                <i className="fas fa-exclamation-circle"></i> จุดที่น่าห่วง (ต้องแก้ด่วน)
                            </h3>
                            <ul className="space-y-3">
                                {report.badPoints.map((point, i) => {
                                    const [title, desc] = point.split(':');
                                    return (
                                        <li key={i} className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                                            <span className="text-rose-300 font-bold block mb-1">{title}</span>
                                            <span className="text-xs text-rose-100/70 leading-relaxed">{desc}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {/* 3. Strength / Good Points */}
                    {report.goodPoints.length > 0 && (
                        <div>
                            <h3 className="text-emerald-400 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                                <i className="fas fa-check-circle"></i> จุดที่ดี
                            </h3>
                            <ul className="space-y-3">
                                {report.goodPoints.map((point, i) => {
                                    const [title, desc] = point.split(':');
                                    return (
                                        <li key={i} className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                                            <span className="text-emerald-300 font-bold block mb-1">{title}</span>
                                            <span className="text-xs text-emerald-100/70 leading-relaxed">{desc}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>

                {/* 4. Recommendation */}
                <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <h3 className="text-indigo-300 font-black text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
                        <i className="fas fa-lightbulb"></i> 💡 คำแนะนำ
                    </h3>
                    <p className="text-white font-medium text-lg">{report.advice}</p>
                    <p className="text-indigo-200/60 text-xs mt-2">ควรปรับปรุงคอนเทนต์เพื่อเพิ่มกำไรครับ!</p>
                </div>
            </div>
        </div>
    );
}
