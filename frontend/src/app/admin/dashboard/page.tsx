'use client';

import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Accessibility, Radio, Activity, TrendingUp, RefreshCw } from 'lucide-react';
import { getHealth, getWheelchairs, getPatients, getRooms, getTodayTimeline, getDeviceStats, HealthResponse, Wheelchair, Patient, Room, TimelineEvent, DeviceStats } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function DashboardPage() {
    const { t, language } = useTranslation();
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [wheelchairs, setWheelchairs] = useState<Wheelchair[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
    const [deviceStats, setDeviceStats] = useState<DeviceStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [healthRes, wheelchairsRes, patientsRes, roomsRes, timelineRes, statsRes] = await Promise.all([
                getHealth(),
                getWheelchairs(),
                getPatients(),
                getRooms(),
                getTodayTimeline(5),
                getDeviceStats(),
            ]);

            if (healthRes.data) setHealth(healthRes.data);
            if (wheelchairsRes.data) setWheelchairs(wheelchairsRes.data.wheelchairs);
            if (patientsRes.data) setPatients(patientsRes.data.patients);
            if (roomsRes.data) setRooms(roomsRes.data.rooms);
            if (timelineRes.data) setTimeline(timelineRes.data.timeline);
            if (statsRes.data) setDeviceStats(statsRes.data);

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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[80vh]">
                <RefreshCw className="w-10 h-10 text-blue-400 animate-spin" />
            </div>
        );
    }

    const activeWheelchairs = wheelchairs.filter(w => w.status !== 'offline').length;

    return (
        <div className="page-content">
            {/* Header */}
            <div className="page-header flex items-center justify-between">
                <div>
                    <h2>📊 {t('admin.dashboard.title')}</h2>
                    <p>WheelSense v2.0 System Overview</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${health?.status === 'healthy' ? 'status-online' : 'status-warning'}`} />
                        <span className="text-sm text-[var(--text-secondary)]">
                            System {health?.status === 'healthy' ? t('admin.dashboard.connected') : 'Degraded'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon primary">
                        <Accessibility />
                    </div>
                    <div className="stat-content">
                        <h3>{activeWheelchairs}/{wheelchairs.length}</h3>
                        <p>{t('admin.dashboard.activeWheelchairs')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success">
                        <Users />
                    </div>
                    <div className="stat-content">
                        <h3>{patients.length}</h3>
                        <p>{t('admin.dashboard.totalPatients')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon info">
                        <Radio />
                    </div>
                    <div className="stat-content">
                        <h3>{deviceStats?.online || 0}/{deviceStats?.total || 0}</h3>
                        <p>{t('admin.dashboard.onlineNodes')}</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon warning">
                        <LayoutDashboard />
                    </div>
                    <div className="stat-content">
                        <h3>{rooms.length}</h3>
                        <p>{t('common.room')}</p>
                    </div>
                </div>
            </div>

            {/* Connection Status & Activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Activity size={20} />
                        {t('admin.dashboard.systemStatus')}
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">📡</span>
                                <span>{t('admin.dashboard.mqtt')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${health?.mqtt_connected ? 'status-online' : 'status-offline'}`} />
                                <span className={`text-sm ${health?.mqtt_connected ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {health?.mqtt_connected ? t('admin.dashboard.connected') : t('admin.dashboard.disconnected')}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">🏠</span>
                                <span>{t('admin.dashboard.homeAssistant')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${health?.ha_connected ? 'status-online' : 'status-offline'}`} />
                                <span className={`text-sm ${health?.ha_connected ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {health?.ha_connected ? t('admin.dashboard.connected') : t('admin.dashboard.disconnected')}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg">
                            <div className="flex items-center gap-3">
                                <span className="text-xl">💾</span>
                                <span>{t('admin.dashboard.database')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${health?.database === 'connected' ? 'status-online' : 'status-offline'}`} />
                                <span className="text-sm text-emerald-400">{t('admin.dashboard.connected')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp size={20} />
                        {t('admin.dashboard.recentActivity')}
                    </h3>
                    <div className="space-y-3">
                        {timeline.length === 0 ? (
                            <p className="text-[var(--text-muted)] text-center py-4">{t('admin.dashboard.noActivity')}</p>
                        ) : (
                            timeline.map((event) => (
                                <div key={event.id} className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                                    <div className="text-xl">
                                        {event.event_type === 'location_change' ? '📍' :
                                            event.event_type === 'appliance_control' ? '💡' : '📝'}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm">
                                            {event.description || `${event.patient_name || event.wheelchair_name} → ${event.to_room_name}`}
                                        </p>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {new Date(event.timestamp).toLocaleTimeString('th-TH')}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Active Wheelchairs */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Accessibility size={20} />
                    {t('admin.dashboard.wheelchairOverview')}
                </h3>
                <div className="overflow-x-auto">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>{t('common.name')}</th>
                                <th>{t('admin.dashboard.patient')}</th>
                                <th>{t('admin.dashboard.location')}</th>
                                <th>{t('admin.dashboard.battery')}</th>
                                <th>{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {wheelchairs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-[var(--text-muted)]">
                                        {t('admin.dashboard.noWheelchairs')}
                                    </td>
                                </tr>
                            ) : (
                                wheelchairs.map((w) => (
                                    <tr key={w.id}>
                                        <td className="font-mono text-sm">{w.id}</td>
                                        <td>{w.name}</td>
                                        <td>{w.patient_name || '-'}</td>
                                        <td>{w.room_name || '-'}</td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${w.battery_level > 50 ? 'bg-emerald-500' :
                                                            w.battery_level > 20 ? 'bg-yellow-500' : 'bg-red-500'
                                                            }`}
                                                        style={{ width: `${w.battery_level}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm">{w.battery_level}%</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`px-2 py-1 rounded-full text-xs ${w.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                                w.status === 'idle' ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-[var(--text-muted)]/20 text-[var(--text-secondary)]'
                                                }`}>
                                                {w.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
