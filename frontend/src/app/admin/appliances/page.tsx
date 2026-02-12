'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, Fan, Thermometer, Tv, Power, RefreshCw, Home } from 'lucide-react';
import { getAppliances, getRooms, controlAppliance, Appliance, Room } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function AppliancesPage() {
  const { t, language } = useTranslation();
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [controlling, setControlling] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [appliancesRes, roomsRes] = await Promise.all([
        getAppliances(),
        getRooms(),
      ]);
      if (appliancesRes.data) setAppliances(appliancesRes.data.appliances);
      if (roomsRes.data) setRooms(roomsRes.data.rooms);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleControl = async (appliance: Appliance) => {
    setControlling(appliance.id);
    try {
      await controlAppliance(appliance.id, !appliance.state);
      // Update local state immediately for responsiveness
      setAppliances(prev => prev.map(a =>
        a.id === appliance.id ? { ...a, state: a.state ? 0 : 1 } : a
      ));
    } catch (error) {
      console.error('Error controlling appliance:', error);
    }
    setControlling(null);
  };

  const getApplianceIcon = (type: string) => {
    switch (type) {
      case 'light': return Lightbulb;
      case 'fan': return Fan;
      case 'ac': return Thermometer;
      case 'tv': return Tv;
      default: return Power;
    }
  };

  const getApplianceColor = (type: string, isOn: boolean) => {
    if (!isOn) return 'from-gray-600 to-gray-700';
    switch (type) {
      case 'light': return 'from-yellow-500 to-orange-500';
      case 'fan': return 'from-cyan-500 to-blue-500';
      case 'ac': return 'from-blue-500 to-indigo-500';
      case 'tv': return 'from-purple-500 to-pink-500';
      default: return 'from-emerald-500 to-teal-500';
    }
  };

  const filteredAppliances = selectedRoom === 'all'
    ? appliances
    : appliances.filter(a => a.room_id === selectedRoom);

  // Group by room
  const groupedAppliances = filteredAppliances.reduce((acc, appliance) => {
    const roomName = appliance.room_name || 'Unknown';
    if (!acc[roomName]) acc[roomName] = [];
    acc[roomName].push(appliance);
    return acc;
  }, {} as Record<string, Appliance[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header flex items-center justify-between">
        <div>
          <h2>💡 {t('admin.appliances.title')}</h2>
          <p>{t('admin.appliances.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input w-48"
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
          >
            <option value="all">{t('appliance.allRooms')}</option>
            {rooms.map(room => (
              <option key={room.id} value={room.id}>{room.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid mb-6">
        <div className="stat-card">
          <div className="stat-icon primary">
            <Power />
          </div>
          <div className="stat-content">
            <h3>{appliances.length}</h3>
            <p>{t('admin.appliances.totalDevices')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success">
            <Lightbulb />
          </div>
          <div className="stat-content">
            <h3>{appliances.filter(a => a.state).length}</h3>
            <p>{t('appliance.currentlyOn')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info">
            <Home />
          </div>
          <div className="stat-content">
            <h3>{new Set(appliances.map(a => a.room_id)).size}</h3>
            <p>{t('appliance.roomsWithDevices')}</p>
          </div>
        </div>
      </div>

      {/* Appliances by Room */}
      {Object.entries(groupedAppliances).map(([roomName, roomAppliances]) => (
        <div key={roomName} className="mb-8">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Home size={20} className="text-[var(--text-secondary)]" />
            {roomName}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {roomAppliances.map((appliance) => {
              const Icon = getApplianceIcon(appliance.type);
              const isOn = !!appliance.state;
              const isControlling = controlling === appliance.id;

              return (
                <button
                  key={appliance.id}
                  onClick={() => handleControl(appliance)}
                  disabled={isControlling}
                  className={`glass-card p-5 text-left transition-all duration-300 hover:scale-[1.02] ${isOn ? 'ring-2 ring-emerald-500/50' : ''
                    } ${isControlling ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getApplianceColor(appliance.type, isOn)} flex items-center justify-center text-white shadow-lg`}>
                      <Icon size={24} />
                    </div>
                    <div className={`w-3 h-3 rounded-full transition-all ${isOn ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-[var(--border-color)]'
                      }`} />
                  </div>

                  <h4 className="font-semibold mb-1">{appliance.name}</h4>
                  <p className="text-sm text-[var(--text-secondary)] capitalize">{appliance.type}</p>

                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${isOn ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                        {isOn ? 'ON' : 'OFF'}
                      </span>
                      {appliance.value !== undefined && appliance.value !== null && isOn && (
                        <span className="text-sm text-[var(--text-secondary)]">
                          {appliance.type === 'ac' ? `${appliance.value}°C` : `${appliance.value}%`}
                        </span>
                      )}
                    </div>
                  </div>

                  {appliance.ha_entity_id && (
                    <p className="text-xs text-[var(--text-muted)] mt-2 font-mono truncate">
                      {appliance.ha_entity_id}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {appliances.length === 0 && (
        <div className="glass-card p-12 text-center">
          <Lightbulb className="w-16 h-16 mx-auto text-[var(--text-muted)] mb-4" />
          <h3 className="text-xl font-semibold mb-2">{t('admin.appliances.noDevices')}</h3>
          <p className="text-[var(--text-secondary)]">{t('admin.appliances.connectHA')}</p>
        </div>
      )}
    </div>
  );
}
