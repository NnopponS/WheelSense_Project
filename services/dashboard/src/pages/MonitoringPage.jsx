import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Activity, Users, Cpu, AlertTriangle, Accessibility, MapPin } from 'lucide-react';
import * as api from '../services/api';

export function MonitoringPage() {
    const { wheelchairs, patients, devices, rooms, openDrawer, timeline, wheelchairPositions, language, detectionState, deviceHeartbeats } = useApp();
    const [liveStatus, setLiveStatus] = useState({}); // Map of deviceId -> { online: boolean, ... }

    // Compute real-time occupancy from detectionState and wheelchair positions
    const isRoomOccupied = (room) => {
        // Confidence threshold: 80% (0.8)
        const CONFIDENCE_THRESHOLD = 0.8;

        // Check detection state first (real-time camera detection)
        const detection = detectionState[room.id] ||
            detectionState[room.roomType?.toLowerCase()] ||
            detectionState[room.nameEn?.toLowerCase()];
        if (detection) {
            // Apply confidence threshold - only consider detected if confidence >= threshold
            const confidence = detection.confidence || 0.0;
            return detection.detected && confidence >= CONFIDENCE_THRESHOLD;
        }
        // Fallback: check if any wheelchair is in this room
        return wheelchairs.some(w =>
            w.room === room.id ||
            w.room === room.roomType?.toLowerCase() ||
            w.room === room.nameEn?.toLowerCase()
        );
    };
    const { t } = useTranslation(language);

    // Fetch live device status periodically (same as DevicesPage)
    useEffect(() => {
        const fetchLiveStatus = async () => {
            try {
                const liveNodes = await api.getNodesLiveStatus();
                const statusMap = {};
                liveNodes.forEach(node => {
                    const deviceId = node.device_id || node.deviceId || node.id;
                    if (deviceId) {
                        statusMap[deviceId] = {
                            online: node.online || false,
                            lastSeen: node.last_seen || node.lastSeen,
                            ...node
                        };
                        if (node.device_id && node.device_id !== deviceId) {
                            statusMap[node.device_id] = statusMap[deviceId];
                        }
                    }
                });
                setLiveStatus(statusMap);
            } catch (error) {
                console.error('[MonitoringPage] Failed to fetch live status:', error);
            }
        };

        fetchLiveStatus();
        const interval = setInterval(fetchLiveStatus, 5000);
        return () => clearInterval(interval);
    }, []);

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

    // Sync with DevicesPage: use same logic for calculating nodes and online devices
    const uniqueDevices = useMemo(() => {
        const byId = new Map();
        safeDevices.forEach((d) => {
            const id = d.id || d.deviceId;
            if (!id) return;

            const live = liveStatus[id] || liveStatus[d.deviceId] || liveStatus[d.id];
            let actualStatus = d.status || 'offline';
            
            if (live) {
                actualStatus = live.online ? 'online' : 'offline';
            } else if (d.lastSeen) {
                const lastSeenTime = new Date(d.lastSeen).getTime();
                const now = Date.now();
                const diff = now - lastSeenTime;
                actualStatus = diff < 30000 ? 'online' : 'offline';
            } else if (deviceHeartbeats?.[id]?.lastSeen) {
                const heartbeatTime = deviceHeartbeats[id].lastSeen;
                const now = Date.now();
                const diff = now - heartbeatTime;
                actualStatus = diff < 30000 ? 'online' : 'offline';
            }

            const existing = byId.get(id);
            if (!existing) {
                byId.set(id, { ...d, status: actualStatus });
            } else {
                const existingTime = existing.lastSeen ? new Date(existing.lastSeen).getTime() : 0;
                const currentTime = d.lastSeen ? new Date(d.lastSeen).getTime() : 0;
                if (currentTime >= existingTime) {
                    byId.set(id, { ...d, status: actualStatus });
                } else {
                    byId.set(id, { ...existing, status: actualStatus });
                }
            }
        });
        return Array.from(byId.values());
    }, [safeDevices, liveStatus, deviceHeartbeats]);

    // Filter to nodes (non-gateway devices) - same as DevicesPage
    const nodes = uniqueDevices.filter(d => d.id && d.type !== 'gateway');
    const onlineDevices = nodes.filter(d => d.status === 'online').length;
    const totalDevices = nodes.length;

    const onlineWheelchairs = safeWheelchairs.filter(w => w.status !== 'offline').length;
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
                        <h3>{onlineDevices}/{totalDevices}</h3>
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

                                            // Normalize room value for matching
                                            const roomLower = wc.room?.toLowerCase().trim() || '';

                                            // Try multiple matching strategies
                                            let r = safeRooms.find(r => r.id === wc.room) ||
                                                safeRooms.find(r => r.roomType?.toLowerCase() === roomLower) ||
                                                safeRooms.find(r => r.nameEn?.toLowerCase() === roomLower) ||
                                                safeRooms.find(r => r.name?.toLowerCase() === roomLower);

                                            // If still not found, try flexible matching with common room name variations
                                            if (!r) {
                                                // Map database room values to room types
                                                const roomTypeMap = {
                                                    'kitchen': 'kitchen',
                                                    'kitch': 'kitchen',
                                                    'bedroom': 'bedroom',
                                                    'bed room': 'bedroom',
                                                    'bathroom': 'bathroom',
                                                    'bath room': 'bathroom',
                                                    'livingroom': 'livingroom',
                                                    'living room': 'livingroom'
                                                };

                                                const mappedRoomType = roomTypeMap[roomLower] || roomLower;

                                                // Try to find room by roomType or nameEn containing the mapped value
                                                r = safeRooms.find(r => {
                                                    const rType = r.roomType?.toLowerCase() || '';
                                                    const rNameEn = r.nameEn?.toLowerCase() || '';
                                                    const rName = r.name?.toLowerCase() || '';

                                                    return rType === mappedRoomType ||
                                                        rNameEn.includes(mappedRoomType) ||
                                                        rName.includes(mappedRoomType) ||
                                                        (mappedRoomType === 'kitchen' && (rNameEn.includes('kitchen') || rName.includes('ครัว'))) ||
                                                        (mappedRoomType === 'bedroom' && (rNameEn.includes('bed') || rName.includes('นอน'))) ||
                                                        (mappedRoomType === 'bathroom' && (rNameEn.includes('bath') || rName.includes('น้ำ'))) ||
                                                        (mappedRoomType === 'livingroom' && (rNameEn.includes('living') || rName.includes('นั่ง')));
                                                });
                                            }

                                            // Return room name if found, otherwise show unknown (don't show raw "KITCHEN")
                                            return r ? (r.nameEn || r.name) : t('Unknown Location');
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
