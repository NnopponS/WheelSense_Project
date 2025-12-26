import React from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Activity, Users, Cpu, AlertTriangle, Accessibility, MapPin } from 'lucide-react';

export function MonitoringPage() {
    const { wheelchairs, patients, devices, rooms, openDrawer, timeline, wheelchairPositions, language, detectionState } = useApp();

    // Compute real-time occupancy from detectionState and wheelchair positions
    const isRoomOccupied = (room) => {
        // Check detection state first (real-time camera detection)
        const detection = detectionState[room.id] ||
            detectionState[room.roomType?.toLowerCase()] ||
            detectionState[room.nameEn?.toLowerCase()];
        if (detection) {
            return detection.detected;
        }
        // Fallback: check if any wheelchair is in this room
        return wheelchairs.some(w =>
            w.room === room.id ||
            w.room === room.roomType?.toLowerCase() ||
            w.room === room.nameEn?.toLowerCase()
        );
    };
    const { t } = useTranslation(language);

    // Debug: Log when language changes
    React.useEffect(() => {
        console.log('[MonitoringPage] Language changed to:', language);
    }, [language]);

    // Defensive checks: ensure arrays are defined
    const safeWheelchairs = wheelchairs || [];
    const safePatients = patients || [];
    const safeDevices = devices || [];
    const safeRooms = rooms || [];
    const safeTimeline = timeline || [];

    const onlineWheelchairs = safeWheelchairs.filter(w => w.status !== 'offline').length;
    const onlineDevices = safeDevices.filter(d => d.status === 'online').length;
    const todayAlerts = safeTimeline.filter(t => t.type === 'alert').length;

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>🎯 {t('Live Monitoring')}</h2>
                <p>{t('Monitor Wheelchair and patient status in real-time')}</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon primary"><Accessibility /></div>
                    <div className="stat-content">
                        <h3>{onlineWheelchairs}/{safeWheelchairs.length}</h3>
                        <p>{t('Wheelchairs Online')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Users /></div>
                    <div className="stat-content">
                        <h3>{safePatients.length}</h3>
                        <p>{t('Patients in System')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon info"><Cpu /></div>
                    <div className="stat-content">
                        <h3>{onlineDevices}/{safeDevices.length}</h3>
                        <p>{t('Devices Online')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon warning"><AlertTriangle /></div>
                    <div className="stat-content">
                        <h3>{todayAlerts}</h3>
                        <p>{t('Alerts Today')}</p>
                    </div>
                </div>
            </div>

            <div className="content-grid">
                <div className="map-container">
                    <div className="map-canvas">
                        {safeRooms.map(room => (
                            <div
                                key={room.id}
                                className={`room ${isRoomOccupied(room) ? 'occupied' : ''}`}
                                style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%` }}
                                onClick={() => openDrawer({ type: 'room', data: room })}
                            >
                                <span className="room-label">{room.nameEn || room.name}</span>
                                <span className="room-status">{isRoomOccupied(room) ? `🟢 ${t('Occupied')}` : `⚪ ${t('Vacant')}`}</span>
                            </div>
                        ))}
                        {safeWheelchairs.filter(w => w.room).map(wc => {
                            let room = safeRooms.find(r => r.id === wc.room);

                            // Fallback: search by name/type if ID match fails
                            if (!room && wc.room) {
                                const lowerRoom = wc.room.toLowerCase();
                                room = safeRooms.find(r =>
                                    (r.roomType && r.roomType.toLowerCase() === lowerRoom) ||
                                    (r.nameEn && r.nameEn.toLowerCase() === lowerRoom) ||
                                    (r.name && r.name.toLowerCase().includes(lowerRoom)) ||
                                    r.id.toLowerCase().includes(lowerRoom)
                                );
                            }

                            if (!room) return null;
                            // Use same positioning as MapPage - use stored position if available
                            const storedPos = wheelchairPositions[wc.id];
                            const markerX = storedPos ? storedPos.x : (room.x + room.width / 2);
                            const markerY = storedPos ? storedPos.y : (room.y + room.height / 2);
                            return (
                                <div
                                    key={wc.id}
                                    className="wheelchair-marker"
                                    style={{
                                        left: `${markerX}%`,
                                        top: `${markerY}%`
                                    }}
                                    title={`${wc.name} - ${wc.patientName || t('No User')}`}
                                    onClick={(e) => { e.stopPropagation(); openDrawer({ type: 'wheelchair', data: wc }); }}
                                >
                                    <Accessibility size={18} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="list-container">
                    <div className="list-header">
                        <span className="list-title"><Users size={18} /> {t('Wheelchair List')}</span>
                        <div className="list-filters">
                            <span className="filter-chip active">{t('All')}</span>
                            <span className="filter-chip">{t('Online')}</span>
                            <span className="filter-chip">{t('Alert')}</span>
                        </div>
                    </div>
                    <div className="list-body">
                        {safeWheelchairs.map(wc => (
                            <div key={wc.id} className="list-item" onClick={() => openDrawer({ type: 'wheelchair', data: wc })}>
                                <div className="list-item-avatar">
                                    <Accessibility size={20} />
                                </div>
                                <div className="list-item-content">
                                    <div className="list-item-title">{wc.name}</div>
                                    <div className="list-item-subtitle">
                                        {wc.patientName || t('No User')} • {(() => {
                                            if (!wc.room) return t('Unknown Location');
                                            const r = safeRooms.find(r => r.id === wc.room) ||
                                                safeRooms.find(r => r.roomType?.toLowerCase() === wc.room.toLowerCase()) ||
                                                safeRooms.find(r => r.nameEn?.toLowerCase() === wc.room.toLowerCase());
                                            return r ? (r.nameEn || r.name) : wc.room;
                                        })()}
                                    </div>
                                </div>
                                <span className={`list-item-badge ${wc.status}`}>{wc.status === 'normal' || wc.status === 'online' ? t('Normal') : wc.status === 'warning' ? t('Warning') : wc.status === 'alert' ? t('Emergency') : t('Offline')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
