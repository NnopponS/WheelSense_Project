import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import * as api from '../services/api';
import { Cpu, Plus, Edit2, Wifi, WifiOff, Video, Settings, Trash2, Wrench, Trash, RotateCw } from 'lucide-react';
import { getVideoStreamUrl, getStreamUrlInfo } from '../services/api';

// WebSocket Video Stream Component with Rotation Controls
function VideoStreamPlayer({ room, onClose, language }) {
    const { t } = useTranslation(language);
    const [videoSrc, setVideoSrc] = useState('');
    const [streamMode, setStreamMode] = useState('loading'); // 'loading', 'websocket', 'offline'
    const [rotation, setRotation] = useState(0);
    const [isRotating, setIsRotating] = useState(false);
    const wsRef = useRef(null);
    const prevSrcRef = useRef('');

    // Find device for this room to get its ID
    const { devices } = useApp();
    const device = devices.find(d =>
        d.room === room.id ||
        d.roomType?.toLowerCase() === room.id?.toLowerCase() ||
        d.room === room.roomType
    );
    const deviceId = device?.id || device?.deviceId || room.id;

    // Load initial rotation from device
    useEffect(() => {
        if (device?.rotation !== undefined) {
            setRotation(device.rotation);
        }
    }, [device?.rotation]);

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
                        // Sync rotation from server
                        if (data.rotation !== undefined) {
                            setRotation(data.rotation);
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

    // Handle rotation click
    const handleRotate = async () => {
        setIsRotating(true);
        try {
            const newRotation = (rotation + 90) % 360;
            const response = await api.rotateCamera(deviceId, newRotation);
            if (response?.rotation !== undefined) {
                setRotation(response.rotation);
            } else {
                setRotation(newRotation);
            }
            console.log(`[VideoPlayer] Rotated ${room.id} to ${newRotation}°`);
        } catch (error) {
            console.error('[VideoPlayer] Rotation failed:', error);
        } finally {
            setIsRotating(false);
        }
    };

    return (
        <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="card-title"><Video size={16} /> {room.nameEn || room.name}</span>
                    <span style={{
                        fontSize: '0.75rem',
                        color: streamMode === 'websocket' ? 'var(--success)' : 'var(--text-muted)',
                    }}>
                        {streamMode === 'websocket' && `● ${t('WebSocket')}`}
                        {streamMode === 'loading' && `⏳ ${t('Connecting...')}`}
                        {streamMode === 'offline' && `○ ${t('No Signal')}`}
                    </span>
                </div>
                {/* Rotation Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {rotation}°
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-icon"
                        onClick={handleRotate}
                        disabled={isRotating || streamMode !== 'websocket'}
                        title={t('Rotate Camera') + ' (+90°)'}
                        style={{ padding: '0.4rem', borderRadius: 'var(--radius)' }}
                    >
                        <RotateCw size={16} className={isRotating ? 'rotating' : ''} />
                    </button>
                </div>
            </div>
            <div className="video-stream" style={{
                aspectRatio: '16/10',
                position: 'relative',
                background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                {videoSrc && streamMode === 'websocket' && (
                    <img
                        src={videoSrc}
                        alt={`${room.nameEn || room.name} Camera`}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain', // Show full image without cropping
                            display: 'block',
                            position: 'relative',
                            zIndex: 2
                        }}
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


function DeviceEditForm({ device, onSave, onCancel, rooms, t }) {
    const [name, setName] = useState(device.name || '');
    const [room, setRoom] = useState(device.room || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ name, room });
    };

    return (
        <div className="card" style={{ border: 'none', boxShadow: 'none', maxWidth: '400px', margin: '0 auto' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                <span className="card-title" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Edit2 size={20} /> {t('Edit Device')}
                </span>
            </div>
            <div className="card-body">
                <form onSubmit={handleSubmit}>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>{t('Device Name')}</label>
                        <input
                            type="text"
                            className="form-control"
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                outline: 'none'
                            }}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>{t('Room')}</label>
                        <select
                            className="form-control"
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: 'var(--radius)',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                outline: 'none'
                            }}
                            value={room}
                            onChange={e => setRoom(e.target.value)}
                        >
                            <option value="">{t('Select Room')}</option>
                            {rooms.map(r => (
                                <option key={r.id} value={r.id}>{r.nameEn || r.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ padding: '0.75rem 1.5rem' }}>{t('Cancel')}</button>
                        <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>{t('Save Changes')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export function DevicesPage() {
    const { devices, setDevices, deleteDevice, updateDevice, openModal, closeModal, rooms, role, language, deviceHeartbeats, wheelchairs, setWheelchairs, addNotification } = useApp();
    const { t } = useTranslation(language);
    const [activeTab, setActiveTab] = useState('nodes');
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [streamUrls, setStreamUrls] = useState({});
    const [liveStatus, setLiveStatus] = useState({}); // Map of deviceId -> { online: boolean, ... }

    // Fetch live device status periodically
    useEffect(() => {
        const fetchLiveStatus = async () => {
            try {
                const liveNodes = await api.getNodesLiveStatus();
                const statusMap = {};
                liveNodes.forEach(node => {
                    // Try multiple ID fields to match devices
                    const deviceId = node.device_id || node.deviceId || node.id;
                    if (deviceId) {
                        // Store by all possible ID formats for matching
                        statusMap[deviceId] = {
                            online: node.online || false,
                            lastSeen: node.last_seen || node.lastSeen,
                            ...node
                        };
                        // Also store by device_id if different
                        if (node.device_id && node.device_id !== deviceId) {
                            statusMap[node.device_id] = statusMap[deviceId];
                        }
                    }
                });
                setLiveStatus(statusMap);
            } catch (error) {
                console.error('[DevicesPage] Failed to fetch live status:', error);
            }
        };

        // Fetch immediately
        fetchLiveStatus();

        // Then fetch every 5 seconds
        const interval = setInterval(fetchLiveStatus, 5000);

        return () => clearInterval(interval);
    }, []);

    // Deduplicate devices by ID/deviceId (keep the last one) so that
    // the same physical device doesn't appear multiple times.
    // Also merge with live status to determine actual online/offline status
    const uniqueDevices = React.useMemo(() => {
        const byId = new Map();
        devices.forEach((d) => {
            const id = d.id || d.deviceId;
            if (!id) return;

            // Get live status for this device - try multiple ID formats
            const live = liveStatus[id] || liveStatus[d.deviceId] || liveStatus[d.id];

            // Determine actual status: use live status if available, otherwise use device status
            // If device has lastSeen, check if it's recent (within 30 seconds = online)
            let actualStatus = d.status || 'offline';
            if (live) {
                // Use live status from WebSocket connection
                actualStatus = live.online ? 'online' : 'offline';
            } else if (d.lastSeen) {
                // Check if lastSeen is recent (within 30 seconds = online)
                const lastSeenTime = new Date(d.lastSeen).getTime();
                const now = Date.now();
                const diff = now - lastSeenTime;
                // If lastSeen is within 30 seconds, consider it online
                actualStatus = diff < 30000 ? 'online' : 'offline';
            } else if (deviceHeartbeats?.[id]?.lastSeen) {
                // Check heartbeat if available
                const heartbeatTime = deviceHeartbeats[id].lastSeen;
                const now = Date.now();
                const diff = now - heartbeatTime;
                actualStatus = diff < 30000 ? 'online' : 'offline';
            } else {
                // Default to offline if no status info
                actualStatus = 'offline';
            }

            // If there are duplicates, prefer the one with the latest lastSeen
            const existing = byId.get(id);
            if (!existing) {
                byId.set(id, { ...d, status: actualStatus });
            } else {
                const existingTime = existing.lastSeen ? new Date(existing.lastSeen).getTime() : 0;
                const currentTime = d.lastSeen ? new Date(d.lastSeen).getTime() : 0;
                if (currentTime >= existingTime) {
                    byId.set(id, { ...d, status: actualStatus });
                } else {
                    // Update status even if keeping existing device
                    byId.set(id, { ...existing, status: actualStatus });
                }
            }
        });
        return Array.from(byId.values());
    }, [devices, liveStatus]);

    // Treat all non-gateway devices as "nodes" so that TsimCam devices
    // (and any future node-type devices) always appear in the Nodes tab.
    const nodes = uniqueDevices.filter(d => d.id && d.type !== 'gateway');
    const gatewaysFromDevices = uniqueDevices.filter(d => d.id && d.type === 'gateway');

    // Add hardcoded online gateway
    const hardcodedGateway = {
        id: 'GW-01',
        name: 'Gateway 01',
        ip: '192.168.1.1',
        status: 'online',
        type: 'gateway',
        lastSeen: new Date().toISOString()
    };

    // Merge hardcoded gateway with devices from API
    const gateways = [hardcodedGateway, ...gatewaysFromDevices];

    // Helper to format last seen time
    const formatLastSeen = (deviceId) => {
        const heartbeat = deviceHeartbeats?.[deviceId];
        if (!heartbeat?.lastSeen) return '-';

        const now = Date.now();
        const diff = now - heartbeat.lastSeen;

        if (diff < 5000) return t('Just now');
        if (diff < 60000) return `${Math.floor(diff / 1000)}s ${t('ago')}`;
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${t('ago')}`;
        return new Date(heartbeat.lastSeen).toLocaleTimeString();
    };

    // Helper to get room name
    const getRoomName = (node) => {
        // Try to find room by various methods
        const roomData = rooms.find(r =>
            r.id === node.room ||
            r.roomType?.toLowerCase() === node.room?.toLowerCase() ||
            r.nameEn?.toLowerCase() === node.room?.toLowerCase()
        );
        if (roomData) return roomData.nameEn || roomData.name;
        return node.room || '-';
    };

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

    const handleEdit = (node) => {
        console.log('[DevicesPage] handleEdit called with node:', node);
        console.log('[DevicesPage] openModal function:', typeof openModal);
        console.log('[DevicesPage] rooms:', rooms);

        if (!node) {
            console.error('[DevicesPage] handleEdit: node is null or undefined');
            return;
        }

        if (typeof openModal !== 'function') {
            console.error('[DevicesPage] openModal is not a function:', openModal);
            return;
        }

        try {
            const editForm = (
                <DeviceEditForm
                    device={node}
                    rooms={rooms || []}
                    t={t}
                    onCancel={() => {
                        console.log('[DevicesPage] Edit form cancelled');
                        closeModal();
                    }}
                    onSave={async (updates) => {
                        console.log('[DevicesPage] Saving device updates:', updates);
                        try {
                            await updateDevice(node.id || node.deviceId, updates);
                            console.log('[DevicesPage] Device updated successfully');

                            // Add notification for device update
                            const deviceName = updates.name || node.name || node.id || node.deviceId;
                            const roomName = rooms.find(r => r.id === updates.room)?.nameEn ||
                                rooms.find(r => r.id === updates.room)?.name ||
                                updates.room ||
                                node.room ||
                                t('Unknown Room');

                            addNotification({
                                type: 'success',
                                title: t('Device Updated'),
                                message: `${deviceName} ${t('has been updated')}${updates.room ? ` - ${t('Room')}: ${roomName}` : ''}`
                            });

                            closeModal();
                        } catch (error) {
                            console.error('[DevicesPage] Failed to update device:', error);
                            alert(t('Failed to update device: ') + (error.message || error));
                        }
                    }}
                />
            );

            console.log('[DevicesPage] Opening modal with content:', editForm);
            openModal(editForm);
            console.log('[DevicesPage] Modal opened');
        } catch (error) {
            console.error('[DevicesPage] Error opening modal:', error);
            alert(t('Failed to open edit form: ') + (error.message || error));
        }
    };

    const handleDelete = (node) => {
        console.log('[DevicesPage] handleDelete called with node:', node);
        if (!node) {
            console.error('[DevicesPage] handleDelete: node is null or undefined');
            return;
        }

        const deviceId = node.id || node.deviceId;
        const deviceName = node.name;

        const handleConfirmDelete = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[DevicesPage] Delete button in modal clicked for:', deviceId);
            try {
                await deleteDevice(deviceId);
                console.log('[DevicesPage] Device deleted successfully');

                // Add notification for device deletion
                addNotification({
                    type: 'warning',
                    title: t('Device Deleted'),
                    message: `${deviceName} (${deviceId}) ${t('has been deleted from the system')}`
                });

                closeModal();
            } catch (error) {
                console.error('[DevicesPage] Error deleting device:', error);
                alert(t('Failed to delete device: ') + (error.message || error));
            }
        };

        openModal(
            <div className="card" style={{ border: 'none', boxShadow: 'none', maxWidth: '400px', margin: '0 1rem' }}>
                <div className="card-header">
                    <span className="card-title" style={{ color: 'var(--danger)' }}>
                        <Trash2 size={20} /> {t('Delete Device')}
                    </span>
                </div>
                <div className="card-body">
                    <p>{t('Are you sure you want to delete this device? This action cannot be undone.')}</p>
                    <p style={{ fontWeight: 500, margin: '1rem 0' }}>{deviceName} ({deviceId})</p>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem', position: 'relative', zIndex: 10000 }}>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={(e) => {
                                e.stopPropagation();
                                console.log('[DevicesPage] Cancel button clicked');
                                closeModal();
                            }}
                            style={{ position: 'relative', zIndex: 10001, pointerEvents: 'auto', cursor: 'pointer' }}
                        >
                            {t('Cancel')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            onClick={handleConfirmDelete}
                            style={{ position: 'relative', zIndex: 10001, pointerEvents: 'auto', cursor: 'pointer' }}
                        >
                            {t('Delete')}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const handleConfig = async (node) => {
        try {
            await api.triggerConfigMode(node.id || node.deviceId);

            // Add notification for device config mode
            const deviceName = node.name || node.id || node.deviceId;
            addNotification({
                type: 'info',
                title: t('Config Mode Activated'),
                message: `${t('Config mode command sent to')} ${deviceName}. ${t('Device will enter configuration mode')}`
            });

            alert(t('Config mode command sent to device'));
        } catch (e) {
            console.error(e);
            alert(t('Failed to send config command'));
        }
    };

    const handleRotate = async (node) => {
        try {
            await api.rotateCamera(node.id || node.deviceId, 90);

            // Add notification for camera rotation
            const deviceName = node.name || node.id || node.deviceId;
            addNotification({
                type: 'success',
                title: t('Camera Rotated'),
                message: `${t('Rotation command sent to')} ${deviceName}. ${t('Note: Rotation only works in config mode')}`
            });
        } catch (e) {
            console.error(e);
            const errorMsg = e.response?.data?.detail || e.message || t('Failed to rotate camera');
            if (errorMsg.includes('403') || errorMsg.includes('config mode')) {
                alert(t('Rotation only available in config mode. Please enter config mode first.'));
            } else {
                alert(t('Failed to rotate camera: ') + errorMsg);
            }
        }
    };

    const handleDeleteHardcodedDevices = async () => {
        const hardcodedIds = ['N-01', 'N-02', 'N-03', 'N-04'];
        const devicesToDelete = devices.filter(d => {
            const deviceId = d.id || d.deviceId;
            return hardcodedIds.includes(deviceId);
        });

        if (devicesToDelete.length === 0) {
            alert(t('No hardcoded devices found to delete'));
            return;
        }

        const confirmMessage = t('Are you sure you want to delete all hardcoded devices?') +
            `\n\n${devicesToDelete.map(d => `${d.name} (${d.id || d.deviceId})`).join('\n')}`;

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            const deviceIds = devicesToDelete.map(d => d.id || d.deviceId);
            await api.deleteDevicesBulk(deviceIds);

            // Update local state
            setDevices(prev => prev.filter(d => {
                const deviceId = d.id || d.deviceId;
                return !hardcodedIds.includes(deviceId);
            }));

            alert(t('Successfully deleted') + ` ${devicesToDelete.length} ` + t('devices'));
        } catch (error) {
            console.error('Failed to delete hardcoded devices:', error);
            alert(t('Failed to delete devices:') + ' ' + error.message);
        }
    };

    const handleClearAllData = async () => {
        const deviceCount = devices.length;
        const wheelchairCount = wheelchairs.length;

        if (deviceCount === 0 && wheelchairCount === 0) {
            alert(t('No data to clear'));
            return;
        }

        const confirmMessage = t('Are you sure you want to clear ALL data?') +
            `\n\n${t('This will delete:')}\n` +
            `- ${deviceCount} ${t('devices')}\n` +
            `- ${wheelchairCount} ${t('wheelchairs')}\n\n` +
            `${t('This action cannot be undone!')}`;

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            // Delete all devices and wheelchairs in parallel
            const [devicesResult, wheelchairsResult] = await Promise.all([
                api.deleteAllDevices().catch(err => {
                    console.error('Failed to delete devices:', err);
                    return { deleted_count: 0 };
                }),
                api.deleteAllWheelchairs().catch(err => {
                    console.error('Failed to delete wheelchairs:', err);
                    return { deleted_count: 0 };
                })
            ]);

            // Clear local state
            setDevices([]);
            setWheelchairs([]);

            alert(
                t('Successfully cleared all data:') + '\n' +
                `- ${devicesResult.deleted_count || 0} ${t('devices deleted')}\n` +
                `- ${wheelchairsResult.deleted_count || 0} ${t('wheelchairs deleted')}`
            );
        } catch (error) {
            console.error('Failed to clear all data:', error);
            alert(t('Failed to clear data:') + ' ' + error.message);
        }
    };

    return (
        <div className="page-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                    <h2>🔌 {t('Devices & Nodes')}</h2>
                    <p>{t('Manage Node devices and Gateways in the system')}</p>
                </div>
                {role === 'admin' && (devices.length > 0 || wheelchairs.length > 0) && (
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={handleClearAllData}
                    >
                        <Trash2 size={16} /> {t('Clear All Data')}
                    </button>
                )}
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                    <div className="stat-icon success"><Wifi /></div>
                    <div className="stat-content">
                        <h3>{nodes.filter(d => d.status === 'online').length}</h3>
                        <p>{t('Devices Online')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon danger"><WifiOff /></div>
                    <div className="stat-content">
                        <h3>{nodes.filter(d => d.status === 'offline').length}</h3>
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
                <button type="button" className={`tab ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => setActiveTab('nodes')}>
                    {t('Nodes')} ({nodes.length})
                </button>
                <button type="button" className={`tab ${activeTab === 'gateways' ? 'active' : ''}`} onClick={() => setActiveTab('gateways')}>
                    {t('Gateways')} ({gateways.length})
                </button>
                <button type="button" className={`tab ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>
                    {t('Video Streams')}
                </button>
            </div>

            {activeTab === 'nodes' && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Cpu size={18} /> {t('Nodes')}</span>
                        {role === 'admin' && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {nodes.some(d => ['N-01', 'N-02', 'N-03', 'N-04'].includes(d.id || d.deviceId)) && (
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={handleDeleteHardcodedDevices}
                                        style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}
                                    >
                                        <Trash size={14} /> {t('Delete Hardcoded Devices')}
                                    </button>
                                )}
                                <button type="button" className="btn btn-primary"><Plus size={16} /> {t('Add Node')}</button>
                            </div>
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
                                    <th>{t('Last Seen')}</th>
                                    {role === 'admin' && <th>{t('Actions')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {nodes.length === 0 ? (
                                    <tr>
                                        <td colSpan={role === 'admin' ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                            {t('No devices connected. Connect a TsimCam-Controller to see devices here.')}
                                        </td>
                                    </tr>
                                ) : nodes.map((node, index) => (
                                    <tr key={node.id || node.deviceId || `device-${index}`}>
                                        <td><code>{node.id || node.deviceId}</code></td>
                                        <td>{node.name}</td>
                                        <td>{getRoomName(node)}</td>
                                        <td><code>{node.ip || '-'}</code></td>
                                        <td>
                                            <span className={`list-item-badge ${node.status === 'online' ? 'normal' : 'offline'}`}>
                                                {node.status === 'online' ? `🟢 ${t('Online')}` : `🔴 ${t('Offline')}`}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {formatLastSeen(node.id || node.deviceId)}
                                        </td>
                                        {role === 'admin' && (
                                            <td style={{ position: 'relative', zIndex: 1 }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', position: 'relative', zIndex: 2 }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-icon"
                                                        style={{ position: 'relative', zIndex: 3, pointerEvents: 'auto' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            console.log('[DevicesPage] Config button clicked for node:', node);
                                                            handleConfig(node);
                                                        }}
                                                        title={t("Remote Config Mode")}
                                                    >
                                                        <Wrench size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-icon"
                                                        style={{ position: 'relative', zIndex: 3, pointerEvents: 'auto' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            console.log('[DevicesPage] Rotate button clicked for node:', node);
                                                            handleRotate(node);
                                                        }}
                                                        title={t("Rotate Camera (90°)")}
                                                    >
                                                        <RotateCw size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-icon"
                                                        style={{ position: 'relative', zIndex: 3, pointerEvents: 'auto' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            console.log('[DevicesPage] Edit button clicked for node:', node);
                                                            handleEdit(node);
                                                        }}
                                                        title={t("Edit Device")}
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-icon"
                                                        style={{ position: 'relative', zIndex: 3, pointerEvents: 'auto' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            console.log('[DevicesPage] View Camera button clicked for node:', node);
                                                            setSelectedRoom(node.room);
                                                        }}
                                                        title={t("View Camera")}
                                                    >
                                                        <Video size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-icon"
                                                        style={{ position: 'relative', zIndex: 3, pointerEvents: 'auto' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            console.log('[DevicesPage] Delete button clicked for node:', node);
                                                            handleDelete(node);
                                                        }}
                                                        title={t("Delete Device")}
                                                    >
                                                        <Trash2 size={16} />
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
                                    type="button"
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
                                        type="button"
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
