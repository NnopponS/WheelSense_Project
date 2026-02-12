'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, Fan, Thermometer, Tv, Power, RefreshCw } from 'lucide-react';
import { getAppliances, controlAppliance, Appliance } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function UserAppliancesPage() {
  const { t, language } = useTranslation();
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [controlling, setControlling] = useState<string | null>(null);

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">💡 {t('user.appliances.title')}</h1>
        <p className="text-[var(--text-secondary)] text-sm">{t('user.appliances.subtitle')}</p>
      </div>

      {Object.entries(grouped).map(([roomName, roomAppliances]) => (
        <div key={roomName} className="mb-6">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">{roomName}</h3>
          <div className="grid grid-cols-2 gap-3">
            {roomAppliances.map((appliance) => {
              const Icon = getIcon(appliance.type);
              const isOn = !!appliance.state;
              const isControlling = controlling === appliance.id;

              return (
                <button
                  key={appliance.id}
                  onClick={() => handleControl(appliance)}
                  disabled={isControlling}
                  className={`glass-card p-4 text-left transition-all active:scale-95 ${isOn ? 'ring-2 ring-emerald-500/50' : ''
                    } ${isControlling ? 'opacity-50' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-xl ${getColor(appliance.type, isOn)} flex items-center justify-center text-white mb-3`}>
                    <Icon size={24} />
                  </div>
                  <h4 className="font-semibold text-sm mb-1">{appliance.name}</h4>
                  <p className={`text-xs font-medium ${isOn ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                    {isOn ? 'ON' : 'OFF'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {appliances.length === 0 && (
        <div className="glass-card p-8 text-center">
          <Lightbulb className="w-12 h-12 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-[var(--text-secondary)]">{t('user.appliances.noDevices')}</p>
        </div>
      )}
    </div>
  );
}
