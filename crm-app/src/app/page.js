'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import CustomerCard from '@/components/CustomerCard';
import StoreGrid from '@/components/StoreGrid';
import ProductModal from '@/components/ProductModal';
import Dashboard from '@/components/Dashboard';
import Orders from '@/components/Orders';
import Analytics from '@/components/Analytics';
import FacebookAds from '@/components/FacebookAds';
import Settings from '@/components/Settings';
import RegistrationModal from '@/components/RegistrationModal';
import LoginPage from '@/components/LoginPage';

export default function Home() {
    const [activeView, setActiveView] = useState('customers');
    const [customers, setCustomers] = useState([]);
    const [activeCustomer, setActiveCustomer] = useState(null);
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [cart, setCart] = useState([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);

    // Auth State
    const [currentUser, setCurrentUser] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [loginError, setLoginError] = useState('');

    // Load customers on mount
    useEffect(() => {
        loadEmployees();
    }, []);

    useEffect(() => {
        if (currentUser) {
            loadCustomers();
            loadProducts();
        }
    }, [currentUser]);

    async function loadEmployees() {
        try {
            const employeeIds = [
                { folder: 'em01', file: 'profile_e01' },
                { folder: 'e002', file: 'profile_e002' },
                { folder: 'e003', file: 'profile_e003' }
            ];
            const loaded = [];
            for (const emp of employeeIds) {
                try {
                    const res = await fetch(`/data/employee/${emp.folder}/${emp.file}.json`);
                    if (res.ok) {
                        const data = await res.json();
                        loaded.push({ id: emp.folder, ...data });
                    }
                } catch (e) {
                    console.log(`Could not load employee ${emp.folder}`);
                }
            }
            setEmployees(loaded);
        } catch (e) {
            console.error('Failed to load employees', e);
        }
    }

    function handleLogin(user) {
        if (user) {
            setCurrentUser(user);
            setLoginError('');
        } else {
            setLoginError('Invalid email or password');
        }
    }

    function handleLogout() {
        setCurrentUser(null);
        setActiveView('customers');
        setCart([]);
    }

    async function loadCustomers() {
        try {
            const apiUrl = `${window.location.origin}/api/customers`;
            console.log('Loading customers from:', apiUrl);
            const res = await fetch(apiUrl, { redirect: 'error' });
            console.log('Customer API response status:', res.status);
            if (res.ok) {
                const loaded = await res.json();
                // Ensure loaded is an array, not an error object
                if (Array.isArray(loaded)) {
                    console.log('Loaded', loaded.length, 'customers');
                    setCustomers(loaded);
                    if (loaded.length > 0) setActiveCustomer(loaded[0]);
                } else {
                    console.error('API returned non-array:', loaded);
                }
            } else {
                const text = await res.text();
                console.error('Failed to load customers, status:', res.status, 'body:', text);
            }
        } catch (e) {
            console.error('Failed to load customers', e);
            console.error('Error details:', e.name, e.message);
        }
    }

    async function saveCustomer(customer) {
        if (!customer.profile || !customer.intelligence) {
            console.error('Refusing to save incomplete customer object:', customer);
            return;
        }
        try {
            const res = await fetch(`${window.location.origin}/api/customers/${customer.customer_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customer)
            });
            if (!res.ok) throw new Error('Failed to update customer');
        } catch (e) {
            console.error('Failed to save customer', e);
        }
    }

    async function loadProducts() {
        try {
            const res = await fetch('/data/catalog.json');
            const catalog = await res.json();
            const allProducts = [
                ...catalog.packages.map(p => ({ ...p, type: 'bundle' })),
                ...catalog.products.map(p => ({ ...p, type: 'course' }))
            ];
            setProducts(allProducts);
        } catch (e) {
            console.error('Failed to load products', e);
        }
    }

    useEffect(() => {
        if (activeView === 'store') {
            loadProducts();
        }
    }, [activeView]);

    function addToCart(product) {
        const productSignature = product.type === 'bundle'
            ? JSON.stringify({
                id: product.id,
                swapped: product.swappedCourses || {},
                free: (product.selectedFreeCourses || []).sort()
            })
            : product.id;
        const existing = cart.find(c => {
            const cSignature = c.type === 'bundle'
                ? JSON.stringify({
                    id: c.id,
                    swapped: c.swappedCourses || {},
                    free: (c.selectedFreeCourses || []).sort()
                })
                : c.id;
            return cSignature === productSignature;
        });

        if (existing) {
            setCart(cart.map(c => {
                const cSignature = c.type === 'bundle'
                    ? JSON.stringify({
                        id: c.id,
                        swapped: c.swappedCourses || {},
                        free: (c.selectedFreeCourses || []).sort()
                    })
                    : c.id;
                return cSignature === productSignature
                    ? { ...c, qty: c.qty + 1 }
                    : c;
            }));
        } else {
            setCart([...cart, { ...product, qty: 1 }]);
        }
    }

    async function handleRegisterCustomer(newCustomer) {
        setCustomers([...customers, newCustomer]);
        setActiveCustomer(newCustomer);
        setIsRegistrationOpen(false);

        // Persist to disk
        await saveCustomer(newCustomer);

        alert(`Customer ${newCustomer.customer_id} registered successfully!`);
    }


    const handleCheckout = async (slipData = null) => {
        if (!activeCustomer) {
            alert("Please select a customer first!");
            return;
        }

        const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const currentBalance = activeCustomer.wallet?.balance || 0;

        // Wallet Logic: Check if balance is sufficient
        if (currentBalance < cartTotal) {
            alert(`Insufficient Wallet Balance! (Have: ฿${currentBalance.toLocaleString()}, Need: ฿${cartTotal.toLocaleString()})`);
            return;
        }

        const newInventoryItems = [];
        const timestamp = new Date().toISOString().split('T')[0];

        cart.forEach(item => {
            for (let i = 0; i < item.qty; i++) {
                if (item.type === 'bundle' || item.type === 'package') {
                    const bundleItems = [];
                    if (item.courses) {
                        item.courses.forEach(cId => {
                            const targetId = item.swappedCourses && item.swappedCourses[cId]
                                ? item.swappedCourses[cId].id
                                : cId;
                            const course = products.find(p => p.id === targetId);
                            if (course) {
                                bundleItems.push({
                                    name: course.name,
                                    course_id: course.id,
                                    description: targetId !== cId ? `Customized (Swapped)` : course.description,
                                    type: 'course',
                                    purchase_date: timestamp,
                                    status: 'Active',
                                    credits_remaining: { sessions: course.duration ? Math.ceil(course.duration / 3) : 1 },
                                    is_bundle_item: true
                                });
                            }
                        });
                    }
                    const freeCourseIds = item.selectedFreeCourses && item.selectedFreeCourses.length > 0
                        ? item.selectedFreeCourses
                        : (item.free_courses || []);
                    freeCourseIds.forEach(cId => {
                        const course = products.find(p => p.id === cId);
                        if (course) {
                            bundleItems.push({
                                name: course.name + " (Bonus)",
                                course_id: course.id,
                                description: "Bonus Course",
                                type: 'course',
                                purchase_date: timestamp,
                                status: 'Active',
                                credits_remaining: { sessions: 1 },
                                is_bonus: true,
                                is_bundle_item: true
                            });
                        }
                    });
                    newInventoryItems.push({
                        name: item.name,
                        bundle_id: item.id,
                        description: "Package License",
                        type: 'bundle',
                        purchase_date: timestamp,
                        status: 'Active',
                        items: bundleItems
                    });
                } else {
                    newInventoryItems.push({
                        name: item.name,
                        course_id: item.id,
                        description: item.description,
                        type: 'course',
                        purchase_date: timestamp,
                        status: 'Active',
                        credits_remaining: { sessions: 1 }
                    });
                }
            }
        });

        const timelineEntry = {
            date: new Date().toISOString(),
            type: 'ORDER',
            icon: 'fas fa-shopping-bag',
            title: `Order #${Math.floor(Math.random() * 90000) + 10000}`,
            details: {
                total: cartTotal,
                items: cart.map(item => `${item.qty}x ${item.name}`)
            }
        };

        const updatedCustomers = customers.map(c => {
            if (c.customer_id === activeCustomer.customer_id) {
                const updatedTotalSpend = (c.intelligence?.metrics?.total_spend || 0) + cartTotal;
                const newBalance = (c.wallet?.balance || 0) - cartTotal;
                return {
                    ...c,
                    wallet: {
                        ...c.wallet,
                        balance: newBalance
                    },
                    inventory: {
                        ...c.inventory,
                        learning_courses: [
                            ...(c.inventory?.learning_courses || []),
                            ...newInventoryItems
                        ]
                    },
                    timeline: [timelineEntry, ...(c.timeline || [])],
                    intelligence: {
                        ...c.intelligence,
                        metrics: {
                            ...c.intelligence?.metrics,
                            total_spend: updatedTotalSpend
                        }
                    }
                };
            }
            return c;
        });

        setCustomers(updatedCustomers);
        const newActive = updatedCustomers.find(c => c.customer_id === activeCustomer.customer_id);
        setActiveCustomer(newActive);

        // Persist to disk
        if (newActive) {
            await saveCustomer(newActive);
        }

        setCart([]);
        setIsCartOpen(false);
        setActiveView('inventory');
        alert(`Checkout successful! ฿${cartTotal.toLocaleString()} deducted from wallet.`);
    };


    const nextCustomerId = `c${String(customers.length + 1).padStart(3, '0')}`;

    // Calculate Next Member ID (MEM-YYYY-XXXX)
    const currentYear = new Date().getFullYear();
    const maxMemberId = customers.reduce((max, c) => {
        const mid = c.profile?.member_id;
        if (mid && mid.startsWith(`MEM-${currentYear}-`)) {
            const num = parseInt(mid.split('-')[2]);
            return num > max ? num : max;
        }
        return max;
    }, 0);
    const nextMemberId = `MEM-${currentYear}-${String(maxMemberId + 1).padStart(4, '0')}`;

    const cartItemCount = cart.reduce((sum, item) => sum + item.qty, 0);
    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Show login page if not authenticated
    if (!currentUser) {
        return (
            <LoginPage
                onLogin={handleLogin}
                employees={employees}
                error={loginError}
            />
        );
    }

    return (
        <div className="flex h-screen bg-slate-900 overflow-hidden">
            {/* Sidebar */}
            <Sidebar
                activeView={activeView}
                onViewChange={setActiveView}
                cartCount={cartItemCount}
                currentUser={currentUser}
                onLogout={handleLogout}
            />

            {/* Main Content */}
            <main className="flex-1 overflow-auto p-10 md:p-16">
                {activeView === 'dashboard' && (
                    <Dashboard
                        customers={customers}
                        products={products}
                        onRefresh={loadCustomers}
                    />
                )}

                {activeView === 'customers' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl font-black text-white tracking-tight">Customer Database</h1>
                                <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mt-1">TOTAL RECORDS: {customers.length}</p>
                            </div>
                            <button
                                onClick={() => setIsRegistrationOpen(true)}
                                className="bg-[#C9A34E] text-[#0A1A2F] px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-transform flex items-center gap-3 shadow-xl"
                            >
                                <i className="fas fa-user-plus"></i>
                                REGISTER NEW CUSTOMER
                            </button>
                        </div>
                        {activeCustomer ? (
                            <CustomerCard
                                customer={activeCustomer}
                                customers={customers}
                                onSelectCustomer={setActiveCustomer}
                                currentUser={currentUser}
                                onUpdateInventory={(updatedCustomer) => {
                                    setCustomers(customers.map(c => c.customer_id === updatedCustomer.customer_id ? updatedCustomer : c));
                                    setActiveCustomer(updatedCustomer);
                                    saveCustomer(updatedCustomer);
                                }}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-white/40">
                                <i className="fas fa-spinner fa-spin text-4xl mb-4"></i>
                                <p className="text-sm font-bold uppercase tracking-widest">Loading customer data...</p>
                            </div>
                        )}
                    </div>
                )}

                {activeView === 'store' && (
                    <StoreGrid
                        products={products}
                        allProducts={products}
                        activeCustomer={activeCustomer}
                        onSelectProduct={setSelectedProduct}
                        onAddToCart={addToCart}
                        cart={cart}
                        setCart={setCart}
                        onCheckout={handleCheckout}
                        isCartOpen={isCartOpen}
                        setIsCartOpen={setIsCartOpen}
                    />
                )}

                {activeView === 'orders' && (
                    <Orders customers={customers} />
                )}

                {activeView === 'analytics' && (
                    <Analytics
                        customers={customers}
                        orders={[]} // Passing empty orders for now as they are not fully implemented in global state
                        products={products}
                        onRefresh={loadCustomers}
                    />
                )}

                {activeView === 'facebook-ads' && (
                    <FacebookAds />
                )}

                {activeView === 'settings' && (
                    <Settings />
                )}

                {activeView === 'inventory' && activeCustomer && (
                    <div className="space-y-6">
                        <h1 className="text-3xl font-black text-white tracking-tight">Inventory Management</h1>
                        <CustomerCard
                            customer={activeCustomer}
                            customers={customers}
                            onSelectCustomer={setActiveCustomer}
                            currentUser={currentUser}
                            onUpdateInventory={(updatedCustomer) => {
                                setCustomers(customers.map(c => c.customer_id === updatedCustomer.customer_id ? updatedCustomer : c));
                                setActiveCustomer(updatedCustomer);
                                saveCustomer(updatedCustomer);
                            }}
                        />
                    </div>
                )}
            </main>

            {/* Modals & Overlays */}
            {activeView === 'store' && (
                <div className={`fixed inset-y-0 right-0 w-96 bg-white shadow-2xl transform transition-transform duration-300 z-50 ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="h-full flex flex-col">
                        <div className="p-6 bg-[#0A1A2F] text-white flex justify-between items-center">
                            <h2 className="text-xl font-black">Shopping Cart</h2>
                            <button onClick={() => setIsCartOpen(false)} className="text-white/60 hover:text-white">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {cart.length === 0 ? (
                                <p className="text-center text-slate-400 mt-10">Your cart is empty.</p>
                            ) : (
                                cart.map((item, index) => (
                                    <div key={index} className="flex justify-between items-start border-b border-slate-100 pb-4">
                                        <div>
                                            <p className="font-bold text-slate-800">{item.name}</p>
                                            <p className="text-xs text-slate-500">Qty: {item.qty}</p>
                                        </div>
                                        <p className="font-black text-slate-800">฿{(item.price * item.qty).toLocaleString()}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-200">
                            <div className="flex justify-between items-center mb-4">
                                <span className="font-bold text-slate-600">Total</span>
                                <span className="text-2xl font-black text-[#0A1A2F]">฿{cartTotal.toLocaleString()}</span>
                            </div>
                            <button
                                onClick={() => handleCheckout()}
                                disabled={cart.length === 0}
                                className="w-full bg-[#C9A34E] text-[#0A1A2F] py-4 rounded-xl font-black uppercase tracking-widest hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Checkout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cart Toggle Button (Floating) */}
            {activeView === 'store' && !isCartOpen && (
                <button
                    onClick={() => setIsCartOpen(true)}
                    className="fixed bottom-8 right-8 w-16 h-16 bg-[#0A1A2F] text-white rounded-full shadow-2xl flex items-center justify-center z-40 hover:scale-110 transition-transform"
                >
                    <div className="relative">
                        <i className="fas fa-shopping-cart text-xl"></i>
                        {cartItemCount > 0 && (
                            <span className="absolute -top-3 -right-3 w-6 h-6 bg-[#C9A34E] text-[#0A1A2F] text-xs font-black rounded-full flex items-center justify-center">
                                {cartItemCount}
                            </span>
                        )}
                    </div>
                </button>
            )}

            <ProductModal
                product={selectedProduct}
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                onAddToCart={(p) => {
                    addToCart(p);
                    setSelectedProduct(null);
                }}
            />

            <RegistrationModal
                isOpen={isRegistrationOpen}
                onClose={() => setIsRegistrationOpen(false)}
                onRegister={handleRegisterCustomer}
                nextId={nextCustomerId}
                nextMemberId={nextMemberId}
            />
        </div>
    );
}
