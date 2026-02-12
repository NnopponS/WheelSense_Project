'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
  getMapData, getBuildings, getFloors, getRooms, MapData,
  Building as BuildingType, Floor, Room
} from '@/lib/api';
import {
  Map, Building, Layers, RefreshCw, ZoomIn, ZoomOut, Accessibility,
  Plus, Edit2, Trash2, Save, X, Move, Lightbulb, ChevronRight
} from 'lucide-react';

export default function MapPage() {
  const { role } = useWheelSenseStore();
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [buildings, setBuildings] = useState<BuildingType[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomForm, setRoomForm] = useState({ name: '', name_en: '', x: 10, y: 10, width: 20, height: 20 });
  const mapCanvasRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [buildingsRes, floorsRes] = await Promise.all([
        getBuildings(),
        getFloors(),
      ]);

      if (buildingsRes.data) {
        setBuildings(buildingsRes.data.buildings);
        if (buildingsRes.data.buildings.length > 0 && !selectedBuilding) {
          setSelectedBuilding(buildingsRes.data.buildings[0].id);
        }
      }

      if (floorsRes.data) {
        setFloors(floorsRes.data.floors);
        if (floorsRes.data.floors.length > 0 && !selectedFloor) {
          setSelectedFloor(floorsRes.data.floors[0].id);
        }
      }

      // Fetch map data
      const mapRes = await getMapData(selectedBuilding || undefined, selectedFloor || undefined);
      if (mapRes.data) setMapData(mapRes.data);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedBuilding || selectedFloor) {
      getMapData(selectedBuilding || undefined, selectedFloor || undefined)
        .then(res => {
          if (res.data) setMapData(res.data);
        });
    }
  }, [selectedBuilding, selectedFloor]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await getMapData(selectedBuilding || undefined, selectedFloor || undefined);
      if (res.data) setMapData(res.data);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedBuilding, selectedFloor]);

  const filteredFloors = floors.filter(f => !selectedBuilding || f.building_id === selectedBuilding);

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement room creation API call
    console.log('Add room:', roomForm);
    setShowRoomModal(false);
    setRoomForm({ name: '', name_en: '', x: 10, y: 10, width: 20, height: 20 });
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>🗺️ Map & Zones</h2>
          <p>Manage buildings, floors, rooms and appliances</p>
        </div>
        {role === 'admin' && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {editMode ? (
              <>
                <button className="btn btn-success" onClick={() => setEditMode(false)}>
                  <Save size={16} /> Save All
                </button>
                <button className="btn btn-secondary" onClick={() => setEditMode(false)}>
                  <X size={16} /> Cancel
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => setEditMode(true)}>
                <Edit2 size={16} /> Edit Mode
              </button>
            )}
          </div>
        )}
      </div>

      {/* Management Panel */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-body" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Buildings */}
          <div style={{ minWidth: '180px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Building size={16} />
              <span style={{ fontWeight: 600 }}>Building</span>
              {editMode && (
                <button className="btn btn-icon" style={{ padding: '0.25rem' }} title="Add Building">
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {buildings.map(b => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: selectedBuilding === b.id ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                    color: selectedBuilding === b.id ? 'white' : 'inherit',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: '0.2s'
                  }}
                  onClick={() => { setSelectedBuilding(b.id); setSelectedFloor(''); }}
                >
                  <span style={{ flex: 1 }}>{b.name_en || b.name}</span>
                </div>
              ))}
            </div>
          </div>

          <ChevronRight size={20} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />

          {/* Floors */}
          <div style={{ minWidth: '160px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Layers size={16} />
              <span style={{ fontWeight: 600 }}>Floor</span>
              {editMode && (
                <button className="btn btn-icon" style={{ padding: '0.25rem' }} title="Add Floor">
                  <Plus size={14} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {filteredFloors.map(f => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: selectedFloor === f.id ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                    color: selectedFloor === f.id ? 'white' : 'inherit',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: '0.2s'
                  }}
                  onClick={() => setSelectedFloor(f.id)}
                >
                  <span style={{ flex: 1 }}>{f.name}</span>
                </div>
              ))}
            </div>
          </div>

          <ChevronRight size={20} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />

          {/* Add Room Button */}
          {editMode && (
            <div style={{ alignSelf: 'center' }}>
              <button className="btn btn-primary" onClick={() => setShowRoomModal(true)}>
                <Plus size={16} /> Add Room
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
            <strong>Edit Mode:</strong> Click rooms to select. Drag to reposition. Drag corners to resize.
          </span>
        </div>
      )}

      {/* Main Content: Map + Details */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        {/* Map Canvas */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title"><Map size={18} /> Floor Map</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary btn-icon"
                onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                style={{ padding: '0.4rem' }}
              >
                <ZoomOut size={16} />
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '45px', textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                className="btn btn-secondary btn-icon"
                onClick={() => setZoom(z => Math.min(2, z + 0.1))}
                style={{ padding: '0.4rem' }}
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>
          <div
            ref={mapCanvasRef}
            style={{
              position: 'relative',
              minHeight: '500px',
              background: 'var(--bg-secondary)',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
                position: 'absolute',
                inset: 0,
                transition: 'transform 0.2s'
              }}
            >
              {/* Grid Pattern */}
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '10% 10%',
                pointerEvents: 'none'
              }} />

              {/* Rooms */}
              {mapData?.rooms.map((room) => {
                const hasWheelchair = mapData.wheelchairs.some(
                  w => w.current_room_id === room.id && w.status !== 'offline'
                );
                const isSelected = selectedRoom === room.id;

                return (
                  <div
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    style={{
                      position: 'absolute',
                      left: `${room.x}%`,
                      top: `${room.y}%`,
                      width: `${room.width}%`,
                      height: `${room.height}%`,
                      background: hasWheelchair
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(20, 184, 166, 0.3))'
                        : isSelected
                          ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3))'
                          : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))',
                      border: isSelected
                        ? '3px solid var(--primary-500)'
                        : hasWheelchair
                          ? '2px solid var(--success-500)'
                          : '2px solid rgba(99, 102, 241, 0.4)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? '0 0 20px rgba(99, 102, 241, 0.3)' : 'none'
                    }}
                  >
                    <span style={{
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                      textAlign: 'center',
                      padding: '0.25rem'
                    }}>
                      {room.name_en || room.name}
                    </span>
                    {room.room_type && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {room.room_type}
                      </span>
                    )}
                    {room.node_status === 'online' && (
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--success-500)',
                        animation: 'pulse 2s infinite'
                      }} />
                    )}
                  </div>
                );
              })}

              {/* Wheelchair markers */}
              {mapData?.wheelchairs.filter(w => w.status !== 'offline').map((wc) => {
                const room = mapData.rooms.find(r => r.id === wc.current_room_id);
                if (!room) return null;

                return (
                  <div
                    key={wc.id}
                    style={{
                      position: 'absolute',
                      left: `${room.x + room.width / 2}%`,
                      top: `${room.y + room.height / 2}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 10
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--success-500), var(--info-500))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
                      animation: 'pulse 2s infinite'
                    }}>
                      <Accessibility size={20} />
                    </div>
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: '0.25rem',
                      background: 'var(--bg-primary)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.7rem',
                      whiteSpace: 'nowrap'
                    }}>
                      {wc.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Legend */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Legend</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: 'var(--radius-sm)', background: 'rgba(16, 185, 129, 0.4)', border: '2px solid var(--success-500)' }} />
                  <span>Occupied Room</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.2)', border: '2px solid rgba(99, 102, 241, 0.4)' }} />
                  <span>Vacant Room</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success-500)' }} />
                  <span>Node Online</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--success-500), var(--info-500))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Accessibility size={10} style={{ color: 'white' }} />
                  </div>
                  <span>Wheelchair</span>
                </div>
              </div>
            </div>
          </div>

          {/* Room List */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Rooms ({mapData?.rooms.length || 0})</span>
            </div>
            <div className="card-body" style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {mapData?.rooms.map(room => {
                  const wheelchair = mapData.wheelchairs.find(
                    w => w.current_room_id === room.id && w.status !== 'offline'
                  );
                  const isSelected = selectedRoom === room.id;
                  return (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoom(room.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                        color: isSelected ? 'white' : 'inherit',
                        cursor: 'pointer',
                        transition: '0.2s'
                      }}
                    >
                      <div>
                        <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{room.name_en || room.name}</p>
                        <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>{room.node_id || 'No node'}</p>
                      </div>
                      {wheelchair && (
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: 'var(--success-500)'
                        }}>
                          {wheelchair.name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Wheelchairs */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Active Wheelchairs</span>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {mapData?.wheelchairs.filter(w => w.status !== 'offline').map(wc => (
                  <div key={wc.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)'
                  }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--success-500)'
                    }}>
                      <Accessibility size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 500, fontSize: '0.875rem' }}>{wc.name}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {wc.room_name || 'Unknown location'}
                      </p>
                    </div>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      background: wc.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                      color: wc.status === 'active' ? 'var(--success-500)' : 'var(--warning-500)'
                    }}>
                      {wc.status}
                    </span>
                  </div>
                ))}
                {(!mapData?.wheelchairs || mapData.wheelchairs.filter(w => w.status !== 'offline').length === 0) && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                    No active wheelchairs
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Room Modal */}
      {showRoomModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowRoomModal(false)}>
          <div className="card" style={{ maxWidth: '450px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="card-header">
              <span className="card-title"><Plus size={18} /> Add New Room</span>
            </div>
            <div className="card-body">
              <form onSubmit={handleAddRoom}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Room Name (Thai)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={roomForm.name}
                      onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                      required
                      placeholder="ห้อง..."
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Room Name (English)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={roomForm.name_en}
                      onChange={(e) => setRoomForm({ ...roomForm, name_en: e.target.value })}
                      placeholder="Room..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">X Position (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={roomForm.x}
                      onChange={(e) => setRoomForm({ ...roomForm, x: parseInt(e.target.value) || 0 })}
                      min={0}
                      max={100}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Y Position (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={roomForm.y}
                      onChange={(e) => setRoomForm({ ...roomForm, y: parseInt(e.target.value) || 0 })}
                      min={0}
                      max={100}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Width (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={roomForm.width}
                      onChange={(e) => setRoomForm({ ...roomForm, width: parseInt(e.target.value) || 0 })}
                      min={5}
                      max={100}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Height (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={roomForm.height}
                      onChange={(e) => setRoomForm({ ...roomForm, height: parseInt(e.target.value) || 0 })}
                      min={5}
                      max={100}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowRoomModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create Room
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
