'use client';

import { useEffect, useState } from 'react';
import { getWheelchairs, Wheelchair } from '@/lib/api';
import { Accessibility, MapPin, Battery, Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function WheelchairsPage() {
    const [wheelchairs, setWheelchairs] = useState<Wheelchair[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const res = await getWheelchairs();
            if (res.data) setWheelchairs(res.data.wheelchairs);
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

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>♿ Wheelchairs</h2>
                <p>Manage and monitor registered wheelchairs</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {wheelchairs.length === 0 ? (
                    <div className="card">
                        <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <Accessibility size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <h3>No wheelchairs registered</h3>
                        </div>
                    </div>
                ) : (
                    wheelchairs.map(wc => (
                        <div key={wc.id} className="card" style={{ borderLeft: `4px solid ${wc.status === 'online' ? 'var(--success-500)' : 'var(--text-muted)'}` }}>
                            <div className="card-body">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Accessibility size={24} style={{ color: 'var(--primary-500)' }} />
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{wc.name}</div>
                                            {wc.patient_name && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{wc.patient_name}</div>}
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600,
                                        background: wc.status === 'online' ? 'rgba(34,197,94,0.15)' : 'rgba(156,163,175,0.15)',
                                        color: wc.status === 'online' ? 'var(--success-500)' : 'var(--text-muted)',
                                    }}>
                                        {wc.status === 'online' ? <Wifi size={12} style={{ display: 'inline', marginRight: '0.25rem' }} /> : <WifiOff size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />}
                                        {wc.status}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {wc.room_name && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <MapPin size={14} /> {wc.room_name}
                                        </span>
                                    )}
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <Battery size={14} /> {wc.battery_level}%
                                    </span>
                                    {wc.last_seen && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            Last seen: {new Date(wc.last_seen).toLocaleTimeString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
