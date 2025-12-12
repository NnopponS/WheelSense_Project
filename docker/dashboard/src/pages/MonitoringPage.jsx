import React from 'react';
import { useApp } from '../context/AppContext';
import { Activity, Users, Cpu, AlertTriangle, Accessibility, MapPin } from 'lucide-react';

export function MonitoringPage() {
    const { wheelchairs, patients, devices, rooms, openDrawer, timeline, wheelchairPositions } = useApp();

    const onlineWheelchairs = wheelchairs.filter(w => w.status !== 'offline').length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const todayAlerts = timeline.filter(t => t.type === 'alert').length;

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>🎯 Live Monitoring</h2>
                <p>ติดตามสถานะ Wheelchair และผู้ป่วยแบบ Real-time</p>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon primary"><Accessibility /></div>
                    <div className="stat-content">
                        <h3>{onlineWheelchairs}/{wheelchairs.length}</h3>
                        <p>Wheelchairs Online</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Users /></div>
                    <div className="stat-content">
                        <h3>{patients.length}</h3>
                        <p>ผู้ป่วยในระบบ</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon info"><Cpu /></div>
                    <div className="stat-content">
                        <h3>{onlineDevices}/{devices.length}</h3>
                        <p>Devices Online</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon warning"><AlertTriangle /></div>
                    <div className="stat-content">
                        <h3>{todayAlerts}</h3>
                        <p>Alerts วันนี้</p>
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
                                <span className="room-label">{room.name}</span>
                                <span className="room-status">{room.occupied ? '🟢 มีคน' : '⚪ ว่าง'}</span>
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
                                    title={`${wc.name} - ${wc.patientName || 'ไม่มีผู้ใช้'}`}
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
                        <span className="list-title"><Users size={18} /> รายการ Wheelchair</span>
                        <div className="list-filters">
                            <span className="filter-chip active">ทั้งหมด</span>
                            <span className="filter-chip">Online</span>
                            <span className="filter-chip">Alert</span>
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
                                        {wc.patientName || 'ไม่มีผู้ใช้'} • {wc.room ? rooms.find(r => r.id === wc.room)?.name : 'ไม่ทราบตำแหน่ง'}
                                    </div>
                                </div>
                                <span className={`list-item-badge ${wc.status}`}>{wc.status === 'normal' ? 'ปกติ' : wc.status === 'warning' ? 'ระวัง' : wc.status === 'alert' ? 'ฉุกเฉิน' : 'Offline'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
