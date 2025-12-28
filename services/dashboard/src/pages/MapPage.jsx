import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import * as api from '../services/api';
import {
    Map, Plus, Trash2, Save, X, Edit2,
    Lightbulb, Thermometer, Tv, Fan, Wind, Power, Bell, Zap,
    Home, Building, Layers
} from 'lucide-react';

// Appliance type icons
const APPLIANCE_ICONS = {
    light: { icon: Lightbulb, emoji: '💡', label: 'Light' },
    AC: { icon: Thermometer, emoji: '❄️', label: 'AC' },
    fan: { icon: Fan, emoji: '🌀', label: 'Fan' },
    tv: { icon: Tv, emoji: '📺', label: 'TV' },
    heater: { icon: Wind, emoji: '🔥', label: 'Heater' },
    alarm: { icon: Bell, emoji: '🚨', label: 'Alarm' },
    curtain: { icon: Power, emoji: '🪟', label: 'Curtain' },
};

export function MapPage() {
    const {
        rooms, setRooms,
        appliances, setAppliances,
        buildings, setBuildings,
        floors, setFloors,
        selectedBuilding, setSelectedBuilding,
        selectedFloor, setSelectedFloor,
        language, role
    } = useApp();
    const { t } = useTranslation(language);

    // UI States
    const [loading, setLoading] = useState(true);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [editMode, setEditMode] = useState(false);

    // Modal States
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [showApplianceModal, setShowApplianceModal] = useState(false);
    const [editingRoom, setEditingRoom] = useState(null);
    const [editingAppliance, setEditingAppliance] = useState(null);

    // Form States
    const [roomForm, setRoomForm] = useState({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });
    const [applianceForm, setApplianceForm] = useState({ name: '', type: 'light' });

    // Safe arrays
    const safeRooms = rooms || [];
    const safeBuildings = buildings || [];
    const safeFloors = floors || [];

    // Load data on mount
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load buildings
            const buildingsData = await api.getBuildings();
            if (buildingsData?.length > 0) setBuildings(buildingsData);

            // Load floors
            const floorsData = await api.getFloors();
            if (floorsData?.length > 0) setFloors(floorsData);

            // Load rooms
            const roomsData = await api.getRooms();
            if (roomsData?.length > 0) setRooms(roomsData);

            // Load appliances
            const appliancesData = await api.getAllAppliances();
            if (appliancesData) setAppliances(appliancesData);

        } catch (err) {
            console.error('Failed to load data:', err);
        }
        setLoading(false);
    };

    // Get appliances for selected room
    const getAppliancesForRoom = (roomId) => {
        if (!roomId) return [];
        const room = safeRooms.find(r => r.id === roomId);
        if (!room) return [];

        // Try multiple keys
        const keys = [
            roomId,
            room.roomType?.toLowerCase(),
            room.nameEn?.toLowerCase(),
            room.name?.toLowerCase()
        ].filter(Boolean);

        for (const key of keys) {
            if (appliances[key]?.length > 0) return appliances[key];
        }
        return [];
    };

    const roomAppliances = getAppliancesForRoom(selectedRoom);
    const selectedRoomData = safeRooms.find(r => r.id === selectedRoom);

    // ============ ROOM OPERATIONS ============
    const handleAddRoom = async () => {
        if (!roomForm.name) {
            alert(t('Please enter room name'));
            return;
        }

        try {
            const newRoom = {
                id: `room-${Date.now()}`,
                ...roomForm,
                temperature: 25,
                humidity: 60,
                occupied: false
            };

            await api.createRoom(newRoom);
            setRooms(prev => [...(prev || []), newRoom]);
            setShowRoomModal(false);
            setRoomForm({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });
            alert(t('Room added successfully!'));
        } catch (err) {
            console.error('Failed to add room:', err);
            alert(t('Failed to add room: ') + err.message);
        }
    };

    const handleDeleteRoom = async (roomId) => {
        if (!confirm(t('Delete this room?'))) return;

        try {
            await api.deleteRoom(roomId);
            setRooms(prev => (prev || []).filter(r => r.id !== roomId));
            if (selectedRoom === roomId) setSelectedRoom(null);
            alert(t('Room deleted!'));
        } catch (err) {
            console.error('Failed to delete room:', err);
            alert(t('Failed to delete room'));
        }
    };

    // ============ APPLIANCE OPERATIONS ============
    const handleAddAppliance = async () => {
        console.log('handleAddAppliance called', { applianceForm, selectedRoom });

        if (!applianceForm.name) {
            alert(t('Please enter appliance name'));
            return;
        }
        if (!selectedRoom) {
            alert(t('Please select a room first'));
            return;
        }

        try {
            const room = safeRooms.find(r => r.id === selectedRoom);
            const roomKey = room?.roomType?.toLowerCase() || room?.nameEn?.toLowerCase().replace(/\s+/g, '') || selectedRoom;

            const newAppliance = {
                room: roomKey,
                type: applianceForm.type,
                name: applianceForm.name
            };

            console.log('Creating appliance:', newAppliance);
            const result = await api.createAppliance(newAppliance);
            console.log('API result:', result);

            // Update local state
            const createdAppliance = result.appliance || {
                id: `app-${Date.now()}`,
                ...newAppliance,
                state: false
            };

            setAppliances(prev => ({
                ...prev,
                [roomKey]: [...(prev[roomKey] || []), createdAppliance]
            }));

            setShowApplianceModal(false);
            setApplianceForm({ name: '', type: 'light' });
            alert(t('Appliance added successfully!'));
        } catch (err) {
            console.error('Failed to add appliance:', err);
            alert(t('Failed to add appliance: ') + err.message);
        }
    };

    const handleDeleteAppliance = async (appId) => {
        if (!confirm(t('Delete this appliance?'))) return;

        try {
            await api.deleteAppliance(appId);

            // Update local state
            const room = safeRooms.find(r => r.id === selectedRoom);
            const roomKey = room?.roomType?.toLowerCase() || room?.nameEn?.toLowerCase().replace(/\s+/g, '') || selectedRoom;

            setAppliances(prev => ({
                ...prev,
                [roomKey]: (prev[roomKey] || []).filter(a => a.id !== appId)
            }));
            alert(t('Appliance deleted!'));
        } catch (err) {
            console.error('Failed to delete appliance:', err);
            alert(t('Failed to delete appliance'));
        }
    };

    // ============ SAVE ALL ============
    const handleSaveAll = async () => {
        try {
            await api.updateAllRooms(rooms);
            alert(t('All changes saved!'));
            setEditMode(false);
        } catch (err) {
            console.error('Failed to save:', err);
            alert(t('Failed to save changes'));
        }
    };

    if (loading) {
        return (
            <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="spinner" style={{
                        width: '40px', height: '40px',
                        border: '4px solid var(--border-color)',
                        borderTop: '4px solid var(--primary-500)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 1rem'
                    }}></div>
                    <p>{t('Loading...')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-content">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2>🗺️ {t('Map & Zones')}</h2>
                    <p style={{ color: 'var(--text-muted)' }}>{t('Manage rooms and appliances')}</p>
                </div>
                {role === 'admin' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {editMode ? (
                            <>
                                <button className="btn btn-success" onClick={handleSaveAll}>
                                    <Save size={16} /> {t('Save')}
                                </button>
                                <button className="btn btn-secondary" onClick={() => setEditMode(false)}>
                                    <X size={16} /> {t('Cancel')}
                                </button>
                            </>
                        ) : (
                            <button className="btn btn-primary" onClick={() => setEditMode(true)}>
                                <Edit2 size={16} /> {t('Edit Mode')}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Building & Floor Selector */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Building size={18} />
                        <select
                            className="filter-select"
                            value={selectedBuilding || ''}
                            onChange={(e) => setSelectedBuilding(e.target.value)}
                        >
                            {safeBuildings.map(b => (
                                <option key={b.id} value={b.id}>{b.nameEn || b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Layers size={18} />
                        <select
                            className="filter-select"
                            value={selectedFloor || ''}
                            onChange={(e) => setSelectedFloor(e.target.value)}
                        >
                            {safeFloors.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                    {editMode && (
                        <button className="btn btn-primary btn-sm" onClick={() => {
                            setRoomForm({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });
                            setShowRoomModal(true);
                        }}>
                            <Plus size={14} /> {t('Add Room')}
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content: Map + Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                {/* Map Canvas */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Map size={18} /> {t('Floor Map')}</span>
                    </div>
                    <div className="map-canvas" style={{ minHeight: '500px', position: 'relative' }}>
                        {safeRooms.map(room => (
                            <div
                                key={room.id}
                                className={`room ${selectedRoom === room.id ? 'selected' : ''}`}
                                style={{
                                    left: `${room.x}%`,
                                    top: `${room.y}%`,
                                    width: `${room.width}%`,
                                    height: `${room.height}%`,
                                    cursor: 'pointer',
                                    outline: selectedRoom === room.id ? '3px solid var(--primary-500)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                                onClick={() => setSelectedRoom(room.id)}
                            >
                                <span className="room-label">{room.nameEn || room.name}</span>
                                <span className="room-status">{room.occupied ? '🟢' : '⚪'}</span>
                                {editMode && selectedRoom === room.id && (
                                    <button
                                        className="btn btn-danger btn-icon"
                                        style={{ position: 'absolute', top: 4, right: 4, padding: 2, minWidth: 24, minHeight: 24 }}
                                        onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id); }}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Room Details Panel */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Home size={18} /> {t('Room Details')}</span>
                    </div>
                    <div className="card-body">
                        {selectedRoom && selectedRoomData ? (
                            <>
                                {/* Room Info */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <h3 style={{ margin: '0 0 0.5rem' }}>{selectedRoomData.nameEn || selectedRoomData.name}</h3>
                                    <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        <span>🌡️ {selectedRoomData.temperature || 25}°C</span>
                                        <span>💧 {selectedRoomData.humidity || 60}%</span>
                                    </div>
                                </div>

                                {/* Appliances Section */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Zap size={16} /> {t('Appliances')} ({roomAppliances.length})
                                        </h4>
                                        {editMode && (
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => {
                                                    console.log('Opening appliance modal');
                                                    setApplianceForm({ name: '', type: 'light' });
                                                    setShowApplianceModal(true);
                                                }}
                                            >
                                                <Plus size={14} /> {t('Add')}
                                            </button>
                                        )}
                                    </div>

                                    {roomAppliances.length === 0 ? (
                                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                                            {t('No appliances in this room')}
                                        </p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {roomAppliances.map(app => {
                                                const iconData = APPLIANCE_ICONS[app.type] || APPLIANCE_ICONS.light;
                                                return (
                                                    <div
                                                        key={app.id}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.75rem',
                                                            padding: '0.75rem',
                                                            background: 'var(--bg-tertiary)',
                                                            borderRadius: 'var(--radius-md)',
                                                            border: '1px solid var(--border-color)'
                                                        }}
                                                    >
                                                        <span style={{ fontSize: '1.25rem' }}>{iconData.emoji}</span>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontWeight: 500 }}>{app.name}</div>
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{iconData.label}</div>
                                                        </div>
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem',
                                                            borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.75rem',
                                                            background: app.state ? 'var(--success-500)' : 'var(--gray-600)',
                                                            color: 'white'
                                                        }}>
                                                            {app.state ? 'ON' : 'OFF'}
                                                        </span>
                                                        {editMode && (
                                                            <button
                                                                className="btn btn-danger btn-icon"
                                                                style={{ padding: 4, minWidth: 28, minHeight: 28 }}
                                                                onClick={() => handleDeleteAppliance(app.id)}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                <Map size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                <p>{t('Select a room to view details')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ============ MODALS ============ */}

            {/* Add Room Modal */}
            {showRoomModal && (
                <div className="modal-overlay" onClick={() => setShowRoomModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>{t('Add Room')}</h3>
                            <button className="btn btn-icon" onClick={() => setShowRoomModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Room Name (Thai)')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ห้องนอน"
                                    value={roomForm.name}
                                    onChange={(e) => setRoomForm(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('Room Name (English)')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Bedroom"
                                    value={roomForm.nameEn}
                                    onChange={(e) => setRoomForm(prev => ({ ...prev, nameEn: e.target.value }))}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <div className="form-group">
                                    <label className="form-label">X (%)</label>
                                    <input type="number" className="form-input" value={roomForm.x}
                                        onChange={(e) => setRoomForm(prev => ({ ...prev, x: parseInt(e.target.value) || 0 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Y (%)</label>
                                    <input type="number" className="form-input" value={roomForm.y}
                                        onChange={(e) => setRoomForm(prev => ({ ...prev, y: parseInt(e.target.value) || 0 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Width (%)</label>
                                    <input type="number" className="form-input" value={roomForm.width}
                                        onChange={(e) => setRoomForm(prev => ({ ...prev, width: parseInt(e.target.value) || 10 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Height (%)</label>
                                    <input type="number" className="form-input" value={roomForm.height}
                                        onChange={(e) => setRoomForm(prev => ({ ...prev, height: parseInt(e.target.value) || 10 }))} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowRoomModal(false)}>{t('Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddRoom}>
                                <Save size={16} /> {t('Add Room')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Appliance Modal */}
            {showApplianceModal && (
                <div className="modal-overlay" onClick={() => setShowApplianceModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>{t('Add Appliance')}</h3>
                            <button className="btn btn-icon" onClick={() => setShowApplianceModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Appliance Name')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={t('e.g. Ceiling Light, AC')}
                                    value={applianceForm.name}
                                    onChange={(e) => setApplianceForm(prev => ({ ...prev, name: e.target.value }))}
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('Type')}</label>
                                <select
                                    className="form-input"
                                    value={applianceForm.type}
                                    onChange={(e) => setApplianceForm(prev => ({ ...prev, type: e.target.value }))}
                                >
                                    {Object.entries(APPLIANCE_ICONS).map(([key, { emoji, label }]) => (
                                        <option key={key} value={key}>{emoji} {label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowApplianceModal(false)}>{t('Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddAppliance}>
                                <Save size={16} /> {t('Add')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
