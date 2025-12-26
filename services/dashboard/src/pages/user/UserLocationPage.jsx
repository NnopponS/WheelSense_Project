/**
 * UserLocationPage - Location tracking page for users
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { MapPin, Battery } from 'lucide-react';

export function UserLocationPage() {
    const { currentUser, rooms, wheelchairs, wheelchairPositions, language } = useApp();
    const { t } = useTranslation(language);

    // Early return if currentUser is not available
    if (!currentUser) {
        return (
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                    <p>{t ? t('Loading user data...') : 'Loading user data...'}</p>
                </div>
            </div>
        );
    }

    const myWheelchair = wheelchairs.find(w => w.id === currentUser?.wheelchairId);

    // Find room using flexible matching (by id, roomType, or nameEn)
    let myRoom = rooms.find(r => r.id === currentUser?.room);
    if (!myRoom && currentUser?.room) {
        myRoom = rooms.find(r => r.roomType?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser?.room) {
        myRoom = rooms.find(r => r.nameEn?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser?.room) {
        myRoom = rooms.find(r => r.name?.toLowerCase().includes(currentUser.room?.toLowerCase() || ''));
    }

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📍 {t('My Location')}</h2>
                <p>{t('View current location on map')}</p>
            </div>

            {/* Current Location Card */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{
                        width: 80, height: 80, margin: '0 auto 1rem',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <MapPin size={36} color="white" />
                    </div>
                    <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{myRoom?.name || t('Unknown Location')}</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>{myRoom?.nameEn}</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1rem' }}>
                        <div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--info-500)' }}>{myRoom?.temperature}°C</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('Temperature')}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--info-500)' }}>{myRoom?.humidity}%</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('Humidity')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="map-container" style={{ minHeight: '400px' }}>
                <div className="map-canvas">
                    {rooms.map(room => (
                        <div
                            key={room.id}
                            className={`room ${room.id === currentUser?.room ? 'occupied' : ''}`}
                            style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%` }}
                        >
                            <span className="room-label">{room.nameEn || room.name}</span>
                        </div>
                    ))}
                    {/* Only show user's own position */}
                    {myRoom && myWheelchair && (() => {
                        const storedPos = wheelchairPositions[myWheelchair.id];
                        const markerX = storedPos ? storedPos.x : (myRoom.x + myRoom.width / 2);
                        const markerY = storedPos ? storedPos.y : (myRoom.y + myRoom.height / 2);
                        return (
                            <div
                                className="wheelchair-marker"
                                style={{
                                    left: `${markerX}%`,
                                    top: `${markerY}%`
                                }}
                                title={`${myWheelchair.name} - ${currentUser?.name || t('User')} • ${myRoom?.nameEn || myRoom?.name || t('Unknown Location')}`}
                            >
                                <span style={{ fontSize: '1rem' }}>📍</span>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Wheelchair Info */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Battery size={18} /> {t('Wheelchair Information')}</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Model')}</div>
                            <div style={{ fontWeight: 500 }}>{myWheelchair?.name}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>ID</div>
                            <div style={{ fontWeight: 500 }}>{myWheelchair?.id}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Battery')}</div>
                            <div style={{ fontWeight: 500, color: myWheelchair?.battery < 20 ? 'var(--danger-500)' : 'var(--success-500)' }}>
                                {myWheelchair?.battery}%
                            </div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Status')}</div>
                            <div style={{ fontWeight: 500, color: 'var(--success-500)' }}>{t('Normal')}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default UserLocationPage;
