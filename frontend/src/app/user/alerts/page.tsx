'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Phone, AlertTriangle, MapPin, Lightbulb, Clock, RefreshCw } from 'lucide-react';
import { getTodayTimeline, TimelineEvent } from '@/lib/api';

export default function UserAlertsPage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await getTodayTimeline(20);
      if (res.data) setEvents(res.data.timeline);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'location_change': return MapPin;
      case 'appliance_control': return Lightbulb;
      case 'alert': return AlertTriangle;
      default: return Bell;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'location_change': return 'var(--info-500)';
      case 'appliance_control': return 'var(--warning-500)';
      case 'alert': return 'var(--danger-500)';
      default: return 'var(--text-muted)';
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('th-TH', {
      hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>🔔 My Notifications</h2>
        <p>Notifications and important events</p>
      </div>

      {/* Emergency Contact Button */}
      <div className="card" style={{
        marginBottom: '1.5rem',
        background: 'linear-gradient(135deg, var(--danger-500), var(--danger-600))',
        border: 'none', color: 'white'
      }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Phone size={28} />
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Emergency Contact Admin</h4>
            <p style={{ opacity: 0.9, fontSize: '0.85rem' }}>Press to report emergency immediately</p>
          </div>
          <button style={{
            padding: '0.75rem 1.5rem',
            background: 'white', color: 'var(--danger-600)',
            border: 'none', borderRadius: 'var(--radius-md)',
            fontWeight: 600, cursor: 'pointer'
          }}>
            📞 Call Now
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title"><Bell size={18} /> Notifications</span>
          {events.length > 0 && (
            <span style={{
              padding: '0.25rem 0.6rem',
              background: 'var(--danger-500)',
              color: 'white',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem', fontWeight: 600
            }}>
              {events.length}
            </span>
          )}
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {events.length > 0 ? (
            events.map(event => {
              const Icon = getIcon(event.event_type);
              const color = getIconColor(event.event_type);
              return (
                <div
                  key={event.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: '0.2s'
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--radius-md)',
                    background: `${color}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Icon size={18} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                      {event.description || (
                        event.event_type === 'location_change'
                          ? `Moved to ${event.to_room_name}`
                          : 'Activity recorded'
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {event.patient_name && `${event.patient_name} • `}
                      {event.event_type.replace('_', ' ')}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={12} /> {formatTime(event.timestamp)}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Bell size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>No new notifications</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
