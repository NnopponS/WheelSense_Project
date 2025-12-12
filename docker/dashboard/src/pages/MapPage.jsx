import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import * as api from '../services/api';
import { Map, Layers, Edit2, Plus, Trash2, Save, X, Check, Zap, Lightbulb, Thermometer, Tv, Fan, Wind, Power, Accessibility, Video, Volume2, Bell } from 'lucide-react';

export function MapPage() {
    const {
        rooms, setRooms,
        devices,
        appliances, setAppliances,
        selectedBuilding, setSelectedBuilding,
        selectedFloor, setSelectedFloor,
        role,
        wheelchairs, setWheelchairs,
        wheelchairPositions, setWheelchairPositions,
        openDrawer,
        toggleAppliance
    } = useApp();

    const [editMode, setEditMode] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [showAddRoom, setShowAddRoom] = useState(false);
    const [showAddAppliance, setShowAddAppliance] = useState(false);
    const [newRoom, setNewRoom] = useState({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20, temperature: 25, humidity: 60 });
    const [newAppliance, setNewAppliance] = useState({ name: '', type: 'light' });
    const [editingRoom, setEditingRoom] = useState(null);

    // Drag state
    const [draggingRoom, setDraggingRoom] = useState(null);
    const [draggingMarker, setDraggingMarker] = useState(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const mapCanvasRef = useRef(null);

    // Resize state
    const [resizingRoom, setResizingRoom] = useState(null);
    const [resizeHandle, setResizeHandle] = useState(null); // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

    // Building and floor options - now with state management
    const [buildings, setBuildings] = useState([
        { id: 'building-1', name: 'อาคาร A' },
        { id: 'building-2', name: 'อาคาร B' },
    ]);
    const [floors, setFloors] = useState([
        { id: 'floor-1', name: 'ชั้น 1' },
        { id: 'floor-2', name: 'ชั้น 2' },
        { id: 'floor-3', name: 'ชั้น 3' },
    ]);

    const selectedBuildingName = buildings.find(b => b.id === selectedBuilding)?.name || 'อาคาร A';
    const selectedFloorName = floors.find(f => f.id === selectedFloor)?.name || 'ชั้น 1';

    // Load map config and rooms from API
    useEffect(() => {
        const loadData = async () => {
            try {
                // Load map config
                const config = await api.getMapConfig();
                if (config) {
                    if (config.buildings && config.buildings.length > 0) {
                        setBuildings(config.buildings);
                    }
                    if (config.floors && config.floors.length > 0) {
                        setFloors(config.floors);
                    }
                    if (config.wheelchairPositions) {
                        setWheelchairPositions(config.wheelchairPositions);
                    }
                }

                // Load rooms from API
                const roomsData = await api.getRooms();
                if (roomsData && roomsData.length > 0) {
                    console.log('Loaded rooms from API:', roomsData.length, roomsData);
                    setRooms(roomsData);
                } else if (rooms && rooms.length > 0) {
                    console.log('No rooms in API, keeping existing rooms:', rooms.length);
                } else {
                    console.log('No rooms found, using empty array');
                }
            } catch (err) {
                console.error('Failed to load map data:', err);
            }
        };
        loadData();
    }, [setRooms]);

    // Save map config to API (debounced)
    const saveTimeoutRef = useRef(null);
    const saveMapConfig = useCallback(async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                console.log('Saving map config to API');
                const result = await api.saveMapConfig({
                    buildings,
                    floors,
                    wheelchairPositions
                });
                console.log('Map config saved successfully:', result);
            } catch (err) {
                console.error('Failed to save map config:', err);
                alert('ไม่สามารถบันทึกการตั้งค่าแผนที่ได้: ' + err.message);
            }
        }, 1000); // Debounce 1 second
    }, [buildings, floors, wheelchairPositions]);

    // Save rooms to API (debounced)
    const saveRooms = useCallback(async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(async () => {
            try {
                console.log('Saving rooms to API:', rooms.length);
                const result = await api.updateAllRooms(rooms);
                console.log('Rooms saved successfully:', result);
            } catch (err) {
                console.error('Failed to save rooms:', err);
                alert('ไม่สามารถบันทึกข้อมูลห้องได้: ' + err.message);
            }
        }, 1000);
    }, [rooms]);

    // Auto-save when data changes
    useEffect(() => {
        saveMapConfig();
    }, [buildings, floors, wheelchairPositions, saveMapConfig]);

    useEffect(() => {
        saveRooms();
    }, [rooms, saveRooms]);

    // Delete building
    const handleDeleteBuilding = async (buildingId) => {
        if (buildings.length <= 1) {
            alert('ไม่สามารถลบอาคารได้ ต้องมีอาคารอย่างน้อย 1 อาคาร');
            return;
        }
        if (confirm('คุณต้องการลบอาคารนี้? การลบจะไม่สามารถกู้คืนได้')) {
            setBuildings(prev => prev.filter(b => b.id !== buildingId));
            if (selectedBuilding === buildingId) {
                const remaining = buildings.filter(b => b.id !== buildingId);
                if (remaining.length > 0) {
                    setSelectedBuilding(remaining[0].id);
                }
            }
            // Save to API
            try {
                await api.deleteBuilding(buildingId);
                saveMapConfig();
            } catch (err) {
                console.error('Failed to delete building:', err);
            }
        }
    };

    // Delete floor
    const handleDeleteFloor = async (floorId) => {
        if (floors.length <= 1) {
            alert('ไม่สามารถลบชั้นได้ ต้องมีชั้นอย่างน้อย 1 ชั้น');
            return;
        }
        if (confirm('คุณต้องการลบชั้นนี้? การลบจะไม่สามารถกู้คืนได้')) {
            setFloors(prev => prev.filter(f => f.id !== floorId));
            if (selectedFloor === floorId) {
                const remaining = floors.filter(f => f.id !== floorId);
                if (remaining.length > 0) {
                    setSelectedFloor(remaining[0].id);
                }
            }
            // Save to API
            try {
                await api.deleteFloor(floorId);
                saveMapConfig();
            } catch (err) {
                console.error('Failed to delete floor:', err);
            }
        }
    };

    // Drag handlers for rooms
    const handleRoomMouseDown = (e, roomId) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        const room = rooms.find(r => r.id === roomId);
        if (!room) return;

        setDraggingRoom(roomId);
        const rect = mapCanvasRef.current?.getBoundingClientRect();
        if (rect) {
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setDragStart({ x: x - room.x, y: y - room.y });
        }
    };

    const handleMouseMove = (e) => {
        if (!mapCanvasRef.current) return;

        const rect = mapCanvasRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        if (resizingRoom) {
            const room = rooms.find(r => r.id === resizingRoom);
            if (!room) return;

            const deltaX = x - resizeStart.x;
            const deltaY = y - resizeStart.y;

            let newX = room.x;
            let newY = room.y;
            let newWidth = resizeStart.width;
            let newHeight = resizeStart.height;

            // Handle different resize directions
            if (resizeHandle.includes('w')) {
                newX = Math.max(0, Math.min(room.x + room.width - 5, resizeStart.x + deltaX));
                newWidth = Math.max(5, resizeStart.width - deltaX);
            }
            if (resizeHandle.includes('e')) {
                newWidth = Math.max(5, resizeStart.width + deltaX);
            }
            if (resizeHandle.includes('n')) {
                newY = Math.max(0, Math.min(room.y + room.height - 5, resizeStart.y + deltaY));
                newHeight = Math.max(5, resizeStart.height - deltaY);
            }
            if (resizeHandle.includes('s')) {
                newHeight = Math.max(5, resizeStart.height + deltaY);
            }

            // Ensure room stays within bounds
            if (newX + newWidth > 100) {
                newWidth = 100 - newX;
            }
            if (newY + newHeight > 100) {
                newHeight = 100 - newY;
            }

            handleUpdateRoom(resizingRoom, { x: newX, y: newY, width: newWidth, height: newHeight });
        } else if (draggingRoom) {
            const newX = Math.max(0, Math.min(100, x - dragStart.x));
            const newY = Math.max(0, Math.min(100, y - dragStart.y));
            handleUpdateRoom(draggingRoom, { x: newX, y: newY });
        } else if (draggingMarker) {
            // Calculate new position using dragStart offset (same as draggingRoom)
            const newX = Math.max(0, Math.min(100, x - dragStart.x));
            const newY = Math.max(0, Math.min(100, y - dragStart.y));
            setWheelchairPositions(prev => {
                const newPositions = {
                    ...prev,
                    [draggingMarker]: { x: newX, y: newY }
                };
                // Save to API immediately (async without await)
                api.saveWheelchairPositions(newPositions).catch(err => {
                    console.error('Failed to save wheelchair positions:', err);
                });
                return newPositions;
            });
        }
    };

    const handleMouseUp = () => {
        setDraggingRoom(null);
        setDraggingMarker(null);
        setResizingRoom(null);
        setResizeHandle(null);
    };

    // Resize handler for rooms
    const handleResizeMouseDown = (e, roomId, handle) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        const room = rooms.find(r => r.id === roomId);
        if (!room) return;

        setResizingRoom(roomId);
        setResizeHandle(handle);
        const rect = mapCanvasRef.current?.getBoundingClientRect();
        if (rect) {
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setResizeStart({ x, y, width: room.width, height: room.height });
        }
    };

    // Drag handler for wheelchair marker
    const handleMarkerMouseDown = (e, wheelchairId) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        const storedPos = wheelchairPositions[wheelchairId];
        const wc = wheelchairs.find(w => w.id === wheelchairId);
        if (wc && wc.room) {
            const room = rooms.find(r => r.id === wc.room);
            if (room) {
                const currentX = storedPos ? storedPos.x : (room.x + room.width / 2);
                const currentY = storedPos ? storedPos.y : (room.y + room.height / 2);
                const rect = mapCanvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setDragStart({ x: x - currentX, y: y - currentY });
                }
            }
        }
        setDraggingMarker(wheelchairId);
    };

    useEffect(() => {
        if (draggingRoom || draggingMarker || resizingRoom) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [draggingRoom, draggingMarker, resizingRoom, dragStart, resizeStart, resizeHandle]);

    const handleAddRoom = () => {
        if (!newRoom.name) {
            alert('กรุณากรอกชื่อห้อง');
            return;
        }
        const roomId = `room-${Date.now()}`;
        setRooms(prev => [...prev, {
            id: roomId,
            ...newRoom,
            occupied: false
        }]);
        // Initialize empty appliances for new room
        setAppliances(prev => ({ ...prev, [roomId]: [] }));
        setNewRoom({ name: '', nameEn: '', x: 10, y: 10, width: 20, height: 20, temperature: 25, humidity: 60 });
        setShowAddRoom(false);
    };

    const handleDeleteRoom = async (roomId) => {
        if (confirm('คุณต้องการลบห้องนี้?')) {
            setRooms(prev => prev.filter(r => r.id !== roomId));
            // Also remove appliances for this room
            setAppliances(prev => {
                const newAppliances = { ...prev };
                delete newAppliances[roomId];
                return newAppliances;
            });
            setSelectedRoom(null);
            // Save to API
            try {
                await api.deleteRoom(roomId);
            } catch (err) {
                console.error('Failed to delete room:', err);
            }
        }
    };

    const handleUpdateRoom = (roomId, updates) => {
        setRooms(prev => {
            const updated = prev.map(r => r.id === roomId ? { ...r, ...updates } : r);
            // Trigger save (will be debounced by saveRooms)
            return updated;
        });
    };

    const handleAddAppliance = () => {
        if (!newAppliance.name || !selectedRoom) {
            alert('กรุณากรอกชื่อเครื่องใช้ไฟฟ้า');
            return;
        }
        const appId = `app-${Date.now()}`;
        const defaultValues = {
            light: { state: false, brightness: 100 },
            aircon: { state: false, temperature: 25 },
            fan: { state: false, speed: 50 },
            tv: { state: false, volume: 50 },
            heater: { state: false },
            alarm: { state: false },
            curtain: { state: false, position: 100 },
        };
        setAppliances(prev => ({
            ...prev,
            [selectedRoom]: [
                ...(prev[selectedRoom] || []),
                { id: appId, ...newAppliance, ...defaultValues[newAppliance.type] }
            ]
        }));
        setNewAppliance({ name: '', type: 'light' });
        setShowAddAppliance(false);
    };

    const handleDeleteAppliance = (roomId, appId) => {
        if (confirm('คุณต้องการลบเครื่องใช้ไฟฟ้านี้?')) {
            setAppliances(prev => ({
                ...prev,
                [roomId]: prev[roomId].filter(a => a.id !== appId)
            }));
        }
    };

    const getApplianceIcon = (type) => {
        switch (type) {
            case 'light': return Lightbulb;
            case 'aircon': return Thermometer;
            case 'tv': return Tv;
            case 'fan': return Fan;
            case 'heater': return Wind;
            case 'av': return Volume2;
            case 'alarm': return Bell;
            default: return Power;
        }
    };

    // Find appliances by roomType, nameEn, or roomId
    const getAppliancesForRoom = (roomId) => {
        if (!roomId) return [];

        // Direct lookup
        if (appliances[roomId]?.length > 0) return appliances[roomId];

        // Find room data
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            // Try by roomType
            const roomType = room.roomType?.toLowerCase();
            if (roomType && appliances[roomType]?.length > 0) return appliances[roomType];

            // Try by nameEn
            const nameEn = room.nameEn?.toLowerCase();
            if (nameEn && appliances[nameEn]?.length > 0) return appliances[nameEn];

            // Try by name mapping
            const roomMapping = {
                'bedroom': ['ห้องนอน', 'bed room', 'bedroom'],
                'bathroom': ['ห้องน้ำ', 'bathroom'],
                'livingroom': ['ห้องนั่งเล่น', 'living room', 'livingroom'],
                'kitchen': ['ห้องครัว', 'kitchen']
            };

            for (const [key, names] of Object.entries(roomMapping)) {
                const roomName = room.name?.toLowerCase() || '';
                const roomNameEn = room.nameEn?.toLowerCase() || '';
                if (names.some(n => roomName.includes(n.toLowerCase()) || roomNameEn.includes(n.toLowerCase()) || n.toLowerCase().includes(roomName) || n.toLowerCase().includes(roomNameEn))) {
                    if (appliances[key]?.length > 0) return appliances[key];
                }
            }
        }

        return [];
    };

    const roomAppliances = getAppliancesForRoom(selectedRoom);

    return (
        <div className="page-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2>🗺️ Map & Zones</h2>
                    <p>จัดการแผนผังอาคารและโซน</p>
                </div>
                {role === 'admin' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {editMode ? (
                            <>
                                <button
                                    className="btn btn-success"
                                    onClick={async () => {
                                        // Force save before exiting edit mode
                                        try {
                                            await api.updateAllRooms(rooms);
                                            await api.saveMapConfig({
                                                buildings,
                                                floors,
                                                wheelchairPositions
                                            });
                                            alert('บันทึกข้อมูลสำเร็จ!');
                                            setEditMode(false);
                                        } catch (err) {
                                            console.error('Failed to save:', err);
                                            alert('ไม่สามารถบันทึกข้อมูลได้: ' + err.message);
                                        }
                                    }}
                                >
                                    <Save size={16} /> บันทึก
                                </button>
                                <button className="btn btn-secondary" onClick={() => setEditMode(false)}>
                                    <X size={16} /> ยกเลิก
                                </button>
                            </>
                        ) : (
                            <button className="btn btn-primary" onClick={() => setEditMode(true)}>
                                <Edit2 size={16} /> แก้ไขแผนที่
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Building & Floor Selector */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>อาคาร:</span>
                        {editMode ? (
                            // Edit Mode: Show input for building name
                            <input
                                type="text"
                                className="form-input"
                                style={{ width: '150px' }}
                                value={buildings.find(b => b.id === selectedBuilding)?.name || ''}
                                onChange={(e) => {
                                    setBuildings(prev => prev.map(b =>
                                        b.id === selectedBuilding ? { ...b, name: e.target.value } : b
                                    ));
                                }}
                                placeholder="ชื่ออาคาร"
                            />
                        ) : (
                            <select
                                className="filter-select"
                                value={selectedBuilding}
                                onChange={(e) => setSelectedBuilding(e.target.value)}
                            >
                                {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        )}
                        {editMode && (
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteBuilding(selectedBuilding)}
                                title="ลบอาคาร"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>ชั้น:</span>
                        {editMode ? (
                            // Edit Mode: Show input for floor name
                            <input
                                type="text"
                                className="form-input"
                                style={{ width: '120px' }}
                                value={floors.find(f => f.id === selectedFloor)?.name || ''}
                                onChange={(e) => {
                                    setFloors(prev => prev.map(f =>
                                        f.id === selectedFloor ? { ...f, name: e.target.value } : f
                                    ));
                                }}
                                placeholder="ชื่อชั้น"
                            />
                        ) : (
                            <select
                                className="filter-select"
                                value={selectedFloor}
                                onChange={(e) => setSelectedFloor(e.target.value)}
                            >
                                {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        )}
                        {editMode && (
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDeleteFloor(selectedFloor)}
                                title="ลบชั้น"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    {editMode && (
                        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowAddRoom(true)}>
                            <Plus size={16} /> เพิ่มห้อง
                        </button>
                    )}
                </div>
            </div>

            <div className="content-grid">
                {/* Map Canvas */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Map size={18} /> แผนผัง - {selectedBuildingName} {selectedFloorName}</span>
                    </div>
                    <div
                        className="map-canvas"
                        style={{ minHeight: '500px', position: 'relative' }}
                        ref={mapCanvasRef}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                    >
                        {rooms.map(room => (
                            <div
                                key={room.id}
                                className={`room ${room.occupied ? 'occupied' : ''} ${selectedRoom === room.id ? 'selected' : ''}`}
                                style={{
                                    left: `${room.x}%`,
                                    top: `${room.y}%`,
                                    width: `${room.width}%`,
                                    height: `${room.height}%`,
                                    cursor: editMode ? 'move' : 'pointer',
                                    outline: selectedRoom === room.id ? '3px solid var(--primary-500)' : 'none',
                                    userSelect: 'none'
                                }}
                                onClick={() => {
                                    if (!editMode) {
                                        // Both Admin and User can open drawer with video and appliance control
                                        openDrawer({ type: 'room', data: room });
                                        // Also select the room for the details panel
                                        setSelectedRoom(room.id);
                                    }
                                }}
                                onMouseDown={(e) => editMode && handleRoomMouseDown(e, room.id)}
                            >
                                <span className="room-label">{room.name}</span>
                                <span className="room-status">{room.occupied ? '🟢 มีคน' : '⚪ ว่าง'}</span>
                                {editMode && selectedRoom === room.id && (
                                    <>
                                        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
                                            <button
                                                className="btn btn-danger btn-icon"
                                                style={{ padding: 2, minHeight: 20, minWidth: 20 }}
                                                onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room.id); }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                        {/* Resize handles */}
                                        {/* Corners */}
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: -4,
                                                left: -4,
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'nwse-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 'nw')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: -4,
                                                right: -4,
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'nesw-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 'ne')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute',
                                                bottom: -4,
                                                left: -4,
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'nesw-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 'sw')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute',
                                                bottom: -4,
                                                right: -4,
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'nwse-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 'se')}
                                        />
                                        {/* Edges */}
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: -4,
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'ns-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 'n')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute',
                                                bottom: -4,
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'ns-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 's')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: '50%',
                                                left: -4,
                                                transform: 'translateY(-50%)',
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'ew-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 'w')}
                                        />
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: '50%',
                                                right: -4,
                                                transform: 'translateY(-50%)',
                                                width: 12,
                                                height: 12,
                                                background: 'var(--primary-500)',
                                                border: '2px solid white',
                                                borderRadius: '50%',
                                                cursor: 'ew-resize',
                                                zIndex: 100
                                            }}
                                            onMouseDown={(e) => handleResizeMouseDown(e, room.id, 'e')}
                                        />
                                    </>
                                )}
                            </div>
                        ))}

                        {/* Wheelchair markers */}
                        {wheelchairs.filter(w => w.room).map(wc => {
                            // Find room using flexible matching (by id, roomType, or nameEn)
                            let room = rooms.find(r => r.id === wc.room);
                            if (!room) {
                                room = rooms.find(r => r.roomType?.toLowerCase() === wc.room?.toLowerCase());
                            }
                            if (!room) {
                                room = rooms.find(r => r.nameEn?.toLowerCase() === wc.room?.toLowerCase());
                            }
                            if (!room) {
                                room = rooms.find(r => r.name?.toLowerCase().includes(wc.room?.toLowerCase() || ''));
                            }
                            if (!room) return null;
                            // Calculate position - use stored position if available, otherwise center of room
                            const storedPos = wheelchairPositions[wc.id];
                            const markerX = storedPos ? storedPos.x : (room.x + room.width / 2);
                            const markerY = storedPos ? storedPos.y : (room.y + room.height / 2);
                            return (
                                <div
                                    key={wc.id}
                                    className="wheelchair-marker"
                                    style={{
                                        left: `${markerX}%`,
                                        top: `${markerY}%`,
                                        cursor: editMode ? 'move' : 'pointer',
                                        zIndex: 20
                                    }}
                                    title={`${wc.name} - ${wc.patientName || 'ไม่มีผู้ใช้'}`}
                                    onMouseDown={(e) => editMode && handleMarkerMouseDown(e, wc.id)}
                                    onClick={(e) => { if (!editMode) e.stopPropagation(); }}
                                >
                                    <Accessibility size={18} />
                                </div>
                            );
                        })}

                        {/* Node markers */}
                        {devices.filter(d => d.type === 'node' && d.room).map(node => {
                            const room = rooms.find(r => r.id === node.room);
                            if (!room) return null;
                            return (
                                <div
                                    key={node.id}
                                    style={{
                                        position: 'absolute',
                                        left: `${room.x + room.width - 5}%`,
                                        top: `${room.y + 5}%`,
                                        width: '24px',
                                        height: '24px',
                                        background: node.status === 'online' ? 'var(--success-500)' : 'var(--gray-600)',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '12px',
                                    }}
                                    title={`${node.name} - ${node.status}`}
                                >
                                    📡
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Room Details & Appliances */}
                <div className="list-container">
                    <div className="list-header">
                        <span className="list-title"><Layers size={18} /> {selectedRoom ? 'รายละเอียดห้อง' : 'รายการห้อง'}</span>
                    </div>
                    <div className="list-body">
                        {selectedRoom ? (
                            // Room Details View
                            <>
                                {(() => {
                                    const room = rooms.find(r => r.id === selectedRoom);
                                    if (!room) return null;
                                    return (
                                        <>
                                            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedRoom(null)} style={{ marginBottom: '1rem' }}>
                                                    ← กลับ
                                                </button>

                                                {editMode ? (
                                                    // Edit Mode: Show input fields for room name
                                                    <>
                                                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                                            <label className="form-label">ชื่อห้อง (ไทย)</label>
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                value={room.name || ''}
                                                                onChange={(e) => handleUpdateRoom(room.id, { name: e.target.value })}
                                                                placeholder="เช่น ห้องนอน"
                                                            />
                                                        </div>
                                                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                                            <label className="form-label">ชื่อห้อง (English)</label>
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                value={room.nameEn || ''}
                                                                onChange={(e) => handleUpdateRoom(room.id, { nameEn: e.target.value })}
                                                                placeholder="e.g. BED ROOM"
                                                            />
                                                        </div>
                                                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                            <label className="form-label">ขนาดห้อง (Label)</label>
                                                            <input
                                                                type="text"
                                                                className="form-input"
                                                                value={room.sizeLabel || ''}
                                                                onChange={(e) => handleUpdateRoom(room.id, { sizeLabel: e.target.value })}
                                                                placeholder="เช่น 22x8"
                                                            />
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                                                            <div className="form-group">
                                                                <label className="form-label">X (%)</label>
                                                                <input type="number" className="form-input" value={room.x}
                                                                    onChange={(e) => handleUpdateRoom(room.id, { x: parseInt(e.target.value) || 0 })} />
                                                            </div>
                                                            <div className="form-group">
                                                                <label className="form-label">Y (%)</label>
                                                                <input type="number" className="form-input" value={room.y}
                                                                    onChange={(e) => handleUpdateRoom(room.id, { y: parseInt(e.target.value) || 0 })} />
                                                            </div>
                                                            <div className="form-group">
                                                                <label className="form-label">Width (%)</label>
                                                                <input type="number" className="form-input" value={room.width}
                                                                    onChange={(e) => handleUpdateRoom(room.id, { width: parseInt(e.target.value) || 10 })} />
                                                            </div>
                                                            <div className="form-group">
                                                                <label className="form-label">Height (%)</label>
                                                                <input type="number" className="form-input" value={room.height}
                                                                    onChange={(e) => handleUpdateRoom(room.id, { height: parseInt(e.target.value) || 10 })} />
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : (
                                                    // View Mode: Show room name as text
                                                    <>
                                                        <h3 style={{ marginBottom: '0.5rem' }}>{room.name}</h3>
                                                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{room.nameEn} {room.sizeLabel && `(${room.sizeLabel})`}</p>
                                                    </>
                                                )}

                                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                                                    <span>🌡️ {room.temperature}°C</span>
                                                    <span>💧 {room.humidity}%</span>
                                                </div>
                                            </div>

                                            {/* Video Stream Button (for user mode) */}
                                            {role === 'user' && (
                                                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ width: '100%' }}
                                                        onClick={() => openDrawer({ type: 'room', data: room })}
                                                    >
                                                        <Video size={16} style={{ marginRight: '0.5rem' }} />
                                                        ดูกล้องสด
                                                    </button>
                                                </div>
                                            )}

                                            {/* Appliances List */}
                                            <div style={{ padding: '1rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                    <h4><Zap size={16} /> เครื่องใช้ไฟฟ้า ({roomAppliances.length})</h4>
                                                    {editMode && (
                                                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddAppliance(true)}>
                                                            <Plus size={14} /> เพิ่ม
                                                        </button>
                                                    )}
                                                </div>

                                                {roomAppliances.length === 0 ? (
                                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ไม่มีเครื่องใช้ไฟฟ้า</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        {roomAppliances.map(app => {
                                                            const Icon = getApplianceIcon(app.type);
                                                            return (
                                                                <div key={app.id} style={{
                                                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                                    padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                                                                    cursor: role === 'user' ? 'pointer' : 'default'
                                                                }}
                                                                    onClick={() => {
                                                                        if (role === 'user') {
                                                                            toggleAppliance(selectedRoom, app.id);
                                                                        }
                                                                    }}
                                                                >
                                                                    <Icon size={16} color={app.state ? 'var(--primary-500)' : 'var(--text-muted)'} />
                                                                    <span style={{ flex: 1 }}>{app.name}</span>
                                                                    {role === 'user' ? (
                                                                        <button
                                                                            className={`btn btn-sm ${app.state ? 'btn-success' : 'btn-secondary'}`}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                toggleAppliance(selectedRoom, app.id);
                                                                            }}
                                                                        >
                                                                            {app.state ? 'เปิด' : 'ปิด'}
                                                                        </button>
                                                                    ) : (
                                                                        <>
                                                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{app.type}</span>
                                                                            {editMode && (
                                                                                <button
                                                                                    className="btn btn-danger btn-icon"
                                                                                    style={{ padding: 2, minHeight: 24, minWidth: 24 }}
                                                                                    onClick={() => handleDeleteAppliance(selectedRoom, app.id)}
                                                                                >
                                                                                    <Trash2 size={12} />
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </>
                        ) : (
                            // Room List View
                            rooms.map(room => (
                                <div
                                    key={room.id}
                                    className="list-item"
                                    onClick={() => setSelectedRoom(room.id)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="list-item-avatar" style={{
                                        background: room.occupied
                                            ? 'linear-gradient(135deg, var(--success-500), var(--success-600))'
                                            : 'var(--gray-600)'
                                    }}>
                                        🏠
                                    </div>
                                    <div className="list-item-content">
                                        <div className="list-item-title">{room.name}</div>
                                        <div className="list-item-subtitle">
                                            {room.nameEn} • {(appliances[room.id] || []).length} อุปกรณ์
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 20, height: 20, background: 'rgba(16, 185, 129, 0.3)', border: '2px solid var(--success-500)', borderRadius: 4 }}></div>
                        <span style={{ fontSize: '0.85rem' }}>มีคนอยู่</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 20, height: 20, background: 'rgba(99, 102, 241, 0.1)', border: '2px solid rgba(99, 102, 241, 0.3)', borderRadius: 4 }}></div>
                        <span style={{ fontSize: '0.85rem' }}>ว่าง</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 20, height: 20, background: 'var(--success-500)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>📡</div>
                        <span style={{ fontSize: '0.85rem' }}>Node Online</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 20, height: 20, background: 'var(--gray-600)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>📡</div>
                        <span style={{ fontSize: '0.85rem' }}>Node Offline</span>
                    </div>
                </div>
            </div>

            {/* Add Room Modal */}
            {showAddRoom && (
                <div className="modal-overlay" onClick={() => setShowAddRoom(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>เพิ่มห้องใหม่</h3>
                            <button className="btn btn-icon" onClick={() => setShowAddRoom(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">ชื่อห้อง (ไทย)</label>
                                <input type="text" className="form-input" placeholder="เช่น ห้องนอน"
                                    value={newRoom.name} onChange={(e) => setNewRoom(prev => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">ชื่อห้อง (อังกฤษ)</label>
                                <input type="text" className="form-input" placeholder="เช่น Bedroom"
                                    value={newRoom.nameEn} onChange={(e) => setNewRoom(prev => ({ ...prev, nameEn: e.target.value }))} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">X Position (%)</label>
                                    <input type="number" className="form-input" value={newRoom.x}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, x: parseInt(e.target.value) || 0 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Y Position (%)</label>
                                    <input type="number" className="form-input" value={newRoom.y}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, y: parseInt(e.target.value) || 0 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Width (%)</label>
                                    <input type="number" className="form-input" value={newRoom.width}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, width: parseInt(e.target.value) || 10 }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Height (%)</label>
                                    <input type="number" className="form-input" value={newRoom.height}
                                        onChange={(e) => setNewRoom(prev => ({ ...prev, height: parseInt(e.target.value) || 10 }))} />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddRoom(false)}>ยกเลิก</button>
                            <button className="btn btn-primary" onClick={handleAddRoom}><Save size={16} /> เพิ่มห้อง</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Appliance Modal */}
            {showAddAppliance && (
                <div className="modal-overlay" onClick={() => setShowAddAppliance(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>เพิ่มเครื่องใช้ไฟฟ้า</h3>
                            <button className="btn btn-icon" onClick={() => setShowAddAppliance(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">ชื่อ</label>
                                <input type="text" className="form-input" placeholder="เช่น ไฟเพดาน, แอร์"
                                    value={newAppliance.name} onChange={(e) => setNewAppliance(prev => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">ประเภท</label>
                                <select className="form-input" value={newAppliance.type}
                                    onChange={(e) => setNewAppliance(prev => ({ ...prev, type: e.target.value }))}>
                                    <option value="light">💡 ไฟ</option>
                                    <option value="aircon">❄️ แอร์</option>
                                    <option value="fan">🌀 พัดลม</option>
                                    <option value="tv">📺 ทีวี</option>
                                    <option value="heater">🔥 เครื่องทำน้ำอุ่น</option>
                                    <option value="curtain">🪟 ม่าน</option>
                                    <option value="alarm">🚨 สัญญาณเตือน</option>
                                    <option value="av">🔊 AV</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddAppliance(false)}>ยกเลิก</button>
                            <button className="btn btn-primary" onClick={handleAddAppliance}><Save size={16} /> เพิ่ม</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
