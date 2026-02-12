'use client';

import { useEffect, useState } from 'react';
import {
    BarChart3, Building2, Layers, Users, AlertTriangle,
    Accessibility, Heart, Clock, TrendingUp, Activity
} from 'lucide-react';
import {
    getAnalyticsSummary, getBuildingAnalytics, getFloorAnalytics,
    getRoomUsage, getBuildings, getFloors
} from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function AnalyticsPage() {
    const { t, language } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<any>(null);
    const [buildings, setBuildings] = useState<any[]>([]);
    const [floors, setFloors] = useState<any[]>([]);
    const [selScope, setSelScope] = useState<'summary' | 'building' | 'floor'>('summary');
    const [selBuildingId, setSelBuildingId] = useState('');
    const [selFloorId, setSelFloorId] = useState('');
    const [scopeData, setScopeData] = useState<any>(null);
    const [roomUsage, setRoomUsage] = useState<any[]>([]);

    const fetchBase = async () => {
        const [sumRes, bRes, fRes] = await Promise.all([
            getAnalyticsSummary(),
            getBuildings(),
            getFloors(),
        ]);
        if (sumRes.data) setSummary(sumRes.data);
        if (bRes.data) setBuildings(bRes.data.buildings || []);
        if (fRes.data) setFloors(fRes.data.floors || []);
        setLoading(false);
    };

    useEffect(() => { fetchBase(); }, []);

    const loadScopeData = async () => {
        setScopeData(null);
        if (selScope === 'building' && selBuildingId) {
            const res = await getBuildingAnalytics(selBuildingId);
            if (res.data) setScopeData(res.data);
        } else if (selScope === 'floor' && selFloorId) {
            const [res, ruRes] = await Promise.all([
                getFloorAnalytics(selFloorId),
                getRoomUsage({ floor_id: selFloorId, days: 7 }),
            ]);
            if (res.data) setScopeData(res.data);
            if (ruRes.data) setRoomUsage((ruRes.data as any).rooms || []);
        }
    };

    useEffect(() => { loadScopeData(); }, [selScope, selBuildingId, selFloorId]);

    if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <h2 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart3 size={24} /> {t('admin.analytics.title')}</h2>

            {/* Scope Selector */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {(['summary', 'building', 'floor'] as const).map(s => (
                    <button key={s} onClick={() => setSelScope(s)}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600,
                            background: selScope === s ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                            color: selScope === s ? 'white' : 'var(--text-secondary)',
                        }}>
                        {s === 'summary' ? t('analytics.systemSummary') : s === 'building' ? t('analytics.byBuilding') : t('analytics.byFloor')}
                    </button>
                ))}
                {selScope === 'building' && (
                    <select value={selBuildingId} onChange={e => setSelBuildingId(e.target.value)}
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
                        <option value="">{t('analytics.selectBuilding')}</option>
                        {buildings.map(b => <option key={b.id} value={b.id}>{b.name_en || b.name}</option>)}
                    </select>
                )}
                {selScope === 'floor' && (
                    <select value={selFloorId} onChange={e => setSelFloorId(e.target.value)}
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
                        <option value="">{t('analytics.selectFloor')}</option>
                        {floors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                )}
            </div>

            {/* System Summary */}
            {selScope === 'summary' && summary && (
                <>
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-icon primary"><Users size={24} /></div>
                            <div className="stat-content"><h3>{summary.total_patients || 0}</h3><p>{t('analytics.totalPatients')}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon success"><Accessibility size={24} /></div>
                            <div className="stat-content"><h3>{summary.active_wheelchairs || 0}</h3><p>{t('analytics.activeWheelchairs')}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon info"><Activity size={24} /></div>
                            <div className="stat-content"><h3>{summary.online_nodes || 0}</h3><p>{t('analytics.onlineNodes')}</p></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon warning"><AlertTriangle size={24} /></div>
                            <div className="stat-content"><h3>{summary.unresolved_alerts || 0}</h3><p>{t('analytics.unresolvedAlerts')}</p></div>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
                            <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Heart size={18} /> {t('analytics.avgHealthScore')}</h4>
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '120px', height: '120px', borderRadius: '50%',
                                    background: `conic-gradient(var(--primary-500) ${(summary.avg_health_score || 0) * 3.6}deg, var(--bg-tertiary) 0deg)`,
                                    position: 'relative'
                                }}>
                                    <span style={{
                                        background: 'var(--bg-secondary)', width: '100px', height: '100px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.5rem', fontWeight: 700,
                                    }}>{Math.round(summary.avg_health_score || 0)}%</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
                            <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><TrendingUp size={18} /> {t('analytics.alertSummary')}</h4>
                            <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <div className="stat-card"><div className="stat-content"><h3>{summary.total_alerts || 0}</h3><p>{t('analytics.totalAlerts')}</p></div></div>
                                <div className="stat-card"><div className="stat-content"><h3>{summary.unresolved_alerts || 0}</h3><p>{t('analytics.unresolved')}</p></div></div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Building/Floor Scope Data */}
            {selScope !== 'summary' && scopeData && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
                    <h4 style={{ margin: '0 0 1rem' }}>{selScope === 'building' ? t('analytics.buildingAnalytics') : t('analytics.floorAnalytics')}</h4>
                    <div className="stats-grid">
                        {Object.entries(scopeData).map(([key, val]) => (
                            typeof val === 'number' ? (
                                <div key={key} className="stat-card">
                                    <div className="stat-content">
                                        <h3>{val}</h3>
                                        <p>{key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
                                    </div>
                                </div>
                            ) : null
                        ))}
                    </div>
                </div>
            )}

            {/* Room Usage (floor scope) */}
            {selScope === 'floor' && roomUsage.length > 0 && (
                <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
                    <h4 style={{ margin: '0 0 0.75rem' }}>{t('analytics.roomUsageLast7')}</h4>
                    {roomUsage.map((r: any) => (
                        <div key={r.room_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <span style={{ minWidth: '120px', fontSize: '0.875rem' }}>{r.room_name || r.room_id}</span>
                            <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: '4px', height: '24px', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: '4px',
                                    background: 'linear-gradient(90deg, var(--primary-500), var(--primary-600))',
                                    width: `${Math.min(100, (r.total_minutes / 60) * 10)}%`,
                                    display: 'flex', alignItems: 'center', paddingLeft: '0.5rem',
                                    fontSize: '0.7rem', color: 'white', fontWeight: 600,
                                }}>
                                    {Math.round(r.total_minutes)} min
                                </div>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '60px' }}>{r.visit_count} {t('analytics.visits')}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
