import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import * as api from '../services/api';
import {
    Map, Plus, Trash2, Save, X, Edit2, Move, Maximize2,
    Lightbulb, Thermometer, Tv, Fan, Wind, Power, Bell, Zap,
    Home, Building, Layers, ChevronRight, GripVertical
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

    // Drag states
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [resizeHandle, setResizeHandle] = useState(null);
    const mapCanvasRef = useRef(null);

    // Modal States
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [showApplianceModal, setShowApplianceModal] = useState(false);
    const [showBuildingModal, setShowBuildingModal] = useState(false);
    const [showFloorModal, setShowFloorModal] = useState(false);

    // Form States
    const [roomForm, setRoomForm] = useState({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });
    const [applianceForm, setApplianceForm] = useState({ name: '', type: 'light' });
    const [buildingForm, setBuildingForm] = useState({ name: '', nameEn: '' });
    const [floorForm, setFloorForm] = useState({ name: '' });

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
            if (buildingsData?.length > 0) {
                setBuildings(buildingsData);
                if (!selectedBuilding) setSelectedBuilding(buildingsData[0].id);
            }

            // Load floors
            const floorsData = await api.getFloors();
            if (floorsData?.length > 0) {
                setFloors(floorsData);
                if (!selectedFloor) setSelectedFloor(floorsData[0].id);
            }

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

    // ============ BUILDING OPERATIONS ============
    const handleAddBuilding = async () => {
        if (!buildingForm.name && !buildingForm.nameEn) {
            alert(t('Please enter building name'));
            return;
        }

        try {
            const newBuilding = {
                id: `building-${Date.now()}`,
                name: buildingForm.name || buildingForm.nameEn,
                nameEn: buildingForm.nameEn || buildingForm.name
            };

            await api.createBuilding(newBuilding);
            setBuildings(prev => [...(prev || []), newBuilding]);
            setShowBuildingModal(false);
            setBuildingForm({ name: '', nameEn: '' });
            alert(t('Building added successfully!'));
        } catch (err) {
            console.error('Failed to add building:', err);
            alert(t('Failed to add building: ') + err.message);
        }
    };

    const handleDeleteBuilding = async (buildingId) => {
        if (!confirm(t('Delete this building? All floors and rooms inside will also be deleted.'))) return;

        try {
            await api.deleteBuilding(buildingId);
            setBuildings(prev => (prev || []).filter(b => b.id !== buildingId));
            if (selectedBuilding === buildingId) {
                const remaining = safeBuildings.filter(b => b.id !== buildingId);
                setSelectedBuilding(remaining[0]?.id || null);
            }
            alert(t('Building deleted!'));
        } catch (err) {
            console.error('Failed to delete building:', err);
            alert(t('Failed to delete building'));
        }
    };

    // ============ FLOOR OPERATIONS ============
    const handleAddFloor = async () => {
        if (!floorForm.name) {
            alert(t('Please enter floor name'));
            return;
        }

        try {
            const newFloor = {
                id: `floor-${Date.now()}`,
                name: floorForm.name,
                buildingId: selectedBuilding
            };

            await api.createFloor(newFloor);
            setFloors(prev => [...(prev || []), newFloor]);
            setShowFloorModal(false);
            setFloorForm({ name: '' });
            alert(t('Floor added successfully!'));
        } catch (err) {
            console.error('Failed to add floor:', err);
            alert(t('Failed to add floor: ') + err.message);
        }
    };

    const handleDeleteFloor = async (floorId) => {
        if (!confirm(t('Delete this floor? All rooms inside will also be deleted.'))) return;

        try {
            await api.deleteFloor(floorId);
            setFloors(prev => (prev || []).filter(f => f.id !== floorId));
            if (selectedFloor === floorId) {
                const remaining = safeFloors.filter(f => f.id !== floorId);
                setSelectedFloor(remaining[0]?.id || null);
            }
            alert(t('Floor deleted!'));
        } catch (err) {
            console.error('Failed to delete floor:', err);
            alert(t('Failed to delete floor'));
        }
    };

    // ============ ROOM OPERATIONS ============
    const handleAddRoom = async () => {
        if (!roomForm.name && !roomForm.nameEn) {
            alert(t('Please enter room name'));
            return;
        }

        try {
            const newRoom = {
                id: `room-${Date.now()}`,
                ...roomForm,
                name: roomForm.name || roomForm.nameEn,
                nameEn: roomForm.nameEn || roomForm.name,
                floorId: selectedFloor,
                buildingId: selectedBuilding,
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

    // ============ DRAG AND DROP ============
    const handleMouseDown = (e, roomId, type = 'move') => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();

        setSelectedRoom(roomId);

        const rect = mapCanvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        setDragStart({ x, y });

        if (type === 'move') {
            setIsDragging(true);
        } else {
            setIsResizing(true);
            setResizeHandle(type);
        }
    };

    const handleMouseMove = useCallback((e) => {
        if (!isDragging && !isResizing) return;
        if (!mapCanvasRef.current) return;

        const rect = mapCanvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        setRooms(prev => prev.map(room => {
            if (room.id !== selectedRoom) return room;

            if (isDragging) {
                // Move room
                const newX = Math.max(0, Math.min(100 - room.width, room.x + dx));
                const newY = Math.max(0, Math.min(100 - room.height, room.y + dy));
                return { ...room, x: newX, y: newY };
            } else if (isResizing) {
                // Resize room
                let newRoom = { ...room };

                switch (resizeHandle) {
                    case 'se': // Southeast (bottom-right)
                        newRoom.width = Math.max(5, Math.min(100 - room.x, room.width + dx));
                        newRoom.height = Math.max(5, Math.min(100 - room.y, room.height + dy));
                        break;
                    case 'sw': // Southwest (bottom-left)
                        const newWidthSW = Math.max(5, room.width - dx);
                        if (room.x + dx >= 0 && newWidthSW >= 5) {
                            newRoom.x = room.x + dx;
                            newRoom.width = newWidthSW;
                        }
                        newRoom.height = Math.max(5, Math.min(100 - room.y, room.height + dy));
                        break;
                    case 'ne': // Northeast (top-right)
                        newRoom.width = Math.max(5, Math.min(100 - room.x, room.width + dx));
                        const newHeightNE = Math.max(5, room.height - dy);
                        if (room.y + dy >= 0 && newHeightNE >= 5) {
                            newRoom.y = room.y + dy;
                            newRoom.height = newHeightNE;
                        }
                        break;
                    case 'nw': // Northwest (top-left)
                        const newWidthNW = Math.max(5, room.width - dx);
                        if (room.x + dx >= 0 && newWidthNW >= 5) {
                            newRoom.x = room.x + dx;
                            newRoom.width = newWidthNW;
                        }
                        const newHeightNW = Math.max(5, room.height - dy);
                        if (room.y + dy >= 0 && newHeightNW >= 5) {
                            newRoom.y = room.y + dy;
                            newRoom.height = newHeightNW;
                        }
                        break;
                }
                return newRoom;
            }
            return room;
        }));

        setDragStart({ x, y });
    }, [isDragging, isResizing, dragStart, selectedRoom, resizeHandle]);

    const handleMouseUp = useCallback(async () => {
        if (isDragging || isResizing) {
            // Save the updated room position to database
            const room = safeRooms.find(r => r.id === selectedRoom);
            if (room) {
                try {
                    await api.updateRoom(room.id, {
                        x: room.x,
                        y: room.y,
                        width: room.width,
                        height: room.height
                    });
                } catch (err) {
                    console.error('Failed to save room position:', err);
                }
            }
        }
        setIsDragging(false);
        setIsResizing(false);
        setResizeHandle(null);
    }, [isDragging, isResizing, selectedRoom, safeRooms]);

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

    // ============ APPLIANCE OPERATIONS ============
    const handleAddAppliance = async () => {
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

            const result = await api.createAppliance(newAppliance);

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
                    <p style={{ color: 'var(--text-muted)' }}>{t('Manage buildings, floors, rooms and appliances')}</p>
                </div>
                {role === 'admin' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {editMode ? (
                            <>
                                <button className="btn btn-success" onClick={handleSaveAll}>
                                    <Save size={16} /> {t('Save All')}
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

            {/* Management Panel */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Buildings */}
                    <div style={{ minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <Building size={16} />
                            <span style={{ fontWeight: 600 }}>{t('Building')}</span>
                            {editMode && (
                                <button className="btn btn-icon btn-sm" onClick={() => setShowBuildingModal(true)} title={t('Add Building')}>
                                    <Plus size={14} />
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {safeBuildings.map(b => (
                                <div
                                    key={b.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem',
                                        background: selectedBuilding === b.id ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                        color: selectedBuilding === b.id ? 'white' : 'inherit',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setSelectedBuilding(b.id)}
                                >
                                    <span style={{ flex: 1 }}>{b.nameEn || b.name}</span>
                                    {editMode && selectedBuilding === b.id && (
                                        <button
                                            className="btn btn-icon btn-danger btn-sm"
                                            style={{ padding: 2, minWidth: 20, minHeight: 20 }}
                                            onClick={(e) => { e.stopPropagation(); handleDeleteBuilding(b.id); }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <ChevronRight size={20} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />

                    {/* Floors */}
                    <div style={{ minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <Layers size={16} />
                            <span style={{ fontWeight: 600 }}>{t('Floor')}</span>
                            {editMode && (
                                <button className="btn btn-icon btn-sm" onClick={() => setShowFloorModal(true)} title={t('Add Floor')}>
                                    <Plus size={14} />
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {safeFloors.filter(f => !selectedBuilding || f.buildingId === selectedBuilding).map(f => (
                                <div
                                    key={f.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.5rem',
                                        background: selectedFloor === f.id ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                        color: selectedFloor === f.id ? 'white' : 'inherit',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setSelectedFloor(f.id)}
                                >
                                    <span style={{ flex: 1 }}>{f.name}</span>
                                    {editMode && selectedFloor === f.id && (
                                        <button
                                            className="btn btn-icon btn-danger btn-sm"
                                            style={{ padding: 2, minWidth: 20, minHeight: 20 }}
                                            onClick={(e) => { e.stopPropagation(); handleDeleteFloor(f.id); }}
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <ChevronRight size={20} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />

                    {/* Add Room Button */}
                    {editMode && (
                        <div style={{ alignSelf: 'center' }}>
                            <button className="btn btn-primary" onClick={() => {
                                setRoomForm({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });
                                setShowRoomModal(true);
                            }}>
                                <Plus size={16} /> {t('Add Room')}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Mode Instructions */}
            {editMode && (
                <div style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                }}>
                    <Move size={18} style={{ color: 'var(--primary-500)' }} />
                    <span style={{ fontSize: '0.9rem' }}>
                        <strong>{t('Edit Mode')}:</strong> {t('Drag rooms to reposition. Drag corners to resize. Click room to view details.')}
                    </span>
                </div>
            )}

            {/* Main Content: Map + Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                {/* Map Canvas */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Map size={18} /> {t('Floor Map')}</span>
                    </div>
                    <div
                        ref={mapCanvasRef}
                        className="map-canvas"
                        style={{
                            minHeight: '500px',
                            position: 'relative',
                            cursor: editMode ? (isDragging ? 'grabbing' : 'default') : 'pointer',
                            userSelect: 'none'
                        }}
                    >
                        {safeRooms.map(room => (
                            <div
                                key={room.id}
                                className={`room ${selectedRoom === room.id ? 'selected' : ''}`}
                                style={{
                                    left: `${room.x}%`,
                                    top: `${room.y}%`,
                                    width: `${room.width}%`,
                                    height: `${room.height}%`,
                                    cursor: editMode ? 'grab' : 'pointer',
                                    outline: selectedRoom === room.id ? '3px solid var(--primary-500)' : 'none',
                                    transition: isDragging || isResizing ? 'none' : 'all 0.2s ease'
                                }}
                                onClick={() => !isDragging && !isResizing && setSelectedRoom(room.id)}
                                onMouseDown={(e) => handleMouseDown(e, room.id, 'move')}
                            >
                                <span className="room-label">{room.nameEn || room.name}</span>
                                <span className="room-status">{room.occupied ? '🟢' : '⚪'}</span>

                                {/* Resize Handles - Only in edit mode */}
                                {editMode && selectedRoom === room.id && (
                                    <>
                                        <div
                                            style={{
                                                position: 'absolute', top: -4, left: -4,
                                                width: 10, height: 10,
                                                background: 'var(--primary-500)',
                                                borderRadius: '50%',
                                                cursor: 'nw-resize'
                                            }}
                                            onMouseDown={(e) => handleMouseDown(e, room.id, 'nw')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute', top: -4, right: -4,
                                                width: 10, height: 10,
                                                background: 'var(--primary-500)',
                                                borderRadius: '50%',
                                                cursor: 'ne-resize'
                                            }}
                                            onMouseDown={(e) => handleMouseDown(e, room.id, 'ne')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute', bottom: -4, left: -4,
                                                width: 10, height: 10,
                                                background: 'var(--primary-500)',
                                                borderRadius: '50%',
                                                cursor: 'sw-resize'
                                            }}
                                            onMouseDown={(e) => handleMouseDown(e, room.id, 'sw')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute', bottom: -4, right: -4,
                                                width: 10, height: 10,
                                                background: 'var(--primary-500)',
                                                borderRadius: '50%',
                                                cursor: 'se-resize'
                                            }}
                                            onMouseDown={(e) => handleMouseDown(e, room.id, 'se')}
                                        />
                                    </>
                                )}

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
                                    {editMode && (
                                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            📍 X: {Math.round(selectedRoomData.x)}% | Y: {Math.round(selectedRoomData.y)}% | W: {Math.round(selectedRoomData.width)}% | H: {Math.round(selectedRoomData.height)}%
                                        </div>
                                    )}
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

            {/* Add Building Modal */}
            {showBuildingModal && (
                <div className="modal-overlay" onClick={() => setShowBuildingModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>{t('Add Building')}</h3>
                            <button className="btn btn-icon" onClick={() => setShowBuildingModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Building Name')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Main Building"
                                    value={buildingForm.nameEn}
                                    onChange={(e) => setBuildingForm(prev => ({ ...prev, nameEn: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowBuildingModal(false)}>{t('Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddBuilding}>
                                <Save size={16} /> {t('Add Building')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Floor Modal */}
            {showFloorModal && (
                <div className="modal-overlay" onClick={() => setShowFloorModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>{t('Add Floor')}</h3>
                            <button className="btn btn-icon" onClick={() => setShowFloorModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Floor Name')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Floor 1"
                                    value={floorForm.name}
                                    onChange={(e) => setFloorForm(prev => ({ ...prev, name: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowFloorModal(false)}>{t('Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddFloor}>
                                <Save size={16} /> {t('Add Floor')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                <label className="form-label">{t('Room Name')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Bedroom"
                                    value={roomForm.nameEn}
                                    onChange={(e) => setRoomForm(prev => ({ ...prev, nameEn: e.target.value, name: e.target.value }))}
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
                                    <label className="form-label">{t('Width')} (%)</label>
                                    <input type="number" className="form-input" value={roomForm.width}
                                        onChange={(e) => setRoomForm(prev => ({ ...prev, width: parseInt(e.target.value) || 10 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('Height')} (%)</label>
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
