'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
    Accessibility, Activity, Users, Settings,
    Home, Heart, Bell, Calendar, Map, Cpu,
    BarChart3, Bot, Clock, Zap, Gauge
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
    labelKey: string;
    icon: LucideIcon;
    path: string;
    sectionKey: string;
    badge?: boolean;
}

const adminNavItems: NavItem[] = [
    { labelKey: 'nav.monitor', icon: Activity, path: '/admin/monitoring', sectionKey: 'section.main' },
    { labelKey: 'nav.mapZone', icon: Map, path: '/admin/map-zone', sectionKey: 'section.main' },
    { labelKey: 'nav.patients', icon: Users, path: '/admin/patients', sectionKey: 'Management' },
    { labelKey: 'nav.devices', icon: Cpu, path: '/admin/devices', sectionKey: 'Management' },
    { labelKey: 'nav.timeline', icon: Clock, path: '/admin/timeline', sectionKey: 'Tracking', badge: true },
    { labelKey: 'nav.schedule', icon: Calendar, path: '/admin/routines', sectionKey: 'Tracking' },
    { labelKey: 'nav.analytics', icon: BarChart3, path: '/admin/analytics', sectionKey: 'Tracking' },
    { labelKey: 'nav.appliances', icon: Zap, path: '/admin/appliances', sectionKey: 'Tools' },
    { labelKey: 'nav.sensors', icon: Gauge, path: '/admin/sensors', sectionKey: 'Tools' },
    { labelKey: 'nav.aiAssistant', icon: Bot, path: '/admin/ai', sectionKey: 'Tools' },
    { labelKey: 'nav.settings', icon: Settings, path: '/admin/settings', sectionKey: 'Tools' },
];

const userNavItems: NavItem[] = [
    { labelKey: 'nav.home', icon: Home, path: '/user/home', sectionKey: 'Main' },
    { labelKey: 'nav.health', icon: Heart, path: '/user/health', sectionKey: 'Main' },
    { labelKey: 'nav.schedule', icon: Calendar, path: '/user/schedule', sectionKey: 'Health' },
    { labelKey: 'nav.appliances', icon: Zap, path: '/user/appliances', sectionKey: 'Control' },
    { labelKey: 'nav.video', icon: Activity, path: '/user/video', sectionKey: 'Control' },
    { labelKey: 'nav.aiAssistant', icon: Bot, path: '/user/ai', sectionKey: 'Control' },
    { labelKey: 'nav.notifications', icon: Bell, path: '/user/alerts', sectionKey: 'More' },
    { labelKey: 'nav.settings', icon: Settings, path: '/user/settings', sectionKey: 'More' },
];

export default function Sidebar() {
    const { role, setRole, sidebarOpen, wheelchairs, currentUser, patients } = useWheelSenseStore();
    const { t } = useTranslation();
    const alertCount = wheelchairs.filter(w => w.status === 'alert' || w.status === 'warning').length;
    const router = useRouter();
    const pathname = usePathname();

    // Auto-detect role from URL
    useEffect(() => {
        if (pathname.startsWith('/user') && role !== 'user') {
            setRole('user');
        } else if (pathname.startsWith('/admin') && role !== 'admin') {
            setRole('admin');
        }
    }, [pathname, role, setRole]);

    const navItems = role === 'admin' ? adminNavItems : userNavItems;

    const handleNavClick = (path: string) => {
        router.push(path);
    };

    const handleRoleSwitch = (newRole: 'admin' | 'user') => {
        setRole(newRole);
        router.push(newRole === 'admin' ? '/admin/monitoring' : '/user/home');
    };

    // Group items by section
    const sections = navItems.reduce((acc, item) => {
        const sectionLabel = item.sectionKey.includes('.') ? t(item.sectionKey) : item.sectionKey;
        if (!acc[sectionLabel]) acc[sectionLabel] = [];
        acc[sectionLabel].push(item);
        return acc;
    }, {} as Record<string, typeof navItems>);

    const patient = currentUser || patients[0];
    const assignedWheelchair = wheelchairs.find((w) => w.patientId === patient?.id) || wheelchairs[0];

    return (
        <aside className={`sidebar ${role === 'user' ? 'user-mode' : ''} ${sidebarOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">
                        <Accessibility />
                    </div>
                    <div className="sidebar-logo-text">
                        <h1>WheelSense</h1>
                        <span>{role === 'admin' ? t('role.adminDashboard') : t('role.userPortal')}</span>
                    </div>
                </div>
            </div>

            <div className="role-switcher">
                <button
                    className={`role-btn ${role === 'admin' ? 'active' : ''}`}
                    onClick={() => handleRoleSwitch('admin')}
                >
                    {t('role.admin')}
                </button>
                <button
                    className={`role-btn ${role === 'user' ? 'active' : ''}`}
                    onClick={() => handleRoleSwitch('user')}
                >
                    {t('role.user')}
                </button>
            </div>

            {role === 'user' && (
                <div style={{ margin: '0 1rem 0.75rem' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.12)'
                        }}
                    >
                        <div
                            style={{
                                width: 30,
                                height: 30,
                                borderRadius: '999px',
                                background: 'rgba(255,255,255,0.9)',
                                color: 'var(--primary-700)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.8rem'
                            }}
                        >
                            {(patient?.name || 'U').slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {patient?.name || 'User'}
                            </div>
                            <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                                {assignedWheelchair?.id || 'WC001'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <nav className="sidebar-nav">
                {Object.entries(sections).map(([sectionName, items]) => (
                    <div key={sectionName} className="nav-section">
                        <div className="nav-section-title">{sectionName}</div>
                        {items.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                            return (
                                <button
                                    key={item.path}
                                    className={`nav-item ${isActive ? 'active' : ''}`}
                                    onClick={() => handleNavClick(item.path)}
                                >
                                    <Icon />
                                    <span>{t(item.labelKey)}</span>
                                    {item.badge && alertCount > 0 && (
                                        <span className="nav-badge">{alertCount}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
