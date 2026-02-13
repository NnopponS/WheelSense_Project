'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, Fan, Thermometer, Tv, Power, RefreshCw, Zap } from 'lucide-react';
import { getAppliances, controlAppliance, Appliance } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function UserAppliancesPage() {
  const { t, language } = useTranslation();
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [controlling, setControlling] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<string>('');

  const fetchData = async () => {
    try {
      const res = await getAppliances();
      if (res.data) setAppliances(res.data.appliances);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching appliances:', error);
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
      setAppliances(prev => prev.map(a =>
        a.id === appliance.id ? { ...a, state: a.state ? 0 : 1 } : a
      ));
    } catch (error) {
      console.error('Error controlling appliance:', error);
    }
    setControlling(null);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'light': return Lightbulb;
      case 'fan': return Fan;
      case 'ac': return Thermometer;
      case 'tv': return Tv;
      default: return Power;
    }
  };

  const getColor = (type: string, isOn: boolean) => {
    if (!isOn) return 'bg-[var(--bg-tertiary)]';
    switch (type) {
      case 'light': return 'bg-gradient-to-br from-yellow-400 to-orange-500';
      case 'fan': return 'bg-gradient-to-br from-cyan-400 to-blue-500';
      case 'ac': return 'bg-gradient-to-br from-blue-400 to-indigo-500';
      case 'tv': return 'bg-gradient-to-br from-purple-400 to-pink-500';
      default: return 'bg-gradient-to-br from-emerald-400 to-teal-500';
    }
  };

  // Group by room
  const grouped = appliances.reduce((acc, app) => {
    const room = app.room_name || 'Other';
    if (!acc[room]) acc[room] = [];
    acc[room].push(app);
    return acc;
  }, {} as Record<string, Appliance[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  const roomNames = Object.keys(grouped);
  const selectedRoom = activeRoom || roomNames[0] || '';
  const roomAppliances = selectedRoom ? grouped[selectedRoom] || [] : [];
  const onCount = roomAppliances.filter((a) => !!a.state).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">⚡ Appliance Control</h1>
        <p className="text-[var(--text-secondary)] text-sm">Control appliances in all rooms</p>
      </div>

      {roomNames.length > 0 && (
        <div className="card mb-4" style={{ padding: '0.35rem' }}>
          <div style={{ display: 'grid', gap: '0.45rem', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            {roomNames.map((room) => (
              <button
                key={room}
                className="btn"
                style={{
                  background: selectedRoom === room ? 'var(--primary-500)' : 'transparent',
                  color: selectedRoom === room ? 'white' : 'var(--text-secondary)',
                  borderColor: selectedRoom === room ? 'var(--primary-500)' : 'transparent'
                }}
                onClick={() => setActiveRoom(room)}
              >
                {room}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedRoom && (
        <div className="card mb-4">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title"><Zap size={16} /> {selectedRoom}</span>
            <span className="list-item-badge info">{onCount}/{roomAppliances.length} On</span>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {roomAppliances.map((appliance) => {
                const Icon = getIcon(appliance.type);
                const isOn = !!appliance.state;
                const isControlling = controlling === appliance.id;
                return (
                  <div
                    key={appliance.id}
                    className="glass-card p-4"
                    style={{ border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${getColor(appliance.type, isOn)} flex items-center justify-center text-white`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{appliance.name}</h4>
                          <p className="text-xs text-[var(--text-muted)]">{isOn ? 'On' : 'Off'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleControl(appliance)}
                        disabled={isControlling}
                        className="btn btn-icon"
                        style={{ opacity: isControlling ? 0.6 : 1 }}
                      >
                        {isOn ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {appliances.length === 0 && (
        <div className="glass-card p-8 text-center">
          <Lightbulb className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-[var(--text-secondary)]">{t('user.appliances.noDevices')}</p>
        </div>
      )}
    </div>
  );
}
