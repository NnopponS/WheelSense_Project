/**
 * UserAlertsPage - Notifications and alerts page for users
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Phone, Bell, AlertTriangle } from 'lucide-react';

export function UserAlertsPage() {
    const { currentUser, notifications, markNotificationRead, language } = useApp();
    const { t } = useTranslation(language);

    const myNotifications = notifications.filter(n => !n.read);

    const formatTime = (date) => {
        const d = new Date(date);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>🔔 {t('My Notifications')}</h2>
                <p>{t('Notifications and important events')}</p>
            </div>

            {/* Emergency Contact Button */}
            <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, var(--danger-500), var(--danger-600))', border: 'none', color: 'white' }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 'var(--radius-full)',
                        background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Phone size={28} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{t('Emergency Contact Admin')}</h4>
                        <p style={{ opacity: 0.9, fontSize: '0.85rem' }}>{t('Press to report emergency immediately')}</p>
                    </div>
                    <button style={{
                        padding: '0.75rem 1.5rem', background: 'white', color: 'var(--danger-600)',
                        border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer'
                    }}>
                        📞 {t('Call Now')}
                    </button>
                </div>
            </div>

            {/* Notifications */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Bell size={18} /> {t('Notifications')}</span>
                    {myNotifications.length > 0 && <span className="list-item-badge alert">{myNotifications.length}</span>}
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                    {myNotifications.length > 0 ? (
                        myNotifications.map(n => (
                            <div
                                key={n.id}
                                className="list-item"
                                onClick={() => markNotificationRead(n.id)}
                                style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                            >
                                <div className="list-item-avatar" style={{
                                    background: n.type === 'alert' ? 'var(--danger-500)' : n.type === 'warning' ? 'var(--warning-500)' : 'var(--info-500)'
                                }}>
                                    <AlertTriangle size={18} />
                                </div>
                                <div className="list-item-content">
                                    <div className="list-item-title">{n.title}</div>
                                    <div className="list-item-subtitle">{n.message}</div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(n.time)}</div>
                            </div>
                        ))
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <Bell size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <p>{t('No new notifications')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default UserAlertsPage;

