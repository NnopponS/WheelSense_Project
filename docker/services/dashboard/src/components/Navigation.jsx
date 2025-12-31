import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { pageToPath } from '../App';
import {
    Activity, Map, Users, Cpu, Clock, Settings, Bot,
    Monitor, AlertTriangle, Home, MoreHorizontal, X, Accessibility,
    Calendar, Heart, Zap, Video, Gauge
} from 'lucide-react';

export function Sidebar() {
    const { role, setRole, currentPage, setCurrentPage, sidebarOpen, setSidebarOpen, notifications, currentUser, language } = useApp();
    const { t } = useTranslation(language);
    const navigate = useNavigate();
    const location = useLocation();

    // Debug: Log when language changes
    React.useEffect(() => {
        console.log('[Sidebar] Language changed to:', language);
    }, [language]);

    const unreadCount = notifications.filter(n => !n.read).length;

    const adminNav = [
        {
            section: 'Main', items: [
                { id: 'monitoring', label: 'Live Monitoring', icon: Activity },
                { id: 'map', label: 'Map & Zones', icon: Map },
            ]
        },
        {
            section: 'Management', items: [
                { id: 'patients', label: 'Wheelchairs & Patients', icon: Users },
                { id: 'devices', label: 'Devices & Nodes', icon: Cpu },
            ]
        },
        {
            section: 'Tracking', items: [
                { id: 'timeline', label: 'Timeline & Alerts', icon: Clock, badge: unreadCount || null },
                { id: 'routines', label: 'Routines', icon: Calendar },
                { id: 'analytics', label: 'Analytics', icon: Activity },
            ]
        },
        {
            section: 'Tools', items: [
                { id: 'appliances', label: 'Appliance Control', icon: Zap },
                { id: 'sensors', label: 'Sensor Monitoring', icon: Gauge },
                { id: 'ai', label: 'AI Assistant', icon: Bot },
                { id: 'settings', label: 'Settings', icon: Settings },
            ]
        },
    ];

    const userNav = [
        {
            section: 'Main', items: [
                { id: 'user-home', label: 'Home', icon: Home },
            ]
        },
        {
            section: 'Health', items: [
                { id: 'user-health', label: 'Health', icon: Heart },
                { id: 'user-routines', label: 'My Schedule', icon: Calendar },
            ]
        },
        {
            section: 'Control', items: [
                { id: 'user-appliances', label: 'Appliances', icon: Zap },
                { id: 'user-video', label: 'Camera', icon: Video },
                { id: 'user-ai', label: 'AI Assistant', icon: Bot },
            ]
        },
        {
            section: 'More', items: [
                { id: 'user-alerts', label: 'Alerts', icon: AlertTriangle, badge: unreadCount || null },
                { id: 'user-settings', label: 'Settings', icon: Settings },
            ]
        },
    ];

    const navItems = role === 'admin' ? adminNav : userNav;

    // Navigate to a page using React Router
    const navigateTo = (pageId) => {
        const path = pageToPath[pageId];
        if (path) {
            navigate(path);
        }
        setCurrentPage(pageId);
        setSidebarOpen(false);
    };

    // Handle role switch
    const handleRoleSwitch = (newRole) => {
        setRole(newRole);
        if (newRole === 'admin') {
            navigate('/Admin/Monitoring');
            setCurrentPage('monitoring');
        } else {
            navigate('/User/Home');
            setCurrentPage('user-home');
        }
    };

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
                            <span>{role === 'admin' ? t('Admin Panel') : t('User Portal')}</span>
                        </div>
                    </div>
                </div>

                <div className="role-switcher">
                    <button className={`role-btn ${role === 'admin' ? 'active' : ''}`} onClick={() => handleRoleSwitch('admin')}>
                        {t('Admin')}
                    </button>
                    <button className={`role-btn ${role === 'user' ? 'active' : ''}`} onClick={() => handleRoleSwitch('user')}>
                        {t('User')}
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
                                    {currentUser?.avatar || '👤'}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{currentUser?.name || 'User'}</div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{currentUser?.wheelchairId || ''}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <nav className="sidebar-nav">
                    {navItems.map((section, idx) => (
                        <div key={idx} className="nav-section">
                            <span className="nav-section-title">{t(section.section)}</span>
                            {section.items.map(item => (
                                <button
                                    key={item.id}
                                    className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
                                    onClick={() => navigateTo(item.id)}
                                    title={t(item.label)}
                                >
                                    <item.icon />
                                    <span>{t(item.label)}</span>
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
    const { currentPage, setCurrentPage, role, notifications, language } = useApp();
    const { t } = useTranslation(language);
    const navigate = useNavigate();
    const unreadCount = notifications.filter(n => !n.read).length;

    const adminItems = [
        { id: 'monitoring', label: 'Monitor', icon: Activity },
        { id: 'patients', label: 'Patients', icon: Users },
        { id: 'timeline', label: 'Alerts', icon: AlertTriangle, badge: unreadCount || null },
        { id: 'more', label: 'More', icon: MoreHorizontal },
    ];

    const userItems = [
        { id: 'user-home', label: 'Home', icon: Home },
        { id: 'user-appliances', label: 'Control', icon: Zap },
        { id: 'user-routines', label: 'Schedule', icon: Calendar },
        { id: 'more', label: 'More', icon: MoreHorizontal },
    ];

    const items = role === 'admin' ? adminItems : userItems;

    // Navigate to a page using React Router
    const navigateTo = (pageId) => {
        const path = pageToPath[pageId];
        if (path) {
            navigate(path);
        }
        setCurrentPage(pageId);
    };

    return (
        <nav className="bottom-nav">
            {items.map(item => (
                <button
                    key={item.id}
                    className={`bottom-nav-item ${currentPage === item.id ? 'active' : ''}`}
                    onClick={() => navigateTo(item.id)}
                >
                    <item.icon />
                    <span>{t(item.label)}</span>
                </button>
            ))}
        </nav>
    );
}
