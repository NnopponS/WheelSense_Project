'use client';

import { useEffect, useState } from 'react';
import { Clock, MapPin, ArrowRight, Calendar } from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { getTimeline } from '@/lib/api';

export default function UserTimelinePage() {
    const { currentUser } = useWheelSenseStore();
    const { t, language } = useTranslation();
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    const fetchData = async () => {
        if (!currentUser) { setLoading(false); return; }
        const res = await getTimeline({ patient_id: currentUser.id, date: selectedDate, limit: 50 });
        if (res.data) setEvents(res.data.timeline || []);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [selectedDate]);

    const formatTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const calcDuration = (enter: string, exit?: string) => {
        const start = new Date(enter).getTime();
        const end = exit ? new Date(exit).getTime() : Date.now();
        const mins = Math.round((end - start) / 60000);
        if (mins < 60) return `${mins} min`;
        return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    };

    if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={24} /> {t('timeline.title')}</h2>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--bg-tertiary)', borderRadius: '8px', padding: '0.5rem' }} />
            </div>

            {events.length === 0 ? (
                <div className="empty-state" style={{ height: '400px' }}>
                    <Calendar size={48} />
                    <h3>{t('timeline.noEvents')}</h3>
                    <p>{t('timeline.tryDifferentDate')}</p>
                </div>
            ) : (
                <div style={{ position: 'relative', paddingLeft: '2rem' }}>
                    {/* Vertical line */}
                    <div style={{ position: 'absolute', left: '14px', top: 0, bottom: 0, width: '2px', background: 'var(--bg-tertiary)' }} />

                    {events.map((ev, i) => (
                        <div key={ev.id || i} style={{ position: 'relative', marginBottom: '1rem' }}>
                            {/* Dot */}
                            <div style={{
                                position: 'absolute', left: '-2rem', top: '0.75rem',
                                width: '12px', height: '12px', borderRadius: '50%',
                                background: ev.event_type === 'enter' ? 'var(--success-500)' : ev.event_type === 'exit' ? 'var(--warning-500)' : 'var(--primary-500)',
                                border: '2px solid var(--bg-secondary)',
                                transform: 'translateX(8px)',
                            }} />

                            <div style={{
                                background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem',
                                border: '1px solid var(--bg-tertiary)', marginLeft: '0.5rem',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                            {ev.event_type === 'enter' ? `🚪 ${t('timeline.entered')}` : ev.event_type === 'exit' ? `🚶 ${t('timeline.exited')}` : '📌'} {ev.description || ev.to_room_name || ev.from_room_name || t('common.unknown')}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <span><Clock size={12} style={{ display: 'inline', marginRight: '2px' }} /> {formatTime(ev.timestamp)}</span>
                                            {ev.from_room_name && ev.to_room_name && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <MapPin size={12} /> {ev.from_room_name} <ArrowRight size={12} /> {ev.to_room_name}
                                                </span>
                                            )}
                                            {ev.duration_minutes && <span>⏱ {calcDuration(ev.timestamp)}</span>}
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
                                        background: ev.event_type === 'enter' ? 'var(--success-500-10)' : 'var(--warning-500-10)',
                                        color: ev.event_type === 'enter' ? 'var(--success-400)' : 'var(--warning-400)',
                                    }}>
                                        {ev.event_type}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
