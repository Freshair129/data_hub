'use client';

export default function StoreGrid({ products, allProducts, activeCustomer, onSelectProduct, onAddToCart, cart, setCart, onCheckout, isCartOpen, setIsCartOpen }) {
    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

    function removeFromCart(productId, type) {
        setCart(cart.filter(c => !(c.id === productId && c.type === type)));
    }

    return (
        <div className="animate-fade-in relative min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Course Store</h2>
                    <p className="text-slate-500">Shopee-style Product Catalog</p>
                </div>
                {activeCustomer && activeCustomer.name && (
                    <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
                        <div className="text-right hidden md:block">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Shopping For</p>
                            <p className="text-sm font-black text-slate-800">{activeCustomer.name}</p>
                        </div>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md ${activeCustomer.level === 'Elite' ? 'bg-gradient-to-br from-cyan-400 to-blue-600' :
                            activeCustomer.level === 'Platinum' ? 'bg-gradient-to-br from-slate-300 to-slate-500' :
                                'bg-gradient-to-br from-amber-400 to-orange-500'
                            }`}>
                            {activeCustomer.name.charAt(0)}
                        </div>
                    </div>
                )}
            </div>

            {/* Product Grid - Full Width now */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xxl:grid-cols-5 gap-4">
                {products.filter(p => p).map((product) => {
                    const hasDiscount = product.base_price && product.base_price > product.price;
                    const discountPercent = hasDiscount
                        ? Math.round(((product.base_price - product.price) / product.base_price) * 100)
                        : 0;

                    // Check ownership (recursive for bundles)
                    const isOwned = activeCustomer?.inventory?.learning_courses?.some(item => {
                        // 1. Direct match (Stand-alone Course or Bundle Header)
                        if (item.course_id === product.id || item.bundle_id === product.id) return true;

                        // 2. Nested match (Course inside a Bundle)
                        if (item.type === 'bundle' && item.items) {
                            return item.items.some(subItem => subItem.course_id === product.id);
                        }
                        return false;
                    });

                    return (
                        <div
                            key={`${product.type}-${product.id}`}
                            onClick={() => onSelectProduct(product)}
                            className={`bg-white rounded-xl overflow-hidden border transition-all duration-500 cursor-pointer group flex flex-col h-full ${isOwned
                                ? 'border-slate-200 opacity-80 hover:opacity-100 grayscale hover:grayscale-0'
                                : 'border-slate-200 hover:border-orange-400 hover:shadow-2xl hover:-translate-y-2'
                                }`}
                        >
                            {/* Image Section */}
                            <div className="aspect-[4/5] bg-slate-50 relative overflow-hidden">
                                <img
                                    src={product.image || 'https://via.placeholder.com/400?text=V+School'}
                                    alt={product.name}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                                />

                                {/* Badges container */}
                                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${product.type === 'bundle'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white/90 backdrop-blur-sm text-slate-700 shadow-sm'
                                        }`}>
                                        {product.type === 'bundle' ? 'Package' : 'Course'}
                                    </div>

                                    {isOwned && (
                                        <div className="bg-green-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm flex items-center gap-1">
                                            <i className="fas fa-check-circle"></i> OWNED
                                        </div>
                                    )}

                                    {!isOwned && hasDiscount && (
                                        <div className="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm animate-pulse">
                                            SAVE {discountPercent}%
                                        </div>
                                    )}
                                </div>

                                {/* Quick View Overlay (appears on hover) */}
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                    <div className="bg-white text-orange-600 px-4 py-2 rounded-full font-bold text-xs shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                        VIEW DETAILS
                                    </div>
                                </div>
                            </div>

                            {/* Info Section */}
                            <div className="p-4 flex-1 flex flex-col">
                                <h3 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2 h-10 mb-3 group-hover:text-orange-600 transition-colors">
                                    {product.name}
                                </h3>

                                <div className="mt-auto">
                                    {/* Price Row */}
                                    <div className="flex flex-col mb-2">
                                        {hasDiscount && (
                                            <span className="text-[11px] text-slate-400 line-through">
                                                ฿{product.base_price.toLocaleString()}
                                            </span>
                                        )}
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-orange-600 font-extrabold text-lg">
                                                ฿{(product.price || 0).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Footer Row (Rating + Sold count feel) */}
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                        <div className="flex items-center gap-1">
                                            <div className="flex text-amber-400 text-[10px]">
                                                <i className="fas fa-star"></i>
                                                <i className="fas fa-star"></i>
                                                <i className="fas fa-star"></i>
                                                <i className="fas fa-star"></i>
                                                <i className="fas fa-star"></i>
                                            </div>
                                            <span className="text-[10px] font-medium text-slate-400">5.0</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            1.2k+ Sold
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {products.length === 0 && (
                    <div className="text-center py-20 text-slate-400 col-span-full">
                        <i className="fas fa-box-open text-4xl mb-4"></i>
                        <p>Loading products...</p>
                    </div>
                )}
            </div>

            {/* Floating Cart Button */}
            <button
                onClick={() => setIsCartOpen(true)}
                className="fixed bottom-10 right-10 w-16 h-16 bg-gradient-to-tr from-orange-600 to-amber-500 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 z-50 group"
            >
                <i className="fas fa-shopping-cart text-2xl group-hover:animate-bounce"></i>
                {cartItemCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white animate-bounce-short">
                        {cartItemCount}
                    </span>
                )}
            </button>

            {/* Cart Popup Overlay */}
            {isCartOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-end animate-fade-in">
                    <div
                        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        onClick={() => setIsCartOpen(false)}
                    ></div>

                    <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col p-6 animate-slide-in-right border-l border-slate-200">
                        {/* Cart Header */}
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                                    <i className="fas fa-shopping-bag text-xl"></i>
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-800 text-xl tracking-tight">Shopping Cart</h3>
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{cartItemCount} items selected</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCartOpen(false)}
                                className="w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {/* Mini Profile Section */}
                        {activeCustomer && (
                            <div className="mb-6 p-4 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl text-white shadow-xl relative overflow-hidden border border-white/10">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>

                                <div className="relative z-10 flex items-center gap-4">
                                    {/* Avatar */}
                                    <div className="relative">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-inner overflow-hidden border-2 border-white/20 ${activeCustomer.profile?.membership_tier === 'GOLD' ? 'bg-gradient-to-tr from-amber-400 to-yellow-600' :
                                            activeCustomer.profile?.membership_tier === 'SILVER' ? 'bg-gradient-to-tr from-slate-300 to-slate-400' :
                                                'bg-gradient-to-tr from-cyan-400 to-blue-600'
                                            }`}>
                                            {activeCustomer.profile?.profile_picture ? (
                                                <img src={activeCustomer.profile.profile_picture} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <span>{(activeCustomer.profile?.nick_name || activeCustomer.profile?.first_name || 'C').charAt(0)}</span>
                                            )}
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-slate-800"></div>
                                    </div>

                                    {/* Name & Tier */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-lg leading-tight">
                                                {activeCustomer.profile?.nick_name || activeCustomer.profile?.first_name || 'Customer'}
                                            </p>
                                            <span className="bg-white/10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter border border-white/5">
                                                {activeCustomer.profile?.membership_tier || 'MEMBER'}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-white/40 font-mono tracking-tight mt-1">{activeCustomer.customer_id}</p>
                                    </div>

                                    {/* Wallet Summary */}
                                    <div className="text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest leading-none">Wallet</span>
                                            <span className="text-sm font-black text-white">฿{(activeCustomer.wallet?.balance || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 justify-end">
                                            <i className="fas fa-coins text-[8px] text-amber-400"></i>
                                            <span className="text-[10px] font-bold text-white/60">{(activeCustomer.intelligence?.metrics?.total_point || activeCustomer.wallet?.points || 0).toLocaleString()} <span className="text-[8px] opacity-40">pts</span></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cart Content */}
                        {cart.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                                    <i className="fas fa-shopping-basket text-4xl opacity-20"></i>
                                </div>
                                <p className="font-bold">Your cart is empty</p>
                                <button
                                    onClick={() => setIsCartOpen(false)}
                                    className="text-orange-600 text-sm font-black hover:underline"
                                >
                                    CONTINUE SHOPPING
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
                                    {cart.map((item, idx) => {
                                        let breakdown = [];
                                        let packageValue = 0;

                                        if (item.type === 'bundle' && item.courses && allProducts) {
                                            // 1. Standard / Swapped courses
                                            item.courses.forEach(cId => {
                                                // Check for swap
                                                const targetId = item.swappedCourses && item.swappedCourses[cId]
                                                    ? item.swappedCourses[cId].id
                                                    : cId;

                                                const course = allProducts.find(p => p.id === targetId);

                                                if (course) {
                                                    const isSwapped = targetId !== cId;
                                                    breakdown.push({
                                                        id: course.id,
                                                        name: course.name,
                                                        price: course.price,
                                                        isSwapped: isSwapped
                                                    });
                                                    packageValue += (course.price || 0);
                                                }
                                            });

                                            // 2. Free Courses (Selected or Default)
                                            const freeCourseIds = item.selectedFreeCourses && item.selectedFreeCourses.length > 0
                                                ? item.selectedFreeCourses
                                                : (item.free_courses || []);

                                            freeCourseIds.forEach(cId => {
                                                const course = allProducts.find(p => p.id === cId);
                                                if (course) {
                                                    breakdown.push({ id: course.id, name: course.name + " (Free)", price: course.price, isFree: true });
                                                    packageValue += (course.price || 0);
                                                }
                                            });
                                        }

                                        const discount = item.type === 'bundle' ? packageValue - item.price : 0;

                                        return (
                                            <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-all hover:bg-white hover:shadow-lg">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${(item.type === 'bundle' || item.type === 'package') ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-600'}`}>
                                                                {(item.type === 'bundle' || item.type === 'package') ? 'Package' : 'Course'}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm font-black text-slate-800 leading-tight mb-2">{item.name}</p>
                                                        <p className="text-xs text-slate-400 font-bold">
                                                            {item.qty} × <span className="text-orange-600">฿{item.price?.toLocaleString()}</span>
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => removeFromCart(item.id, item.type)}
                                                        className="w-8 h-8 bg-white text-slate-300 hover:text-red-500 hover:shadow-md rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <i className="fas fa-trash-alt text-xs"></i>
                                                    </button>
                                                </div>

                                                {(item.type === 'bundle' || item.type === 'package') && breakdown.length > 0 && (
                                                    <div className="mt-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Package Contents</p>

                                                        <div className="space-y-2 mb-4">
                                                            {breakdown.map((c, i) => (
                                                                <div key={i} className="flex justify-between items-start text-[11px]">
                                                                    <span className={`font-bold leading-tight flex-1 pr-4 ${c.isSwapped ? "text-blue-600" : c.isFree ? "text-slate-500" : "text-slate-600"}`}>
                                                                        {c.name} {c.isFree && "(Free)"}
                                                                    </span>
                                                                    <span className="font-mono text-slate-400 whitespace-nowrap">฿{c.price?.toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <div className="pt-3 border-t border-slate-50 space-y-1">
                                                            <div className="text-right">
                                                                <span className="text-xs font-mono text-slate-400">{packageValue.toLocaleString()}</span>
                                                            </div>

                                                            <div className="flex justify-between items-center text-green-600 font-bold">
                                                                <span className="text-[10px] uppercase tracking-widest">Bundle Savings</span>
                                                                <span className="text-sm font-mono">-฿{discount.toLocaleString()}</span>
                                                            </div>

                                                            <div className="flex justify-end pt-1">
                                                                <span className="text-lg font-black text-slate-800 font-mono">฿{item.price?.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 p-6 bg-[#0A1A2F] rounded-3xl text-white shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>

                                    <div className="relative z-10 space-y-4">
                                        {/* Slip Upload Area (Mockup for Admin) */}
                                        <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Payment Evidence (Slip)</p>
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1 h-12 bg-white/5 border border-dashed border-white/20 rounded-xl flex items-center justify-center text-[10px] font-bold text-white/30 truncate px-4">
                                                    <i className="fas fa-file-upload mr-2"></i>
                                                    DRAG SLIP OR CLICK TO BROWSE
                                                </div>
                                                <button
                                                    onClick={() => alert("Slip upload simulation triggered.")}
                                                    className="w-12 h-12 bg-[#C9A34E] text-[#0A1A2F] rounded-xl flex items-center justify-center shadow-lg"
                                                >
                                                    <i className="fas fa-camera"></i>
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center px-4">
                                            <span className="text-white/60 font-black uppercase tracking-widest text-xs">Final Amount</span>
                                            <span className="text-3xl font-black text-orange-400">฿{cartTotal.toLocaleString()}</span>
                                        </div>

                                        <button
                                            onClick={() => onCheckout({ slip_url: '/assets/slips/mock-slip.jpg' })}
                                            className="w-full bg-orange-500 hover:bg-orange-400 text-white py-4 rounded-xl font-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3 group"
                                        >
                                            <span>COMPLETE & ATTACH SLIP</span>
                                            <i className="fas fa-arrow-right text-xs transition-transform group-hover:translate-x-1"></i>
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
