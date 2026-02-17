'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Video, X, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { getRooms, Room } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function resolveWsBaseUrl(): string {
    try {
        const url = new URL(API_URL);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = '';
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        if (typeof window !== 'undefined') {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${window.location.hostname}:8000`;
        }
        return 'ws://localhost:8000';
    }
}

export default function UserVideoPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [streamMode, setStreamMode] = useState<'loading' | 'websocket' | 'offline'>('loading');
    const [loading, setLoading] = useState(true);
    const [hasFrame, setHasFrame] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const latestBlobUrlRef = useRef<string | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);
    const activeRoomRef = useRef<string | null>(null);
    const hasFrameRef = useRef(false);

    const cleanupImage = useCallback(() => {
        if (latestBlobUrlRef.current) {
            URL.revokeObjectURL(latestBlobUrlRef.current);
            latestBlobUrlRef.current = null;
        }
        if (imgRef.current) imgRef.current.src = '';
        hasFrameRef.current = false;
        setHasFrame(false);
    }, []);

    const disconnectWebSocket = useCallback(() => {
        if (reconnectTimerRef.current !== null) {
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        const ws = wsRef.current;
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            ws.close();
            wsRef.current = null;
        }
    }, []);

    const connectWebSocket = useCallback((roomId: string) => {
        disconnectWebSocket();
        cleanupImage();

        activeRoomRef.current = roomId;
        setStreamMode('loading');
        const wsBase = resolveWsBaseUrl();
        const wsUrl = `${wsBase}/api/ws/stream/${encodeURIComponent(roomId)}`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            reconnectAttemptRef.current = 0;
            setStreamMode('websocket');
        };

        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
                const blob = event.data instanceof Blob
                    ? event.data
                    : new Blob([event.data], { type: 'image/jpeg' });
                const nextUrl = URL.createObjectURL(blob);
                const previousUrl = latestBlobUrlRef.current;
                latestBlobUrlRef.current = nextUrl;
                if (imgRef.current) imgRef.current.src = nextUrl;
                if (previousUrl) URL.revokeObjectURL(previousUrl);

                if (!hasFrameRef.current) {
                    hasFrameRef.current = true;
                    setHasFrame(true);
                }
                return;
            }

            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'ping') ws.send('pong');
                } catch {
                    // Ignore non-JSON text frames.
                }
            }
        };

        ws.onerror = () => {
            setStreamMode('offline');
        };

        ws.onclose = () => {
            if (activeRoomRef.current !== roomId) return;
            cleanupImage();
            setStreamMode('offline');

            const attempt = reconnectAttemptRef.current;
            const backoffMs = Math.min(10000, 1000 * (2 ** attempt));
            reconnectAttemptRef.current = attempt + 1;

            reconnectTimerRef.current = window.setTimeout(() => {
                if (activeRoomRef.current === roomId) connectWebSocket(roomId);
            }, backoffMs);
        };

        wsRef.current = ws;
    }, [cleanupImage, disconnectWebSocket]);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await getRooms();
                if (res.data) setRooms(res.data.rooms);
            } catch (err) {
                console.error('Error loading rooms:', err);
            }
            setLoading(false);
        };
        load();
    }, []);

    useEffect(() => {
        if (!selectedRoom) {
            activeRoomRef.current = null;
            disconnectWebSocket();
            cleanupImage();
            setStreamMode('loading');
            return;
        }

        connectWebSocket(selectedRoom);
        return () => {
            disconnectWebSocket();
        };
    }, [selectedRoom, connectWebSocket, disconnectWebSocket, cleanupImage]);

    const selectedRoomData = selectedRoom ? rooms.find(r => r.id === selectedRoom) : null;
    const defaultRoom = rooms[0]?.id || null;

    useEffect(() => {
        if (!selectedRoom && defaultRoom) setSelectedRoom(defaultRoom);
    }, [defaultRoom, selectedRoom]);

    useEffect(() => {
        return () => {
            activeRoomRef.current = null;
            disconnectWebSocket();
            cleanupImage();
        };
    }, [disconnectWebSocket, cleanupImage]);

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
                <h2>📹 Room Video</h2>
                <p>View CCTV cameras of each room</p>
            </div>

            {/* Room Selection */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Video size={18} /> Select Room to View</span>
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
                                        : 'var(--bg-tertiary)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-lg)',
                                    color: selectedRoom === room.id ? 'white' : 'var(--text-primary)',
                                    cursor: 'pointer', textAlign: 'center', transition: '0.2s'
                                }}
                            >
                                <Video size={24} style={{ marginBottom: '0.5rem' }} />
                                <div style={{ fontWeight: 500 }}>{room.name_en || room.name}</div>
                                {selectedRoom === room.id && <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', opacity: 0.95 }}>📍 Your Location</div>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Video Player */}
            {selectedRoom && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="card-title">
                            <Video size={18} /> Camera — {selectedRoomData?.name || selectedRoom}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary" onClick={() => setIsFullscreen(!isFullscreen)} style={{ padding: '0.4rem' }}>
                                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setSelectedRoom(null)} style={{ padding: '0.4rem' }}>
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <div style={{
                            aspectRatio: '16/10',
                            minHeight: isFullscreen ? '70vh' : '300px',
                            position: 'relative',
                            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden'
                        }}>
                            <img
                                ref={imgRef}
                                alt={`${selectedRoomData?.name} Camera`}
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    display: hasFrame ? 'block' : 'none',
                                }}
                            />

                            {/* Placeholder when no video */}
                            <div style={{
                                width: '100%', height: '100%',
                                display: hasFrame ? 'none' : 'flex',
                                flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                position: 'absolute', top: 0, left: 0,
                                color: 'rgba(255,255,255,0.5)',
                                fontSize: '0.9rem'
                            }}>
                                {streamMode === 'loading' && (
                                    <div style={{
                                        marginBottom: '1rem', width: 48, height: 48,
                                        border: '4px solid rgba(255,255,255,0.1)',
                                        borderTop: '4px solid var(--primary-500)',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }} />
                                )}
                                <Video size={48} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '1rem' }} />
                                <p style={{ margin: 0, textAlign: 'center' }}>
                                    {streamMode === 'loading' && 'Connecting WebSocket...'}
                                    {streamMode === 'offline' && 'Camera Offline'}
                                    {streamMode === 'websocket' && !hasFrame && 'Waiting for video from camera'}
                                </p>
                            </div>

                            {streamMode === 'websocket' && (
                                <span style={{
                                    position: 'absolute', top: '0.75rem', left: '0.75rem',
                                    padding: '0.25rem 0.5rem',
                                    background: 'var(--danger-500)',
                                    color: 'white', borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.7rem', fontWeight: 700, zIndex: 2
                                }}>
                                    LIVE
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* No room selected placeholder */}
            {!selectedRoom && (
                <div className="card">
                    <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
                        <Video size={64} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: '1rem' }} />
                        <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Select Room to View Camera</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Click the room button above to view video streaming
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
