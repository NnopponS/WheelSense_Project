'use client';

import { useEffect, useState } from 'react';
import { Heart, Brain, Activity, Gauge, ChevronDown, ChevronUp, Save, Edit2 } from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
  getPatients, getWheelchairs, getLatestHealthScore,
  getHealthScores, updatePatient
} from '@/lib/api';

interface HealthScoreData {
  overall_score?: number;
  components?: Record<string, number>;
  recommendations?: string[];
  timestamp?: string;
}

export default function UserHealthPage() {
  const { patients, setPatients, wheelchairs, setWheelchairs } = useWheelSenseStore();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<HealthScoreData | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [conditions, setConditions] = useState('');
  const [editingConditions, setEditingConditions] = useState(false);

  const patient = patients[0];
  const wheelchair = (wheelchairs as any[]).find((w: any) => (w.patient_id || w.patientId) === patient?.id) || wheelchairs[0] as any;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [pRes, wRes] = await Promise.all([getPatients(), getWheelchairs()]);
      if (pRes.data) setPatients(pRes.data.patients as any || []);
      if (wRes.data) setWheelchairs(wRes.data.wheelchairs as any || []);

      const pid = pRes.data?.patients?.[0]?.id;
      if (pid && pRes.data?.patients) {
        const p0 = pRes.data.patients[0] as any;
        setConditions(p0.condition || p0.notes || '');
        const [hRes, histRes] = await Promise.all([
          getLatestHealthScore(pid), getHealthScores(pid, 7)
        ]);
        if (hRes.data) setHealthData(hRes.data as HealthScoreData);
        if (histRes.data) setHistory((histRes.data as any)?.scores || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSaveConditions = async () => {
    if (!patient?.id) return;
    try {
      await updatePatient(patient.id, { condition: conditions });
      setEditingConditions(false);
    } catch (e) { console.error(e); }
  };

  const score = healthData?.overall_score ?? 85;
  const scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  if (loading) return <div className="empty-state" style={{ height: '60vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Health Score Card */}
      <div className="card" style={{
        background: `linear-gradient(135deg, ${scoreColor}22, ${scoreColor}11)`,
        border: `1px solid ${scoreColor}44`,
      }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          {/* Score Circle */}
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            <svg viewBox="0 0 120 120" width="120" height="120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-color)" strokeWidth="8" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={`${(score / 100) * 327} 327`} strokeLinecap="round"
                transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: scoreColor }}>{score}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>/100</span>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Heart size={20} style={{ color: scoreColor }} /> {t('Health Score')}
            </h2>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              {score >= 80 ? t('Your health status is excellent! Keep up the good work.') :
                score >= 60 ? t('Your health is fair. Pay attention to the recommendations below.') :
                  t('Your health needs attention. Please consult with your caregiver.')}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: t('Distance'), value: `${(wheelchair as any)?.distance_m?.toFixed(1) || '0'} m`, icon: <Activity size={18} />, color: '#6366f1' },
          { label: t('Speed'), value: `${(wheelchair as any)?.speed_ms?.toFixed(2) || '0'} m/s`, icon: <Gauge size={18} />, color: '#8b5cf6' },
          { label: t('Heart Rate'), value: '72 bpm', icon: <Heart size={18} />, color: '#ef4444' },
          { label: t('RSSI'), value: `${(wheelchair as any)?.rssi || '-'} dBm`, icon: <Activity size={18} />, color: '#10b981' },
        ].map((stat, i) => (
          <div key={i} className="card" style={{ border: `1px solid ${stat.color}33` }}>
            <div className="card-body" style={{ padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ color: stat.color, marginBottom: '0.25rem' }}>{stat.icon}</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stat.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Conditions + AI Recommendations */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Medical Conditions */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title">🩺 {t('Medical Conditions')}</span>
            {!editingConditions ? (
              <button className="btn btn-sm btn-icon" onClick={() => setEditingConditions(true)}><Edit2 size={14} /></button>
            ) : (
              <button className="btn btn-sm btn-success" onClick={handleSaveConditions}><Save size={14} /> {t('Save')}</button>
            )}
          </div>
          <div className="card-body">
            {editingConditions ? (
              <textarea style={{
                width: '100%', minHeight: 120, padding: '0.75rem',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical',
              }} value={conditions} onChange={(e) => setConditions(e.target.value)}
                placeholder={t('Enter your medical conditions, allergies, etc.')} />
            ) : (
              <p style={{ color: conditions ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {conditions || t('No conditions recorded. Click edit to add.')}
              </p>
            )}
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Brain size={18} /> {t('AI Recommendations')}</span>
          </div>
          <div className="card-body">
            {healthData?.recommendations && healthData.recommendations.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {healthData.recommendations.map((rec, i) => (
                  <li key={i} style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{rec}</li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                {t('No AI recommendations available yet. Health data is being analyzed.')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Health Components */}
      {healthData?.components && Object.keys(healthData.components).length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 {t('Health Components')}</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {Object.entries(healthData.components).map(([key, value]) => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.9rem', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                    <span style={{ fontWeight: 600 }}>{value}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-tertiary)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${value}%`,
                      background: value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444',
                      borderRadius: 999, transition: 'width 1s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Score History */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">📈 {t('Score History')}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {history.slice(0, 7).map((h: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: i < Math.min(history.length, 7) - 1 ? '1px solid var(--border-color)' : 'none',
              }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {new Date(h.timestamp || h.created_at).toLocaleDateString()}
                </span>
                <span style={{
                  fontWeight: 600,
                  color: (h.overall_score ?? h.score) >= 80 ? '#10b981' : (h.overall_score ?? h.score) >= 60 ? '#f59e0b' : '#ef4444',
                }}>
                  {h.overall_score ?? h.score ?? '-'}/100
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
