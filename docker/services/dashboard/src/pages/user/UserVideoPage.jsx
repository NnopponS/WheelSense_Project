/**
 * UserVideoPage - Video streaming page for users
 */

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Video, X, Maximize2, Minimize2, Zap, Lightbulb, Thermometer, Tv, Fan, Power, RotateCw } from 'lucide-react';
import * as api from '../../services/api';

export function UserVideoPage() {
    const { rooms, currentUser, appliances, toggleAppliance, devices } = useApp();
    const { t } = useTranslation();
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [videoSrc, setVideoSrc] = useState('');
    const [streamMode, setStreamMode] = useState('loading');
    const [rotationDegrees, setRotationDegrees] = useState(0);
    const [isRotating, setIsRotating] = useState(false);
    const wsRef = useRef(null);

    // Sync rotation state from device data when room/device changes
    useEffect(() => {
        if (selectedRoom) {
            const roomDevices = devices.filter(d => d.room === selectedRoom);
            if (roomDevices.length > 0) {
                const device = roomDevices[0];
                const deviceRotation = device.rotation || 0;
                setRotationDegrees(deviceRotation);
                console.log(`[UserVideoPage] Loaded rotation ${deviceRotation}° for device ${device.id || device.deviceId}`);
            }
        } else {
            setRotationDegrees(0);
        }
    }, [selectedRoom, devices]);

    // Setup WebSocket video stream when room is selected
    useEffect(() => {
        if (!selectedRoom) {
            setVideoSrc('');
            setStreamMode('loading');
            disconnectWebSocket();
            return;
        }

        connectWebSocket(selectedRoom);

        return () => {
            disconnectWebSocket();
        };
    }, [selectedRoom]);

    const connectWebSocket = async (roomId) => {
        disconnectWebSocket();

        try {
            const { getStreamUrlInfo } = await import('../../services/api');
            const streamInfo = await getStreamUrlInfo(roomId);

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = streamInfo.ws_url || `${protocol}//${host}/api/ws/stream/${roomId}`;

            console.log(`[UserVideo] Connecting to WebSocket: ${wsUrl}`);
            setStreamMode('loading');

            const ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                console.log(`[UserVideo] WebSocket connected for room: ${roomId}`);
                setStreamMode('websocket');
            };

            ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    const blob = new Blob([event.data], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    setVideoSrc(prev => {
                        if (prev && prev.startsWith('blob:')) {
                            URL.revokeObjectURL(prev);
                        }
                        return url;
                    });
                } else if (typeof event.data === 'string') {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'ping') {
                            ws.send(JSON.stringify({ type: 'pong' }));
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            };

            ws.onerror = (error) => {
                console.error('[UserVideo] WebSocket error:', error);
                setStreamMode('offline');
            };

            ws.onclose = () => {
                console.log('[UserVideo] WebSocket disconnected');
                setStreamMode('offline');
            };

            wsRef.current = ws;
        } catch (error) {
            console.error('[UserVideo] Failed to connect WebSocket:', error);
            setStreamMode('offline');
        }
    };

    const disconnectWebSocket = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (videoSrc && videoSrc.startsWith('blob:')) {
            URL.revokeObjectURL(videoSrc);
        }
    };

    const handleRotate = async (absoluteDegrees) => {
        // Use absolute rotation values: 0, 90, 180, 270
        setIsRotating(true);
        try {
            // Find device for this room
            const roomDevices = devices.filter(d => d.room === selectedRoom);
            if (roomDevices.length > 0) {
                const deviceId = roomDevices[0].id || roomDevices[0].deviceId;
                console.log(`[UserVideoPage] Setting absolute rotation for camera ${deviceId} to ${absoluteDegrees}°`);

                // Call API with absolute rotation value
                const result = await api.rotateCamera(deviceId, absoluteDegrees);
                console.log('[UserVideoPage] Camera rotation successful:', result);

                // Update local state from API response
                if (result.rotation !== undefined) {
                    setRotationDegrees(result.rotation);
                } else {
                    setRotationDegrees(absoluteDegrees);
                }
            }
        } catch (error) {
            console.error('[UserVideoPage] Failed to rotate camera:', error);
            // Revert on error - reload from device
            const roomDevices = devices.filter(d => d.room === selectedRoom);
            if (roomDevices.length > 0) {
                const device = roomDevices[0];
                setRotationDegrees(device.rotation || 0);
            }
        } finally {
            setIsRotating(false);
        }
    };

    const selectedRoomData = selectedRoom ? rooms.find(r => r.id === selectedRoom) : null;
    const selectedRoomAppliances = selectedRoom ? (appliances[selectedRoom] || []) : [];

    const getIcon = (type) => {
        switch (type) {
            case 'light': return Lightbulb;
            case 'AC': return Thermometer;
            case 'tv': return Tv;
            case 'fan': return Fan;
            default: return Power;
        }
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📹 {t('Room Video')}</h2>
                <p>{t('View CCTV cameras of each room')}</p>
            </div>

            {/* Room Selection */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Video size={18} /> {t('Select Room to View')}</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                        {rooms.map(room => (
                            <button
                                key={room.id}
                                onClick={() => setSelectedRoom(room.id)}
                                style={{
                                    padding: '1rem',
                                    background: selectedRoom === room.id
                                        ? 'linear-gradient(135deg, var(--primary-500), var(--primary-700))'
                                        : room.id === currentUser?.room
                                            ? 'var(--success-600)'
                                            : 'var(--bg-tertiary)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-lg)',
                                    color: selectedRoom === room.id || room.id === currentUser?.room ? 'white' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    textAlign: 'center'
                                }}
                            >
                                <Video size={24} style={{ marginBottom: '0.5rem' }} />
                                <div style={{ fontWeight: 500 }}>{room.nameEn || room.name}</div>
                                {room.id === currentUser?.room && (
                                    <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', opacity: 0.8 }}>📍 {t('Your Location')}</div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Video Player */}
            {selectedRoom && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header">
                        <span className="card-title">
                            <Video size={18} /> {t('Camera')} - {selectedRoomData?.name}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setIsFullscreen(!isFullscreen)}
                            >
                                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedRoom(null)}>
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <div className="video-stream" style={{
                            aspectRatio: '16/10',
                            minHeight: isFullscreen ? '70vh' : '300px',
                            position: 'relative',
                            background: 'linear-gradient(135deg, var(--dark-bg), var(--dark-surface))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden'
                        }}>
                            {videoSrc && (
                                <img
                                    src={videoSrc}
                                    alt={`${selectedRoomData?.name} Camera`}
                                    style={{
                                        transform: `rotate(${rotationDegrees}deg)`,
                                        transition: 'transform 0.3s ease',
                                        // For 90° or 270° rotation, swap width/height to fill container properly
                                        width: (rotationDegrees % 180 === 90) ? 'auto' : '100%',
                                        height: (rotationDegrees % 180 === 90) ? '100%' : 'auto',
                                        maxWidth: (rotationDegrees % 180 === 90) ? 'none' : '100%',
                                        maxHeight: (rotationDegrees % 180 === 90) ? 'none' : '100%',
                                        objectFit: 'contain', // Show full image without cropping
                                        display: 'block'
                                    }}
                                />
                            )}
                            <div
                                id={`user-video-placeholder-${selectedRoom}`}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: videoSrc ? 'none' : 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'linear-gradient(135deg, var(--dark-bg), var(--dark-surface))',
                                    color: 'var(--dark-text-muted)',
                                    fontSize: '0.9rem',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    zIndex: 1
                                }}
                            >
                                {streamMode === 'loading' && (
                                    <div style={{
                                        marginBottom: '1rem',
                                        width: '48px',
                                        height: '48px',
                                        border: '4px solid rgba(255,255,255,0.1)',
                                        borderTop: '4px solid var(--primary-500)',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }} />
                                )}
                                <Video size={48} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '1rem' }} />
                                <p style={{ margin: 0, textAlign: 'center' }}>
                                    {streamMode === 'loading' && t('Connecting WebSocket...')}
                                    {streamMode === 'offline' && t('Camera Offline')}
                                    {streamMode === 'websocket' && !videoSrc && t('Waiting for video from camera')}
                                </p>
                            </div>
                            {streamMode === 'websocket' && (
                                <span className="video-live-badge" style={{ zIndex: 2 }}>LIVE</span>
                            )}


                        </div>
                    </div>
                </div>
            )
            }

            {/* Appliance Control for Selected Room */}
            {
                selectedRoom && selectedRoomAppliances.length > 0 && (
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title"><Zap size={18} /> {t('Appliance Control')} - {selectedRoomData?.name}</span>
                        </div>
                        <div className="card-body">
                            <div className="device-grid">
                                {selectedRoomAppliances.map(app => {
                                    const Icon = getIcon(app.type);
                                    return (
                                        <div
                                            key={app.id}
                                            className={`device-card ${app.state ? 'active' : ''}`}
                                            onClick={() => toggleAppliance(selectedRoom, app.id)}
                                        >
                                            <div className="device-icon"><Icon size={24} /></div>
                                            <div className="device-name">{app.name}</div>
                                            <div className="device-status">{app.state ? t('On') : t('Off')}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Info when no room selected */}
            {
                !selectedRoom && (
                    <div className="card">
                        <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
                            <Video size={64} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: '1rem' }} />
                            <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('Select Room to View Camera')}</h3>
                            <p style={{ color: 'var(--text-muted)' }}>
                                {t('Click the room button above to view video streaming and control appliances')}
                            </p>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

export default UserVideoPage;
