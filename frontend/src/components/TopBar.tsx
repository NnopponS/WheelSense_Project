'use client';

import React, { useState, useEffect } from 'react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { getBuildings, getFloors } from '@/lib/api';
import {
    Search, Bell, Menu, Sun, Moon, X, AlertTriangle,
    Info, CheckCircle, Clock
} from 'lucide-react';

export default function TopBar() {
    const {
        sidebarOpen, setSidebarOpen,
        notifications, markNotificationRead,
        markAllNotificationsRead,
        theme, setTheme, role,
        language, setLanguage,
        currentUser,
        selectedBuilding,
        selectedFloor,
        setSelectedBuilding,
        setSelectedFloor,
    } = useWheelSenseStore();

    const { t } = useTranslation();
    const [showNotifications, setShowNotifications] = useState(false);
    const [currentTime, setCurrentTime] = useState<string>('');
    const [mounted, setMounted] = useState(false);
    const [buildings, setBuildings] = useState<any[]>([]);
    const [floors, setFloors] = useState<any[]>([]);

    // Prevent hydration mismatch — only render time on client
    useEffect(() => {
        setMounted(true);
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }));
        }, 1000);
        return () => clearInterval(timer);
    }, [language]);

    useEffect(() => {
        const loadFilters = async () => {
            const [bRes, fRes] = await Promise.all([getBuildings(), getFloors()]);
            if (bRes.data?.buildings) setBuildings(bRes.data.buildings);
            if (fRes.data?.floors) setFloors(fRes.data.floors);
        };
        loadFilters();
    }, []);

    const filteredFloors = selectedBuilding
        ? floors.filter((f: any) => f.building_id === selectedBuilding)
        : floors;

    const unreadCount = notifications.filter(n => !n.read).length;

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'alert': return <AlertTriangle size={18} />;
            case 'warning': return <AlertTriangle size={18} />;
            case 'success': return <CheckCircle size={18} />;
            default: return <Info size={18} />;
        }
    };

    const getNotificationColor = (type: string) => {
        switch (type) {
            case 'alert': return 'var(--danger-500)';
            case 'warning': return 'var(--warning-500)';
            case 'success': return 'var(--success-500)';
            default: return 'var(--info-500)';
        }
    };

    const formatTime = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return t('time.justNow');
        if (mins < 60) return t('time.minutesAgo', { n: mins });
        const hours = Math.floor(mins / 60);
        if (hours < 24) return t('time.hoursAgo', { n: hours });
        return new Date(date).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US');
    };

    return (
        <header className="top-bar">
            <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                {sidebarOpen ? <X /> : <Menu />}
            </button>

            {role === 'admin' && (
                <>
                    <div className="global-filters">
                        <select
                            className="filter-select"
                            value={selectedBuilding || ''}
                            onChange={(e) => {
                                setSelectedBuilding(e.target.value || null);
                                setSelectedFloor(null);
                            }}
                        >
                            {buildings.length === 0 && <option value="">Smart Home</option>}
                            {buildings.map((b: any) => (
                                <option key={b.id} value={b.id}>{b.name_en || b.name}</option>
                            ))}
                        </select>

                        <select
                            className="filter-select"
                            value={selectedFloor || ''}
                            onChange={(e) => setSelectedFloor(e.target.value || null)}
                        >
                            {filteredFloors.length === 0 && <option value="">Floor 1</option>}
                            {filteredFloors.map((f: any) => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="search-bar">
                        <Search />
                        <input
                            type="text"
                            placeholder={t('topbar.searchPlaceholder')}
                        />
                    </div>
                </>
            )}

            {role === 'user' && <div style={{ flex: 1 }} />}

            <div className="top-bar-actions">
                {/* Live Clock */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.375rem 0.75rem',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                }}>
                    <Clock size={14} />
                    <span>{mounted ? currentTime : '--:--:--'}</span>
                    <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '0.25rem' }}>GMT+7</span>
                </div>

                {role === 'user' && (
                    <button className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}>
                        {language === 'th' ? 'รีเซ็ตตาราง' : 'Reset Schedule'}
                    </button>
                )}

                {/* Language Toggle */}
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                        onClick={() => setLanguage('en')}
                        style={{
                            padding: '0.375rem 0.75rem',
                            background: language === 'en' ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                            color: language === 'en' ? 'white' : 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500
                        }}
                    >
                        ENG
                    </button>
                    <button
                        onClick={() => setLanguage('th')}
                        style={{
                            padding: '0.375rem 0.75rem',
                            background: language === 'th' ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                            color: language === 'th' ? 'white' : 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500
                        }}
                    >
                        TH
                    </button>
                </div>

                {/* Theme Toggle */}
                <div className="theme-toggle">
                    <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
                        <Sun size={16} />
                    </button>
                    <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
                        <Moon size={16} />
                    </button>
                </div>

                {/* Notifications */}
                <div style={{ position: 'relative' }}>
                    <button className="action-btn" onClick={() => setShowNotifications(!showNotifications)}>
                        <Bell />
                        {unreadCount > 0 && <span className="badge" />}
                    </button>

                    {showNotifications && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowNotifications(false)} />
                            <div className="notification-dropdown">
                                <div className="notification-header">
                                    <span style={{ fontWeight: 600 }}>{t('topbar.notifications')} ({unreadCount})</span>
                                    <button
                                        onClick={markAllNotificationsRead}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary-500)', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        {t('topbar.markAllRead')}
                                    </button>
                                </div>
                                <div className="notification-list">
                                    {notifications.length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            {t('topbar.noNotifications')}
                                        </div>
                                    ) : (
                                        notifications.slice(0, 5).map(n => (
                                            <div
                                                key={n.id}
                                                className={`notification-item ${!n.read ? 'unread' : ''}`}
                                                onClick={() => markNotificationRead(n.id)}
                                            >
                                                <div className="notification-icon" style={{ background: getNotificationColor(n.type), color: 'white', borderRadius: '50%' }}>
                                                    {getNotificationIcon(n.type)}
                                                </div>
                                                <div className="notification-content">
                                                    <p><strong>{n.title}</strong></p>
                                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{n.message}</p>
                                                    <small>{formatTime(n.timestamp)}</small>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* User Avatar */}
                <div className="user-avatar">
                    {role === 'admin' ? 'AD' : (currentUser?.name?.substring(0, 2).toUpperCase() || 'US')}
                </div>
            </div>
        </header>
    );
}
