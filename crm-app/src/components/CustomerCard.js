'use client';

import React, { useState } from 'react';
import IntelligencePanel from './IntelligencePanel';
import InventoryPanel from './InventoryPanel';
import Timeline from './Timeline';

export default function CustomerCard({ customer, customers, onSelectCustomer, currentUser, onUpdateInventory }) {
    const [searchTerm, setSearchTerm] = useState('');

    if (!customer) return null;

    const profile = customer.profile || {};
    const intel = customer.intelligence || {};
    const inventory = customer.inventory || {};
    const wallet = customer.wallet || { balance: 0, points: 0, currency: 'THB' };
    const contact = customer.contact_info || profile.contact_info || {};
    const timeline = customer.timeline || [];

    const tierConfig = {
        L1: { label: 'General Member (L1)', color: 'bg-slate-400', nextTier: 'L2', threshold: 15000, hourThreshold: 0, icon: 'fa-certificate', textColor: 'text-slate-100' },
        L2: { label: 'Silver (L2)', color: 'bg-zinc-300', nextTier: 'L3', threshold: 50000, hourThreshold: 0, icon: 'fa-medal', textColor: 'text-zinc-800' },
        L3: { label: 'Gold (L3)', color: 'bg-amber-400', nextTier: 'L4', threshold: 125000, hourThreshold: 30, icon: 'fa-crown', textColor: 'text-amber-950' },
        L4: { label: 'Platinum (L4)', color: 'bg-cyan-400', nextTier: 'L5', threshold: 250000, hourThreshold: 100, icon: 'fa-gem', textColor: 'text-cyan-950' },
        L5: { label: 'Elite (L5)', color: 'bg-rose-500', nextTier: null, threshold: Infinity, hourThreshold: Infinity, icon: 'fa-fire', textColor: 'text-white' }
    };

    const totalSpend = intel.metrics?.total_spend || 0;
    const learningHours = intel.metrics?.total_learning_hours || 0;
    const internship = intel.metrics?.internship_completed || false;

    // Detect Current Tier based on spending AND hours
    let currentTierKey = 'L1';
    if (totalSpend >= 250000 && learningHours >= 100 && internship) currentTierKey = 'L5';
    else if (totalSpend >= 125000 && learningHours >= 30) currentTierKey = 'L4';
    else if (totalSpend >= 50000) currentTierKey = 'L3';
    else if (totalSpend >= 15000) currentTierKey = 'L2';

    const currentTier = tierConfig[currentTierKey];
    const nextTierKey = currentTier.nextTier;
    const nextTier = nextTierKey ? tierConfig[nextTierKey] : null;

    // Progress calculation (Dominant by Spending, but checking both)
    const spendProgress = nextTier ? Math.min(100, (totalSpend / nextTier.threshold) * 100) : 100;
    const hourProgress = nextTier && nextTier.hourThreshold > 0 ? Math.min(100, (learningHours / nextTier.hourThreshold) * 100) : 100;
    const combinedProgress = nextTier && nextTier.hourThreshold > 0 ? (spendProgress + hourProgress) / 2 : spendProgress;

    return (
        <div className="animate-fade-in pb-12 overflow-hidden">
            {/* Top Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 bg-[#162A47]/80 p-6 lg:p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden ring-1 ring-white/10 backdrop-blur-md">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
                <div className="relative z-10">
                    <h2 className="text-3xl font-black text-white tracking-tight">Customer Engagement</h2>
                    <p className="text-slate-400 text-sm font-bold">360° Insight & Experience Management</p>
                </div>

                {/* Search Bar - Global for Customer View */}
                <div className="flex-1 max-w-md mx-auto hidden lg:block">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <i className="fas fa-search text-slate-400 group-focus-within:text-[#0A1A2F] transition-colors"></i>
                        </div>
                        <input
                            type="text"
                            placeholder="Search Inventory (Name, ID, Keyword)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0A1A2F]/10 focus:border-[#0A1A2F]/20 transition-all shadow-sm"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-300 hover:text-slate-500 transition-colors"
                            >
                                <i className="fas fa-times-circle"></i>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 pl-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Session</span>
                    </div>
                    <select
                        value={customer.customer_id}
                        onChange={(e) => {
                            const selected = customers.find(c => c.customer_id === e.target.value);
                            if (selected) onSelectCustomer(selected);
                        }}
                        className="pl-4 pr-10 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-orange-500/20 transition-all outline-none"
                        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23fb923c\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M8 9l4-4 4 4m0 6l-4 4-4-4\' /%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
                    >
                        {customers.map((c) => (
                            <option key={c.customer_id} value={c.customer_id}>
                                {c.profile?.member_id ? `[${c.profile.member_id}]` : `[${c.customer_id}]`} {c.profile?.first_name ? `${c.profile.first_name} ${c.profile.last_name || ''}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column - Profile & Wallet (4 Units) */}
                <div className="lg:col-span-4 space-y-6">

                    {/* Profile Detail Card - Updated to Lighter Brand Navy */}
                    <div className="bg-[#162A47]/80 rounded-[2rem] shadow-xl border border-white/10 overflow-hidden relative group backdrop-blur-md">
                        <div className="p-8 pb-32 bg-gradient-to-br from-[#162A47]/80 to-[#1F3A5F]/80 relative">
                            {/* Fast Action Buttons */}
                            <div className="absolute top-6 right-6 flex gap-2">
                                <button className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white/70 hover:text-[#C9A34E] hover:bg-white/20 transition-all border border-white/10">
                                    <i className="fas fa-edit text-xs"></i>
                                </button>
                            </div>

                            <div className="flex flex-col items-center">
                                <div className="relative mb-6">
                                    <div className="w-32 h-32 rounded-full bg-[#162A47] p-1 ring-4 ring-[#C9A34E]/20 shadow-2xl overflow-hidden">
                                        <img
                                            src={profile.profile_picture || 'https://via.placeholder.com/150'}
                                            alt="Avatar"
                                            className="w-full h-full object-cover rounded-full"
                                            onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + (profile.first_name || 'C') + '&background=0A1A2F&color=C9A34E'; }}
                                        />
                                    </div>
                                    <div className="absolute bottom-1 right-1 w-8 h-8 bg-green-500 border-4 border-[#0A1A2F] rounded-full flex items-center justify-center shadow-md">
                                        <i className="fas fa-check text-white text-[10px]"></i>
                                    </div>
                                </div>

                                <h3 className="text-2xl font-black text-[#F8F8F6] mb-1 tracking-tight">{profile.first_name} {profile.last_name}</h3>
                                {profile.member_id && (
                                    <p className="text-[#C9A34E] font-black text-sm tracking-widest uppercase mb-1 drop-shadow-sm font-mono">{profile.member_id}</p>
                                )}
                                <p className="text-white/40 font-bold text-[10px] tracking-[0.2em] uppercase mb-4">
                                    {profile.nick_name ? `"${profile.nick_name}"` : 'Premium Member'}
                                </p>


                                {/* Membership Badge */}
                                <div className={`flex items-center gap-2 px-4 py-1.5 ${currentTier.color} rounded-full mb-6 shadow-lg shadow-black/20 border border-white/20 transition-all hover:scale-105 cursor-default`}>
                                    <i className={`fas ${currentTier.icon} ${currentTier.textColor} text-xs`}></i>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${currentTier.textColor}`}>
                                        {currentTier.label}
                                    </span>
                                </div>

                                {/* Membership Progress */}
                                {nextTier && (
                                    <div className="w-full max-w-[240px] mb-6 p-4 bg-white/5 rounded-2xl border border-white/5 shadow-inner">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Next Tier: {nextTier.label.split(' ')[0]}</span>
                                            <div className="flex gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${spendProgress >= 100 ? 'bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.5)]' : 'bg-slate-600'}`}></div>
                                                {nextTier.hourThreshold > 0 && (
                                                    <div className={`w-1.5 h-1.5 rounded-full ${hourProgress >= 100 ? 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'bg-slate-600'}`}></div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Spending Progress Bar */}
                                        <div className="space-y-3">
                                            <div>
                                                <div className="flex justify-between text-[8px] font-bold text-slate-500 mb-1 px-1">
                                                    <span>SPEND</span>
                                                    <span>{totalSpend.toLocaleString()} / {nextTier.threshold.toLocaleString()}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-amber-400 to-amber-200 rounded-full transition-all duration-1000 ease-out"
                                                        style={{ width: `${spendProgress}%` }}
                                                    ></div>
                                                </div>
                                            </div>

                                            {/* Hours Progress Bar (if applicable) */}
                                            {nextTier.hourThreshold > 0 && (
                                                <div>
                                                    <div className="flex justify-between text-[8px] font-bold text-slate-500 mb-1 px-1">
                                                        <span>HOURS</span>
                                                        <span>{learningHours} / {nextTier.hourThreshold} HRS</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-blue-400 to-blue-200 rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(96,165,250,0.3)]"
                                                            style={{ width: `${hourProgress}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Wallet Section - 2-Row Grid with Actions */}
                                <div className="w-full max-w-[240px] bg-[#162A47] rounded-2xl p-5 mb-6 border border-white/10 relative overflow-hidden">
                                    <div className="space-y-4 relative z-10">
                                        {/* Row 1: Wallet */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">W. Wallet</span>
                                                <div className="text-xl font-black text-white flex items-baseline gap-1">
                                                    <span className="text-xs text-slate-500 font-bold">฿</span>
                                                    {wallet.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <button className="px-4 py-1.5 bg-[#D9381E] hover:bg-[#b92b14] text-white text-[10px] font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-red-900/20 border border-white/10 transition-all active:scale-95">
                                                Top Up
                                            </button>
                                        </div>

                                        {/* Divider */}
                                        <div className="h-px w-full bg-white/5"></div>

                                        {/* Row 2: VP Points */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">P. VP</span>
                                                <div className="text-xl font-black text-[#C9A34E] flex items-baseline gap-1">
                                                    <span className="text-xs text-[#C9A34E]/60 font-bold">VP</span>
                                                    {wallet.points?.toLocaleString()}
                                                </div>
                                            </div>
                                            <button className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg border border-white/10 transition-all active:scale-95">
                                                Transfer
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap justify-center gap-2 max-w-full px-2">
                                    {intel.tags?.map((tag, i) => (
                                        <span key={i} className="px-3 py-1 bg-[#C9A34E]/10 text-[#C9A34E] text-[10px] font-bold uppercase tracking-wider rounded-lg border border-[#C9A34E]/20 whitespace-nowrap shadow-sm">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Contact List Overlap - Dark Mode */}
                        <div className="px-6 -mt-24 pb-8 relative z-10">
                            <div className="bg-slate-800/80 rounded-3xl p-6 shadow-xl shadow-black/20 border border-slate-700 space-y-4 backdrop-blur-sm">
                                {[
                                    { icon: 'fa-envelope', label: 'E-mail', val: contact.email || profile.email || '-', color: 'text-blue-400' },
                                    { icon: 'fa-phone', label: 'Phone', val: contact.phone_primary || profile.phone_primary || '-', color: 'text-green-400' },
                                    { icon: 'fa-line', label: 'Line ID', val: contact.line_id || '-', color: 'text-emerald-400' },
                                    { icon: 'fa-facebook', label: 'Facebook', val: contact.facebook || '-', color: 'text-blue-500' },
                                    { icon: 'fa-birthday-cake', label: 'Birthday', val: profile.birthday || '-', color: 'text-pink-400' },
                                    { icon: 'fa-briefcase', label: 'Occupation', val: profile.job_title || '-', color: 'text-orange-400' },
                                    { icon: 'fa-user-tie', label: 'Responsible Agent', val: profile.agent || 'Not Assigned', color: 'text-[#C9A34E]' }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-4 group/item hover:bg-white/5 p-2 rounded-xl transition-colors -mx-2">
                                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 group-hover/item:text-[#C9A34E] group-hover/item:bg-[#C9A34E]/10 transition-all border border-white/5">
                                            <i className={`fas ${item.icon} text-sm`}></i>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">{item.label}</p>
                                            <p className="text-sm font-bold text-[#F8F8F6] truncate group-hover/item:text-white transition-colors">{item.val}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right Column - Intelligence, Inventory & History (8 Units) */}
                <div className="lg:col-span-8 space-y-6">
                    <IntelligencePanel intel={intel} />
                    <InventoryPanel
                        inventory={inventory}
                        searchTerm={searchTerm}
                        currentUser={currentUser}
                        onUpdateInventory={onUpdateInventory}
                    />
                    <Timeline timeline={timeline} />
                </div>
            </div>
        </div>
    );
}
