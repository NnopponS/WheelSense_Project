import React from 'react';
import { useApp } from '../context/AppContext';
import {
    Activity, Map, Users, Cpu, Clock, Settings, Bot,
    Monitor, AlertTriangle, Home, MoreHorizontal, X, Accessibility,
    Calendar, Heart, Zap, Video
} from 'lucide-react';

export function Sidebar() {
    const { role, setRole, currentPage, setCurrentPage, sidebarOpen, setSidebarOpen, notifications, currentUser } = useApp();

    const unreadCount = notifications.filter(n => !n.read).length;

    const adminNav = [
        {
            section: 'หลัก', items: [
                { id: 'monitoring', label: 'Live Monitoring', icon: Activity },
                { id: 'map', label: 'Map & Zones', icon: Map },
            ]
        },
        {
            section: 'จัดการ', items: [
                { id: 'patients', label: 'Wheelchairs & Patients', icon: Users },
                { id: 'devices', label: 'Devices & Nodes', icon: Cpu },
            ]
        },
        {
            section: 'ติดตาม', items: [
                { id: 'timeline', label: 'Timeline & Alerts', icon: Clock, badge: unreadCount || null },
                { id: 'routines', label: 'Routines', icon: Calendar },
                { id: 'analytics', label: 'Analytics', icon: Activity },
            ]
        },
        {
            section: 'เครื่องมือ', items: [
                { id: 'appliances', label: 'Appliance Control', icon: Zap },
                { id: 'ai', label: 'AI Assistant', icon: Bot },
                { id: 'settings', label: 'Settings', icon: Settings },
            ]
        },
    ];

    const userNav = [
        {
            section: 'หลัก', items: [
                { id: 'user-home', label: 'หน้าแรก', icon: Home },
                { id: 'user-location', label: 'ตำแหน่งของฉัน', icon: Map },
            ]
        },
        {
            section: 'สุขภาพ', items: [
                { id: 'user-health', label: 'สุขภาพ', icon: Heart },
                { id: 'user-routines', label: 'ตารางของฉัน', icon: Calendar },
            ]
        },
        {
            section: 'ควบคุม', items: [
                { id: 'user-appliances', label: 'เครื่องใช้ไฟฟ้า', icon: Zap },
                { id: 'user-video', label: 'ดูกล้อง', icon: Video },
                { id: 'user-ai', label: 'ผู้ช่วย AI', icon: Bot },
            ]
        },
        {
            section: 'อื่นๆ', items: [
                { id: 'user-alerts', label: 'การแจ้งเตือน', icon: AlertTriangle, badge: unreadCount || null },
                { id: 'user-settings', label: 'ตั้งค่า', icon: Settings },
            ]
        },
    ];

    const navItems = role === 'admin' ? adminNav : userNav;

    return (
        <>
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }} />
            )}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''} ${role === 'user' ? 'user-mode' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">
                            <Accessibility />
                        </div>
                        <div className="sidebar-logo-text">
                            <h1>WheelSense</h1>
                            <span>{role === 'admin' ? 'Admin Panel' : 'User Portal'}</span>
                        </div>
                    </div>
                </div>

                <div className="role-switcher">
                    <button className={`role-btn ${role === 'admin' ? 'active' : ''}`} onClick={() => { setRole('admin'); setCurrentPage('monitoring'); }}>
                        Admin
                    </button>
                    <button className={`role-btn ${role === 'user' ? 'active' : ''}`} onClick={() => { setRole('user'); setCurrentPage('user-home'); }}>
                        User
                    </button>
                </div>

                {/* User profile for user mode */}
                {role === 'user' && (
                    <div style={{ padding: '0 1rem 1rem', display: 'block' }}>
                        <div style={{
                            background: 'linear-gradient(135deg, var(--primary-600), var(--primary-800))',
                            borderRadius: 'var(--radius-lg)', padding: '1rem', color: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: 40, height: 40, borderRadius: '50%',
                                    background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'var(--primary-600)', fontWeight: 600
                                }}>
                                    {currentUser.avatar}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{currentUser.name}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{currentUser.wheelchairId}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <nav className="sidebar-nav">
                    {navItems.map((section, idx) => (
                        <div key={idx} className="nav-section">
                            <span className="nav-section-title">{section.section}</span>
                            {section.items.map(item => (
                                <button
                                    key={item.id}
                                    className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                                    onClick={() => { setCurrentPage(item.id); setSidebarOpen(false); }}
                                    title={item.label}
                                >
                                    <item.icon />
                                    <span>{item.label}</span>
                                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
}

export function BottomNav() {
    const { currentPage, setCurrentPage, role, notifications } = useApp();
    const unreadCount = notifications.filter(n => !n.read).length;

    const adminItems = [
        { id: 'monitoring', label: 'Monitor', icon: Activity },
        { id: 'patients', label: 'Patients', icon: Users },
        { id: 'timeline', label: 'Alerts', icon: AlertTriangle, badge: unreadCount || null },
        { id: 'more', label: 'More', icon: MoreHorizontal },
    ];

    const userItems = [
        { id: 'user-home', label: 'หน้าแรก', icon: Home },
        { id: 'user-appliances', label: 'ควบคุม', icon: Zap },
        { id: 'user-routines', label: 'ตาราง', icon: Calendar },
        { id: 'more', label: 'อื่นๆ', icon: MoreHorizontal },
    ];

    const items = role === 'admin' ? adminItems : userItems;

    return (
        <nav className="bottom-nav">
            {items.map(item => (
                <button
                    key={item.id}
                    className={`bottom-nav-item ${currentPage === item.id ? 'active' : ''}`}
                    onClick={() => setCurrentPage(item.id)}
                >
                    <item.icon />
                    <span>{item.label}</span>
                </button>
            ))}
        </nav>
    );
}
