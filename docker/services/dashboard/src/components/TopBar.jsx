import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { resetSchedule, setCustomTime as setCustomTimeAPI } from '../services/api';
import { Search, Bell, Menu, Sun, Moon, X, AlertTriangle, Info, CheckCircle, Clock, Edit2, Check, RotateCcw } from 'lucide-react';

export function TopBar() {
    const {
        sidebarOpen, setSidebarOpen,
        selectedBuilding, setSelectedBuilding,
        selectedFloor, setSelectedFloor,
        buildings, floors,
        notifications, markNotificationRead,
        markAllNotificationsRead, showNotifications, setShowNotifications,
        theme, toggleTheme, role,
        patients, wheelchairs, rooms, setCurrentPage, openDrawer,
        getCurrentTime,
        customTime,
        setCustomTime,
        language
    } = useApp();
    const { t } = useTranslation();
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [timeInput, setTimeInput] = useState('');

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [displayTime, setDisplayTime] = useState('');
    const customTimeSetAt = useRef(null); // Track when custom time was set

    // Update display time every second (live clock)
    useEffect(() => {
        const updateDisplayTime = () => {
            let timeToDisplay;

            if (customTime) {
                // Use custom time - create a date with custom hours and minutes
                const [hours, minutes] = customTime.split(':');
                const now = new Date();

                // Calculate elapsed seconds since custom time was set
                const elapsedSeconds = customTimeSetAt.current
                    ? Math.floor((Date.now() - customTimeSetAt.current) / 1000)
                    : 0;

                now.setHours(parseInt(hours), parseInt(minutes), elapsedSeconds, 0);
                timeToDisplay = now;
            } else {
                // Use real time
                timeToDisplay = new Date();
            }

            setDisplayTime(timeToDisplay.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: 'Asia/Bangkok' // GMT+7
            }));
        };

        updateDisplayTime();
        const interval = setInterval(updateDisplayTime, 1000);
        return () => clearInterval(interval);
    }, [language, customTime]);

    // Track when custom time is set
    useEffect(() => {
        if (customTime) {
            customTimeSetAt.current = Date.now();
        } else {
            customTimeSetAt.current = null;
        }
    }, [customTime]);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Handle custom time setting
    const handleSetCustomTime = async () => {
        // Validate HH:MM format
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (timeRegex.test(timeInput)) {
            // Call backend API FIRST to trigger notification, then update local state
            try {
                console.log('[TopBar] Calling backend setCustomTime API with:', timeInput);
                await setCustomTimeAPI(timeInput, null);
                console.log('[TopBar] Backend setCustomTime API succeeded');
            } catch (error) {
                console.error('[TopBar] Failed to sync custom time to backend:', error);
            }
            // Update local state for UI display
            setCustomTime(timeInput);
            setShowTimePicker(false);
            setTimeInput('');
        } else {
            alert(t('Invalid time format. Please use HH:MM (e.g., 14:30)'));
        }
    };

    const handleResetTime = async () => {
        // Reset in backend first
        try {
            await setCustomTimeAPI(null, null);
        } catch (error) {
            console.error('[TopBar] Failed to reset custom time in backend:', error);
        }
        // Update local state
        setCustomTime(null);
        setShowTimePicker(false);
        setTimeInput('');
    };

    const handleOpenTimePicker = () => {
        setTimeInput(customTime || '');
        setShowTimePicker(true);
    };

    // Search handler
    const handleSearch = (query) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const results = [];

        // Search patients
        patients.forEach(p => {
            if (p.name.toLowerCase().includes(lowerQuery) || p.id.toLowerCase().includes(lowerQuery)) {
                results.push({ type: 'patient', id: p.id, name: p.name, subtitle: `${t('Wheelchair')}: ${p.wheelchairId}`, icon: '👤' });
            }
        });

        // Search wheelchairs
        wheelchairs.forEach(w => {
            if (w.name.toLowerCase().includes(lowerQuery) || w.id.toLowerCase().includes(lowerQuery)) {
                results.push({ type: 'wheelchair', id: w.id, name: w.name, subtitle: w.patientName || 'No User Assigned', icon: '🦽' });
            }
        });

        // Search rooms
        rooms.forEach(r => {
            if (r.name.toLowerCase().includes(lowerQuery) || r.nameEn?.toLowerCase().includes(lowerQuery)) {
                results.push({ type: 'room', id: r.id, name: r.name, subtitle: r.nameEn || '', icon: '🏠' });
            }
        });

        setSearchResults(results.slice(0, 8));
        setShowSearchResults(results.length > 0);
    };

    const handleResultClick = (result) => {
        setShowSearchResults(false);
        setSearchQuery('');

        switch (result.type) {
            case 'patient':
                setCurrentPage('patients');
                // Could also open drawer with patient details
                break;
            case 'wheelchair':
                setCurrentPage('monitoring');
                break;
            case 'room':
                setCurrentPage('map');
                break;
        }
    };

    const formatTime = (date) => {
        const diff = Date.now() - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return t('Just now');
        if (mins < 60) return `${mins} ${t('minutes ago')}`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} ${t('hours ago')}`;
        return new Date(date).toLocaleDateString('en-US');
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'alert': return <AlertTriangle size={18} />;
            case 'warning': return <AlertTriangle size={18} />;
            case 'success': return <CheckCircle size={18} />;
            default: return <Info size={18} />;
        }
    };

    const getNotificationColor = (type) => {
        switch (type) {
            case 'alert': return 'var(--danger-500)';
            case 'warning': return 'var(--warning-500)';
            case 'success': return 'var(--success-500)';
            default: return 'var(--info-500)';
        }
    };

    const toggleSidebar = () => {
        setSidebarOpen(!sidebarOpen);
    };

    return (
        <header className="top-bar">
            <button className="menu-toggle" onClick={toggleSidebar}>
                {sidebarOpen ? <X /> : <Menu />}
            </button>

            {role === 'admin' && (
                <div className="global-filters">
                    <select className="filter-select" value={selectedBuilding || ''} onChange={(e) => setSelectedBuilding(e.target.value)}>
                        {(!buildings || buildings.length === 0) && <option value="">Loading...</option>}
                        {(buildings || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select className="filter-select" value={selectedFloor || ''} onChange={(e) => setSelectedFloor(e.target.value)}>
                        {(!floors || floors.length === 0) && <option value="">Loading...</option>}
                        {(floors || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </div>
            )}

            {role === 'admin' && (
                <div className="search-bar" style={{ position: 'relative' }}>
                    <Search />
                    <input
                        type="text"
                        placeholder={t('Search Patient, Wheelchair, Room...')}
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                    />

                    {/* Search Results Dropdown */}
                    {showSearchResults && (
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 198 }}
                                onClick={() => setShowSearchResults(false)}
                            />
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '0.5rem',
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-lg)',
                                boxShadow: 'var(--shadow-lg)',
                                zIndex: 200,
                                maxHeight: '300px',
                                overflowY: 'auto'
                            }}>
                                {searchResults.map((result, index) => (
                                    <div
                                        key={`${result.type}-${result.id}`}
                                        onClick={() => handleResultClick(result)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            cursor: 'pointer',
                                            borderBottom: index < searchResults.length - 1 ? '1px solid var(--border-color)' : 'none',
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <span style={{ fontSize: '1.25rem' }}>{result.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500 }}>{result.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{result.subtitle}</div>
                                        </div>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            padding: '0.25rem 0.5rem',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: 'var(--radius-sm)',
                                            color: 'var(--text-muted)'
                                        }}>
                                            {result.type === 'patient' ? t('Patient') : result.type === 'wheelchair' ? t('Wheelchair') : t('Room')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="top-bar-actions">
                {/* Live Clock Display */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem', position: 'relative' }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.375rem 0.75rem',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}
                        title={customTime ? t('Custom time - Click to change') : t('Click to customize time')}
                        onClick={handleOpenTimePicker}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                    >
                        <Clock size={14} />
                        <span>{displayTime}</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '0.25rem' }}>GMT+7</span>
                        {customTime && (
                            <span style={{
                                fontSize: '0.65rem',
                                opacity: 0.7,
                                marginLeft: '0.25rem',
                                color: 'var(--primary-500)'
                            }}>
                                ({t('Custom')})
                            </span>
                        )}
                    </div>

                    {/* Time Picker Modal */}
                    {showTimePicker && (
                        <>
                            <div
                                style={{
                                    position: 'fixed',
                                    inset: 0,
                                    background: 'rgba(0, 0, 0, 0.5)',
                                    zIndex: 999,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onClick={() => setShowTimePicker(false)}
                            />
                            <div
                                style={{
                                    position: 'fixed',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'var(--card-bg)',
                                    borderRadius: 'var(--radius-lg)',
                                    padding: '1.5rem',
                                    zIndex: 1000,
                                    minWidth: '300px',
                                    boxShadow: 'var(--shadow-lg)'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
                                    {t('Customize Time')}
                                </h3>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{
                                        display: 'block',
                                        marginBottom: '0.5rem',
                                        fontSize: '0.875rem',
                                        color: 'var(--text-secondary)'
                                    }}>
                                        {t('Time (HH:MM)')}
                                    </label>
                                    <input
                                        type="text"
                                        value={timeInput}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9:]/g, '');
                                            // Auto-format as user types
                                            if (val.length <= 5) {
                                                setTimeInput(val);
                                            }
                                        }}
                                        placeholder="HH:MM"
                                        maxLength={5}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            fontSize: '1rem',
                                            textAlign: 'center',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-sm)',
                                            background: 'var(--bg-primary)',
                                            color: 'var(--text-primary)'
                                        }}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSetCustomTime();
                                            }
                                        }}
                                        autoFocus
                                    />
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--text-muted)',
                                        marginTop: '0.25rem',
                                        textAlign: 'center'
                                    }}>
                                        {t('Format: 00:00 - 23:59')}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => setShowTimePicker(false)}
                                    >
                                        {t('Cancel')}
                                    </button>
                                    {customTime && (
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleResetTime}
                                        >
                                            {t('Reset to Real Time')}
                                        </button>
                                    )}
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleSetCustomTime}
                                    >
                                        {t('Apply')}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Reset Schedule Button (User role only) */}
                {role === 'user' && (
                    <>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowResetConfirm(true)}
                            style={{ marginRight: '1rem' }}
                        >
                            <RotateCcw size={14} /> {t('Reset Schedule')}
                        </button>
                        {showResetConfirm && (
                            <>
                                <div
                                    style={{
                                        position: 'fixed',
                                        inset: 0,
                                        background: 'rgba(0, 0, 0, 0.5)',
                                        zIndex: 999,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onClick={() => setShowResetConfirm(false)}
                                />
                                <div
                                    style={{
                                        position: 'fixed',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        background: 'var(--card-bg)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: '1.5rem',
                                        zIndex: 1000,
                                        minWidth: '300px',
                                        boxShadow: 'var(--shadow-lg)'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>{t('Reset Schedule')}</h3>
                                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                                        {t('Reset daily schedule to base schedule and clear all one-time events?')}
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => setShowResetConfirm(false)}
                                        >
                                            {t('Cancel')}
                                        </button>
                                        <button
                                            className="btn btn-primary"
                                            onClick={async () => {
                                                try {
                                                    const result = await resetSchedule();
                                                    alert(t('Schedule reset! Cleared {count} one-time event(s).', { count: result.one_time_events_cleared || 0 }));
                                                    setShowResetConfirm(false);
                                                } catch (error) {
                                                    console.error('Failed to reset schedule:', error);
                                                    alert(t('Failed to reset schedule: ') + error.message);
                                                }
                                            }}
                                        >
                                            {t('Confirm')}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* Theme Toggle */}
                <div className="theme-toggle">
                    <button className={theme === 'light' ? 'active' : ''} onClick={() => theme !== 'light' && toggleTheme()} title="Light Mode">
                        <Sun size={16} />
                    </button>
                    <button className={theme === 'dark' ? 'active' : ''} onClick={() => theme !== 'dark' && toggleTheme()} title="Dark Mode">
                        <Moon size={16} />
                    </button>
                </div>

                {/* Notifications */}
                <div style={{ position: 'relative' }}>
                    <button className="action-btn" onClick={() => setShowNotifications(!showNotifications)}>
                        <Bell />
                        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
                    </button>

                    {showNotifications && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowNotifications(false)} />
                            <div className="notification-dropdown">
                                <div className="notification-header">
                                    <span style={{ fontWeight: 600 }}>{t('Notifications')} ({unreadCount})</span>
                                    <button
                                        onClick={markAllNotificationsRead}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary-500)', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        {t('Mark All Read')}
                                    </button>
                                </div>
                                <div className="notification-list">
                                    {notifications.slice(0, 5).map(n => (
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
                                                <small>{formatTime(n.time)}</small>
                                            </div>
                                        </div>
                                    ))}
                                    {notifications.length === 0 && (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            {t('No Notifications')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="user-avatar">{role === 'admin' ? 'AD' : 'SC'}</div>
            </div>
        </header>
    );
}
