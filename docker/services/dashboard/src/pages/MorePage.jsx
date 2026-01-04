import React from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import {
    Map, Cpu, Clock, Bot, Settings, User, Home, Heart,
    Zap, Calendar, AlertTriangle, Phone, Info, LogOut, HelpCircle
} from 'lucide-react';

export function MorePage() {
    const { setCurrentPage, role, currentUser, notifications } = useApp();
    const { t } = useTranslation();

    const unreadCount = notifications.filter(n => !n.read).length;

    const adminItems = [
        { id: 'map', label: 'Map & Zones', icon: Map, desc: 'Manage building layout' },
        { id: 'devices', label: 'Devices & Nodes', icon: Cpu, desc: 'Manage devices' },
        { id: 'routines', label: 'Routines', icon: Clock, desc: 'Activity schedule' },
        { id: 'analytics', label: 'Analytics', icon: Heart, desc: 'Data analysis' },
        { id: 'appliances', label: 'Appliances', icon: Zap, desc: 'Appliance control' },
        { id: 'ai', label: 'AI Assistant', icon: Bot, desc: 'AI Assistant' },
        { id: 'settings', label: 'Settings', icon: Settings, desc: 'System settings' },
    ];

    const userItems = [
        { id: 'user-health', label: 'Health', icon: Heart, desc: 'View health status' },
        { id: 'user-location', label: 'My Location', icon: Map, desc: 'View location on map' },
        { id: 'user-routines', label: 'My Schedule', icon: Calendar, desc: 'Daily activities' },
        { id: 'user-ai', label: 'AI Assistant', icon: Bot, desc: 'Chat with AI' },
        { id: 'user-alerts', label: 'Notifications', icon: AlertTriangle, desc: `${unreadCount} New`, badge: unreadCount },
        { id: 'user-settings', label: 'Settings', icon: Settings, desc: 'Personal settings' },
    ];

    const items = role === 'admin' ? adminItems : userItems;

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📋 {role === 'admin' ? t('More Menu') : t('More Options')}</h2>
                <p>{role === 'admin' ? t('Other system functions') : t('Additional menus and settings')}</p>
            </div>

            {/* User Profile Card (User mode only) */}
            {role === 'user' && currentUser && (
                <div className="profile-card" style={{ marginBottom: '1.5rem' }}>
                    <div className="profile-header">
                        <div className="profile-avatar">{currentUser?.avatar || '👤'}</div>
                        <h3>{currentUser?.name || 'Unknown User'}</h3>
                        <p>{currentUser?.wheelchairId || 'N/A'} • Age {currentUser?.age || '--'} years</p>
                    </div>
                    <div className="profile-body">
                        <div className="profile-stat">
                            <div className="profile-stat-item">
                                <h4>{currentUser?.healthScore || '--'}</h4>
                                <p>Health Score</p>
                            </div>
                            <div className="profile-stat-item">
                                <h4>{currentUser?.todaySteps || 0}</h4>
                                <p>Steps Today</p>
                            </div>
                            <div className="profile-stat-item">
                                <h4>Normal</h4>
                                <p>Status</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Menu Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                {items.map(item => (
                    <div
                        key={item.id}
                        className="device-card"
                        onClick={() => setCurrentPage(item.id)}
                        style={{ padding: '1.5rem', position: 'relative' }}
                    >
                        {item.badge > 0 && (
                            <span style={{
                                position: 'absolute', top: '0.75rem', right: '0.75rem',
                                background: 'var(--danger-500)', color: 'white',
                                fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px',
                                borderRadius: 'var(--radius-full)'
                            }}>
                                {item.badge}
                            </span>
                        )}
                        <div className="device-icon" style={{ width: 56, height: 56 }}>
                            <item.icon size={28} />
                        </div>
                        <div className="device-name" style={{ fontSize: '0.95rem' }}>{t(item.label)}</div>
                        <div className="device-status">{t(item.desc)}</div>
                    </div>
                ))}
            </div>

            {/* Quick Actions */}
            {role === 'user' && (
                <div className="card" style={{ marginTop: '1.5rem' }}>
                    <div className="card-header">
                        <span className="card-title"><Phone size={18} /> {t('Request Help')}</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button className="btn btn-danger btn-lg btn-block">
                                <AlertTriangle size={20} /> 🚨 {t('Report Emergency')}
                            </button>
                            <button className="btn btn-primary btn-block">
                                <Phone size={18} /> {t('Call Caregiver')}
                            </button>
                            <button className="btn btn-secondary btn-block">
                                <HelpCircle size={18} /> {t('Request Help')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Profile Card */}
            {role === 'admin' && (
                <div className="card" style={{ marginTop: '2rem' }}>
                    <div className="card-header">
                        <span className="card-title"><User size={18} /> System Administrator Profile</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div className="user-avatar" style={{ width: 56, height: 56, fontSize: '1.25rem' }}>AD</div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Admin User</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>admin@wheelsense.local</div>
                                <div style={{ marginTop: '0.5rem' }}>
                                    <span className="list-item-badge normal">Administrator</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* System Status */}
            <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header">
                    <span className="card-title"><Info size={18} /> System Status</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 10, height: 10, background: 'var(--success-500)', borderRadius: '50%' }}></div>
                            <span style={{ fontSize: '0.85rem' }}>Backend API</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 10, height: 10, background: 'var(--success-500)', borderRadius: '50%' }}></div>
                            <span style={{ fontSize: '0.85rem' }}>MQTT Broker</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 10, height: 10, background: 'var(--success-500)', borderRadius: '50%' }}></div>
                            <span style={{ fontSize: '0.85rem' }}>MCP Server</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 10, height: 10, background: 'var(--success-500)', borderRadius: '50%' }}></div>
                            <span style={{ fontSize: '0.85rem' }}>Ollama LLM</span>
                        </div>
                    </div>
                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Version 1.0.0 • © 2024 WheelSense
                    </div>
                </div>
            </div>

            {/* Logout */}
            <button className="btn btn-secondary btn-block" style={{ marginTop: '1.5rem' }}>
                <LogOut size={18} /> Logout
            </button>
        </div>
    );
}
