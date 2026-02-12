'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
    Accessibility, LayoutDashboard, Users, Settings,
    Home, Heart, Bell, Calendar, Map, Cpu,
    BarChart3, MessageCircle, Clock
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
    { labelKey: 'nav.monitor', icon: LayoutDashboard, path: '/admin/monitoring', sectionKey: 'section.main' },
    { labelKey: 'nav.mapZone', icon: Map, path: '/admin/map-zone', sectionKey: 'section.main' },
    { labelKey: 'nav.patients', icon: Users, path: '/admin/patients', sectionKey: 'section.main' },
    { labelKey: 'nav.devices', icon: Cpu, path: '/admin/devices', sectionKey: 'section.main' },
    { labelKey: 'nav.analytics', icon: BarChart3, path: '/admin/analytics', sectionKey: 'section.main' },
    { labelKey: 'nav.aiAssistant', icon: MessageCircle, path: '/admin/ai', sectionKey: 'section.ai' },
];

const userNavItems: NavItem[] = [
    { labelKey: 'nav.home', icon: Home, path: '/user/home', sectionKey: 'section.main' },
    { labelKey: 'nav.health', icon: Heart, path: '/user/health', sectionKey: 'section.main' },
    { labelKey: 'nav.schedule', icon: Calendar, path: '/user/schedule', sectionKey: 'section.main' },
    { labelKey: 'nav.timeline', icon: Clock, path: '/user/timeline', sectionKey: 'section.main' },
    { labelKey: 'nav.aiChat', icon: MessageCircle, path: '/user/ai-chat', sectionKey: 'section.ai' },
    { labelKey: 'nav.notifications', icon: Bell, path: '/user/notifications', sectionKey: 'section.main', badge: true },
];

export default function Sidebar() {
    const { role, setRole, sidebarOpen, wheelchairs } = useWheelSenseStore();
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
        const sectionLabel = t(item.sectionKey);
        if (!acc[sectionLabel]) acc[sectionLabel] = [];
        acc[sectionLabel].push(item);
        return acc;
    }, {} as Record<string, typeof navItems>);

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
