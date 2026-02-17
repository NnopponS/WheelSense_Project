'use client';

import { useEffect, useState } from 'react';
import {
  Cpu, Wifi, Accessibility, Search, Edit3, Save, X,
  Signal, Clock, MapPin, Camera
} from 'lucide-react';
import {
  getDevices,
  getWheelchairs,
  updateDevice,
  updateWheelchair,
  getCameras,
  getDataQuality,
  setCameraMode,
  getRooms,
  pushDeviceConfig,
  sendDeviceCommand,
  deleteDeviceFromSystem,
  type DataQualityResponse,
} from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function DevicesPage() {
  const { t, language } = useTranslation();
  const [tab, setTab] = useState<'nodes' | 'wheelchairs'>('nodes');
  const [devices, setDevices] = useState<any[]>([]);
  const [wheelchairs, setWheelchairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [cameras, setCameras] = useState<any[]>([]);
  const [modePending, setModePending] = useState<string | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [cameraDrafts, setCameraDrafts] = useState<Record<string, { node_id: string; room_id: string; room_name: string }>>({});
  const [cameraConfigPending, setCameraConfigPending] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState<string | null>(null);
  const [boardCommandPending, setBoardCommandPending] = useState<string | null>(null);
  const [verifyPending, setVerifyPending] = useState<string | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityResponse | null>(null);

  const fetchData = async () => {
    const [dRes, wRes, cRes, rRes, qRes] = await Promise.all([
      getDevices(),
      getWheelchairs(),
      getCameras(),
      getRooms(),
      getDataQuality(),
    ]);
    if (dRes.data) setDevices(dRes.data.devices || []);
    if (wRes.data) setWheelchairs(wRes.data.wheelchairs || []);
    if (cRes.data) setCameras(cRes.data.cameras || []);
    if (rRes.data) setRooms(rRes.data.rooms || []);
    if (qRes.data) setDataQuality(qRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    setCameraDrafts(prev => {
      const next = { ...prev };
      for (const cam of cameras) {
        if (!next[cam.device_id]) {
          next[cam.device_id] = {
            node_id: cam.node_id || cam.device_id,
            room_id: cam.room_id || '',
            room_name: cam.room_name || '',
          };
        }
      }
      return next;
    });
  }, [cameras]);

  const nodes = devices.filter(d => d.type === 'node');
  const filteredNodes = nodes.filter(n =>
    (n.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.id || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredWheelchairs = wheelchairs.filter(w =>
    (w.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (w.id || '').toLowerCase().includes(search.toLowerCase())
  );

  const getStatusView = (item: any, currentTab: 'nodes' | 'wheelchairs') => {
    const rawStatus = String(item?.status || '').toLowerCase();
    if (currentTab === 'wheelchairs') {
      if (rawStatus === 'offline') {
        return {
          isOnline: false,
          badgeClass: 'offline',
          badgeText: 'offline',
        };
      }
      if (rawStatus === 'idle') {
        return {
          isOnline: true,
          badgeClass: 'warning',
          badgeText: 'idle',
        };
      }
      if (rawStatus === 'active') {
        return {
          isOnline: true,
          badgeClass: 'online',
          badgeText: 'active',
        };
      }
      return {
        isOnline: true,
        badgeClass: 'online',
        badgeText: rawStatus || 'online',
      };
    }

    const online = rawStatus === 'online';
    return {
      isOnline: online,
      badgeClass: online ? 'online' : 'offline',
      badgeText: online ? t('common.online') : t('common.offline'),
    };
  };

  const startEdit = (item: any) => {
    setEditing(item.id);
    setEditForm({ name: item.name || '', room_id: item.room_id || item.room_name || '', camera_angle: item.camera_angle || '' });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (tab === 'nodes') {
      await updateDevice(editing, editForm);
    } else {
      await updateWheelchair(editing, editForm);
    }
    setEditing(null);
    fetchData();
  };

  const handleCameraMode = async (deviceId: string, mode: 'config' | 'reboot' | 'sync_config') => {
    const labels: Record<string, string> = {
      config: 'Config Mode',
      reboot: 'Reboot',
      sync_config: 'Sync Config',
    };
    if (!window.confirm(`Send "${deviceId}" -> ${labels[mode]}?`)) return;
    setModePending(deviceId);
    const res = await setCameraMode(deviceId, mode);
    setModePending(null);
    if (res.error) {
      window.alert(`Failed to send command: ${res.error}`);
      return;
    }
    fetchData();
  };

  const handleCameraDraftChange = (deviceId: string, key: 'node_id' | 'room_id' | 'room_name', value: string) => {
    setCameraDrafts(prev => ({
      ...prev,
      [deviceId]: {
        node_id: prev[deviceId]?.node_id || deviceId,
        room_id: prev[deviceId]?.room_id || '',
        room_name: prev[deviceId]?.room_name || '',
        [key]: value,
      },
    }));
  };

  const handlePushCameraConfig = async (deviceId: string) => {
    const draft = cameraDrafts[deviceId] || { node_id: deviceId, room_id: '', room_name: '' };
    setCameraConfigPending(deviceId);
    const res = await pushDeviceConfig(deviceId, {
      node_id: draft.node_id || deviceId,
      room_id: draft.room_id || null,
      room_name: draft.room_name || null,
      sync_only: false,
    });
    setCameraConfigPending(null);

    if (res.error) {
      window.alert(`Failed to push config: ${res.error}`);
      return;
    }
    fetchData();
  };

  const handleDeleteBoard = async (deviceId: string) => {
    if (!window.confirm(`Delete "${deviceId}" from system records?`)) return;
    setDeletePending(deviceId);
    const res = await deleteDeviceFromSystem(deviceId);
    setDeletePending(null);
    if (res.error) {
      window.alert(`Delete failed: ${res.error}`);
      return;
    }
    fetchData();
  };

  const handleBoardCommand = async (deviceId: string, mode: 'sync_config' | 'reboot' | 'config') => {
    const labels: Record<string, string> = {
      sync_config: 'Sync Config',
      reboot: 'Reboot',
      config: 'Config Mode',
    };
    if (!window.confirm(`Send "${deviceId}" -> ${labels[mode]}?`)) return;
    setBoardCommandPending(deviceId);
    const res = await sendDeviceCommand(deviceId, mode);
    setBoardCommandPending(null);
    if (res.error) {
      window.alert(`Command failed: ${res.error}`);
      return;
    }
    fetchData();
  };

  const cameraLagSeconds = (cam: any): number => {
    if (typeof cam.heartbeat_lag_seconds === 'number') return cam.heartbeat_lag_seconds;
    if (!cam.last_seen) return Number.POSITIVE_INFINITY;
    const ms = Date.now() - new Date(cam.last_seen).getTime();
    return Math.max(0, Math.floor(ms / 1000));
  };

  const heartbeatState = (cam: any): 'ok' | 'stale' => {
    return cameraLagSeconds(cam) <= 60 ? 'ok' : 'stale';
  };

  const handleVerifyHeartbeat = async (deviceId: string) => {
    setVerifyPending(deviceId);
    const res = await getCameras();
    setVerifyPending(null);
    if (res.error || !res.data) {
      window.alert(`Heartbeat verify failed: ${res.error || 'unknown error'}`);
      return;
    }
    const latest = res.data.cameras || [];
    setCameras(latest);
    const camera = latest.find((c: any) => c.device_id === deviceId);
    if (!camera) {
      window.alert(`Camera ${deviceId} not found`);
      return;
    }
    const lag = cameraLagSeconds(camera);
    if (lag <= 60) {
      window.alert(`Heartbeat OK (${lag}s)`);
    } else {
      window.alert(`Heartbeat stale (${lag}s)`);
    }
  };

  if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Cpu size={24} /> {t('admin.devices.title')}</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-secondary)', borderRadius: '10px', padding: '0.25rem', marginBottom: '1rem', border: '1px solid var(--bg-tertiary)' }}>
        <button onClick={() => { setTab('nodes'); setSearch(''); setEditing(null); }}
          style={{
            flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600,
            background: tab === 'nodes' ? 'var(--primary-500)' : 'transparent',
            color: tab === 'nodes' ? 'white' : 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}>
          <Wifi size={16} /> {t('admin.devices.nodes')} ({nodes.length})
        </button>
        <button onClick={() => { setTab('wheelchairs'); setSearch(''); setEditing(null); }}
          style={{
            flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600,
            background: tab === 'wheelchairs' ? 'var(--primary-500)' : 'transparent',
            color: tab === 'wheelchairs' ? 'white' : 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          }}>
          <Accessibility size={16} /> {t('admin.devices.wheelchairs')} ({wheelchairs.length})
        </button>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '1rem', border: '1px solid var(--bg-tertiary)' }}>
        <Search size={16} />
        <input placeholder={t('device.searchDevices')} value={search} onChange={e => setSearch(e.target.value)}
          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%' }} />
      </div>

      {tab === 'nodes' && dataQuality && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: '8px', padding: '0.65rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unknown Room Ratio</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{(dataQuality.unknown_room_ratio * 100).toFixed(1)}%</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: '8px', padding: '0.65rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Camera Mapping</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                {dataQuality.mapping.cameras.unmapped === 0 ? 'Complete' : 'Incomplete'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {dataQuality.mapping.cameras.mapped}/{dataQuality.mapping.cameras.total} mapped
              </div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: '8px', padding: '0.65rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unmapped Nodes</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{dataQuality.mapping.nodes.unmapped}</div>
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: '8px', padding: '0.65rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Stale Devices</div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{dataQuality.stale_device_count}</div>
            </div>
          </div>
        </div>
      )}

      {/* Device List */}
      <div className="list-container">
        <div className="list-body">
          {(tab === 'nodes' ? filteredNodes : filteredWheelchairs).map((item: any) => {
            const statusView = getStatusView(item, tab);
            return (
              <div key={item.id} className="list-item" style={{ padding: '0.75rem' }}>
              <div
                className="list-item-avatar"
                style={{
                  background: statusView.isOnline
                    ? 'linear-gradient(135deg, var(--success-500), var(--success-600))'
                    : 'var(--text-muted)'
                }}
              >
                {tab === 'nodes' ? <Wifi size={18} /> : <Accessibility size={18} />}
              </div>

              {editing === item.id ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input placeholder={t('device.deviceName')} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                  <input placeholder={t('device.roomId')} value={editForm.room_id} onChange={e => setEditForm({ ...editForm, room_id: e.target.value })}
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                  {tab === 'nodes' && (
                    <input placeholder={t('device.cameraAngle')} value={editForm.camera_angle} onChange={e => setEditForm({ ...editForm, camera_angle: e.target.value })}
                      style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }} />
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={saveEdit} style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: 'white', cursor: 'pointer' }}>
                      <Save size={14} /> {t('common.save')}
                    </button>
                    <button onClick={() => setEditing(null)} style={{ background: 'var(--border-color)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.75rem', color: 'white', cursor: 'pointer' }}>
                      <X size={14} /> {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="list-item-content">
                    <div className="list-item-title">{item.name || item.id}</div>
                    <div className="list-item-subtitle" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <span><Signal size={10} style={{ display: 'inline', marginRight: '2px' }} /> RSSI: {item.rssi || '-'} dBm</span>
                      <span><MapPin size={10} style={{ display: 'inline', marginRight: '2px' }} /> {item.room_name || item.room_id || t('device.unassigned')}</span>
                      <span><Clock size={10} style={{ display: 'inline', marginRight: '2px' }} /> {item.last_seen ? new Date(item.last_seen).toLocaleString() : t('device.never')}</span>
                      {tab === 'wheelchairs' && item.mac_address && <span>Device: {item.mac_address}</span>}
                    </div>
                    {tab === 'wheelchairs' && item.features_limited && (
                      <div className="list-item-subtitle" style={{ marginTop: '0.25rem', color: 'var(--warning-500)' }}>
                        Different WiFi: Some LAN features are unavailable
                        {item.warning_message ? ` (${item.warning_message})` : ''}
                      </div>
                    )}
                    {tab === 'wheelchairs' && item.mac_address && (
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleBoardCommand(item.mac_address, 'sync_config')}
                          disabled={boardCommandPending === item.mac_address || deletePending === item.mac_address}
                          style={{ background: 'var(--info-600)', border: 'none', borderRadius: '6px', padding: '0.35rem 0.6rem', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          Sync
                        </button>
                        <button
                          onClick={() => handleBoardCommand(item.mac_address, 'reboot')}
                          disabled={boardCommandPending === item.mac_address || deletePending === item.mac_address}
                          style={{ background: 'var(--warning-600)', border: 'none', borderRadius: '6px', padding: '0.35rem 0.6rem', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          Reboot
                        </button>
                        <button
                          onClick={() => handleDeleteBoard(item.mac_address)}
                          disabled={boardCommandPending === item.mac_address || deletePending === item.mac_address}
                          style={{ background: 'var(--danger-600)', border: 'none', borderRadius: '6px', padding: '0.35rem 0.6rem', color: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          Delete Board
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={`list-item-badge ${statusView.badgeClass}`}>
                    {statusView.badgeText}
                  </span>
                  <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', color: 'var(--primary-400)', cursor: 'pointer', marginLeft: '0.5rem' }}>
                    <Edit3 size={16} />
                  </button>
                </>
              )}
              </div>
            );
          })}
          {(tab === 'nodes' ? filteredNodes : filteredWheelchairs).length === 0 && (
            <div className="empty-state">
              {tab === 'nodes' ? <Wifi size={32} /> : <Accessibility size={32} />}
              <h3>{t('device.noDevicesFound')}</h3>
            </div>
          )}
        </div>
      </div>

      {tab === 'nodes' && (
        <div className="list-container" style={{ marginTop: '1rem' }}>
          <div className="list-header">
            <span className="list-title"><Camera size={18} /> Camera Nodes ({cameras.length})</span>
          </div>
          <div className="list-body">
            {cameras.length === 0 && (
              <div className="empty-state">
                <Camera size={32} />
                <h3>No cameras discovered</h3>
              </div>
            )}
            {cameras.map((cam) => {
              const isConfig = cam.config_mode || cam.status === 'config';
              const isOnline = cam.status === 'online';
              const statusLabel = isConfig ? 'config' : cam.status;
              const isPending = modePending === cam.device_id || cameraConfigPending === cam.device_id || deletePending === cam.device_id || verifyPending === cam.device_id;
              const draft = cameraDrafts[cam.device_id] || { node_id: cam.node_id || cam.device_id, room_id: cam.room_id || '', room_name: cam.room_name || '' };
              const mappingState = cam.mapping_state || (cam.room_id ? 'mapped' : 'unmapped');
              const hbState = heartbeatState(cam);
              const hbLag = cameraLagSeconds(cam);

              return (
                <div key={cam.device_id} className="list-item" style={{ padding: '0.75rem' }}>
                  <div className="list-item-avatar" style={{
                    background: isConfig
                      ? 'linear-gradient(135deg, var(--warning-500), var(--warning-600))'
                      : isOnline
                        ? 'linear-gradient(135deg, var(--success-500), var(--success-600))'
                        : 'var(--text-muted)',
                  }}>
                    <Camera size={18} />
                  </div>

                  <div className="list-item-content">
                    <div className="list-item-title">{cam.device_id}</div>
                    <div className="list-item-subtitle" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <span><MapPin size={10} style={{ display: 'inline', marginRight: '2px' }} /> {cam.room_name || cam.room_id || t('device.unassigned')}</span>
                      <span>Node: {cam.node_id || '-'}</span>
                      <span>Mapping: {mappingState}</span>
                      <span>Heartbeat: {hbState === 'ok' ? `OK (${hbLag}s)` : `stale (${hbLag}s)`}</span>
                      <span>WS: {cam.ws_connected ? 'ON' : 'OFF'}</span>
                      <span>Frames: {cam.frames_sent ?? 0}/{cam.frames_dropped ?? 0}</span>
                      <span><Clock size={10} style={{ display: 'inline', marginRight: '2px' }} /> {cam.last_seen ? new Date(cam.last_seen).toLocaleString() : t('device.never')}</span>
                    </div>
                    {cam.room_binding_last_updated && (
                      <div className="list-item-subtitle" style={{ marginTop: '0.2rem' }}>
                        Room binding updated: {new Date(cam.room_binding_last_updated).toLocaleString()}
                      </div>
                    )}
                    {cam.features_limited && (
                      <div className="list-item-subtitle" style={{ marginTop: '0.25rem', color: 'var(--warning-500)' }}>
                        Different WiFi: Some LAN features are unavailable
                        {cam.warning_message ? ` (${cam.warning_message})` : ''}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.55rem' }}>
                      <input
                        value={draft.node_id}
                        onChange={e => handleCameraDraftChange(cam.device_id, 'node_id', e.target.value)}
                        placeholder="Node ID"
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }}
                      />
                      <select
                        value={draft.room_id}
                        onChange={e => {
                          const room = rooms.find((r: any) => r.id === e.target.value);
                          handleCameraDraftChange(cam.device_id, 'room_id', e.target.value);
                          handleCameraDraftChange(cam.device_id, 'room_name', room?.name || '');
                        }}
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.4rem' }}
                      >
                        <option value="">Unassigned</option>
                        {rooms.map((room: any) => (
                          <option key={room.id} value={room.id}>{room.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handlePushCameraConfig(cam.device_id)}
                        disabled={isPending}
                        style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '6px', padding: '0.38rem 0.62rem', color: 'white', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        {cameraConfigPending === cam.device_id ? 'Saving...' : 'Save Config'}
                      </button>
                      <button
                        onClick={() => handleCameraMode(cam.device_id, 'sync_config')}
                        disabled={isPending}
                        style={{ background: 'var(--info-600)', border: 'none', borderRadius: '6px', padding: '0.38rem 0.62rem', color: 'white', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        Sync
                      </button>
                      <button
                        onClick={() => handleVerifyHeartbeat(cam.device_id)}
                        disabled={isPending}
                        style={{ background: 'var(--success-700)', border: 'none', borderRadius: '6px', padding: '0.38rem 0.62rem', color: 'white', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        {verifyPending === cam.device_id ? 'Verifying...' : 'Verify HB'}
                      </button>
                      <button
                        onClick={() => handleCameraMode(cam.device_id, 'reboot')}
                        disabled={isPending}
                        style={{ background: 'var(--warning-600)', border: 'none', borderRadius: '6px', padding: '0.38rem 0.62rem', color: 'white', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        Reboot
                      </button>
                      <button
                        onClick={() => handleCameraMode(cam.device_id, 'config')}
                        disabled={isPending || isConfig}
                        style={{ background: isConfig ? 'var(--text-muted)' : 'var(--warning-700)', border: 'none', borderRadius: '6px', padding: '0.38rem 0.62rem', color: 'white', cursor: (isPending || isConfig) ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        {isConfig ? 'In Config' : 'Config Mode'}
                      </button>
                      <button
                        onClick={() => handleDeleteBoard(cam.device_id)}
                        disabled={isPending}
                        style={{ background: 'var(--danger-600)', border: 'none', borderRadius: '6px', padding: '0.38rem 0.62rem', color: 'white', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <span className={`list-item-badge ${mappingState === 'mapped' ? 'online' : mappingState === 'stale' ? 'warning' : 'offline'}`}>
                    {mappingState}
                  </span>
                  <span className={`list-item-badge ${isOnline ? 'online' : isConfig ? 'warning' : 'offline'}`} style={{ marginLeft: '0.35rem' }}>
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
