'use client';

import { useEffect, useState } from 'react';
import {
  MapPin, Phone, CheckCircle, Clock, Lightbulb, Fan, Thermometer, Tv,
  Wind, Power, Bell, ChevronRight, Accessibility
} from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
  getPatients, getWheelchairs, getRooms, getMapData,
  getRoomAppliances, controlAppliance, getRoutines, sendEmergencyAlert
} from '@/lib/api';
import type { Room, Appliance } from '@/lib/api';

const APPLIANCE_ICONS: Record<string, { emoji: string; label: string }> = {
  light: { emoji: '💡', label: 'Light' },
  AC: { emoji: '❄️', label: 'AC' },
  fan: { emoji: '🌀', label: 'Fan' },
  tv: { emoji: '📺', label: 'TV' },
  heater: { emoji: '🔥', label: 'Heater' },
  alarm: { emoji: '🚨', label: 'Alarm' },
  curtain: { emoji: '🪟', label: 'Curtain' },
};

interface RoutineItem {
  id: string;
  title: string;
  time: string;
  room_name?: string;
  room_name_en?: string;
  done?: boolean;
}

export default function UserHomePage() {
  const { currentUser, rooms, setRooms, wheelchairs, setWheelchairs, patients, setPatients } = useWheelSenseStore();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [routines, setRoutinesState] = useState<RoutineItem[]>([]);
  const [completedRoutines, setCompletedRoutines] = useState<Set<string>>(new Set());

  // Get first patient as current user context
  const patient = patients[0] || currentUser;
  const wheelchair = (wheelchairs as any[]).find((w: any) => (w.patient_id || w.patientId) === patient?.id) || wheelchairs[0] as any;

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [pRes, wRes, mRes, rRes] = await Promise.all([
        getPatients(), getWheelchairs(), getMapData(), getRoutines()
      ]);

      if (pRes.data) setPatients(pRes.data.patients as any || []);
      if (wRes.data) setWheelchairs(wRes.data.wheelchairs as any || []);
      if (mRes.data) setRooms(mRes.data.rooms as any || []);

      // Get current room from wheelchair
      const wc = wRes.data?.wheelchairs?.[0];
      if (wc?.current_room_id && mRes.data?.rooms) {
        const room = mRes.data.rooms.find((r: Room) => r.id === wc.current_room_id);
        if (room) {
          setCurrentRoom(room);
          // Load appliances for current room
          const aRes = await getRoomAppliances(room.id);
          if (aRes.data) setAppliances(aRes.data.appliances || []);
        }
      }

      if (rRes.data) setRoutinesState(rRes.data.routines?.map((r: any) => ({
        id: r.id, title: r.title, time: r.time, room_name: r.room_name, room_name_en: r.room_name_en,
      })) || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleToggleAppliance = async (app: Appliance) => {
    try {
      await controlAppliance(app.id, !app.state, app.value);
      setAppliances(prev => prev.map(a => a.id === app.id ? { ...a, state: a.state ? 0 : 1 } : a));
    } catch (e) { console.error(e); }
  };

  const handleSOS = async () => {
    if (!confirm(t('Send emergency alert? Staff will be notified immediately.'))) return;
    try {
      await sendEmergencyAlert({ message: 'Emergency alert from user', patient_id: patient?.id });
    } catch (e) { console.error(e); }
  };

  const handleMarkDone = (id: string) => {
    setCompletedRoutines(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  if (loading) return <div className="empty-state" style={{ height: '60vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Profile Header Card */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700, #4338ca))',
        color: 'white', border: 'none',
      }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
            }}>
              {patient?.name?.[0]?.toUpperCase() || '👤'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                {t('Hello')}, {patient?.name || (patient as any)?.name_en || t('User')} 👋
              </h2>
              <div style={{ opacity: 0.85, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <MapPin size={14} />
                <span>{(currentRoom as any)?.name_en || (currentRoom as any)?.nameEn || currentRoom?.name || t('Unknown Location')}</span>
              </div>
            </div>
          </div>
          <button onClick={handleSOS} style={{
            background: '#ef4444', border: 'none', color: 'white',
            padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)',
            fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            boxShadow: '0 4px 12px rgba(239,68,68,0.4)',
          }}>
            <Phone size={18} /> SOS
          </button>
        </div>
      </div>

      {/* Map Section */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><MapPin size={18} /> {t('Current Location')}</span>
        </div>
        <div style={{
          position: 'relative', minHeight: '300px',
          background: 'var(--bg-secondary)',
          borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
          overflow: 'hidden',
        }}>
          {/* Grid */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '10% 10%', pointerEvents: 'none',
          }} />

          {rooms.map(room => {
            const isCurrentRoom = currentRoom?.id === room.id;
            return (
              <div key={room.id} style={{
                position: 'absolute',
                left: `${room.x}%`, top: `${room.y}%`,
                width: `${room.width}%`, height: `${room.height}%`,
                background: isCurrentRoom
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.3))'
                  : 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                border: isCurrentRoom ? '2px solid var(--success-500)' : '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 'var(--radius-md)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s ease',
                boxShadow: isCurrentRoom ? '0 0 20px rgba(16, 185, 129, 0.3)' : 'none',
              }}>
                <span style={{
                  fontWeight: isCurrentRoom ? 700 : 500,
                  fontSize: '0.8rem', color: 'var(--text-primary)',
                  textAlign: 'center', padding: '0.25rem',
                }}>
                  {(room as any).name_en || (room as any).nameEn || room.name}
                </span>
                {isCurrentRoom && (
                  <Accessibility size={20} style={{ color: 'var(--success-500)', marginTop: 2 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Appliance Controls */}
      {appliances.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚡ {t('Room Controls')}</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              {appliances.map(app => {
                const iconData = APPLIANCE_ICONS[app.type] || APPLIANCE_ICONS.light;
                const isOn = !!app.state;
                return (
                  <div key={app.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                    background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
                    border: `1px solid ${isOn ? 'var(--primary-500)' : 'var(--border-color)'}`,
                    transition: 'all 0.2s',
                  }}>
                    <span style={{ fontSize: '1.5rem' }}>{iconData.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{app.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{iconData.label}</div>
                    </div>
                    {/* Toggle Switch */}
                    <label className="toggle-switch" style={{ position: 'relative', cursor: 'pointer' }}>
                      <input type="checkbox" checked={isOn} onChange={() => handleToggleAppliance(app)}
                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                      <div style={{
                        width: 44, height: 24, borderRadius: 999,
                        background: isOn ? 'var(--primary-500)' : 'var(--gray-600)',
                        transition: 'background 0.2s', position: 'relative',
                      }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'white', position: 'absolute', top: 2,
                          left: isOn ? 22 : 2, transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        }} />
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Section */}
      {routines.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Clock size={18} /> {t('Today\'s Schedule')}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {routines.map((r, i) => {
              const isDone = completedRoutines.has(r.id);
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0.75rem 1rem',
                  borderBottom: i < routines.length - 1 ? '1px solid var(--border-color)' : 'none',
                  opacity: isDone ? 0.5 : 1,
                  transition: 'opacity 0.3s',
                }}>
                  <div style={{
                    minWidth: 60, fontWeight: 600, fontSize: '0.85rem',
                    color: 'var(--primary-500)',
                  }}>
                    {r.time || '--:--'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: 500,
                      textDecoration: isDone ? 'line-through' : 'none',
                    }}>{r.title}</div>
                    {r.room_name_en && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        📍 {r.room_name_en || r.room_name}
                      </div>
                    )}
                  </div>
                  {!isDone ? (
                    <button className="btn btn-sm btn-success" onClick={() => handleMarkDone(r.id)}>
                      <CheckCircle size={14} /> {t('Done')}
                    </button>
                  ) : (
                    <CheckCircle size={18} style={{ color: 'var(--success-500)' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
