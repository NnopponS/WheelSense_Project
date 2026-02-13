'use client';

import { useEffect, useState } from 'react';
import { Heart, Brain, Save, Edit2 } from 'lucide-react';
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
    <div style={{ maxWidth: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>❤️ My Health</h2>
        <p>Track health status and activities</p>
      </div>

      <div className="card" style={{
        background: `linear-gradient(135deg, ${scoreColor}, ${scoreColor}CC)`,
        border: `1px solid ${scoreColor}88`,
      }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white', minHeight: 84 }}>
          <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{`${score}`}</div>
            <div style={{ opacity: 0.9 }}>{score >= 80 ? 'Good' : score >= 60 ? 'Caution Required' : 'Needs Attention'}</div>
          </div>
          <Heart size={36} style={{ opacity: 0.85 }} />
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">🧍 User Condition</span>
          {!editingConditions ? (
            <button className="btn btn-sm btn-icon" onClick={() => setEditingConditions(true)}><Edit2 size={14} /> Edit</button>
          ) : (
            <button className="btn btn-sm btn-success" onClick={handleSaveConditions}><Save size={14} /> {t('Save')}</button>
          )}
        </div>
        <div className="card-body">
          {editingConditions ? (
            <textarea
              style={{
                width: '100%', minHeight: 120, padding: '0.75rem',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical',
              }}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder={t('Enter your medical conditions, allergies, etc.')}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {(conditions || '').split(/[\n,]+/).map((c, idx) => c.trim()).filter(Boolean).map((line, idx) => (
                <div key={idx} style={{ padding: '0.7rem 0.8rem', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 600 }}>
                  • {line}
                </div>
              ))}
              {!conditions && (
                <div style={{ color: 'var(--text-muted)' }}>{t('No conditions recorded. Click edit to add.')}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ borderColor: 'rgba(99,102,241,0.65)' }}>
        <div className="card-header">
          <span className="card-title"><Brain size={18} /> AI Recommendations</span>
        </div>
        <div className="card-body">
          {healthData?.recommendations && healthData.recommendations.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {healthData.recommendations.slice(0, 6).map((rec, i) => (
                <li key={i} style={{ fontSize: '0.95rem', lineHeight: 1.45 }}>{rec}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              {t('No AI recommendations available yet. Health data is being analyzed.')}
            </p>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">📈 {t('Score History')}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {history.slice(0, 5).map((h: any, i: number) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: i < Math.min(history.length, 5) - 1 ? '1px solid var(--border-color)' : 'none',
              }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {new Date(h.timestamp || h.created_at).toLocaleDateString()}
                </span>
                <span style={{
                  fontWeight: 700,
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
