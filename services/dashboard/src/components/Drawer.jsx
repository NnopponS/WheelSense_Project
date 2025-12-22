import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { X, Accessibility, MapPin, Clock, Activity, Lightbulb, Thermometer, Tv, Fan, Power, Video, User, Edit2 } from 'lucide-react';
import { getStreamUrlInfo } from '../services/api';

export function Drawer() {
    const { drawerOpen, drawerContent, closeDrawer, rooms, appliances, toggleAppliance, patients, wheelchairs, language } = useApp();
    const { t } = useTranslation(language);
    const [videoSrc, setVideoSrc] = useState('');
    const [streamMode, setStreamMode] = useState('loading'); // 'loading', 'websocket', 'offline'
    const wsRef = useRef(null);
    const canvasRef = useRef(null);

    // Setup WebSocket video stream when room drawer opens
    useEffect(() => {
        if (!drawerContent) {
            setVideoSrc('');
            setStreamMode('loading');
            disconnectWebSocket();
            return;
        }

        const { type, data } = drawerContent;

        if (type === 'room' && drawerOpen && data?.id) {
            connectWebSocket(data.id);
        } else {
            // Clear video when drawer closes or not a room
            setVideoSrc('');
            setStreamMode('loading');
            disconnectWebSocket();
        }

        return () => {
            disconnectWebSocket();
        };
    }, [drawerContent, drawerOpen]);

    const connectWebSocket = (roomId) => {
        disconnectWebSocket();
        
        // Get WebSocket URL from API
        const getWsUrl = async () => {
            try {
                const streamInfo = await getStreamUrlInfo(roomId);
                
                // Use relative WebSocket URL that works with nginx proxy
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host; // This will be the nginx proxy host
                const wsUrl = streamInfo.ws_url || `${protocol}//${host}/api/ws/stream/${roomId}`;
                
                // Ensure protocol is correct
                const wsUrlFinal = wsUrl.replace(/^https?:/, protocol).replace(/^ws?:/, protocol);
                
                console.log(`[Video] Connecting to WebSocket: ${wsUrlFinal}`);
                setStreamMode('loading');
                
                const ws = new WebSocket(wsUrlFinal);
                ws.binaryType = 'arraybuffer';
                
                ws.onopen = () => {
                    console.log(`[Video] WebSocket connected for room: ${roomId}`);
                    setStreamMode('websocket');
                };
                
                ws.onmessage = (event) => {
                    if (event.data instanceof ArrayBuffer) {
                        // Binary JPEG frame
                        const blob = new Blob([event.data], { type: 'image/jpeg' });
                        const url = URL.createObjectURL(blob);
                        setVideoSrc(url);
                        
                        // Revoke old URL to prevent memory leak
                        if (videoSrc && videoSrc.startsWith('blob:')) {
                            URL.revokeObjectURL(videoSrc);
                        }
                    } else if (typeof event.data === 'string') {
                        // Text message (ping/pong, status, etc.)
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
                    console.error('[Video] WebSocket error:', error);
                    setStreamMode('offline');
                };
                
                ws.onclose = () => {
                    console.log('[Video] WebSocket disconnected');
                    setStreamMode('offline');
                    setVideoSrc('');
                };
                
                wsRef.current = ws;
            } catch (error) {
                console.error('[Video] Failed to connect WebSocket:', error);
                setStreamMode('offline');
            }
        };
        
        getWsUrl();
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

    if (!drawerContent) return null;

    const { type, data } = drawerContent;

    return (
        <>
            {drawerOpen && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }}
                    onClick={closeDrawer}
                />
            )}
            <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
                <div className="modal-header">
                    <span className="modal-title">
                        {type === 'wheelchair' && `🦽 ${t('Wheelchair Details')}`}
                        {type === 'room' && `🏠 ${t('Room Details')}`}
                        {type === 'patient' && `👤 ${t('Patient Details')}`}
                        {type === 'patient-edit' && `✏️ ${t('Edit Patient')}`}
                    </span>
                    <button className="modal-close" onClick={closeDrawer}><X size={20} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {/* Wheelchair Detail */}
                    {type === 'wheelchair' && (
                        <div style={{ padding: '1.5rem' }}>
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <div style={{
                                    width: 80, height: 80,
                                    background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                                    borderRadius: '50%', margin: '0 auto 1rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Accessibility size={40} color="white" />
                                </div>
                                <h3>{data.name}</h3>
                                <p style={{ color: 'var(--dark-text-muted)' }}>{data.id}</p>
                                <span className={`list-item-badge ${data.status}`} style={{ marginTop: '0.5rem' }}>
                                    {data.status === 'normal' ? t('Normal') : data.status === 'warning' ? t('Warning') : data.status === 'alert' ? t('Emergency') : 'Offline'}
                                </span>
                            </div>

                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-header"><span className="card-title"><User size={16} /> {t('User')}</span></div>
                                <div className="card-body">
                                    {data.patientName ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div className="list-item-avatar">{data.patientName?.charAt(0)}</div>
                                            <div>
                                                <div style={{ fontWeight: 500 }}>{data.patientName}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--dark-text-muted)' }}>ID: {data.patientId}</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p style={{ color: 'var(--dark-text-muted)' }}>{t('No User')}</p>
                                    )}
                                </div>
                            </div>

                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-header"><span className="card-title"><MapPin size={16} /> {t('Current Location')}</span></div>
                                <div className="card-body">
                                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--primary-400)' }}>
                                        {(rooms.find(r => r.id === data.room)?.nameEn || rooms.find(r => r.id === data.room)?.name) || t('Unknown Location')}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--dark-text-muted)', marginTop: '0.25rem' }}>
                                        {t('Here since')} {data.lastSeen ? new Date(data.lastSeen).toLocaleTimeString('en-US') : '-'}
                                    </div>
                                </div>
                            </div>

                            <button className="btn btn-primary" style={{ width: '100%' }}>
                                <MapPin size={16} /> {t('View on Map')}
                            </button>
                        </div>
                    )}

                    {/* Room Detail with Appliance Control */}
                    {type === 'room' && (
                        <div style={{ padding: '1.5rem' }}>
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <div style={{
                                    width: 80, height: 80,
                                    background: data.occupied ? 'linear-gradient(135deg, var(--success-500), var(--success-600))' : 'var(--gray-600)',
                                    borderRadius: '1rem', margin: '0 auto 1rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2rem'
                                }}>
                                    🏠
                                </div>
                                <h3>{data.nameEn || data.name}</h3>
                                <p style={{ color: 'var(--dark-text-muted)' }}>{data.nameEn || data.name}</p>
                                <span className={`list-item-badge ${data.occupied ? 'normal' : 'offline'}`}>
                                    {data.occupied ? `🟢 ${t('Occupied')}` : `⚪ ${t('Vacant')}`}
                                </span>
                            </div>

                            {/* Video Stream */}
                            <div className="card" style={{ marginBottom: '1rem' }}>
                                <div className="card-header">
                                    <span className="card-title"><Video size={16} /> Live Camera</span>
                                    {streamMode === 'websocket' && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', marginLeft: '0.5rem' }}>
                                            ● WebSocket
                                        </span>
                                    )}
                                </div>
                                <div className="video-stream" style={{ aspectRatio: '16/10', position: 'relative', background: 'linear-gradient(135deg, var(--dark-bg), var(--dark-surface))' }}>
                                    {videoSrc && (
                                        <img
                                            key={`video-${data.id}`}
                                            src={videoSrc}
                                            alt={`${data.nameEn || data.name} Camera`}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                display: 'block',
                                                position: 'relative',
                                                zIndex: 2
                                            }}
                                            onLoad={(e) => {
                                                // Check if image is larger than placeholder (which is ~165 bytes / 1x1 pixel)
                                                const img = e.target;
                                                const placeholder = document.getElementById(`video-placeholder-${data.id}`);

                                                // If image dimensions are very small (placeholder), keep showing placeholder UI
                                                if (img.naturalWidth <= 10 || img.naturalHeight <= 10) {
                                                    console.log('Received placeholder frame, showing placeholder UI');
                                                    if (placeholder) {
                                                        placeholder.style.display = 'flex';
                                                    }
                                                    img.style.display = 'none';
                                                } else {
                                                    // Real video frame - hide placeholder
                                                    console.log('Received real video frame:', img.naturalWidth, 'x', img.naturalHeight);
                                                    if (placeholder) {
                                                        placeholder.style.display = 'none';
                                                    }
                                                    img.style.display = 'block';
                                                }
                                            }}
                                            onError={(e) => {
                                                // Show placeholder on error
                                                console.error('Video stream error for room:', data.id, e);
                                                e.target.style.display = 'none';
                                                const placeholder = document.getElementById(`video-placeholder-${data.id}`);
                                                if (placeholder) {
                                                    placeholder.style.display = 'flex';
                                                }
                                            }}
                                        />
                                    )}
                                    <div
                                        id={`video-placeholder-${data.id}`}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            display: 'flex',
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
                                            <div className="loading-spinner" style={{ marginBottom: '1rem', width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid var(--primary-500)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                        )}
                                        <Video size={48} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '1rem' }} />
                                        <p style={{ margin: 0, textAlign: 'center' }}>
                                            {streamMode === 'loading' && t('Connecting WebSocket...')}
                                            {streamMode === 'offline' && t('Camera Offline')}
                                            {!streamMode && t('Waiting for video from camera')}
                                        </p>
                                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', opacity: 0.7, textAlign: 'center' }}>
                                            {streamMode === 'loading' && t('Connecting to ESP32...')}
                                            {streamMode === 'offline' && t('Cannot Connect')}
                                            {streamMode === 'websocket' && t('Connected Successfully')}
                                        </p>
                                    </div>
                                    {streamMode === 'websocket' && (
                                        <span className="video-live-badge" style={{ zIndex: 2 }}>LIVE</span>
                                    )}
                                </div>
                            </div>

                            {/* Appliance Control */}
                            <div className="card">
                                <div className="card-header">
                                    <span className="card-title"><Power size={16} /> {t('Appliance Control')}</span>
                                </div>
                                <div className="card-body">
                                    <div className="device-grid">
                                        {(() => {
                                            // Find appliances by roomType, nameEn, or roomId
                                            const roomMapping = {
                                                'bedroom': ['bed room', 'bedroom', 'Bedroom'],
                                                'bathroom': ['bathroom', 'Bathroom'],
                                                'livingroom': ['living room', 'livingroom', 'Living Room'],
                                                'kitchen': ['kitchen', 'Kitchen']
                                            };
                                            
                                            let roomAppliances = appliances[data.id] || [];
                                            
                                            // Try by roomType
                                            if (roomAppliances.length === 0 && data.roomType) {
                                                roomAppliances = appliances[data.roomType.toLowerCase()] || [];
                                            }
                                            
                                            // Try by nameEn
                                            if (roomAppliances.length === 0 && data.nameEn) {
                                                roomAppliances = appliances[data.nameEn.toLowerCase()] || [];
                                            }
                                            
                                            // Try by name mapping
                                            if (roomAppliances.length === 0) {
                                                for (const [key, names] of Object.entries(roomMapping)) {
                                                    const roomName = (data.name || '').toLowerCase();
                                                    const roomNameEn = (data.nameEn || '').toLowerCase();
                                                    if (names.some(n => roomName.includes(n.toLowerCase()) || roomNameEn.includes(n.toLowerCase()) || n.toLowerCase().includes(roomName) || n.toLowerCase().includes(roomNameEn))) {
                                                        roomAppliances = appliances[key] || [];
                                                        break;
                                                    }
                                                }
                                            }
                                            
                                            return roomAppliances.map(app => {
                                                const Icon = app.type === 'light' ? Lightbulb :
                                                    app.type === 'AC' ? Thermometer :
                                                        app.type === 'tv' ? Tv :
                                                            app.type === 'fan' ? Fan : Power;
                                                
                                                // Get room key for toggleAppliance
                                                let roomKey = data.roomType?.toLowerCase() || data.nameEn?.toLowerCase() || data.id;
                                                for (const [key, names] of Object.entries(roomMapping)) {
                                                    const roomName = (data.name || '').toLowerCase();
                                                    const roomNameEn = (data.nameEn || '').toLowerCase();
                                                    if (names.some(n => roomName.includes(n.toLowerCase()) || roomNameEn.includes(n.toLowerCase()))) {
                                                        roomKey = key;
                                                        break;
                                                    }
                                                }
                                                
                                                return (
                                                    <div
                                                        key={app.id}
                                                        className={`device-card ${app.state ? 'active' : ''}`}
                                                        onClick={() => toggleAppliance(roomKey, app.id)}
                                                    >
                                                        <div className="device-icon"><Icon size={24} /></div>
                                                        <div className="device-name">{app.name || (app.type === 'AC' ? 'AC' : app.type)}</div>
                                                        <div className="device-status">{app.state ? t('On') : t('Off')}</div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                    {(() => {
                                        // Same logic to check if appliances exist
                                        const roomMapping = {
                                            'bedroom': ['bed room', 'bedroom', 'Bedroom'],
                                            'bathroom': ['bathroom', 'Bathroom'],
                                            'livingroom': ['living room', 'livingroom', 'Living Room'],
                                            'kitchen': ['kitchen', 'Kitchen']
                                        };
                                        
                                        let roomAppliances = appliances[data.id] || [];
                                        
                                        if (roomAppliances.length === 0 && data.roomType) {
                                            roomAppliances = appliances[data.roomType.toLowerCase()] || [];
                                        }
                                        
                                        if (roomAppliances.length === 0 && data.nameEn) {
                                            roomAppliances = appliances[data.nameEn.toLowerCase()] || [];
                                        }
                                        
                                        if (roomAppliances.length === 0) {
                                            for (const [key, names] of Object.entries(roomMapping)) {
                                                const roomName = (data.name || '').toLowerCase();
                                                const roomNameEn = (data.nameEn || '').toLowerCase();
                                                if (names.some(n => roomName.includes(n.toLowerCase()) || roomNameEn.includes(n.toLowerCase()) || n.toLowerCase().includes(roomName) || n.toLowerCase().includes(roomNameEn))) {
                                                    roomAppliances = appliances[key] || [];
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        return roomAppliances.length === 0 ? (
                                            <p style={{ color: 'var(--dark-text-muted)', textAlign: 'center' }}>{t('No Appliances in This Room')}</p>
                                        ) : null;
                                    })()}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Patient Edit Form */}
                    {type === 'patient-edit' && (
                        <div style={{ padding: '1.5rem' }}>
                            <form>
                                <div className="form-group">
                                    <label className="form-label">{t('Full Name')}</label>
                                    <input type="text" className="form-input" defaultValue={data.name} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('Age')}</label>
                                    <input type="number" className="form-input" defaultValue={data.age} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('Health Status')}</label>
                                    <select className="form-input" defaultValue={data.condition}>
                                        <option value="Normal">{t('Normal')}</option>
                                        <option value="Caution">{t('Caution')}</option>
                                        <option value="Critical">{t('Critical')}</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Wheelchair</label>
                                    <select className="form-input" defaultValue={data.wheelchairId}>
                                        <option value="">-- {t('Not Specified')} --</option>
                                        {wheelchairs.map(wc => (
                                            <option key={wc.id} value={wc.id}>{wc.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </form>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                {(type === 'patient-edit' || type === 'wheelchair-edit') && (
                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={closeDrawer}>{t('Cancel')}</button>
                        <button className="btn btn-primary" onClick={closeDrawer}>{t('Save')}</button>
                    </div>
                )}
            </div>
        </>
    );
}
