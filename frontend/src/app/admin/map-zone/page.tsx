'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
    Building2, Layers, Plus, Trash2, Edit2, Save, X, MapPin, Move,
    ChevronRight, Home, Zap, Lightbulb, Thermometer, Tv, Fan, Wind, Power, Bell
} from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
    getBuildings, getFloors, getRooms, createBuilding, deleteBuilding,
    createFloor, deleteFloor, createRoom, updateRoom, deleteRoom,
    getRoomAppliances
} from '@/lib/api';
import type { Room } from '@/lib/api';

// Appliance type icons
const APPLIANCE_ICONS: Record<string, { icon: typeof Lightbulb; emoji: string; label: string }> = {
    light: { icon: Lightbulb, emoji: '💡', label: 'Light' },
    AC: { icon: Thermometer, emoji: '❄️', label: 'AC' },
    fan: { icon: Fan, emoji: '🌀', label: 'Fan' },
    tv: { icon: Tv, emoji: '📺', label: 'TV' },
    heater: { icon: Wind, emoji: '🔥', label: 'Heater' },
    alarm: { icon: Bell, emoji: '🚨', label: 'Alarm' },
    curtain: { icon: Power, emoji: '🪟', label: 'Curtain' },
};

interface DragState {
    isDragging: boolean;
    isResizing: boolean;
    roomId: string | null;
    resizeHandle: string | null;
    startX: number;
    startY: number;
    startRoomX: number;
    startRoomY: number;
    startRoomWidth: number;
    startRoomHeight: number;
}

const defaultDragState: DragState = {
    isDragging: false, isResizing: false, roomId: null, resizeHandle: null,
    startX: 0, startY: 0, startRoomX: 0, startRoomY: 0, startRoomWidth: 0, startRoomHeight: 0,
};

export default function MapZonePage() {
    const { buildings, setBuildings, floors, setFloors, rooms, setRooms } = useWheelSenseStore();
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [selBuilding, setSelBuilding] = useState<string | null>(null);
    const [selFloor, setSelFloor] = useState<string | null>(null);
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [roomAppliances, setRoomAppliances] = useState<any[]>([]);

    // Drag state
    const [dragState, setDragState] = useState<DragState>(defaultDragState);
    const mapCanvasRef = useRef<HTMLDivElement>(null);

    // Modal states
    const [showBuildingModal, setShowBuildingModal] = useState(false);
    const [showFloorModal, setShowFloorModal] = useState(false);
    const [showRoomModal, setShowRoomModal] = useState(false);

    // Form states
    const [buildingForm, setBuildingForm] = useState({ name: '', nameEn: '' });
    const [floorForm, setFloorForm] = useState({ name: '' });
    const [roomForm, setRoomForm] = useState({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });

    // ============ DATA LOADING ============
    const fetchData = async () => {
        try {
            const [bRes, fRes, rRes] = await Promise.all([getBuildings(), getFloors(), getRooms()]);
            if (bRes.data) {
                const mapped = bRes.data.buildings.map((b: any) => ({ id: b.id, name: b.name, nameEn: b.name_en }));
                setBuildings(mapped);
                if (!selBuilding && mapped.length > 0) setSelBuilding(mapped[0].id);
            }
            if (fRes.data) {
                const mapped = fRes.data.floors.map((f: any) => ({ id: f.id, name: f.name, buildingId: f.building_id }));
                setFloors(mapped);
                if (!selFloor && mapped.length > 0) setSelFloor(mapped[0].id);
            }
            if (rRes.data) setRooms(rRes.data.rooms.map((r: any) => ({
                id: r.id, name: r.name, nameEn: r.name_en, roomType: r.room_type,
                x: r.x ?? 10, y: r.y ?? 10, width: r.width ?? 20, height: r.height ?? 20,
                floorId: r.floor_id, buildingId: 'building-1',
            })));
            setLoading(false);
        } catch (e) { console.error(e); setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    // Load appliances when room is selected
    useEffect(() => {
        if (selectedRoom) {
            getRoomAppliances(selectedRoom).then(res => {
                if (res.data) setRoomAppliances(res.data.appliances || []);
                else setRoomAppliances([]);
            }).catch(() => setRoomAppliances([]));
        } else {
            setRoomAppliances([]);
        }
    }, [selectedRoom]);

    const filteredFloors = selBuilding ? floors.filter(f => f.buildingId === selBuilding) : floors;
    const filteredRooms = selFloor ? rooms.filter(r => r.floorId === selFloor) : rooms;
    const selectedRoomData = rooms.find(r => r.id === selectedRoom);

    // ============ BUILDING OPERATIONS ============
    const handleAddBuilding = async () => {
        if (!buildingForm.name.trim() && !buildingForm.nameEn.trim()) return;
        await createBuilding({ name: buildingForm.name || buildingForm.nameEn, name_en: buildingForm.nameEn || undefined });
        setBuildingForm({ name: '', nameEn: '' });
        setShowBuildingModal(false);
        fetchData();
    };

    const handleDeleteBuilding = async (id: string) => {
        if (!confirm(t('Delete this building? All floors and rooms inside will also be deleted.'))) return;
        await deleteBuilding(id);
        if (selBuilding === id) { setSelBuilding(null); setSelFloor(null); }
        fetchData();
    };

    // ============ FLOOR OPERATIONS ============
    const handleAddFloor = async () => {
        if (!floorForm.name.trim() || !selBuilding) return;
        await createFloor({ building_id: selBuilding, name: floorForm.name, level: filteredFloors.length + 1 });
        setFloorForm({ name: '' });
        setShowFloorModal(false);
        fetchData();
    };

    const handleDeleteFloor = async (id: string) => {
        if (!confirm(t('Delete this floor? All rooms inside will also be deleted.'))) return;
        await deleteFloor(id);
        if (selFloor === id) setSelFloor(null);
        fetchData();
    };

    // ============ ROOM OPERATIONS ============
    const handleAddRoom = async () => {
        const roomName = roomForm.nameEn || roomForm.name;
        if (!roomName.trim() || !selFloor) return;
        await createRoom({
            floor_id: selFloor, name: roomName, name_en: roomForm.nameEn || undefined,
            room_type: 'room', x: roomForm.x, y: roomForm.y, width: roomForm.width, height: roomForm.height
        });
        setRoomForm({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });
        setShowRoomModal(false);
        fetchData();
    };

    const handleDeleteRoom = async (id: string) => {
        if (!confirm(t('Delete this room?'))) return;
        await deleteRoom(id);
        if (selectedRoom === id) setSelectedRoom(null);
        fetchData();
    };

    const handleSaveAll = async () => {
        try {
            await Promise.all(rooms.map(r => updateRoom(r.id, { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })));
            setEditMode(false);
        } catch (e) { console.error('Failed to save:', e); }
    };

    // ============ DRAG AND DROP ============
    const getMousePositionPercent = (e: MouseEvent | React.MouseEvent) => {
        if (!mapCanvasRef.current) return { x: 0, y: 0 };
        const rect = mapCanvasRef.current.getBoundingClientRect();
        return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
    };

    const handleRoomMouseDown = (e: React.MouseEvent, room: any, action = 'move') => {
        if (!editMode) { setSelectedRoom(room.id); return; }
        e.preventDefault();
        e.stopPropagation();
        const pos = getMousePositionPercent(e);
        setSelectedRoom(room.id);
        setDragState({
            isDragging: action === 'move', isResizing: action !== 'move',
            roomId: room.id, resizeHandle: action !== 'move' ? action : null,
            startX: pos.x, startY: pos.y,
            startRoomX: room.x, startRoomY: room.y,
            startRoomWidth: room.width, startRoomHeight: room.height,
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const { isDragging, isResizing, roomId, resizeHandle, startX, startY, startRoomX, startRoomY, startRoomWidth, startRoomHeight } = dragState;
        if (!isDragging && !isResizing) return;
        if (!mapCanvasRef.current || !roomId) return;

        const pos = getMousePositionPercent(e);
        const dx = pos.x - startX;
        const dy = pos.y - startY;

        setRooms(rooms.map(room => {
            if (room.id !== roomId) return room;
            if (isDragging) {
                return { ...room, x: Math.max(0, Math.min(100 - room.width, startRoomX + dx)), y: Math.max(0, Math.min(100 - room.height, startRoomY + dy)) };
            }
            if (isResizing) {
                const minSize = 5;
                const newRoom = { ...room };
                switch (resizeHandle) {
                    case 'se':
                        newRoom.width = Math.max(minSize, Math.min(100 - startRoomX, startRoomWidth + dx));
                        newRoom.height = Math.max(minSize, Math.min(100 - startRoomY, startRoomHeight + dy));
                        break;
                    case 'sw': {
                        const nw = startRoomWidth - dx;
                        const nx = startRoomX + dx;
                        if (nw >= minSize && nx >= 0) { newRoom.x = nx; newRoom.width = nw; }
                        newRoom.height = Math.max(minSize, Math.min(100 - startRoomY, startRoomHeight + dy));
                        break;
                    }
                    case 'ne': {
                        newRoom.width = Math.max(minSize, Math.min(100 - startRoomX, startRoomWidth + dx));
                        const nh = startRoomHeight - dy;
                        const ny = startRoomY + dy;
                        if (nh >= minSize && ny >= 0) { newRoom.y = ny; newRoom.height = nh; }
                        break;
                    }
                    case 'nw': {
                        const nw2 = startRoomWidth - dx;
                        const nx2 = startRoomX + dx;
                        if (nw2 >= minSize && nx2 >= 0) { newRoom.x = nx2; newRoom.width = nw2; }
                        const nh2 = startRoomHeight - dy;
                        const ny2 = startRoomY + dy;
                        if (nh2 >= minSize && ny2 >= 0) { newRoom.y = ny2; newRoom.height = nh2; }
                        break;
                    }
                }
                return newRoom;
            }
            return room;
        }));
    }, [dragState, rooms]);

    const handleMouseUp = useCallback(async () => {
        const { isDragging, isResizing, roomId } = dragState;
        if ((isDragging || isResizing) && roomId) {
            const room = rooms.find(r => r.id === roomId);
            if (room) {
                try { await updateRoom(room.id, { x: Math.round(room.x), y: Math.round(room.y), width: Math.round(room.width), height: Math.round(room.height) }); }
                catch (e) { console.error('Failed to save room position:', e); }
            }
        }
        setDragState(defaultDragState);
    }, [dragState, rooms]);

    useEffect(() => {
        if (dragState.isDragging || dragState.isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
        }
    }, [dragState.isDragging, dragState.isResizing, handleMouseMove, handleMouseUp]);

    // ============ RENDER ============
    if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

    const activeBuilding = buildings.find((b) => b.id === selBuilding);
    const activeFloor = floors.find((f) => f.id === selFloor);

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🗺️ {t('Map & Zones')}</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>{t('Manage buildings, floors, rooms and appliances')}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {editMode ? (
                        <>
                            <button className="btn btn-success" onClick={handleSaveAll}><Save size={16} /> {t('Save All')}</button>
                            <button className="btn btn-secondary" onClick={() => setEditMode(false)}><X size={16} /> {t('Cancel')}</button>
                        </>
                    ) : (
                        <button className="btn btn-primary" onClick={() => setEditMode(true)}><Edit2 size={16} /> {t('Edit Mode')}</button>
                    )}
                </div>
            </div>

            {!editMode && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 220 }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Building</div>
                            <div style={{
                                padding: '0.65rem 0.75rem',
                                borderRadius: '8px',
                                background: 'var(--primary-600)',
                                color: 'white',
                                fontWeight: 700
                            }}>
                                {activeBuilding?.nameEn || activeBuilding?.name || 'Smart Home'}
                            </div>
                        </div>
                        <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
                        <div style={{ minWidth: 220 }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Floor</div>
                            <div style={{
                                padding: '0.65rem 0.75rem',
                                borderRadius: '8px',
                                background: 'var(--primary-600)',
                                color: 'white',
                                fontWeight: 700
                            }}>
                                {activeFloor?.name || 'Floor 1'}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Management Panel */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    {/* Buildings */}
                    <div style={{ minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <Building2 size={16} />
                            <span style={{ fontWeight: 600 }}>{t('Building')}</span>
                            {editMode && (
                                <button className="btn btn-icon btn-sm" onClick={() => setShowBuildingModal(true)} title={t('Add Building')}>
                                    <Plus size={14} />
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {buildings.map(b => (
                                <div key={b.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem',
                                    background: selBuilding === b.id ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                    color: selBuilding === b.id ? 'white' : 'inherit',
                                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                }} onClick={() => { setSelBuilding(b.id); setSelFloor(null); }}>
                                    <span style={{ flex: 1 }}>{b.nameEn || b.name}</span>
                                    {editMode && selBuilding === b.id && (
                                        <button className="btn btn-icon btn-danger btn-sm" style={{ padding: 2, minWidth: 20, minHeight: 20 }}
                                            onClick={(e) => { e.stopPropagation(); handleDeleteBuilding(b.id); }}>
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
                            {filteredFloors.map(f => (
                                <div key={f.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem',
                                    background: selFloor === f.id ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                    color: selFloor === f.id ? 'white' : 'inherit',
                                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                }} onClick={() => setSelFloor(f.id)}>
                                    <span style={{ flex: 1 }}>{f.name}</span>
                                    {editMode && selFloor === f.id && (
                                        <button className="btn btn-icon btn-danger btn-sm" style={{ padding: 2, minWidth: 20, minHeight: 20 }}
                                            onClick={(e) => { e.stopPropagation(); handleDeleteFloor(f.id); }}>
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
                    marginBottom: '1rem', padding: '0.75rem 1rem',
                    background: 'rgba(99, 102, 241, 0.1)', borderRadius: 'var(--radius-md)',
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                }}>
                    <Move size={18} style={{ color: 'var(--primary-500)' }} />
                    <span style={{ fontSize: '0.9rem' }}>
                        <strong>{t('Edit Mode')}:</strong> {t('Drag rooms to reposition. Drag corners to resize. Click room to view details.')}
                    </span>
                </div>
            )}

            {/* Main Content: Map + Details */}
            <div style={{ display: 'grid', gridTemplateColumns: selFloor ? '2fr 1fr' : '1fr', gap: '1rem' }}>
                {/* Map Canvas */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><MapPin size={18} /> {t('Floor Map')}</span>
                    </div>
                    {selFloor ? (
                        <div
                            ref={mapCanvasRef}
                            style={{
                                position: 'relative', minHeight: '500px',
                                background: 'var(--bg-secondary)',
                                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                                cursor: editMode ? (dragState.isDragging ? 'grabbing' : 'default') : 'pointer',
                                userSelect: 'none', overflow: 'hidden',
                            }}
                        >
                            {/* Grid Pattern */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                                backgroundSize: '10% 10%', pointerEvents: 'none',
                            }} />

                            {/* Rooms */}
                            {filteredRooms.map(room => (
                                <div
                                    key={room.id}
                                    style={{
                                        position: 'absolute',
                                        left: `${room.x}%`, top: `${room.y}%`,
                                        width: `${room.width}%`, height: `${room.height}%`,
                                        background: selectedRoom === room.id
                                            ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3))'
                                            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))',
                                        border: selectedRoom === room.id ? '3px solid var(--primary-500)' : '2px solid rgba(99, 102, 241, 0.4)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: editMode ? 'grab' : 'pointer',
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                        transition: dragState.isDragging || dragState.isResizing ? 'none' : 'all 0.2s ease',
                                        boxShadow: selectedRoom === room.id ? '0 0 20px rgba(99, 102, 241, 0.3)' : 'none',
                                    }}
                                    onMouseDown={(e) => handleRoomMouseDown(e, room, 'move')}
                                >
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', textShadow: '0 1px 2px rgba(0,0,0,0.2)', textAlign: 'center', padding: '0.25rem' }}>
                                        {room.nameEn || room.name}
                                    </span>

                                    {/* Resize Handles */}
                                    {editMode && selectedRoom === room.id && (
                                        <>
                                            {['nw', 'ne', 'sw', 'se'].map(handle => (
                                                <div key={handle} style={{
                                                    position: 'absolute',
                                                    top: handle.includes('n') ? -6 : undefined,
                                                    bottom: handle.includes('s') ? -6 : undefined,
                                                    left: handle.includes('w') ? -6 : undefined,
                                                    right: handle.includes('e') ? -6 : undefined,
                                                    width: 12, height: 12,
                                                    background: 'var(--primary-500)', border: '2px solid white',
                                                    borderRadius: '50%', cursor: `${handle}-resize`, zIndex: 10,
                                                }} onMouseDown={(e) => { e.stopPropagation(); handleRoomMouseDown(e, room, handle); }} />
                                            ))}
                                            <button className="btn btn-danger btn-icon" style={{
                                                position: 'absolute', top: 4, right: 4,
                                                padding: 4, minWidth: 24, minHeight: 24, zIndex: 10,
                                            }} onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id); }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}

                            {/* Empty State */}
                            {filteredRooms.length === 0 && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                    <MapPin size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                    <p>{t('No rooms on this floor')}</p>
                                    {editMode && (
                                        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => {
                                            setRoomForm({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20 });
                                            setShowRoomModal(true);
                                        }}>
                                            <Plus size={16} /> {t('Add Room')}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="card-body" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
                            <MapPin size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <h3>{t('Select a Building & Floor')}</h3>
                            <p>{t('Choose a building and floor from the panel above to view and edit the map.')}</p>
                        </div>
                    )}
                </div>

                {/* Room Details Panel */}
                {selFloor && (
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title"><Home size={18} /> {t('Room Details')}</span>
                        </div>
                        <div className="card-body">
                            {selectedRoom && selectedRoomData ? (
                                <>
                                    {/* Room Info */}
                                    <div style={{ marginBottom: '1.2rem' }}>
                                        <h3 style={{ margin: '0 0 0.5rem' }}>{selectedRoomData.nameEn || selectedRoomData.name}</h3>
                                        {!editMode && (
                                            <div style={{ display: 'flex', gap: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                <span>🌡️ 25°C</span>
                                                <span>💧 60%</span>
                                            </div>
                                        )}
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
                                        </div>

                                        {roomAppliances.length === 0 ? (
                                            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                                                {t('No appliances in this room')}
                                            </p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {roomAppliances.map((app: any) => {
                                                    const iconData = APPLIANCE_ICONS[app.type] || APPLIANCE_ICONS.light;
                                                    return (
                                                        <div key={app.id} style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                                                            background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                                                            border: '1px solid var(--border-color)',
                                                        }}>
                                                            <span style={{ fontSize: '1.25rem' }}>{iconData.emoji}</span>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontWeight: 500 }}>{app.name}</div>
                                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{iconData.label}</div>
                                                            </div>
                                                            <span style={{
                                                                padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)',
                                                                fontSize: '0.75rem', color: 'white',
                                                                background: app.state ? 'var(--success-500)' : 'var(--gray-600)',
                                                            }}>
                                                                {app.state ? 'ON' : 'OFF'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    <MapPin size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                    <p>{t('Select a room to view details')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ============ MODALS ============ */}

            {/* Add Building Modal */}
            {showBuildingModal && (
                <div className="modal-overlay" onClick={() => setShowBuildingModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{t('Add Building')}</h3>
                            <button className="modal-close" onClick={() => setShowBuildingModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Building Name')}</label>
                                <input type="text" className="form-input" placeholder="Main Building"
                                    value={buildingForm.nameEn} onChange={(e) => setBuildingForm(p => ({ ...p, nameEn: e.target.value, name: e.target.value }))} autoFocus />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowBuildingModal(false)}>{t('Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddBuilding}><Save size={16} /> {t('Add Building')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Floor Modal */}
            {showFloorModal && (
                <div className="modal-overlay" onClick={() => setShowFloorModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{t('Add Floor')}</h3>
                            <button className="modal-close" onClick={() => setShowFloorModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Floor Name')}</label>
                                <input type="text" className="form-input" placeholder="Floor 1"
                                    value={floorForm.name} onChange={(e) => setFloorForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowFloorModal(false)}>{t('Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddFloor}><Save size={16} /> {t('Add Floor')}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Room Modal */}
            {showRoomModal && (
                <div className="modal-overlay" onClick={() => setShowRoomModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{t('Add Room')}</h3>
                            <button className="modal-close" onClick={() => setShowRoomModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Room Name')}</label>
                                <input type="text" className="form-input" placeholder="Bedroom"
                                    value={roomForm.nameEn} onChange={(e) => setRoomForm(p => ({ ...p, nameEn: e.target.value, name: e.target.value }))} autoFocus />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <div className="form-group">
                                    <label className="form-label">X (%)</label>
                                    <input type="number" className="form-input" value={roomForm.x}
                                        onChange={(e) => setRoomForm(p => ({ ...p, x: parseInt(e.target.value) || 0 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Y (%)</label>
                                    <input type="number" className="form-input" value={roomForm.y}
                                        onChange={(e) => setRoomForm(p => ({ ...p, y: parseInt(e.target.value) || 0 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('Width')} (%)</label>
                                    <input type="number" className="form-input" value={roomForm.width}
                                        onChange={(e) => setRoomForm(p => ({ ...p, width: parseInt(e.target.value) || 10 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{t('Height')} (%)</label>
                                    <input type="number" className="form-input" value={roomForm.height}
                                        onChange={(e) => setRoomForm(p => ({ ...p, height: parseInt(e.target.value) || 10 }))} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowRoomModal(false)}>{t('Cancel')}</button>
                            <button className="btn btn-primary" onClick={handleAddRoom}><Save size={16} /> {t('Add Room')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
