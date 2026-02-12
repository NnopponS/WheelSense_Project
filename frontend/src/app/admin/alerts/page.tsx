'use client';

import { useEffect, useState } from 'react';
import { getTimeline, TimelineEvent } from '@/lib/api';
import { AlertTriangle, Clock, RefreshCw, MapPin } from 'lucide-react';

export default function AdminAlertsPage() {
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const res = await getTimeline({ limit: 50 });
            if (res.data) setEvents(res.data.timeline);
            setLoading(false);
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
            </div>
        );
    }

    const getEventColor = (type: string) => {
        switch (type) {
            case 'alert': return 'var(--danger-500)';
            case 'appliance_control': return 'var(--warning-500)';
            case 'room_enter': return 'var(--success-500)';
            case 'room_exit': return 'var(--info-500)';
            case 'routine': return 'var(--primary-500)';
            default: return 'var(--text-muted)';
        }
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>🔔 Alerts & Events</h2>
                <p>System alerts and activity log</p>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title"><AlertTriangle size={18} /> Recent Events ({events.length})</span>
                </div>
                <div className="card-body">
                    {events.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <AlertTriangle size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <h3>No events yet</h3>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {events.map(ev => (
                                <div key={ev.id} style={{
                                    display: 'flex', gap: '1rem', padding: '0.75rem 1rem',
                                    background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                                    borderLeft: `3px solid ${getEventColor(ev.event_type)}`,
                                    alignItems: 'center'
                                }}>
                                    <div style={{ minWidth: '70px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <Clock size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
                                        {new Date(ev.timestamp).toLocaleTimeString()}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontWeight: 500 }}>{ev.description || ev.event_type}</span>
                                        {(ev.to_room_name || ev.from_room_name) && (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                                                <MapPin size={12} style={{ display: 'inline' }} /> {ev.to_room_name || ev.from_room_name}
                                            </span>
                                        )}
                                    </div>
                                    <span style={{
                                        padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                        fontSize: '0.7rem', fontWeight: 600,
                                        background: `${getEventColor(ev.event_type)}20`,
                                        color: getEventColor(ev.event_type),
                                    }}>
                                        {ev.event_type}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
