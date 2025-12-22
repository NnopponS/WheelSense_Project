import React from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Activity, Users, Cpu, AlertTriangle, Accessibility, MapPin } from 'lucide-react';

export function MonitoringPage() {
    const { wheelchairs, patients, devices, rooms, openDrawer, timeline, wheelchairPositions, language } = useApp();
    const { t } = useTranslation(language);
    
    // Debug: Log when language changes
    React.useEffect(() => {
        console.log('[MonitoringPage] Language changed to:', language);
    }, [language]);

    const onlineWheelchairs = wheelchairs.filter(w => w.status !== 'offline').length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const todayAlerts = timeline.filter(t => t.type === 'alert').length;

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
                        <h3>{onlineWheelchairs}/{wheelchairs.length}</h3>
                        <p>{t('Wheelchairs Online')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Users /></div>
                    <div className="stat-content">
                        <h3>{patients.length}</h3>
                        <p>{t('Patients in System')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon info"><Cpu /></div>
                    <div className="stat-content">
                        <h3>{onlineDevices}/{devices.length}</h3>
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
                        {rooms.map(room => (
                            <div
                                key={room.id}
                                className={`room ${room.occupied ? 'occupied' : ''}`}
                                style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%` }}
                                onClick={() => openDrawer({ type: 'room', data: room })}
                            >
                                <span className="room-label">{room.nameEn || room.name}</span>
                                <span className="room-status">{room.occupied ? `🟢 ${t('Occupied')}` : `⚪ ${t('Vacant')}`}</span>
                            </div>
                        ))}
                        {wheelchairs.filter(w => w.room).map(wc => {
                            const room = rooms.find(r => r.id === wc.room);
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
                        {wheelchairs.map(wc => (
                            <div key={wc.id} className="list-item" onClick={() => openDrawer({ type: 'wheelchair', data: wc })}>
                                <div className="list-item-avatar">
                                    <Accessibility size={20} />
                                </div>
                                <div className="list-item-content">
                                    <div className="list-item-title">{wc.name}</div>
                                    <div className="list-item-subtitle">
                                        {wc.patientName || t('No User')} • {wc.room ? (rooms.find(r => r.id === wc.room)?.nameEn || rooms.find(r => r.id === wc.room)?.name) : t('Unknown Location')}
                                    </div>
                                </div>
                                <span className={`list-item-badge ${wc.status}`}>{wc.status === 'normal' ? t('Normal') : wc.status === 'warning' ? t('Warning') : wc.status === 'alert' ? t('Emergency') : t('Offline')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
