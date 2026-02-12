'use client';

import { useEffect, useState } from 'react';
import { Bell, Check, Trash2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { getNotifications, markNotificationRead, deleteNotification, getAlerts, resolveAlert } from '@/lib/api';

export default function UserNotificationsPage() {
    const { currentUser } = useWheelSenseStore();

    const { t, language } = useTranslation();
    const [tab, setTab] = useState<'notifications' | 'alerts'>('notifications');
    const [notifications, setNotifications] = useState<any[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        const [nRes, aRes] = await Promise.all([
            getNotifications({ patient_id: currentUser?.id, limit: 50 }),
            getAlerts({ patient_id: currentUser?.id, resolved: false }),
        ]);
        if (nRes.data) setNotifications(nRes.data.notifications || []);
        if (aRes.data) setAlerts(aRes.data.alerts || []);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    const handleMarkRead = async (id: string) => {
        await markNotificationRead(id);
        fetchData();
    };

    const handleDelete = async (id: string) => {
        await deleteNotification(id);
        fetchData();
    };

    const handleResolve = async (id: string) => {
        await resolveAlert(id);
        fetchData();
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    const getAlertIcon = (severity: string) => {
        if (severity === 'emergency') return <AlertCircle size={18} style={{ color: 'var(--danger-400)' }} />;
        if (severity === 'warning') return <AlertTriangle size={18} style={{ color: 'var(--warning-400)' }} />;
        return <Info size={18} style={{ color: 'var(--info-400)' }} />;
    };

    if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell size={24} /> {t('notifications.title')}
                {unreadCount > 0 && <span style={{ background: 'var(--danger-500)', padding: '0.15rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', color: 'white' }}>{unreadCount}</span>}
            </h2>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-secondary)', borderRadius: '10px', padding: '0.25rem', marginBottom: '1rem', border: '1px solid var(--bg-tertiary)' }}>
                <button onClick={() => setTab('notifications')}
                    style={{
                        flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600,
                        background: tab === 'notifications' ? 'var(--primary-500)' : 'transparent',
                        color: tab === 'notifications' ? 'white' : 'var(--text-secondary)',
                    }}>
                    {t('notifications.tabNotifications')} ({notifications.length})
                </button>
                <button onClick={() => setTab('alerts')}
                    style={{
                        flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600,
                        background: tab === 'alerts' ? 'var(--primary-500)' : 'transparent',
                        color: tab === 'alerts' ? 'white' : 'var(--text-secondary)',
                    }}>
                    {t('notifications.tabAlerts')} ({alerts.length})
                </button>
            </div>

            <div className="list-container">
                <div className="list-body">
                    {tab === 'notifications' && (
                        notifications.length === 0 ? (
                            <div className="empty-state"><Bell size={48} /><h3>{t('notifications.noNotifications')}</h3></div>
                        ) : (
                            notifications.map(n => (
                                <div key={n.id} className="list-item" style={{ padding: '0.75rem', opacity: n.read ? 0.6 : 1 }}>
                                    <div className="list-item-avatar" style={{ background: n.read ? 'var(--border-color)' : 'var(--primary-500)' }}>
                                        <Bell size={16} />
                                    </div>
                                    <div className="list-item-content">
                                        <div className="list-item-title">{n.title || t('notifications.title')}</div>
                                        <div className="list-item-subtitle">{n.message} • {new Date(n.created_at).toLocaleString()}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        {!n.read && (
                                            <button onClick={() => handleMarkRead(n.id)} title="Mark as read"
                                                style={{ background: 'none', border: 'none', color: 'var(--success-400)', cursor: 'pointer' }}><Check size={16} /></button>
                                        )}
                                        <button onClick={() => handleDelete(n.id)} title="Delete"
                                            style={{ background: 'none', border: 'none', color: 'var(--danger-400)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))
                        )
                    )}

                    {tab === 'alerts' && (
                        alerts.length === 0 ? (
                            <div className="empty-state"><AlertTriangle size={48} /><h3>{t('notifications.noAlerts')}</h3></div>
                        ) : (
                            alerts.map(a => (
                                <div key={a.id} className="list-item" style={{
                                    padding: '0.75rem',
                                    borderLeft: `3px solid ${a.severity === 'emergency' ? 'var(--danger-500)' : a.severity === 'warning' ? 'var(--warning-500)' : 'var(--info-500)'}`,
                                }}>
                                    <div className="list-item-avatar" style={{
                                        background: a.severity === 'emergency' ? 'var(--danger-500)' : a.severity === 'warning' ? 'var(--warning-500)' : 'var(--info-500)'
                                    }}>
                                        {getAlertIcon(a.severity)}
                                    </div>
                                    <div className="list-item-content">
                                        <div className="list-item-title">{a.title || a.severity?.toUpperCase()}</div>
                                        <div className="list-item-subtitle">{a.message} • {new Date(a.created_at).toLocaleString()}</div>
                                    </div>
                                    <button onClick={() => handleResolve(a.id)}
                                        style={{ background: 'var(--success-500)', border: 'none', borderRadius: '6px', padding: '0.3rem 0.75rem', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                                        {t('notifications.resolve')}
                                    </button>
                                </div>
                            ))
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
