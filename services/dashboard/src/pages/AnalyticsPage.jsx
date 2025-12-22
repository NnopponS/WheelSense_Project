import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import {
    BarChart3, Users, TrendingUp, TrendingDown, Calendar, Clock,
    Activity, AlertTriangle, CheckCircle, Battery, Cpu
} from 'lucide-react';

export function AnalyticsPage() {
    const { patients, wheelchairs, devices, timeline, emergencies, aiAnalysis, language } = useApp();
    const { t } = useTranslation(language);
    const [dateRange, setDateRange] = useState('today');

    // Calculate statistics
    const totalPatients = patients.length;
    const activePatients = patients.filter(p => wheelchairs.find(w => w.id === p.wheelchairId && w.status !== 'offline')).length;
    const averageHealthScore = Math.round(patients.reduce((sum, p) => sum + (p.healthScore || 0), 0) / patients.length);
    const todayAlerts = timeline.filter(t => t.type === 'alert').length;
    const activeEmergencies = emergencies.filter(e => !e.resolved).length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const wheelchairsLowBattery = wheelchairs.filter(w => w.battery < 20 && w.battery > 0).length;

    // Activity by hour (mock data)
    const activityByHour = [
        { hour: '06:00', count: 5 },
        { hour: '08:00', count: 12 },
        { hour: '10:00', count: 18 },
        { hour: '12:00', count: 15 },
        { hour: '14:00', count: 10 },
        { hour: '16:00', count: 14 },
        { hour: '18:00', count: 16 },
        { hour: '20:00', count: 8 },
        { hour: '22:00', count: 3 },
    ];
    const maxActivity = Math.max(...activityByHour.map(a => a.count));

    // Room usage (mock data)
    const roomUsage = [
        { room: 'Bedroom', percentage: 35, color: 'var(--primary-500)' },
        { room: 'Living Room', percentage: 30, color: 'var(--success-500)' },
        { room: 'Kitchen', percentage: 20, color: 'var(--warning-500)' },
        { room: 'Bathroom', percentage: 15, color: 'var(--info-500)' },
    ];

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📊 {t('Analytics Dashboard')}</h2>
                <p>{t('Analyze system data and trends')}</p>
            </div>

            {/* Date Range Filter */}
            <div className="tabs" style={{ marginBottom: '1.5rem', maxWidth: 400 }}>
                <button className={`tab ${dateRange === 'today' ? 'active' : ''}`} onClick={() => setDateRange('today')}>{t('Today')}</button>
                <button className={`tab ${dateRange === 'week' ? 'active' : ''}`} onClick={() => setDateRange('week')}>{t('7 Days')}</button>
                <button className={`tab ${dateRange === 'month' ? 'active' : ''}`} onClick={() => setDateRange('month')}>{t('30 Days')}</button>
            </div>

            {/* Key Metrics */}
            <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="stat-card">
                    <div className="stat-icon primary"><Users /></div>
                    <div className="stat-content">
                        <h3>{activePatients}/{totalPatients}</h3>
                        <p>{t('Patients Online')}</p>
                        <div className="stat-trend up"><TrendingUp size={14} /> {t('+2 from yesterday')}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon success"><Activity /></div>
                    <div className="stat-content">
                        <h3>{averageHealthScore}</h3>
                        <p>{t('Average Health Score')}</p>
                        <div className="stat-trend up"><TrendingUp size={14} /> +5%</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon warning"><AlertTriangle /></div>
                    <div className="stat-content">
                        <h3>{todayAlerts}</h3>
                        <p>{t('Alerts Today')}</p>
                        <div className="stat-trend down"><TrendingDown size={14} /> {t('-3 from yesterday')}</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon danger"><Battery /></div>
                    <div className="stat-content">
                        <h3>{wheelchairsLowBattery}</h3>
                        <p>{t('Low Battery')}</p>
                    </div>
                </div>
            </div>

            <div className="content-grid">
                {/* Activity Chart */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><BarChart3 size={18} /> {t('Activity by Time')}</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 200, gap: '0.5rem' }}>
                            {activityByHour.map((item, idx) => (
                                <div key={idx} style={{ flex: 1, textAlign: 'center' }}>
                                    <div
                                        style={{
                                            height: `${(item.count / maxActivity) * 160}px`,
                                            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                                            borderRadius: 'var(--radius-sm)',
                                            marginBottom: '0.5rem',
                                            transition: 'height 0.3s ease'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.hour}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Room Usage */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Clock size={18} /> {t('Room Usage')}</span>
                    </div>
                    <div className="card-body">
                        {roomUsage.map((room, idx) => (
                            <div key={idx} style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <span style={{ fontSize: '0.9rem' }}>{room.room}</span>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{room.percentage}%</span>
                                </div>
                                <div className="progress-bar">
                                    <div
                                        className="progress-bar-fill"
                                        style={{ width: `${room.percentage}%`, background: room.color }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Patient Health Overview */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Users size={18} /> {t('Patient Health Status')}</span>
                </div>
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>{t('Name')}</th>
                                <th>{t('Health Score')}</th>
                                <th>{t('Status')}</th>
                                <th>{t('Wheelchair')}</th>
                                <th>{t('Current Room')}</th>
                                <th>{t('Battery')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {patients.map(patient => {
                                const wc = wheelchairs.find(w => w.id === patient.wheelchairId);
                                return (
                                    <tr key={patient.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div className="list-item-avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>{patient.avatar}</div>
                                                <span>{patient.name}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div className="progress-bar" style={{ width: 80, height: 6 }}>
                                                    <div
                                                        className={`progress-bar-fill ${patient.healthScore >= 80 ? 'success' : patient.healthScore >= 50 ? 'warning' : 'danger'}`}
                                                        style={{ width: `${patient.healthScore}%` }}
                                                    />
                                                </div>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{patient.healthScore}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`list-item-badge ${patient.condition === 'Normal' ? 'normal' : patient.condition === 'Caution' ? 'warning' : 'alert'}`}>
                                                {patient.condition}
                                            </span>
                                        </td>
                                        <td>{wc?.name || '-'}</td>
                                        <td>{patient.room || '-'}</td>
                                        <td>
                                            <span style={{ color: wc?.battery < 20 ? 'var(--danger-500)' : 'var(--success-500)', fontWeight: 500 }}>
                                                {wc?.battery || 0}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* AI Insights */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Activity size={18} /> {t('AI Insights')}</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                        <div style={{ padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)' }}>
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <CheckCircle size={18} color="var(--success-500)" /> {t('Daily Report')}
                            </h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{aiAnalysis.dailySummary}</p>
                        </div>
                        {aiAnalysis.anomalies.map((anomaly, i) => (
                            <div key={i} style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--danger-500)' }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--danger-500)' }}>
                                    <AlertTriangle size={18} /> ⚠️ {t('Anomaly Detected')}
                                </h4>
                                <p style={{ fontSize: '0.85rem' }}>{anomaly.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* System Status */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Cpu size={18} /> {t('System Status')}</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('Devices Online')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-500)' }}>{onlineDevices}/{devices.length}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('Active Emergencies')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: activeEmergencies > 0 ? 'var(--danger-500)' : 'var(--success-500)' }}>
                                {activeEmergencies}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('AI Last Analysis')}</div>
                            <div style={{ fontSize: '1rem', fontWeight: 500 }}>{new Date(aiAnalysis.lastAnalysis).toLocaleTimeString('en-US')}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{t('Uptime')}</div>
                            <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--success-500)' }}>99.9%</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
