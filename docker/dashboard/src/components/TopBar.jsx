import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Bell, Menu, Sun, Moon, X, AlertTriangle, Info, CheckCircle } from 'lucide-react';

export function TopBar() {
    const {
        sidebarOpen, setSidebarOpen,
        selectedBuilding, setSelectedBuilding,
        selectedFloor, setSelectedFloor,
        notifications, markNotificationRead,
        markAllNotificationsRead, showNotifications, setShowNotifications,
        theme, toggleTheme, role,
        patients, wheelchairs, rooms, setCurrentPage, openDrawer
    } = useApp();

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchResults, setShowSearchResults] = useState(false);

    const unreadCount = notifications.filter(n => !n.read).length;

    const buildings = [
        { id: 'building-1', name: 'อาคาร A' },
        { id: 'building-2', name: 'อาคาร B' },
    ];

    const floors = [
        { id: 'floor-1', name: 'ชั้น 1' },
        { id: 'floor-2', name: 'ชั้น 2' },
        { id: 'floor-3', name: 'ชั้น 3' },
    ];

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
                results.push({ type: 'patient', id: p.id, name: p.name, subtitle: `Wheelchair: ${p.wheelchairId}`, icon: '👤' });
            }
        });

        // Search wheelchairs
        wheelchairs.forEach(w => {
            if (w.name.toLowerCase().includes(lowerQuery) || w.id.toLowerCase().includes(lowerQuery)) {
                results.push({ type: 'wheelchair', id: w.id, name: w.name, subtitle: w.patientName || 'ไม่ได้กำหนดผู้ใช้', icon: '🦽' });
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
        if (mins < 1) return 'เมื่อกี้';
        if (mins < 60) return `${mins} นาทีที่แล้ว`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} ชม.ที่แล้ว`;
        return new Date(date).toLocaleDateString('th-TH');
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
                    <select className="filter-select" value={selectedBuilding} onChange={(e) => setSelectedBuilding(e.target.value)}>
                        {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select className="filter-select" value={selectedFloor} onChange={(e) => setSelectedFloor(e.target.value)}>
                        {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                </div>
            )}

            {role === 'admin' && (
                <div className="search-bar" style={{ position: 'relative' }}>
                    <Search />
                    <input
                        type="text"
                        placeholder="ค้นหา Patient, Wheelchair, Room..."
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
                                            {result.type === 'patient' ? 'ผู้ป่วย' : result.type === 'wheelchair' ? 'รถเข็น' : 'ห้อง'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            <div className="top-bar-actions">
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
                        {unreadCount > 0 && <span className="badge"></span>}
                    </button>

                    {showNotifications && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowNotifications(false)} />
                            <div className="notification-dropdown">
                                <div className="notification-header">
                                    <span style={{ fontWeight: 600 }}>การแจ้งเตือน ({unreadCount})</span>
                                    <button
                                        onClick={markAllNotificationsRead}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary-500)', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        อ่านทั้งหมด
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
                                            ไม่มีการแจ้งเตือน
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
