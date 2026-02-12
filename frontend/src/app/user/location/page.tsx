'use client';

import { useEffect, useState } from 'react';
import { MapPin, Activity, Accessibility, Wifi, Clock, Navigation } from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { getPatients, getWheelchairs, getMapData, getWheelchairPosition } from '@/lib/api';
import type { Room, Wheelchair } from '@/lib/api';

export default function UserLocationPage() {
    const { patients, setPatients, rooms, setRooms, wheelchairs, setWheelchairs } = useWheelSenseStore();
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [currentRoom, setCurrentRoom] = useState<Room | null>(null);

    const patient = patients[0];
    const wheelchair = (wheelchairs as any[]).find((w: any) => (w.patient_id || w.patientId) === patient?.id) || wheelchairs[0] as any;

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const [pRes, wRes, mRes] = await Promise.all([getPatients(), getWheelchairs(), getMapData()]);
            if (pRes.data) setPatients(pRes.data.patients as any || []);
            if (wRes.data) setWheelchairs(wRes.data.wheelchairs as any || []);
            if (mRes.data) setRooms(mRes.data.rooms as any || []);

            const wc = wRes.data?.wheelchairs?.[0];
            if (wc?.current_room_id && mRes.data?.rooms) {
                const room = mRes.data.rooms.find((r: Room) => r.id === wc.current_room_id);
                if (room) setCurrentRoom(room);
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const isDetected = !!(wheelchair?.current_room_id || wheelchair?.currentRoom);

    if (loading) return <div className="empty-state" style={{ height: '60vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Location Card */}
            <div className="card" style={{
                background: isDetected
                    ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))',
                border: `1px solid ${isDetected ? 'var(--success-500)' : 'var(--danger-500)'}44`,
            }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: isDetected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Navigation size={28} style={{ color: isDetected ? 'var(--success-500)' : 'var(--danger-500)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ margin: '0 0 0.25rem' }}>
                            {(currentRoom as any)?.name_en || (currentRoom as any)?.nameEn || currentRoom?.name || t('Unknown Location')}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: isDetected ? '#10b981' : '#ef4444',
                                display: 'inline-block',
                            }} />
                            {isDetected ? t('Active tracking') : t('Location not detected')}
                        </div>
                    </div>
                    <div style={{
                        padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)',
                        background: isDetected ? 'var(--success-500)' : 'var(--danger-500)',
                        color: 'white', fontWeight: 600, fontSize: '0.85rem',
                    }}>
                        {isDetected ? t('DETECTED') : t('NOT DETECTED')}
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title"><MapPin size={18} /> {t('Floor Map')}</span>
                </div>
                <div style={{
                    position: 'relative', minHeight: '400px',
                    background: 'var(--bg-secondary)',
                    borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                    overflow: 'hidden',
                }}>
                    {/* Grid */}
                    <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                        backgroundSize: '10% 10%', pointerEvents: 'none',
                    }} />

                    {rooms.map(room => {
                        const isCurrent = currentRoom?.id === room.id;
                        return (
                            <div key={room.id} style={{
                                position: 'absolute',
                                left: `${room.x}%`, top: `${room.y}%`,
                                width: `${room.width}%`, height: `${room.height}%`,
                                background: isCurrent
                                    ? 'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(5,150,105,0.3))'
                                    : 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))',
                                border: isCurrent ? '2px solid var(--success-500)' : '1px solid rgba(99,102,241,0.3)',
                                borderRadius: 'var(--radius-md)',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.3s ease',
                                boxShadow: isCurrent ? '0 0 20px rgba(16,185,129,0.3)' : 'none',
                            }}>
                                <span style={{
                                    fontWeight: isCurrent ? 700 : 500, fontSize: '0.8rem',
                                    color: 'var(--text-primary)', textAlign: 'center', padding: '0.25rem',
                                }}>
                                    {(room as any).name_en || (room as any).nameEn || room.name}
                                </span>
                                {isCurrent && <Accessibility size={20} style={{ color: 'var(--success-500)', marginTop: 2 }} />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Wheelchair Info */}
            {wheelchair && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    {[
                        { label: t('Wheelchair'), value: wheelchair.name || wheelchair.id, icon: <Accessibility size={18} />, color: '#6366f1' },
                        { label: t('Status'), value: wheelchair.status || t('Unknown'), icon: <Activity size={18} />, color: wheelchair.status === 'online' ? '#10b981' : '#f59e0b' },
                        { label: t('RSSI'), value: `${wheelchair.rssi ?? '-'} dBm`, icon: <Wifi size={18} />, color: '#8b5cf6' },
                        { label: t('Last Seen'), value: (wheelchair.last_seen || wheelchair.lastSeen) ? new Date(wheelchair.last_seen || wheelchair.lastSeen).toLocaleTimeString() : '-', icon: <Clock size={18} />, color: '#06b6d4' },
                    ].map((stat, i) => (
                        <div key={i} className="card">
                            <div className="card-body" style={{ padding: '0.75rem', textAlign: 'center' }}>
                                <div style={{ color: stat.color, marginBottom: '0.25rem' }}>{stat.icon}</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{stat.value}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stat.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
