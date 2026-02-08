'use client';

import { useState } from 'react';

export default function InventoryPanel({ inventory, searchTerm = '', currentUser, onUpdateInventory }) {
    const [redeeming, setRedeeming] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newItem, setNewItem] = useState({
        type: 'coupon',
        name: '',
        description: '',
        expiry_date: '',
        course_id: '',
        coupon_id: '',
        sessions: 10
    });

    const canEdit = currentUser?.permissions?.can_edit_inventory || currentUser?.permissions?.is_admin;

    const filterItem = (item) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            item.name?.toLowerCase().includes(term) ||
            (item.coupon_id && item.coupon_id.toLowerCase().includes(term)) ||
            (item.course_id && item.course_id.toLowerCase().includes(term)) ||
            (item.description && item.description.toLowerCase().includes(term))
        );
    };

    const handleDelete = (item, type, e) => {
        if (e) e.stopPropagation();
        if (!confirm(`Are you sure you want to remove ${item.name}?`)) return;

        const updatedInventory = { ...inventory };
        if (type === 'coupon') {
            updatedInventory.coupons = inventory.coupons.filter(c => c !== item);
        } else {
            updatedInventory.learning_courses = inventory.learning_courses.filter(c => c !== item);
        }
        onUpdateInventory(updatedInventory);
        setSelectedItem(null);
    };

    const handleAddItem = (e) => {
        e.preventDefault();
        const updatedInventory = { ...inventory };
        const itemToAdd = { ...newItem };

        if (newItem.type === 'coupon') {
            updatedInventory.coupons = [...(inventory.coupons || []), itemToAdd];
        } else {
            updatedInventory.learning_courses = [...(inventory.learning_courses || []), {
                ...itemToAdd,
                credits_remaining: { sessions: parseInt(newItem.sessions) }
            }];
        }

        onUpdateInventory(updatedInventory);
        setIsAddModalOpen(false);
        setNewItem({ type: 'coupon', name: '', description: '', expiry_date: '', course_id: '', coupon_id: '', sessions: 10 });
    };

    const coupons = (inventory?.coupons || []).filter(filterItem);
    const courses = (inventory?.learning_courses || []).filter(filterItem);

    if (!inventory) return null;

    const handleRedeem = (item, type, e) => {
        if (e) e.stopPropagation();
        setRedeeming({ ...item, type });
        // In a real app, this would call an API
        setTimeout(() => {
            alert(`Successfully redeemed: ${item.name}`);
            setRedeeming(null);
            setSelectedItem(null);
        }, 1500);
    };

    // Helper to render a consistent ticket card with correct proportions
    const TicketCard = ({ item, type }) => {
        const isFreeDrink = item.name.toLowerCase().includes('drink');
        const isSushiCourse = item.name.toLowerCase().includes('sushi');
        const isWagyu = item.name.toLowerCase().includes('wagyu');
        const isBundle = item.type === 'bundle' || item.type === 'package';
        const isCourse = type === 'course' || isBundle; // Treat bundle as a course-like item for sectioning

        const bgStyle = isFreeDrink
            ? { backgroundImage: 'url(/assets/coupon_free_drink.png)' }
            : isSushiCourse
                ? { backgroundImage: 'url(/assets/course_intensive_sushi.jpg)' }
                : isWagyu
                    ? { backgroundImage: 'url(/assets/coupon_wagyu.png)' }
                    : isBundle
                        ? { background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)' }
                        : isCourse
                            ? { background: 'linear-gradient(135deg, #FF9D6C 0%, #BB4E75 100%)' }
                            : { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' };

        return (
            <div
                onClick={() => setSelectedItem({ ...item, type: item.type })}
                className="group relative transition-all duration-500 hover:scale-[1.02] hover:z-20 cursor-pointer aspect-[10/6]"
            >
                {/* Main Card Boundary with Background */}
                <div
                    className={`absolute inset-0 rounded-3xl border shadow-xl group-hover:shadow-2xl transition-all duration-500 overflow-hidden ${isFreeDrink || isSushiCourse || isWagyu || !isFreeDrink ? 'border-transparent text-white ring-1 ring-white/10' : 'bg-slate-50 border-slate-100'
                        }`}
                    style={{
                        ...bgStyle,
                        backgroundSize: '100% 100%', // Force exact fit for 1000x600 images
                        WebkitMaskImage: 'radial-gradient(circle at 0 50%, transparent 12px, black 13px), radial-gradient(circle at 100% 50%, transparent 12px, black 13px)',
                        WebkitMaskComposite: 'source-in',
                        maskImage: 'radial-gradient(circle at 0 50%, transparent 12px, black 13px), radial-gradient(circle at 100% 50%, transparent 12px, black 13px)',
                        maskComposite: 'intersect'
                    }}
                >
                    <div className={`absolute inset-0 transition-all duration-500 ${isFreeDrink || isSushiCourse || isWagyu
                        ? 'bg-black/0 group-hover:bg-black/10' // Transparent by default to show full image
                        : 'bg-black/20 group-hover:bg-black/10'
                        }`}></div>
                </div>


                {/* Dotted separator line */}
                <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[1px] border-t border-dashed border-white/20 z-20 pointer-events-none"></div>

                {/* Content Layer */}
                <div className="relative z-20 h-full p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-start justify-between mb-2">
                            {canEdit && (
                                <button
                                    onClick={(e) => handleDelete(item, type, e)}
                                    className="w-8 h-8 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center transition-all border border-red-500/20 backdrop-blur-md"
                                >
                                    <i className="fas fa-trash-alt text-[10px]"></i>
                                </button>
                            )}
                            <div className="text-right ml-auto">
                                <div className="text-[7px] font-black uppercase tracking-[0.1em] text-white/70 drop-shadow-lg">
                                    {isBundle ? 'Package License' : (isCourse ? 'Course Credit' : 'Valid Until')}
                                </div>
                                <div className="text-[10px] font-black leading-none mt-1 drop-shadow-md">{isCourse || isBundle ? 'Active' : item.expiry_date}</div>
                            </div>
                        </div>
                        {(!isFreeDrink && !isWagyu) && (
                            <>
                                <h5 className="font-black text-lg leading-tight mb-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-white">{item.name}</h5>
                                <p className="text-[10px] font-medium opacity-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] text-white/90 line-clamp-1">{item.description}</p>
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-[8px] font-black uppercase tracking-widest bg-[#C9A34E]/20 text-[#C9A34E] px-2 py-0.5 rounded-md backdrop-blur-md border border-[#C9A34E]/30 shadow-lg">
                            {isBundle ? `PKG: ${item.bundle_id}` : (isCourse ? `ID: ${item.course_id || 'CRS'}` : `ID: ${item.coupon_id || 'COUP'}`)}
                        </span>
                        <div className="flex items-center gap-3">
                            <div className="text-[9px] font-black flex items-center gap-1 group-hover:gap-2 transition-all drop-shadow-lg text-white/80">
                                VIEW <i className="fas fa-chevron-right text-[7px]"></i>
                            </div>
                            <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-lg">
                                <i className={`fas ${isBundle ? 'fa-box-open' : (isCourse ? 'fa-graduation-cap' : 'fa-ticket-alt')} text-xs text-white`}></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-10 px-4 md:px-8 py-4">
            {/* Header Section */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-[#0A1A2F] shadow-xl flex items-center justify-center text-white ring-4 ring-[#0A1A2F]/5">
                        <i className="fas fa-wallet text-xl"></i>
                    </div>
                    <div>
                        <h3 className="font-black text-white text-2xl tracking-tight">Your Inventory</h3>
                        <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Coupons & Course Credits</p>
                    </div>
                </div>

                {/* Permission-based Add Button */}
                {canEdit && (
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-[#C9A34E] text-[#0A1A2F] px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-2 shadow-lg"
                    >
                        <i className="fas fa-plus"></i>
                        ADD ASSET
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-14">
                {/* Coupons Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div> Available Vouchers
                        </h4>
                    </div>

                    {coupons.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {coupons.map((coupon, i) => (
                                <TicketCard key={`coupon-${i}`} item={coupon} type="coupon" />
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 shadow-inner">
                            <p className="text-slate-400 text-xs font-bold">No coupons available</p>
                        </div>
                    )}
                </div>

                {/* Courses Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A34E] animate-pulse"></div> Course Enrollments
                        </h4>
                    </div>

                    {courses.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {courses.map((course, i) => (
                                <TicketCard key={`course-${i}`} item={course} type="course" />
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 shadow-inner">
                            <p className="text-slate-400 text-xs font-bold">No course enrollment found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Detail Modal - Balanced Impact & Compactness */}
            {selectedItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
                    <div
                        className="absolute inset-0 bg-[#0A1A2F]/60 backdrop-blur-sm"
                        onClick={() => setSelectedItem(null)}
                    ></div>

                    <div className="relative bg-[#F8F8F6] rounded-[2rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.4)] w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col animate-scale-up border border-white/20">
                        {/* Close Button */}
                        <button
                            onClick={() => setSelectedItem(null)}
                            className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/20 hover:bg-black/40 text-white rounded-full flex items-center justify-center transition-all backdrop-blur-md"
                        >
                            <i className="fas fa-times"></i>
                        </button>

                        {/* Top: Image Section - Large & Clear */}
                        <div className="w-full bg-white flex-shrink-0 relative overflow-hidden flex items-center justify-center border-b border-slate-100 min-h-[220px] max-h-[450px]">
                            {selectedItem.name.toLowerCase().includes('drink') ? (
                                <img
                                    src="/assets/coupon_free_drink.png"
                                    className="w-full h-auto block object-contain max-h-[300px] p-2"
                                    alt="Coupon Image"
                                />
                            ) : selectedItem.name.toLowerCase().includes('sushi') ? (
                                <img
                                    src="/assets/course_intensive_sushi.jpg"
                                    className="w-full h-auto block object-cover max-h-[320px]"
                                    alt="Course Image"
                                />
                            ) : selectedItem.name.toLowerCase().includes('wagyu') ? (
                                <img
                                    src="/assets/coupon_wagyu.png"
                                    className="w-full h-auto block object-contain max-h-[300px] p-2"
                                    alt="Coupon Image"
                                />
                            ) : (
                                <div className="w-full aspect-[5/3] flex flex-col items-center justify-center p-8 text-center bg-[#0A1A2F]">
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-2xl text-white ${selectedItem.type === 'bundle' ? 'bg-blue-600' : selectedItem.type === 'course' ? 'bg-[#C9A34E]' : 'bg-red-500'}`}>
                                        <i className={`fas ${selectedItem.type === 'bundle' ? 'fa-box-open' : selectedItem.type === 'course' ? 'fa-graduation-cap' : 'fa-ticket-alt'} text-3xl`}></i>
                                    </div>
                                    <h2 className="text-2xl md:text-4xl font-black text-[#F8F8F6] italic tracking-tight uppercase px-4 leading-none">
                                        {selectedItem.name}
                                    </h2>
                                </div>
                            )}
                        </div>

                        {/* Bottom: Info Section - Efficient */}
                        <div className="flex-1 overflow-y-auto min-h-0 bg-white p-5 md:p-8">
                            <div className="flex flex-col gap-6">
                                {/* Header Details */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Item Details</p>
                                        <p className="text-slate-500 text-[13px] font-bold leading-tight max-w-sm">
                                            {selectedItem.description}
                                        </p>
                                    </div>
                                    <span className="bg-green-100/50 text-green-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-200/50">Active Asset</span>
                                </div>

                                {/* Bundle Content Section (If it is a bundle) */}
                                {(selectedItem.type === 'bundle' || selectedItem.type === 'package') && selectedItem.items && (
                                    <div className="space-y-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Included Courses</p>
                                        <div className="space-y-2">
                                            {selectedItem.items.map((subItem, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${subItem.is_bonus ? 'bg-green-500' : 'bg-blue-500'}`}>
                                                            <i className={`fas ${subItem.is_bonus ? 'fa-gift' : 'fa-book'} text-xs`}></i>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-700">{subItem.name}</p>
                                                            <p className="text-[9px] font-medium text-slate-400 uppercase">{subItem.is_bonus ? 'Bonus Content' : 'Core Curriculum'}</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-black text-slate-300">{subItem.course_id}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Property Grid (Hide for bundle if redundant, but keep for now) */}
                                {selectedItem.type !== 'bundle' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                                {selectedItem.type === 'course' ? 'Class Credits' : 'Expires On'}
                                            </p>
                                            <p className="text-base font-black text-[#0A1A2F]">
                                                {selectedItem.type === 'course' ? `${selectedItem.credits_remaining?.sessions || 0} Sessions` : selectedItem.expiry_date}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Reference ID</p>
                                            <p className="text-base font-black text-[#0A1A2F]">
                                                {selectedItem.type === 'course' ? (selectedItem.course_id || 'CRS-001') : (selectedItem.coupon_id || 'COUP-001')}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Action Area */}
                                <div className="bg-[#0A1A2F] rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                                    <div className="flex items-center gap-8 relative z-10">
                                        {/* QR Code */}
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-28 h-28 bg-white p-2.5 rounded-2xl shadow-xl">
                                                <img
                                                    src="/assets/mock_qr_code.png"
                                                    className="w-full h-full object-contain"
                                                    alt="QR"
                                                />
                                            </div>
                                            <p className="text-[7px] font-black text-white/30 uppercase tracking-[0.2em]">SCAN TO USE</p>
                                        </div>

                                        {/* Action Info */}
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <p className="text-[#C9A34E] text-[10px] font-black uppercase tracking-[0.3em] mb-1">Verified Transaction</p>
                                                <h4 className="text-[#F8F8F6] text-xl font-black tracking-tight leading-none">Ready for Asset Redemption</h4>
                                            </div>
                                            <button
                                                onClick={(e) => handleRedeem(selectedItem, selectedItem.type, e)}
                                                disabled={redeeming}
                                                className="w-full py-4 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-xl text-sm font-black transition-all shadow-lg flex items-center justify-center gap-3"
                                            >
                                                {redeeming ? (
                                                    <i className="fas fa-circle-notch animate-spin text-xl"></i>
                                                ) : (
                                                    <>
                                                        <span>{selectedItem.type === 'course' ? 'CONFIRM CHECK-IN' : (selectedItem.type === 'bundle' ? 'MANAGE PACKAGE' : 'USE NOW')}</span>
                                                        <i className="fas fa-arrow-right text-[10px] opacity-50"></i>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-center text-slate-300 text-[8px] font-black uppercase tracking-[0.5em] pt-2">SECURE TRANSACTION SESSION</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Add Item Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-[#0A1A2F]/80 backdrop-blur-md"
                        onClick={() => setIsAddModalOpen(false)}
                    ></div>
                    <form
                        onSubmit={handleAddItem}
                        className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20"
                    >
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-black text-[#0A1A2F] tracking-tight">Add New Inventory Asset</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manual Provisioning</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-all"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="p-8 space-y-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    type="button"
                                    onClick={() => setNewItem({ ...newItem, type: 'coupon' })}
                                    className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 border-2 transition-all ${newItem.type === 'coupon' ? 'bg-red-500 border-red-500 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                                >
                                    <i className="fas fa-ticket-alt"></i> COUPON
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNewItem({ ...newItem, type: 'course' })}
                                    className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 border-2 transition-all ${newItem.type === 'course' ? 'bg-[#C9A34E] border-[#C9A34E] text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                                >
                                    <i className="fas fa-graduation-cap"></i> COURSE
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Asset Name</label>
                                    <input
                                        required
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#C9A34E]/20 focus:border-[#C9A34E]/50 transition-all"
                                        placeholder="e.g. Free Wagyu Steak"
                                        value={newItem.name}
                                        onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Description</label>
                                    <textarea
                                        required
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#C9A34E]/20 focus:border-[#C9A34E]/50 transition-all min-h-[80px]"
                                        placeholder="Brief description of the benefit..."
                                        value={newItem.description}
                                        onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            {newItem.type === 'coupon' ? 'ID (COUP-XXX)' : 'ID (CRS-XXX)'}
                                        </label>
                                        <input
                                            required
                                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#C9A34E]/20 focus:border-[#C9A34E]/50 transition-all"
                                            value={newItem.type === 'coupon' ? newItem.coupon_id : newItem.course_id}
                                            onChange={e => newItem.type === 'coupon' ? setNewItem({ ...newItem, coupon_id: e.target.value }) : setNewItem({ ...newItem, course_id: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            {newItem.type === 'coupon' ? 'EXPIRY DATE' : 'SESSION CREDITS'}
                                        </label>
                                        <input
                                            required
                                            type={newItem.type === 'coupon' ? 'text' : 'number'}
                                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#C9A34E]/20 focus:border-[#C9A34E]/50 transition-all"
                                            value={newItem.type === 'coupon' ? newItem.expiry_date : newItem.sessions}
                                            onChange={e => newItem.type === 'coupon' ? setNewItem({ ...newItem, expiry_date: e.target.value }) : setNewItem({ ...newItem, sessions: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 border-t border-slate-100">
                            <button
                                type="submit"
                                className="w-full bg-[#0A1A2F] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl hover:scale-[1.02] transition-transform active:scale-95 flex items-center justify-center gap-3"
                            >
                                <i className="fas fa-plus-circle"></i> ADD TO INVENTORY
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

