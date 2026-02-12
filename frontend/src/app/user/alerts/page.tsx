'use client';

import { useEffect, useState } from 'react';
import { Phone, Bell, AlertTriangle, CheckCircle, Clock, Trash2, X } from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  sendEmergencyAlert, getPatients
} from '@/lib/api';

interface NotificationItem {
  id: string | number;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export default function UserAlertsPage() {
  const { patients, setPatients } = useWheelSenseStore();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const patient = patients[0];

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [pRes, nRes] = await Promise.all([getPatients(), getNotifications({ limit: 50 })]);
      if (pRes.data) setPatients(pRes.data.patients || []);
      if (nRes.data) setNotifications(nRes.data.notifications || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSOS = async () => {
    if (!confirm(t('Send emergency alert? Staff will be notified immediately.'))) return;
    try {
      await sendEmergencyAlert({ message: 'Emergency alert from user', patient_id: patient?.id });
    } catch (e) { console.error(e); }
  };

  const handleMarkRead = async (id: string | number) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (e) { console.error(e); }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(patient?.id);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) { console.error(e); }
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'emergency': case 'alert': return <AlertTriangle size={18} />;
      case 'info': return <Bell size={18} />;
      default: return <Bell size={18} />;
    }
  };

  const getNotifColor = (type: string) => {
    switch (type) {
      case 'emergency': return '#ef4444';
      case 'alert': case 'warning': return '#f59e0b';
      default: return '#6366f1';
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) return <div className="empty-state" style={{ height: '60vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Emergency Contact Card */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))',
        border: '1px solid rgba(239,68,68,0.3)',
      }}>
        <div className="card-body" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '1rem',
        }}>
          <div>
            <h3 style={{ margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Phone size={20} style={{ color: '#ef4444' }} /> {t('Emergency Contact')}
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {t('Press the button to alert staff immediately')}
            </p>
          </div>
          <button onClick={handleSOS} style={{
            background: '#ef4444', border: 'none', color: 'white',
            padding: '0.75rem 2rem', borderRadius: 'var(--radius-md)',
            fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(239,68,68,0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }} onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}>
            <Phone size={20} /> SOS
          </button>
        </div>
      </div>

      {/* Notifications Card */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">
            <Bell size={18} /> {t('Notifications')}
            {unreadCount > 0 && (
              <span style={{
                marginLeft: '0.5rem', padding: '0.15rem 0.5rem',
                borderRadius: 999, background: 'var(--danger-500)',
                color: 'white', fontSize: '0.75rem', fontWeight: 600,
              }}>{unreadCount}</span>
            )}
          </span>
          {unreadCount > 0 && (
            <button className="btn btn-sm btn-secondary" onClick={handleMarkAllRead}>
              <CheckCircle size={14} /> {t('Mark All Read')}
            </button>
          )}
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Bell size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>{t('No notifications')}</p>
            </div>
          ) : (
            notifications.map((n, i) => {
              const color = getNotifColor(n.type);
              return (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderBottom: i < notifications.length - 1 ? '1px solid var(--border-color)' : 'none',
                  background: n.read ? 'transparent' : `${color}08`,
                  transition: 'background 0.2s',
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `${color}22`, color: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 2,
                  }}>
                    {getNotifIcon(n.type)}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: n.read ? 400 : 600,
                      fontSize: '0.9rem', marginBottom: '0.15rem',
                    }}>{n.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} /> {new Date(n.timestamp).toLocaleString()}
                    </div>
                  </div>

                  {/* Actions */}
                  {!n.read && (
                    <button className="btn btn-icon btn-sm" onClick={() => handleMarkRead(n.id)}
                      title={t('Mark as read')} style={{ flexShrink: 0 }}>
                      <CheckCircle size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
