'use client';

import React, { useEffect, useState } from 'react';
import { MapPin, Battery, RefreshCw } from 'lucide-react';
import {
    getPatients, getWheelchairs, getRooms,
    Patient, Wheelchair, Room
} from '@/lib/api';

export default function UserLocationPage() {
    const [patient, setPatient] = useState<Patient | null>(null);
    const [wheelchair, setWheelchair] = useState<Wheelchair | null>(null);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [patientsRes, wheelchairsRes, roomsRes] = await Promise.all([
                getPatients(),
                getWheelchairs(),
                getRooms(),
            ]);

            if (roomsRes.data) setRooms(roomsRes.data.rooms);

            if (patientsRes.data && patientsRes.data.patients.length > 0) {
                const p = patientsRes.data.patients[0];
                setPatient(p);

                if (wheelchairsRes.data) {
                    const wc = wheelchairsRes.data.wheelchairs.find(w => w.patient_id === p.id);
                    if (wc) setWheelchair(wc);
                }
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching location data:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
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
                <h2>📍 My Location</h2>
                <p>View current location on map</p>
            </div>

            {/* Current Location Card */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{
                        width: 80, height: 80, margin: '0 auto 1rem',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <MapPin size={36} color="white" />
                    </div>
                    <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                        📍 Current Location: {wheelchair?.room_name || 'Unknown'}
                    </h3>
                    <p style={{
                        fontSize: '0.9rem',
                        color: wheelchair?.room_name ? 'var(--success-500)' : 'var(--text-muted)',
                        fontWeight: 500
                    }}>
                        {wheelchair?.room_name ? '🟢 Active' : '⚪ Not Detected'}
                    </p>
                </div>
            </div>

            {/* Map */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body" style={{ padding: 0 }}>
                    <div style={{
                        position: 'relative',
                        minHeight: '400px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden'
                    }}>
                        {rooms.map(room => {
                            const isMyRoom = room.name === wheelchair?.room_name;
                            return (
                                <div
                                    key={room.id}
                                    style={{
                                        position: 'absolute',
                                        left: `${room.x}%`,
                                        top: `${room.y}%`,
                                        width: `${room.width}%`,
                                        height: `${room.height}%`,
                                        background: isMyRoom
                                            ? 'rgba(34, 197, 94, 0.25)'
                                            : 'rgba(59, 130, 246, 0.1)',
                                        border: isMyRoom
                                            ? '2px solid var(--success-500)'
                                            : '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.75rem',
                                        fontWeight: 500,
                                        transition: '0.2s'
                                    }}
                                >
                                    <span>{room.name_en || room.name}</span>
                                    {isMyRoom && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--success-500)', marginTop: '2px' }}>
                                            🟢 You are here
                                        </span>
                                    )}
                                </div>
                            );
                        })}

                        {/* My wheelchair marker */}
                        {wheelchair?.room_name && (() => {
                            const myRoom = rooms.find(r => r.name === wheelchair.room_name);
                            if (!myRoom) return null;
                            const x = myRoom.x + myRoom.width / 2;
                            const y = myRoom.y + myRoom.height / 2;
                            return (
                                <div style={{
                                    position: 'absolute',
                                    left: `${x}%`, top: `${y}%`,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 25,
                                    fontSize: '1.5rem'
                                }}>
                                    📍
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Wheelchair Info */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Battery size={18} /> Wheelchair Information</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Model</div>
                            <div style={{ fontWeight: 500 }}>{wheelchair?.name || '—'}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>ID</div>
                            <div style={{ fontWeight: 500 }}>{wheelchair?.id || '—'}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Battery</div>
                            <div style={{
                                fontWeight: 500,
                                color: (wheelchair?.battery_level || 0) < 20 ? 'var(--danger-500)' : 'var(--success-500)'
                            }}>
                                {wheelchair?.battery_level || 0}%
                            </div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Status</div>
                            <div style={{ fontWeight: 500, color: 'var(--success-500)', textTransform: 'capitalize' }}>
                                {wheelchair?.status || 'Offline'}
                            </div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Distance</div>
                            <div style={{ fontWeight: 500 }}>{wheelchair?.distance_m?.toFixed(1) || 0} m</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Speed</div>
                            <div style={{ fontWeight: 500 }}>{wheelchair?.speed_ms?.toFixed(2) || 0} m/s</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
