'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Heart, Activity, TrendingUp, Zap, Brain
} from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { getWheelchairPosition, getLatestHealthScore, calculateHealthScore, getHealthScores } from '@/lib/api';

export default function UserHealthPage() {
  const { currentUser } = useWheelSenseStore();

  const { t, language } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<any>(null);
  const [healthScore, setHealthScore] = useState<any>(null);
  const [scoreHistory, setScoreHistory] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentUser) { setLoading(false); return; }
    try {
      const wcId = currentUser.wheelchairId;
      if (wcId) {
        try {
          const posRes = await getWheelchairPosition(wcId);
          if (posRes.data) setPosition(posRes.data);
        } catch { /* wheelchair position not available yet */ }
      }
      const hsRes = await getLatestHealthScore(currentUser.id);
      if (hsRes.data) setHealthScore(hsRes.data);
      const histRes = await getHealthScores(currentUser.id, 7);
      if (histRes.data) setScoreHistory((histRes.data as any).scores || []);
      setLoading(false);
    } catch (e) { console.error(e); setLoading(false); }
  }, [currentUser]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRecalculate = async () => {
    if (!currentUser) return;
    await calculateHealthScore(currentUser.id);
    fetchData();
  };

  const score = healthScore?.score || 0;
  const scoreColor = score >= 70 ? 'var(--success-500)' : score >= 40 ? 'var(--warning-500)' : 'var(--danger-500)';

  if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Heart size={24} /> {t('health.title')}</h2>

      {/* Health Score Card */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '2rem', border: '1px solid var(--bg-tertiary)', marginBottom: '1rem', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 1rem' }}>{t('health.healthScore')}</h3>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '160px', height: '160px', borderRadius: '50%',
          background: `conic-gradient(${scoreColor} ${score * 3.6}deg, var(--bg-tertiary) 0deg)`,
          position: 'relative', margin: '0 auto'
        }}>
          <span style={{
            background: 'var(--bg-secondary)', width: '130px', height: '130px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 700, color: scoreColor }}>{score}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/ 100</span>
          </span>
        </div>
        {healthScore?.ai_summary && (
          <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', fontSize: '0.875rem', maxWidth: '500px', margin: '1rem auto 0' }}>
            <Brain size={14} style={{ display: 'inline', marginRight: '4px' }} /> {healthScore.ai_summary}
          </p>
        )}
        <button onClick={handleRecalculate}
          style={{ marginTop: '1rem', background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
          {t('health.recalculate')}
        </button>
      </div>

      {/* Real-time Data */}
      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-icon primary"><Activity size={24} /></div>
          <div className="stat-content">
            <h3>{position?.distance_m?.toFixed(1) || '0'} m</h3>
            <p>{t('health.distanceToday')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info"><Zap size={24} /></div>
          <div className="stat-content">
            <h3>{position?.speed_ms?.toFixed(2) || '0'} m/s</h3>
            <p>{t('health.currentSpeed')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><Heart size={24} /></div>
          <div className="stat-content">
            <h3>{position?.heart_rate || '--'}</h3>
            <p>{t('health.heartRate')}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><TrendingUp size={24} /></div>
          <div className="stat-content">
            <h3>{position?.rssi || '--'} dBm</h3>
            <p>{t('health.signalStrength')}</p>
          </div>
        </div>
      </div>

      {/* Health Components */}
      {healthScore?.components && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.75rem' }}>{t('health.scoreComponents')}</h4>
          {Object.entries(healthScore.components).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ minWidth: '140px', fontSize: '0.85rem' }}>{key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
              <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: '4px', height: '20px' }}>
                <div style={{ height: '100%', borderRadius: '4px', background: 'var(--primary-500)', width: `${Math.min(100, Number(val))}%`, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>{String(val)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Score History */}
      {scoreHistory.length > 0 && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
          <h4 style={{ margin: '0 0 0.75rem' }}>{t('health.recentScores')}</h4>
          {scoreHistory.map((s: any, i: number) => (
            <div key={i} className="list-item" style={{ marginBottom: '0.5rem' }}>
              <div className="list-item-avatar" style={{
                background: s.score >= 70 ? 'var(--success-500)' : s.score >= 40 ? 'var(--warning-500)' : 'var(--danger-500)', fontSize: '0.75rem'
              }}>{s.score}%</div>
              <div className="list-item-content">
                <div className="list-item-title">Score: {s.score}/100</div>
                <div className="list-item-subtitle">{new Date(s.created_at).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
