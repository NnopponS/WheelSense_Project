import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Cpu, Plus, Edit2, Wifi, WifiOff, Video, Settings } from 'lucide-react';
import { getVideoStreamUrl, getStreamUrlInfo } from '../services/api';

// WebSocket Video Stream Component
function VideoStreamPlayer({ room, onClose, language }) {
    const { t } = useTranslation(language);
    const [videoSrc, setVideoSrc] = useState('');
    const [streamMode, setStreamMode] = useState('loading'); // 'loading', 'websocket', 'offline'
    const wsRef = useRef(null);
    const prevSrcRef = useRef('');

    const connectWebSocket = useCallback(async () => {
        if (!room?.id) return;

        try {
            const info = await getStreamUrlInfo(room.id);

            // Build WebSocket URL - use relative path for nginx proxy
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = info.ws_url || `${protocol}//${window.location.host}/api/ws/stream/${room.id}`;

            // Ensure protocol is correct
            const wsUrlFinal = wsUrl.replace(/^https?:/, protocol).replace(/^ws?:/, protocol);

            console.log(`[VideoPlayer] Connecting to WebSocket: ${wsUrlFinal}`);
            setStreamMode('loading');

            const ws = new WebSocket(wsUrlFinal);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                console.log(`[VideoPlayer] WebSocket connected for room: ${room.id}`);
                setStreamMode('websocket');
            };

            ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    // Binary JPEG frame
                    const blob = new Blob([event.data], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);

                    // Revoke old URL to prevent memory leak
                    if (prevSrcRef.current && prevSrcRef.current.startsWith('blob:')) {
                        URL.revokeObjectURL(prevSrcRef.current);
                    }

                    prevSrcRef.current = url;
                    setVideoSrc(url);
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
                console.error('[VideoPlayer] WebSocket error:', error);
                setStreamMode('offline');
            };

            ws.onclose = () => {
                console.log('[VideoPlayer] WebSocket disconnected');
                setStreamMode('offline');
            };

            wsRef.current = ws;
        } catch (error) {
            console.error('[VideoPlayer] Failed to connect WebSocket:', error);
            setStreamMode('offline');
        }
    }, [room?.id]);

    useEffect(() => {
        connectWebSocket();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (prevSrcRef.current && prevSrcRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(prevSrcRef.current);
            }
        };
    }, [connectWebSocket]);

    return (
        <div className="card">
            <div className="card-header">
                <span className="card-title"><Video size={16} /> {room.nameEn || room.name}</span>
                <span style={{
                    fontSize: '0.75rem',
                    color: streamMode === 'websocket' ? 'var(--success)' : 'var(--text-muted)',
                    marginLeft: '0.5rem'
                }}>
                    {streamMode === 'websocket' && `● ${t('WebSocket')}`}
                    {streamMode === 'loading' && `⏳ ${t('Connecting...')}`}
                    {streamMode === 'offline' && `○ ${t('No Signal')}`}
                </span>
            </div>
            <div className="video-stream" style={{ aspectRatio: '16/10', position: 'relative', background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))' }}>
                {videoSrc && streamMode === 'websocket' && (
                    <img
                        src={videoSrc}
                        alt={`${room.nameEn || room.name} Camera`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'relative', zIndex: 2 }}
                    />
                )}
                <div style={{
                    width: '100%', height: '100%',
                    display: streamMode !== 'websocket' ? 'flex' : 'none',
                    flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))',
                    color: 'var(--text-muted)', fontSize: '0.9rem',
                    position: 'absolute', top: 0, left: 0, zIndex: 1
                }}>
                    <Video size={48} style={{ color: 'rgba(255, 255, 255, 0.3)', marginBottom: '1rem' }} />
                    <p style={{ margin: 0, textAlign: 'center' }}>
                        {streamMode === 'loading' && t('Connecting WebSocket...')}
                        {streamMode === 'offline' && t('No signal from camera')}
                    </p>
                </div>
                {streamMode === 'websocket' && <span className="video-live-badge" style={{ zIndex: 2 }}>{t('LIVE')}</span>}
            </div>
        </div>
    );
}

export function DevicesPage() {
    const { devices, setDevices, rooms, role, language } = useApp();
    const { t } = useTranslation(language);
    const [activeTab, setActiveTab] = useState('nodes');
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [streamUrls, setStreamUrls] = useState({});

    const nodes = devices.filter(d => d.type === 'node');
    const gateways = devices.filter(d => d.type === 'gateway');

    // Fetch direct stream URLs for all online nodes
    useEffect(() => {
        if (activeTab === 'video') {
            const fetchStreamUrls = async () => {
                const urls = {};
                for (const node of nodes.filter(n => n.status === 'online')) {
                    try {
                        const info = await getStreamUrlInfo(node.room);
                        urls[node.room] = info.stream_url || getVideoStreamUrl(node.room);
                    } catch (e) {
                        urls[node.room] = getVideoStreamUrl(node.room);
                    }
                }
                setStreamUrls(urls);
            };
            fetchStreamUrls();
        }
    }, [activeTab, nodes]);

    const handleToggleStatus = (deviceId) => {
        setDevices(prev => prev.map(d =>
            d.id === deviceId ? { ...d, status: d.status === 'online' ? 'offline' : 'online' } : d
        ));
    };

    const handleRenameDevice = (deviceId, newName) => {
        setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, name: newName } : d));
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>🔌 {t('Devices & Nodes')}</h2>
                <p>{t('Manage Node devices and Gateways in the system')}</p>
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-icon success"><Wifi /></div>
                    <div className="stat-content">
                        <h3>{devices.filter(d => d.status === 'online').length}</h3>
                        <p>{t('Devices Online')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon danger"><WifiOff /></div>
                    <div className="stat-content">
                        <h3>{devices.filter(d => d.status === 'offline').length}</h3>
                        <p>{t('Devices Offline')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon primary"><Video /></div>
                    <div className="stat-content">
                        <h3>{nodes.filter(d => d.status === 'online').length}</h3>
                        <p>{t('Video Streams')}</p>
                    </div>
                </div>
            </div>

            <div className="tabs">
                <button className={`tab ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => setActiveTab('nodes')}>
                    {t('Nodes')} ({nodes.length})
                </button>
                <button className={`tab ${activeTab === 'gateways' ? 'active' : ''}`} onClick={() => setActiveTab('gateways')}>
                    {t('Gateways')} ({gateways.length})
                </button>
                <button className={`tab ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>
                    {t('Video Streams')}
                </button>
            </div>

            {activeTab === 'nodes' && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Cpu size={18} /> {t('Nodes')}</span>
                        {role === 'admin' && (
                            <button className="btn btn-primary"><Plus size={16} /> {t('Add Node')}</button>
                        )}
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>{t('ID')}</th>
                                    <th>{t('Name')}</th>
                                    <th>{t('Room')}</th>
                                    <th>{t('IP')}</th>
                                    <th>{t('Status')}</th>
                                    {role === 'admin' && <th>{t('Actions')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {nodes.map(node => (
                                    <tr key={node.id}>
                                        <td><code>{node.id}</code></td>
                                        <td>{node.name}</td>
                                        <td>{rooms.find(r => r.id === node.room)?.name || '-'}</td>
                                        <td><code>{node.ip}</code></td>
                                        <td>
                                            <span className={`list-item-badge ${node.status === 'online' ? 'normal' : 'offline'}`}>
                                                {node.status === 'online' ? `🟢 ${t('Online')}` : `🔴 ${t('Offline')}`}
                                            </span>
                                        </td>
                                        {role === 'admin' && (
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-secondary btn-icon"><Edit2 size={16} /></button>
                                                    <button className="btn btn-secondary btn-icon" onClick={() => setSelectedRoom(node.room)}>
                                                        <Video size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'gateways' && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Settings size={18} /> {t('Gateways')}</span>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>{t('ID')}</th>
                                    <th>{t('Name')}</th>
                                    <th>{t('IP')}</th>
                                    <th>{t('Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gateways.map(gw => (
                                    <tr key={gw.id}>
                                        <td><code>{gw.id}</code></td>
                                        <td>{gw.name}</td>
                                        <td><code>{gw.ip}</code></td>
                                        <td>
                                            <span className={`list-item-badge ${gw.status === 'online' ? 'normal' : 'offline'}`}>
                                                {gw.status === 'online' ? `🟢 ${t('Online')}` : `🔴 ${t('Offline')}`}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'video' && (
                <div>
                    {/* Room Selection */}
                    <div className="card" style={{ marginBottom: '1rem' }}>
                        <div className="card-header">
                            <span className="card-title"><Video size={18} /> {t('Select Room to View')}</span>
                        </div>
                        <div className="card-body">
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                                {/* View All Button */}
                                <button
                                    onClick={() => setSelectedRoom('all')}
                                    style={{
                                        padding: '1rem',
                                        background: selectedRoom === 'all' ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                        border: 'none',
                                        borderRadius: 'var(--radius-lg)',
                                        color: selectedRoom === 'all' ? 'white' : 'var(--text-primary)',
                                        cursor: 'pointer',
                                        transition: '0.2s',
                                        textAlign: 'center'
                                    }}
                                >
                                    <Video size={24} style={{ marginBottom: '0.5rem' }} />
                                    <div style={{ fontWeight: 500 }}>📺 {t('View All Rooms')}</div>
                                </button>

                                {/* Room Buttons */}
                                {rooms.map(room => (
                                    <button
                                        key={room.id}
                                        onClick={() => setSelectedRoom(room.id)}
                                        style={{
                                            padding: '1rem',
                                            background: selectedRoom === room.id ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                            border: 'none',
                                            borderRadius: 'var(--radius-lg)',
                                            color: selectedRoom === room.id ? 'white' : 'var(--text-primary)',
                                            cursor: 'pointer',
                                            transition: '0.2s',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <Video size={24} style={{ marginBottom: '0.5rem' }} />
                                        <div style={{ fontWeight: 500 }}>{room.nameEn || room.name}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Video Grid - Auto Grid Size based on number of rooms */}
                    {selectedRoom && (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: selectedRoom === 'all'
                                ? `repeat(${Math.min(Math.ceil(Math.sqrt(rooms.length)), 2)}, 1fr)`
                                : '1fr',
                            gap: '1rem'
                        }}>
                            {(selectedRoom === 'all' ? rooms : rooms.filter(r => r.id === selectedRoom)).map(room => (
                                <VideoStreamPlayer key={room.id} room={room} language={language} />
                            ))}
                        </div>
                    )}

                    {/* Show message when no room selected */}
                    {!selectedRoom && (
                        <div className="card">
                            <div className="card-body" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                <Video size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                <p>{t('Please select a room to view camera, or click "View All Rooms" to view all at once')}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
