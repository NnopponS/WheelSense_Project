'use client';

import { useEffect, useState } from 'react';
import {
    Building2, Layers, Plus, Trash2, Edit3, GripVertical,
    Save, X, MapPin, Move
} from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
    getBuildings, getFloors, getRooms, createBuilding, deleteBuilding,
    createFloor, deleteFloor, createRoom, updateRoom, deleteRoom,
    getAppliances, getRoomAppliances
} from '@/lib/api';

export default function MapZonePage() {
    const { buildings, setBuildings, floors, setFloors, rooms, setRooms } = useWheelSenseStore();

  const { t, language } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [selBuilding, setSelBuilding] = useState<string | null>(null);
    const [selFloor, setSelFloor] = useState<string | null>(null);
    const [showAddBuilding, setShowAddBuilding] = useState(false);
    const [showAddFloor, setShowAddFloor] = useState(false);
    const [showAddRoom, setShowAddRoom] = useState(false);
    const [newName, setNewName] = useState('');
    const [newNameEn, setNewNameEn] = useState('');
    const [editingRoom, setEditingRoom] = useState<any>(null);
    const [dragRoom, setDragRoom] = useState<string | null>(null);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

    const fetchData = async () => {
        try {
            const [bRes, fRes, rRes] = await Promise.all([getBuildings(), getFloors(), getRooms()]);
            if (bRes.data) setBuildings(bRes.data.buildings.map((b: any) => ({ id: b.id, name: b.name, nameEn: b.name_en })));
            if (fRes.data) setFloors(fRes.data.floors.map((f: any) => ({ id: f.id, name: f.name, buildingId: f.building_id })));
            if (rRes.data) setRooms(rRes.data.rooms.map((r: any) => ({
                id: r.id, name: r.name, nameEn: r.name_en, roomType: r.room_type,
                x: r.x, y: r.y, width: r.width, height: r.height,
                floorId: r.floor_id, buildingId: 'building-1',
            })));
            setLoading(false);
        } catch (e) { console.error(e); setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const filteredFloors = selBuilding ? floors.filter(f => f.buildingId === selBuilding) : floors;
    const filteredRooms = selFloor ? rooms.filter(r => r.floorId === selFloor) : rooms;

    const handleAddBuilding = async () => {
        if (!newName.trim()) return;
        await createBuilding({ name: newName, name_en: newNameEn || undefined });
        setNewName(''); setNewNameEn(''); setShowAddBuilding(false);
        fetchData();
    };

    const handleAddFloor = async () => {
        if (!newName.trim() || !selBuilding) return;
        await createFloor({ building_id: selBuilding, name: newName, level: filteredFloors.length + 1 });
        setNewName(''); setShowAddFloor(false);
        fetchData();
    };

    const handleAddRoom = async () => {
        if (!newName.trim() || !selFloor) return;
        await createRoom({
            floor_id: selFloor, name: newName, name_en: newNameEn || undefined,
            room_type: 'room', x: 10, y: 10, width: 20, height: 20
        });
        setNewName(''); setNewNameEn(''); setShowAddRoom(false);
        fetchData();
    };

    const handleDeleteBuilding = async (id: string) => {
        if (!confirm('Delete this building?')) return;
        await deleteBuilding(id);
        if (selBuilding === id) { setSelBuilding(null); setSelFloor(null); }
        fetchData();
    };

    const handleDeleteFloor = async (id: string) => {
        if (!confirm('Delete this floor?')) return;
        await deleteFloor(id);
        if (selFloor === id) setSelFloor(null);
        fetchData();
    };

    const handleDeleteRoom = async (id: string) => {
        if (!confirm('Delete this room?')) return;
        await deleteRoom(id);
        fetchData();
    };

    const handleSaveRoom = async () => {
        if (!editingRoom) return;
        await updateRoom(editingRoom.id, {
            name: editingRoom.name, name_en: editingRoom.nameEn,
            room_type: editingRoom.roomType, x: editingRoom.x, y: editingRoom.y,
            width: editingRoom.width, height: editingRoom.height
        });
        setEditingRoom(null);
        fetchData();
    };

    // Drag to reposition rooms on the map canvas
    const handleCanvasMouseDown = (e: React.MouseEvent, roomId: string) => {
        e.stopPropagation();
        setDragRoom(roomId);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!dragRoom || !dragStart) return;
        const canvas = e.currentTarget.getBoundingClientRect();
        const dx = ((e.clientX - dragStart.x) / canvas.width) * 100;
        const dy = ((e.clientY - dragStart.y) / canvas.height) * 100;
        setRooms(rooms.map(r => r.id === dragRoom ? { ...r, x: Math.max(0, Math.min(95, r.x + dx)), y: Math.max(0, Math.min(95, r.y + dy)) } : r));
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleCanvasMouseUp = async () => {
        if (dragRoom) {
            const room = rooms.find(r => r.id === dragRoom);
            if (room) await updateRoom(room.id, { x: Math.round(room.x), y: Math.round(room.y) });
            setDragRoom(null);
            setDragStart(null);
        }
    };

    if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>Loading...</h3></div>;

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
            <h2 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><MapPin size={24} /> Map & Zone Editor</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>
                {/* Left: Building/Floor Tree */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Buildings */}
                    <div className="list-container">
                        <div className="list-header">
                            <span className="list-title"><Building2 size={18} /> Buildings</span>
                            <button onClick={() => setShowAddBuilding(true)} style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '6px', padding: '0.25rem 0.5rem', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}>
                                <Plus size={14} /> Add
                            </button>
                        </div>
                        <div className="list-body">
                            {buildings.map(b => (
                                <div key={b.id} className={`list-item ${selBuilding === b.id ? 'active' : ''}`}
                                    onClick={() => { setSelBuilding(b.id); setSelFloor(null); }}
                                    style={selBuilding === b.id ? { background: 'var(--primary-500-10)' } : {}}>
                                    <div className="list-item-content">
                                        <div className="list-item-title">{b.nameEn || b.name}</div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteBuilding(b.id); }}
                                        style={{ background: 'none', border: 'none', color: 'var(--danger-400)', cursor: 'pointer' }}>
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            {showAddBuilding && (
                                <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <input placeholder="Name (TH)" value={newName} onChange={e => setNewName(e.target.value)}
                                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                    <input placeholder="Name (EN)" value={newNameEn} onChange={e => setNewNameEn(e.target.value)}
                                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button onClick={handleAddBuilding} style={{ flex: 1, background: 'var(--primary-500)', border: 'none', borderRadius: '6px', padding: '0.4rem', color: 'white', cursor: 'pointer' }}>Save</button>
                                        <button onClick={() => setShowAddBuilding(false)} style={{ background: 'var(--border-color)', border: 'none', borderRadius: '6px', padding: '0.4rem', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Floors */}
                    {selBuilding && (
                        <div className="list-container">
                            <div className="list-header">
                                <span className="list-title"><Layers size={18} /> Floors</span>
                                <button onClick={() => setShowAddFloor(true)} style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '6px', padding: '0.25rem 0.5rem', color: 'white', cursor: 'pointer', fontSize: '0.75rem' }}>
                                    <Plus size={14} /> Add
                                </button>
                            </div>
                            <div className="list-body">
                                {filteredFloors.map(f => (
                                    <div key={f.id} className={`list-item ${selFloor === f.id ? 'active' : ''}`}
                                        onClick={() => setSelFloor(f.id)}
                                        style={selFloor === f.id ? { background: 'var(--primary-500-10)' } : {}}>
                                        <div className="list-item-content">
                                            <div className="list-item-title">{f.name}</div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); handleDeleteFloor(f.id); }}
                                            style={{ background: 'none', border: 'none', color: 'var(--danger-400)', cursor: 'pointer' }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                                {showAddFloor && (
                                    <div style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                        <input placeholder="Floor Name" value={newName} onChange={e => setNewName(e.target.value)}
                                            style={{ flex: 1, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                        <button onClick={handleAddFloor} style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '6px', padding: '0.4rem', color: 'white', cursor: 'pointer' }}><Save size={14} /></button>
                                        <button onClick={() => setShowAddFloor(false)} style={{ background: 'var(--border-color)', border: 'none', borderRadius: '6px', padding: '0.4rem', color: 'white', cursor: 'pointer' }}><X size={14} /></button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Map Canvas */}
                <div>
                    {selFloor ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    <Move size={14} style={{ display: 'inline', marginRight: '4px' }} />
                                    Drag rooms to reposition. Click a room to edit.
                                </span>
                                <button onClick={() => setShowAddRoom(true)}
                                    style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.4rem 1rem', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                                    <Plus size={14} /> Add Room
                                </button>
                            </div>
                            <div className="map-container" style={{ minHeight: '500px' }}>
                                <div className="map-canvas"
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp}
                                    onMouseLeave={handleCanvasMouseUp}>
                                    {filteredRooms.map(room => (
                                        <div
                                            key={room.id}
                                            className="room"
                                            style={{
                                                left: `${room.x}%`, top: `${room.y}%`,
                                                width: `${room.width}%`, height: `${room.height}%`,
                                                cursor: dragRoom === room.id ? 'grabbing' : 'grab',
                                                outline: editingRoom?.id === room.id ? '2px solid var(--primary-500)' : 'none',
                                            }}
                                            onMouseDown={(e) => handleCanvasMouseDown(e, room.id)}
                                            onClick={(e) => { e.stopPropagation(); setEditingRoom({ ...room }); }}
                                        >
                                            <span className="room-label">{room.nameEn || room.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Room Editor Panel */}
                            {editingRoom && (
                                <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 0.75rem' }}>Edit Room: {editingRoom.nameEn || editingRoom.name}</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <input placeholder="Name (TH)" value={editingRoom.name} onChange={e => setEditingRoom({ ...editingRoom, name: e.target.value })}
                                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                        <input placeholder="Name (EN)" value={editingRoom.nameEn || ''} onChange={e => setEditingRoom({ ...editingRoom, nameEn: e.target.value })}
                                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                        <input placeholder="Width %" type="number" value={editingRoom.width} onChange={e => setEditingRoom({ ...editingRoom, width: Number(e.target.value) })}
                                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                        <input placeholder="Height %" type="number" value={editingRoom.height} onChange={e => setEditingRoom({ ...editingRoom, height: Number(e.target.value) })}
                                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                        <button onClick={handleSaveRoom} style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer' }}>
                                            <Save size={14} /> Save
                                        </button>
                                        <button onClick={() => handleDeleteRoom(editingRoom.id)} style={{ background: 'var(--danger-500)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer' }}>
                                            <Trash2 size={14} /> Delete
                                        </button>
                                        <button onClick={() => setEditingRoom(null)} style={{ background: 'var(--border-color)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                </div>
                            )}

                            {/* Add Room Modal */}
                            {showAddRoom && (
                                <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 0.75rem' }}>Add Room</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <input placeholder="Name (TH)" value={newName} onChange={e => setNewName(e.target.value)}
                                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                        <input placeholder="Name (EN)" value={newNameEn} onChange={e => setNewNameEn(e.target.value)}
                                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                        <button onClick={handleAddRoom} style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer' }}>Create</button>
                                        <button onClick={() => setShowAddRoom(false)} style={{ background: 'var(--border-color)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="empty-state" style={{ height: '400px' }}>
                            <MapPin size={48} />
                            <h3>Select a Building & Floor</h3>
                            <p>Choose a building and floor from the left panel to view and edit the map.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
