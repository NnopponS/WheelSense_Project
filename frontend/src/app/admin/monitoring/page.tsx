'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Users, Cpu, AlertTriangle, Accessibility,
  Wifi, MapPin, Building2, Layers, Send, Bell,
  ChevronDown, Eye, EyeOff, Video, X, Home, Power
} from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
  getMapData, getHealth, getDevices, getAppliances,
  getAlerts, createAlert, sendEmergencyAlert, getRoomAppliances, controlAppliance
} from '@/lib/api';
import type { Wheelchair, Room, Building, Floor, Device, Appliance } from '@/types';

export default function MonitoringPage() {
  const {
    wheelchairs, setWheelchairs,
    rooms, setRooms,
    devices, setDevices,
    buildings, setBuildings,
    floors, setFloors,
    appliances, setAppliances,
    selectedBuilding, setSelectedBuilding,
    selectedFloor, setSelectedFloor,
    openDrawer
  } = useWheelSenseStore();

  const { t, language } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<{ mqtt: boolean; ha: boolean }>({ mqtt: false, ha: false });
  const [wcFilter, setWcFilter] = useState<'all' | 'online' | 'alert'>('all');
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [alertPatient, setAlertPatient] = useState('');
  const [alertType, setAlertType] = useState<'info' | 'warning' | 'emergency'>('info');
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomAppliances, setRoomAppliances] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [mapRes, healthRes, devicesRes, appsRes, alertsRes] = await Promise.all([
        getMapData(selectedBuilding || undefined, selectedFloor || undefined),
        getHealth(),
        getDevices(),
        getAppliances(),
        getAlerts({ resolved: false, limit: 10 }),
      ]);

      if (mapRes.data) {
        const mappedWheelchairs: Wheelchair[] = (mapRes.data.wheelchairs || []).map((w: any) => ({
          id: w.id, name: w.name, patientId: w.patient_id, patientName: w.patient_name,
          status: w.status as any, currentRoom: w.current_room_id,
          lastSeen: w.last_seen, battery: w.battery_level,
        }));
        const mappedRooms: Room[] = (mapRes.data.rooms || []).map((r: any) => ({
          id: r.id, name: r.name, nameEn: r.name_en, roomType: r.room_type,
          x: r.x, y: r.y, width: r.width, height: r.height,
          floorId: r.floor_id, buildingId: 'building-1',
        }));
        const mappedBuildings: Building[] = (mapRes.data.buildings || []).map((b: any) => ({
          id: b.id, name: b.name, nameEn: b.name_en
        }));
        const mappedFloors: Floor[] = (mapRes.data.floors || []).map((f: any) => ({
          id: f.id, name: f.name, buildingId: f.building_id
        }));
        setWheelchairs(mappedWheelchairs);
        setRooms(mappedRooms);
        setBuildings(mappedBuildings);
        setFloors(mappedFloors);
      }
      if (healthRes.data) {
        setHealthStatus({ mqtt: healthRes.data.mqtt_connected, ha: healthRes.data.ha_connected });
      }
      if (devicesRes.data && Array.isArray(devicesRes.data.devices)) {
        const mappedDevices: Device[] = devicesRes.data.devices.map((d: any) => ({
          id: d.id, name: d.name, type: d.type, status: d.status,
          rssi: d.rssi, room: d.room_id || d.room_name, lastSeen: d.last_seen
        }));
        setDevices(mappedDevices);
      }
      if (appsRes.data && Array.isArray(appsRes.data.appliances)) {
        const appsByRoom: Record<string, Appliance[]> = {};
        appsRes.data.appliances.forEach((a: any) => {
          const roomId = a.room_id;
          if (!appsByRoom[roomId]) appsByRoom[roomId] = [];
          appsByRoom[roomId].push({
            id: a.id, name: a.name, type: a.type as any,
            room: a.room_id, state: a.state === 1, value: a.value
          });
        });
        setAppliances(appsByRoom);
      }
      if (alertsRes.data) setActiveAlerts(alertsRes.data.alerts || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  }, [selectedBuilding, selectedFloor]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRoomClick = async (room: Room) => {
    setSelectedRoom(room);
    const res = await getRoomAppliances(room.id);
    if (res.data) setRoomAppliances(res.data.appliances || []);
  };

  const handleSendAlert = async () => {
    if (!alertMsg.trim()) return;
    try {
      if (alertType === 'emergency') {
        await sendEmergencyAlert({ message: alertMsg, patient_id: alertPatient || undefined });
      } else {
        await createAlert({ alert_type: alertType, message: alertMsg, patient_id: alertPatient || undefined });
      }
      setShowAlertModal(false);
      setAlertMsg('');
      setAlertPatient('');
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleToggleAppliance = async (app: any) => {
    await controlAppliance(app.id, app.state === 0 ? true : false, app.value);
    if (selectedRoom) {
      const res = await getRoomAppliances(selectedRoom.id);
      if (res.data) setRoomAppliances(res.data.appliances || []);
    }
  };

  // Filtered data
  const filteredBuilding = selectedBuilding;
  const filteredFloors = floors.filter(f => !filteredBuilding || f.buildingId === filteredBuilding);
  const filteredRooms = rooms;
  const onlineWheelchairs = wheelchairs.filter(w => w.status !== 'offline');
  const filteredWheelchairs = wcFilter === 'all' ? wheelchairs
    : wcFilter === 'online' ? wheelchairs.filter(w => w.status !== 'offline')
      : wheelchairs.filter(w => w.status === 'warning' || w.status === 'alert');
  const nodeDevices = devices.filter(d => d.type === 'node');
  const onlineNodes = nodeDevices.filter(d => d.status === 'online');

  if (loading) {
    return (
      <div className="empty-state" style={{ height: '80vh' }}>
        <div className="loading-spinner" />
        <h3>{t('common.loading')}</h3>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      {/* Building/Floor Selector + Alert Button */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Building2 size={18} />
          <select
            className="form-select"
            value={selectedBuilding || ''}
            onChange={e => { setSelectedBuilding(e.target.value || null); setSelectedFloor(null); }}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            <option value="">{t('common.all')} {t('common.building')}</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.nameEn || b.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Layers size={18} />
          <select
            className="form-select"
            value={selectedFloor || ''}
            onChange={e => setSelectedFloor(e.target.value || null)}
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            <option value="">{t('common.all')} {t('common.floor')}</option>
            {filteredFloors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span className={`list-item-badge ${healthStatus.mqtt ? 'online' : 'offline'}`}>MQTT {healthStatus.mqtt ? 'ON' : 'OFF'}</span>
          <span className={`list-item-badge ${healthStatus.ha ? 'info' : 'offline'}`}>HA {healthStatus.ha ? 'ON' : 'OFF'}</span>
        </div>
        <button
          onClick={() => setShowAlertModal(true)}
          style={{ background: 'linear-gradient(135deg, var(--danger-500), var(--danger-600))', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}
        >
          <Bell size={16} /> {t('admin.monitoring.sendAlert')}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon primary"><Accessibility size={24} /></div>
          <div className="stat-content">
            <h3>{onlineWheelchairs.length}/{wheelchairs.length}</h3>
            <p>{t('admin.monitoring.activeWheelchairs')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><Users size={24} /></div>
          <div className="stat-content">
            <h3>{wheelchairs.filter(w => w.patientName).length}</h3>
            <p>{t('admin.monitoring.totalPatients')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info"><Cpu size={24} /></div>
          <div className="stat-content">
            <h3>{onlineNodes.length}/{nodeDevices.length}</h3>
            <p>{t('admin.monitoring.onlineNodes')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><AlertTriangle size={24} /></div>
          <div className="stat-content">
            <h3>{activeAlerts.length}</h3>
            <p>{t('admin.monitoring.activeAlerts')}</p>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="content-grid">
        {/* Map Container */}
        <div className="map-container">
          <div className="card-header">
            <span className="card-title"><Activity size={18} /> {t('admin.monitoring.floorMap')}</span>
          </div>
          <div className="map-canvas">
            {filteredRooms.map(room => {
              const roomWheelchairs = wheelchairs.filter(w => w.currentRoom === room.id && w.status !== 'offline');
              const hasWheelchair = roomWheelchairs.length > 0;
              return (
                <div
                  key={room.id}
                  onClick={() => handleRoomClick(room)}
                  className={`room ${hasWheelchair ? 'detected' : ''}`}
                  style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%` }}
                >
                  <span className="room-label">{language === 'th' ? room.name : (room.nameEn || room.name)}</span>
                  {hasWheelchair && (
                    <div className="room-wheelchair-icon"><Accessibility size={20} /></div>
                  )}
                </div>
              );
            })}
            {wheelchairs.map(wc => {
              if (wc.status === 'offline' || !wc.currentRoom) return null;
              const room = rooms.find(r => r.id === wc.currentRoom);
              if (!room) return null;
              return (
                <div
                  key={wc.id}
                  onClick={(e) => { e.stopPropagation(); openDrawer({ type: 'wheelchair', data: wc }); }}
                  className="wheelchair-marker"
                  style={{ left: `${room.x + room.width / 2}%`, top: `${room.y + room.height / 2}%` }}
                  title={`${wc.name} (${wc.patientName || 'No User'})`}
                >
                  <Accessibility size={18} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Wheelchair List with filter */}
          <div className="list-container">
            <div className="list-header">
              <span className="list-title"><Accessibility size={18} /> {t('admin.devices.wheelchairs')}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {(['all', 'online', 'alert'] as const).map(f => (
                  <button key={f} onClick={() => setWcFilter(f)}
                    style={{
                      padding: '0.25rem 0.5rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
                      background: wcFilter === f ? 'var(--primary-500)' : 'var(--bg-tertiary)', color: wcFilter === f ? 'white' : 'var(--text-secondary)'
                    }}
                  >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                ))}
              </div>
            </div>
            <div className="list-body">
              {filteredWheelchairs.length === 0 ? (
                <div className="empty-state"><Accessibility size={32} /><h3>No wheelchairs</h3></div>
              ) : (
                filteredWheelchairs.map(wc => (
                  <div key={wc.id} onClick={() => openDrawer({ type: 'wheelchair', data: wc })} className="list-item">
                    <div className="list-item-avatar">{wc.id.split('-').pop()?.slice(0, 2)}</div>
                    <div className="list-item-content">
                      <div className="list-item-title">{wc.patientName || 'Available'}</div>
                      <div className="list-item-subtitle">
                        <MapPin size={10} style={{ display: 'inline', marginRight: '4px' }} />
                        {wc.currentRoom ? (rooms.find(r => r.id === wc.currentRoom)?.nameEn || wc.currentRoom) : 'Unknown'}
                      </div>
                    </div>
                    <span className={`list-item-badge ${wc.status !== 'offline' ? 'online' : 'offline'}`}>{wc.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Node Status */}
          <div className="list-container">
            <div className="list-header">
              <span className="list-title"><Cpu size={18} /> {t('admin.monitoring.nodeStatus')}</span>
            </div>
            <div className="list-body">
              {nodeDevices.map(node => (
                <div key={node.id} className="list-item">
                  <div className="list-item-avatar" style={{
                    background: node.status === 'online' ? 'linear-gradient(135deg, var(--info-500), var(--info-600))' : 'var(--text-muted)'
                  }}><Wifi size={18} /></div>
                  <div className="list-item-content">
                    <div className="list-item-title">{node.name}</div>
                    <div className="list-item-subtitle">RSSI: {node.rssi || '-'} dBm</div>
                  </div>
                  <span className={`list-item-badge ${node.status === 'online' ? 'online' : 'offline'}`}>
                    {node.status === 'online' ? 'ON' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Alert Modal */}
      {selectedRoom && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(360px, 92vw)',
          height: '100vh',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-color)',
          zIndex: 140,
          overflowY: 'auto'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Home size={18} /> Room Details</h3>
            <button className="btn btn-icon" onClick={() => setSelectedRoom(null)}><X size={16} /></button>
          </div>

          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div className="card" style={{ margin: 0 }}>
              <div className="card-body" style={{ textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, margin: '0 auto 0.6rem', borderRadius: 16,
                  background: 'linear-gradient(135deg, var(--success-500), var(--info-500))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem'
                }}>🏠</div>
                <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{selectedRoom.nameEn || selectedRoom.name}</div>
                <span className={`list-item-badge ${wheelchairs.some(w => w.currentRoom === selectedRoom.id && w.status !== 'offline') ? 'online' : 'offline'}`}>
                  {wheelchairs.some(w => w.currentRoom === selectedRoom.id && w.status !== 'offline') ? 'Occupied' : 'Vacant'}
                </span>
              </div>
            </div>

            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <span className="card-title"><Video size={16} /> Live Camera</span>
              </div>
              <div className="card-body" style={{ paddingTop: '0.5rem' }}>
                <span className="list-item-badge" style={{ background: 'var(--danger-500)', color: 'white' }}>LIVE</span>
                <div style={{
                  marginTop: '0.7rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  minHeight: 140,
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--text-muted)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <Video size={30} style={{ margin: '0 auto 0.45rem', opacity: 0.65 }} />
                    <div style={{ fontSize: '0.85rem' }}>Connected Successfully</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ margin: 0 }}>
              <div className="card-header">
                <span className="card-title"><Power size={16} /> Appliance Control</span>
              </div>
              <div className="card-body" style={{ padding: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
                  {roomAppliances.map((app: any) => (
                    <button
                      key={app.id}
                      onClick={() => handleToggleAppliance(app)}
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        padding: '0.7rem',
                        textAlign: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{app.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{app.state ? 'On' : 'Off'}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAlertModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '1.5rem', width: '90%', maxWidth: '480px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Bell size={20} /> Send Alert</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <select value={alertType} onChange={e => setAlertType(e.target.value as any)}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
                <option value="info">ℹ️ Info</option>
                <option value="warning">⚠️ Warning</option>
                <option value="emergency">🚨 Emergency</option>
              </select>
              <input
                placeholder="Patient ID (leave empty for broadcast)"
                value={alertPatient} onChange={e => setAlertPatient(e.target.value)}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}
              />
              <textarea
                placeholder="Alert message..."
                value={alertMsg} onChange={e => setAlertMsg(e.target.value)}
                rows={3}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem', resize: 'none' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAlertModal(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSendAlert}
                  style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: alertType === 'emergency' ? 'var(--danger-500)' : 'var(--primary-500)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                  <Send size={14} style={{ display: 'inline', marginRight: '4px' }} /> Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
