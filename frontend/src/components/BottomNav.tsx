'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
    LayoutDashboard, Users, Cpu, BarChart3,
    Home, Heart, Calendar, Clock, Bell
} from 'lucide-react';

const adminItems = [
    { labelKey: 'nav.monitor', icon: LayoutDashboard, path: '/admin/monitoring' },
    { labelKey: 'nav.patients', icon: Users, path: '/admin/patients' },
    { labelKey: 'nav.devices', icon: Cpu, path: '/admin/devices' },
    { labelKey: 'nav.analytics', icon: BarChart3, path: '/admin/analytics' },
];

const userItems = [
    { labelKey: 'nav.home', icon: Home, path: '/user/home' },
    { labelKey: 'nav.health', icon: Heart, path: '/user/health' },
    { labelKey: 'nav.schedule', icon: Calendar, path: '/user/schedule' },
    { labelKey: 'nav.timeline', icon: Clock, path: '/user/timeline' },
    { labelKey: 'nav.alerts', icon: Bell, path: '/user/notifications' },
];

export default function BottomNav() {
    const router = useRouter();
    const pathname = usePathname();
    const { role } = useWheelSenseStore();
    const { t } = useTranslation();

    const isUserRoute = pathname.startsWith('/user');
    const navItems = isUserRoute ? userItems : adminItems;

    return (
        <nav className="bottom-nav">
            {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                return (
                    <button
                        key={item.path}
                        className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                        onClick={() => router.push(item.path)}
                    >
                        <Icon />
                        <span>{t(item.labelKey)}</span>
                    </button>
                );
            })}
        </nav>
    );
}
