'use client';

import { useEffect, useState } from 'react';
import {
  Cpu, Wifi, Accessibility, Search, Edit3, Save, X,
  Signal, Clock, MapPin, Camera
} from 'lucide-react';
import { getDevices, getWheelchairs, updateDevice, updateWheelchair } from '@/lib/api';
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

  const fetchData = async () => {
    const [dRes, wRes] = await Promise.all([getDevices(), getWheelchairs()]);
    if (dRes.data) setDevices(dRes.data.devices || []);
    if (wRes.data) setWheelchairs(wRes.data.wheelchairs || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const nodes = devices.filter(d => d.type === 'node');
  const filteredNodes = nodes.filter(n =>
    (n.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.id || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredWheelchairs = wheelchairs.filter(w =>
    (w.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (w.id || '').toLowerCase().includes(search.toLowerCase())
  );

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

      {/* Device List */}
      <div className="list-container">
        <div className="list-body">
          {(tab === 'nodes' ? filteredNodes : filteredWheelchairs).map((item: any) => (
            <div key={item.id} className="list-item" style={{ padding: '0.75rem' }}>
              <div className="list-item-avatar" style={{
                background: item.status === 'online'
                  ? 'linear-gradient(135deg, var(--success-500), var(--success-600))'
                  : 'var(--text-muted)'
              }}>
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
                    </div>
                  </div>
                  <span className={`list-item-badge ${item.status === 'online' ? 'online' : 'offline'}`}>
                    {item.status === 'online' ? t('common.online') : t('common.offline')}
                  </span>
                  <button onClick={() => startEdit(item)} style={{ background: 'none', border: 'none', color: 'var(--primary-400)', cursor: 'pointer', marginLeft: '0.5rem' }}>
                    <Edit3 size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
          {(tab === 'nodes' ? filteredNodes : filteredWheelchairs).length === 0 && (
            <div className="empty-state">
              {tab === 'nodes' ? <Wifi size={32} /> : <Accessibility size={32} />}
              <h3>{t('device.noDevicesFound')}</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
