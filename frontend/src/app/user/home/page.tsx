'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Home, MapPin, Calendar, Clock, Accessibility, Activity,
  ChevronRight, Zap, Power
} from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
  getMapData, getRoutines, getWheelchairPosition,
  getRoomAppliances, controlAppliance
} from '@/lib/api';
import type { Room, Appliance } from '@/types';

export default function UserHomePage() {
  const { currentUser, rooms, setRooms } = useWheelSenseStore();

  const { t, language } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<any>(null);
  const [routines, setRoutines] = useState<any[]>([]);
  const [roomApplianceMap, setRoomApplianceMap] = useState<Record<string, any[]>>({});
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [mapRes, rtRes] = await Promise.all([
        getMapData(),
        getRoutines(currentUser?.id),
      ]);

      if (mapRes.data) {
        const mappedRooms: Room[] = (mapRes.data.rooms || []).map((r: any) => ({
          id: r.id, name: r.name, nameEn: r.name_en, roomType: r.room_type,
          x: r.x, y: r.y, width: r.width, height: r.height,
          floorId: r.floor_id, buildingId: 'building-1',
        }));
        setRooms(mappedRooms);
      }

      if (rtRes.data) {
        const now = new Date();
        const sorted = (rtRes.data.routines || []).sort((a: any, b: any) => a.time.localeCompare(b.time));
        setRoutines(sorted);
      }

      // Get wheelchair position
      if (currentUser?.wheelchairId) {
        const wcId = currentUser.wheelchairId;
        try {
          const posRes = await getWheelchairPosition(wcId);
          const posData = posRes.data;
          if (posData) {
            setPosition(posData);
            const rm = rooms.find(r => r.id === posData.current_room_id);
            if (rm) {
              setCurrentRoom(rm);
              const appRes = await getRoomAppliances(rm.id);
              if (appRes.data) setRoomApplianceMap({ [rm.id]: appRes.data.appliances || [] });
            }
          }
        } catch (posErr) {
          // Gracefully handle 404 or other errors for wheelchair position
          console.warn('Wheelchair position unavailable:', posErr);
        }
      }

      setLoading(false);
    } catch (e) { console.error(e); setLoading(false); }
  }, [currentUser]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleAppliance = async (app: any) => {
    await controlAppliance(app.id, !app.state, app.value);
    fetchData();
  };

  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);
  const currentRoutine = routines.find(r => r.time <= timeStr && r.time > (routines[routines.indexOf(r) - 1]?.time || '00:00'));
  const nextRoutine = routines.find(r => r.time > timeStr);

  if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Welcome */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>👋 {t('home.welcome')}, {currentUser?.nameEn || currentUser?.name || t('common.user')}</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0' }}>
          {position?.room_name ? `📍 ${t('home.youAreIn')} ${position.room_name}` : `📍 ${t('home.locationUnknown')}`}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Floor Map */}
        <div className="map-container" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <span className="card-title"><MapPin size={18} /> {t('home.yourLocation')}</span>
          </div>
          <div className="map-canvas" style={{ minHeight: '250px' }}>
            {rooms.map(room => {
              const isHere = position?.room_id === room.id;
              return (
                <div key={room.id} className={`room ${isHere ? 'detected' : ''}`}
                  style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%` }}>
                  <span className="room-label">{room.nameEn || room.name}</span>
                  {isHere && <div className="room-wheelchair-icon"><Accessibility size={20} /></div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Current & Next Activity */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
          <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Activity size={18} /> {t('home.currentActivity')}</h4>
          {currentRoutine ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{currentRoutine.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{currentRoutine.time} • {currentRoutine.room_name_en || currentRoutine.room_name || ''}</div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>{t('home.noActivity')}</p>
          )}
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
          <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={18} /> {t('home.nextUp')}</h4>
          {nextRoutine ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--info-500), var(--info-600))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{nextRoutine.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{nextRoutine.time} • {nextRoutine.room_name_en || nextRoutine.room_name || ''}</div>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>{t('home.noMoreActivities')}</p>
          )}
        </div>

        {/* Today Schedule */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
          <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={18} /> {t('home.todaySchedule')}</h4>
          {routines.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('home.noRoutines')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {routines.slice(0, 6).map((r: any) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem',
                  borderRadius: '8px', background: r.time <= timeStr ? 'var(--bg-tertiary)' : 'transparent',
                  opacity: r.time <= timeStr ? 0.6 : 1
                }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', minWidth: '45px', color: 'var(--primary-400)' }}>{r.time}</span>
                  <span style={{ fontSize: '0.85rem' }}>{r.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Appliance Controls */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
          <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={18} /> {t('home.roomControls')}</h4>
          {currentRoom && roomApplianceMap[currentRoom.id]?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {roomApplianceMap[currentRoom.id].map((app: any) => (
                <div key={app.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-tertiary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Power size={16} style={{ color: app.state ? 'var(--success-400)' : 'var(--text-secondary)' }} />
                    <span style={{ fontSize: '0.85rem' }}>{app.name}</span>
                  </div>
                  <button onClick={() => handleToggleAppliance(app)}
                    style={{
                      padding: '0.3rem 0.75rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                      background: app.state ? 'var(--success-500)' : 'var(--border-color)',
                      color: 'white',
                    }}>
                    {app.state ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)' }}>{t('home.noAppliances')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
