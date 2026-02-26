'use client';

import { useState, useEffect } from 'react';

export default function EmployeeManagement({ employees, customers = [], onRefresh, currentUser }) {
    const [search, setSearch] = useState('');
    const [filterDept, setFilterDept] = useState('All');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [activeMetricDetail, setActiveMetricDetail] = useState(null); // null, 'sales', 'customers'

    const filteredEmployees = employees.filter(emp => {
        const name = `${emp.firstName} ${emp.lastName} ${emp.nickName || ''}`.toLowerCase();
        const matchesSearch = name.includes(search.toLowerCase());
        const matchesDept = filterDept === 'All' || emp.department === filterDept;
        return matchesSearch && matchesDept;
    });

    const departments = ['All', ...new Set(employees.map(e => e.department))];

    const permissionKeys = [
        { key: 'is_admin', label: 'Administrator Access' },
        { key: 'can_access_all', label: 'Full Data Access' },
        { key: 'can_manage_orders', label: 'Manage Orders' },
        { key: 'can_edit_inventory', label: 'Edit Inventory' },
        { key: 'can_manage_customers', label: 'Manage Customers' },
        { key: 'can_manage_employees', label: 'Manage Employees' },
        { key: 'can_manage_analytics', label: 'Manage Analytics' },
        { key: 'can_broadcast_message', label: 'Broadcast Messages' },
    ];

    const canManageEmployees = currentUser?.role === 'Developer' || currentUser?.permissions?.can_manage_employees || currentUser?.permissions?.can_access_all;

    const handleEditToggle = () => {
        if (!isEditing) {
            setEditForm({ ...selectedEmployee });
        }
        setIsEditing(!isEditing);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`/api/employees/${selectedEmployee.employeeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });
            const result = await res.json();
            if (result.success) {
                onRefresh();
                setSelectedEmployee(result.data);
                setIsEditing(false);
            }
        } catch (err) {
            console.error('Save failed:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (emp) => {
        if (!emp) return;

        const confirmed = window.confirm(`Are you sure you want to delete ${emp.firstName} ${emp.lastName}? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            const res = await fetch(`/api/employees/${emp.employeeId}`, {
                method: 'DELETE'
            });
            const result = await res.json();
            if (result.success) {
                onRefresh();
                setSelectedEmployee(null);
                setIsEditing(false);
            } else {
                alert(`Delete failed: ${result.error}`);
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('An error occurred while deleting the employee.');
        }
    };

    const getLinkedData = (emp) => {
        if (!emp) return { assignedCustomers: [], sales: [] };

        const nick = emp.nickName || emp.firstName;
        const full = `${emp.firstName} ${emp.lastName}`;
        const facebook = emp.facebookName;
        const aliases = emp.metadata?.aliases || [];
        const nameKeys = [nick, full, emp.firstName, facebook, ...aliases].filter(Boolean);

        const assignedCustomers = customers.filter(c => {
            const agent = c.agent || c.intelligence?.agent || 'Unassigned';
            return nameKeys.includes(agent);
        });

        const sales = assignedCustomers.flatMap(c => {
            // Check both customer.orders and check if there are orders in timeline
            const orderList = c.orders || [];
            const timelineOrders = (c.timeline || [])
                .filter(t => t.type === 'ORDER')
                .map(t => ({
                    orderId: t.title,
                    date: t.date,
                    totalAmount: t.details?.total || 0,
                    status: t.details?.status || 'Completed',
                    items: t.details?.items || []
                }));

            // Merge and avoid duplicates by orderId if possible
            const seen = new Set();
            return [...orderList, ...timelineOrders].filter(o => {
                const id = o.orderId || o.id;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        });

        return { assignedCustomers, sales };
    };

    return (
        <>
            <div className="animate-fade-in space-y-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h2 className="text-3xl font-black text-[#F8F8F6] tracking-tight mb-2">Employee Directory</h2>
                        <p className="text-white/40 text-sm font-bold uppercase tracking-[0.2em]">TALENT & TEAM MANAGEMENT</p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="relative group">
                            <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[#C9A34E] transition-colors"></i>
                            <input
                                type="text"
                                placeholder="Search name, nickname..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-white/5 border border-white/10 text-white pl-12 pr-6 py-3 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#C9A34E]/50 focus:bg-white/10 transition-all w-64"
                            />
                        </div>

                        <select
                            value={filterDept}
                            onChange={(e) => setFilterDept(e.target.value)}
                            className="bg-white/5 border border-white/10 text-white px-6 py-3 rounded-2xl text-xs font-bold focus:outline-none hover:bg-white/10 transition-all min-w-[150px]"
                        >
                            {departments.map(dept => (
                                <option key={dept} value={dept} className="bg-[#0A1A2F]">{dept}</option>
                            ))}
                        </select>

                        <button
                            className="bg-[#C9A34E] hover:bg-amber-400 text-[#0A1A2F] px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-[#C9A34E]/20 active:scale-95"
                        >
                            <i className="fas fa-user-plus mr-2"></i> Add Employee
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredEmployees.map((emp) => (
                        <div key={emp.employeeId} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group hover:border-[#C9A34E]/30 hover:bg-white/[0.07] transition-all duration-500 relative">
                            {/* Status Badge */}
                            <div className="absolute top-6 right-6 z-10">
                                <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${emp.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                    }`}>
                                    {emp.status}
                                </span>
                            </div>

                            {/* Top Accent Area */}
                            <div className="h-24 bg-gradient-to-br from-slate-800 to-slate-900 relative">
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>

                            {/* Profile Content */}
                            <div className="px-8 pb-8 -mt-12 relative z-10">
                                <div className="flex justify-center mb-6">
                                    <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-[#C9A34E] to-amber-700 p-1 shadow-2xl rotate-[-4deg] group-hover:rotate-0 transition-transform duration-500">
                                        <div className="w-full h-full rounded-[1.8rem] bg-slate-900 overflow-hidden flex items-center justify-center border-2 border-white/10 font-black text-3xl text-white">
                                            {emp.profilePicture ? (
                                                <img src={emp.profilePicture} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span>{emp.firstName.charAt(0)}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-center mb-8">
                                    <h3 className="font-black text-white text-xl tracking-tight mb-1">
                                        {emp.firstName} {emp.lastName}
                                    </h3>
                                    {emp.nickName && (
                                        <p className="text-[10px] text-[#C9A34E] font-black uppercase tracking-[0.2em] mb-3">({emp.nickName})</p>
                                    )}
                                    <div className="inline-block px-4 py-1.5 bg-white/5 rounded-xl border border-white/5 text-[10px] font-bold text-white/60">
                                        {emp.role} • {emp.department}
                                    </div>
                                </div>

                                <div className="space-y-3 mb-8">
                                    <div className="flex items-center gap-4 text-xs">
                                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/20">
                                            <i className="fas fa-envelope"></i>
                                        </div>
                                        <span className="text-white/60 font-medium truncate">{emp.email}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/20">
                                            <i className="fas fa-phone"></i>
                                        </div>
                                        <span className="text-white/60 font-medium">{emp.phonePrimary || 'Not specified'}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/20">
                                            <i className="fab fa-line"></i>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">Line Handle</span>
                                            <span className="text-white/60 font-medium">{emp.lineName || emp.lineId || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs">
                                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/20">
                                            <i className="fab fa-facebook-f"></i>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-white/20 font-black uppercase tracking-widest">FB Name (Agent Id)</span>
                                            <span className="text-white/60 font-medium">{emp.facebookName || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setSelectedEmployee(emp)}
                                        className="flex-1 bg-white/5 hover:bg-white/10 text-white/80 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] border border-white/5 transition-all"
                                    >
                                        View Details
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedEmployee(emp);
                                            setIsEditing(true);
                                            setEditForm({ ...emp });
                                        }}
                                        className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] border border-white/10 transition-all"
                                    >
                                        Edit Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredEmployees.length === 0 && (
                        <div className="col-span-full py-20 text-center bg-white/5 rounded-[2.5rem] border-2 border-dashed border-white/10">
                            <i className="fas fa-user-slash text-4xl text-white/10 mb-4"></i>
                            <p className="text-white/40 font-black uppercase tracking-widest">No employees found matching your criteria</p>
                        </div>
                    )}
                </div>

                {/* Detail Modal */}
                {selectedEmployee && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-[#0A1A2F]/80 backdrop-blur-md" onClick={() => setSelectedEmployee(null)}></div>
                        <div className="relative bg-gradient-to-br from-[#1A2F4F] to-[#0A1A2F] border border-white/10 w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-scale-up">
                            <button
                                onClick={() => {
                                    setSelectedEmployee(null);
                                    setIsEditing(false);
                                    setActiveMetricDetail(null);
                                }}
                                className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"
                            >
                                <i className="fas fa-times text-2xl"></i>
                            </button>

                            <div className="p-12">
                                <div className="flex flex-col md:flex-row gap-10 items-start">
                                    <div className="w-40 h-40 rounded-[2.5rem] bg-[#C9A34E] p-1 flex-shrink-0">
                                        <div className="w-full h-full rounded-[2.3rem] bg-slate-900 overflow-hidden flex items-center justify-center border-2 border-white/10 font-black text-5xl text-white">
                                            {selectedEmployee.profilePicture ? (
                                                <img src={selectedEmployee.profilePicture} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span>{selectedEmployee.firstName.charAt(0)}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 w-full text-left">
                                        {!isEditing ? (
                                            <>
                                                <h3 className="text-4xl font-black text-white mb-2 leading-none">
                                                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                                                </h3>
                                                <p className="text-[#C9A34E] text-lg font-black uppercase tracking-[0.2em] mb-6">
                                                    {selectedEmployee.nickName ? `(${selectedEmployee.nickName})` : ''}
                                                </p>

                                                <div className="grid grid-cols-2 gap-6 mb-10">
                                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Position</p>
                                                        <p className="text-sm font-bold text-white">{selectedEmployee.role}</p>
                                                    </div>
                                                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Department</p>
                                                        <p className="text-sm font-bold text-white">{selectedEmployee.department}</p>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-6 mb-10">
                                                <div className="col-span-1 space-y-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">First Name</label>
                                                    <input
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                        value={editForm.firstName || ''}
                                                        onChange={e => setEditForm({ ...editForm, firstName: e.target.value })}
                                                    />
                                                </div>
                                                <div className="col-span-1 space-y-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Last Name</label>
                                                    <input
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                        value={editForm.lastName || ''}
                                                        onChange={e => setEditForm({ ...editForm, lastName: e.target.value })}
                                                    />
                                                </div>
                                                <div className="col-span-1 space-y-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Nickname</label>
                                                    <input
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                        value={editForm.nickName || ''}
                                                        onChange={e => setEditForm({ ...editForm, nickName: e.target.value })}
                                                    />
                                                </div>
                                                <div className="col-span-1 space-y-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Department</label>
                                                    <input
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                        value={editForm.department || ''}
                                                        onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                                                    />
                                                </div>
                                                <div className="col-span-2 space-y-2">
                                                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Role</label>
                                                    <input
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                        value={editForm.role || ''}
                                                        onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[#C9A34E]"><i className="fas fa-envelope"></i></div>
                                                {!isEditing ? (
                                                    <div>
                                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Email</p>
                                                        <p className="text-sm text-white font-bold">{selectedEmployee.email}</p>
                                                    </div>
                                                ) : (
                                                    <input
                                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                        value={editForm.email || ''}
                                                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                                    />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[#C9A34E]"><i className="fab fa-line"></i></div>
                                                {!isEditing ? (
                                                    <div>
                                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Line Handle</p>
                                                        <p className="text-sm text-white font-bold">{selectedEmployee.lineName || selectedEmployee.lineId || 'N/A'}</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 space-y-1">
                                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Line Handle</p>
                                                        <input
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                            value={editForm.lineName || ''}
                                                            placeholder="Example: line_id_123"
                                                            onChange={e => setEditForm({ ...editForm, lineName: e.target.value })}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-[#C9A34E]"><i className="fab fa-facebook"></i></div>
                                                {!isEditing ? (
                                                    <div>
                                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Facebook Agent Name</p>
                                                        <p className="text-sm text-white font-bold">{selectedEmployee.facebookName || 'N/A'}</p>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 space-y-1">
                                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">Facebook Name (Must match Chat Assignment)</p>
                                                        <input
                                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white font-bold"
                                                            value={editForm.facebookName || ''}
                                                            placeholder="Example: Nuwat (V School)"
                                                            onChange={e => setEditForm({ ...editForm, facebookName: e.target.value })}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {isEditing && (
                                            <div className="mt-10 pt-10 border-t border-white/5">
                                                <h4 className="text-[10px] font-black text-[#C9A34E] uppercase tracking-[0.2em] mb-6">Permissions Control</h4>
                                                <div className="grid grid-cols-2 gap-4 text-left">
                                                    {permissionKeys.map(({ key, label }) => (
                                                        <label key={key} className="flex items-center gap-3 p-4 bg-white/5 border border-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all group">
                                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${editForm.permissions?.[key] ? 'bg-[#C9A34E] border-[#C9A34E]' : 'border-white/20'}`}>
                                                                {editForm.permissions?.[key] && <i className="fas fa-check text-[10px] text-[#0A1A2F]"></i>}
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                className="hidden"
                                                                checked={editForm.permissions?.[key] || false}
                                                                onChange={(e) => {
                                                                    setEditForm({
                                                                        ...editForm,
                                                                        permissions: {
                                                                            ...(editForm.permissions || {}),
                                                                            [key]: e.target.checked
                                                                        }
                                                                    });
                                                                }}
                                                            />
                                                            <span className="text-[10px] font-bold text-white/70 group-hover:text-white transition-colors uppercase tracking-widest">{label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-8 flex gap-4">
                                            {!isEditing ? (
                                                <>
                                                    <button
                                                        onClick={handleEditToggle}
                                                        className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                                                    >
                                                        <i className="fas fa-edit mr-2"></i> Edit Profile
                                                    </button>

                                                    {canManageEmployees && (
                                                        <button
                                                            onClick={() => handleDelete(selectedEmployee)}
                                                            className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-red-500/20 transition-all"
                                                        >
                                                            <i className="fas fa-trash-alt mr-2"></i> Delete Employee
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={handleSave}
                                                        disabled={isSaving}
                                                        className="bg-[#C9A34E] hover:bg-amber-400 text-[#0A1A2F] px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                                                    >
                                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                                    </button>
                                                    <button
                                                        onClick={handleEditToggle}
                                                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-12 pt-12 border-t border-white/5 relative">
                                    {activeMetricDetail && (
                                        <button
                                            onClick={() => setActiveMetricDetail(null)}
                                            className="absolute top-12 left-0 text-[10px] font-black text-[#C9A34E] uppercase tracking-widest flex items-center gap-2 hover:text-white transition-colors"
                                        >
                                            <i className="fas fa-arrow-left"></i> Back to Summary
                                        </button>
                                    )}

                                    {activeMetricDetail === null && (
                                        <div className="grid grid-cols-3 gap-6">
                                            <div
                                                onClick={() => setActiveMetricDetail('sales')}
                                                className="text-center p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-[#C9A34E]/30 cursor-pointer transition-all"
                                            >
                                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Total Sales</p>
                                                <p className="text-2xl font-black text-white">฿{selectedEmployee.performance?.metrics?.total_revenue_generated?.toLocaleString() || 0}</p>
                                                <p className="text-[8px] font-bold text-[#C9A34E] mt-1 opacity-0 group-hover:opacity-100 uppercase">Click for details</p>
                                            </div>
                                            <div
                                                onClick={() => setActiveMetricDetail('customers')}
                                                className="text-center p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-[#C9A34E]/30 cursor-pointer transition-all"
                                            >
                                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Customers</p>
                                                <p className="text-2xl font-black text-white">{selectedEmployee.performance?.metrics?.total_customers_registered || 0}</p>
                                                <p className="text-[8px] font-bold text-[#C9A34E] mt-1 opacity-0 group-hover:opacity-100 uppercase">Click for details</p>
                                            </div>
                                            <div className="text-center p-4 rounded-2xl bg-white/5 border border-white/5">
                                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Status</p>
                                                <p className="text-2xl font-black text-emerald-400">{selectedEmployee.status}</p>
                                            </div>
                                        </div>
                                    )}

                                    {activeMetricDetail === 'customers' && (
                                        <div className="pt-8 animate-fade-in">
                                            <h4 className="text-xs font-black text-white uppercase tracking-widest mb-6 border-l-4 border-[#C9A34E] pl-4">Assigned Customers</h4>
                                            <div className="max-h-60 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                                {getLinkedData(selectedEmployee).assignedCustomers.length > 0 ? (
                                                    getLinkedData(selectedEmployee).assignedCustomers.map(c => (
                                                        <div key={c.id} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                                                            <div>
                                                                <p className="text-sm font-bold text-white">{c.profile?.first_name} {c.profile?.last_name}</p>
                                                                <p className="text-[9px] text-white/40 uppercase tracking-widest">{c.customer_id}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xs font-black text-[#C9A34E]">฿{(c.intelligence?.metrics?.total_spend || 0).toLocaleString()}</p>
                                                                <p className="text-[9px] text-white/20 font-bold uppercase">{c.profile?.status || 'Active'}</p>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-white/20 text-center py-6 italic">No customers found for this name mapping</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {activeMetricDetail === 'sales' && (
                                        <div className="pt-8 animate-fade-in">
                                            <h4 className="text-xs font-black text-white uppercase tracking-widest mb-6 border-l-4 border-[#C9A34E] pl-4">Order History</h4>
                                            <div className="max-h-60 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                                {getLinkedData(selectedEmployee).sales.length > 0 ? (
                                                    getLinkedData(selectedEmployee).sales.sort((a, b) => new Date(b.date) - new Date(a.date)).map((s, idx) => (
                                                        <div key={idx} className="p-4 bg-white/5 rounded-2xl border border-white/5 group/order">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-[#C9A34E] uppercase tracking-widest">{s.orderId}</p>
                                                                    <p className="text-[9px] text-white/20 font-bold uppercase">{new Date(s.date).toLocaleDateString()}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-sm font-black text-white">฿{s.totalAmount?.toLocaleString()}</p>
                                                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${s.status === 'Completed' || s.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                                                                        }`}>
                                                                        {s.status}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="text-[9px] text-white/40 leading-relaxed italic">
                                                                {Array.isArray(s.items) ? s.items.join(', ') : 'Direct Item Purchase'}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-white/20 text-center py-6 italic">No recorded sales found</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
