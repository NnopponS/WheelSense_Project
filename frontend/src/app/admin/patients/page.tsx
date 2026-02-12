'use client';

import { useEffect, useState } from 'react';
import {
  Users, Search, Plus, Edit3, Trash2, Accessibility,
  Heart, Clock, BarChart3, Calendar, Activity, MapPin, ChevronRight, X
} from 'lucide-react';
import {
  getPatients, getPatient, createPatient, updatePatient, deletePatient,
  getWheelchairs, getWheelchairPosition, getTimeline, getRoutines,
  getHealthScores, calculateHealthScore, getPatientAnalytics
} from '@/lib/api';
import { useTranslation } from '@/lib/i18n';

export default function PatientsPage() {
  const { t, language } = useTranslation();
  const [patients, setPatients] = useState<any[]>([]);
  const [wheelchairs, setWheelchairs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'realtime' | 'routines' | 'analytics' | 'timeline'>('info');
  const [patientTimeline, setPatientTimeline] = useState<any[]>([]);
  const [patientRoutines, setPatientRoutines] = useState<any[]>([]);
  const [healthScores, setHealthScores] = useState<any[]>([]);
  const [wcPosition, setWcPosition] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', name_en: '', age: '', gender: '', condition: '', notes: '', wheelchair_id: '' });

  const fetchData = async () => {
    const [pRes, wRes] = await Promise.all([getPatients(), getWheelchairs()]);
    if (pRes.data) setPatients(pRes.data.patients || []);
    if (wRes.data) setWheelchairs(wRes.data.wheelchairs || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const loadPatientDetails = async (p: any) => {
    setSelectedPatient(p);
    setDetailTab('info');
    const [tlRes, rtRes, hsRes] = await Promise.all([
      getTimeline({ patient_id: p.id, limit: 30 }),
      getRoutines(p.id),
      getHealthScores(p.id, 10),
    ]);
    if (tlRes.data) setPatientTimeline(tlRes.data.timeline || []);
    if (rtRes.data) setPatientRoutines(rtRes.data.routines || []);
    if (hsRes.data) setHealthScores((hsRes.data as any).scores || []);
    if (p.wheelchair_id) {
      try {
        const posRes = await getWheelchairPosition(p.wheelchair_id);
        if (posRes.data) setWcPosition(posRes.data);
      } catch { setWcPosition(null); }
    } else { setWcPosition(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('patient.deleteConfirm'))) return;
    await deletePatient(id);
    setSelectedPatient(null);
    fetchData();
  };

  const handleCreate = async () => {
    await createPatient({
      name: form.name, name_en: form.name_en || undefined,
      age: form.age ? Number(form.age) : undefined, gender: form.gender || undefined,
      condition: form.condition || undefined, notes: form.notes || undefined,
      wheelchair_id: form.wheelchair_id || undefined,
    });
    setShowAdd(false);
    setForm({ name: '', name_en: '', age: '', gender: '', condition: '', notes: '', wheelchair_id: '' });
    fetchData();
  };

  const handleCalculateHealth = async (patientId: string) => {
    await calculateHealthScore(patientId);
    const res = await getHealthScores(patientId, 10);
    if (res.data) setHealthScores((res.data as any).scores || []);
  };

  const filtered = patients.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.name_en || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.id || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={24} /> {t('admin.patients.title')}</h2>
        <button onClick={() => setShowAdd(true)}
          style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> {t('admin.patients.addPatient')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedPatient ? '350px 1fr' : '1fr', gap: '1rem' }}>
        {/* Patient List */}
        <div className="list-container">
          <div style={{ padding: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '0.4rem 0.75rem' }}>
              <Search size={16} />
              <input placeholder={t('patient.searchPatients')} value={search} onChange={e => setSearch(e.target.value)}
                style={{ background: 'none', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', fontSize: '0.875rem' }} />
            </div>
          </div>
          <div className="list-body">
            {filtered.map(p => (
              <div key={p.id} className={`list-item ${selectedPatient?.id === p.id ? 'active' : ''}`}
                onClick={() => loadPatientDetails(p)}
                style={selectedPatient?.id === p.id ? { background: 'var(--primary-500-10)' } : {}}>
                <div className="list-item-avatar">{(p.name_en || p.name || '?').charAt(0)}</div>
                <div className="list-item-content">
                  <div className="list-item-title">{p.name_en || p.name}</div>
                  <div className="list-item-subtitle">{p.condition || t('patient.noCondition')} • {p.wheelchair_name || t('patient.noWheelchairAssigned')}</div>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Patient Detail */}
        {selectedPatient && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Info Header */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selectedPatient.name_en || selectedPatient.name}</h3>
                  <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0' }}>ID: {selectedPatient.id} • {selectedPatient.gender || 'N/A'} • Age: {selectedPatient.age || 'N/A'}</p>
                  <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{t('admin.patients.condition')}: {selectedPatient.condition || '-'}</p>
                  {selectedPatient.wheelchair_name && (
                    <p style={{ color: 'var(--primary-400)', margin: '0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Accessibility size={14} /> {selectedPatient.wheelchair_name} • <MapPin size={14} /> {selectedPatient.current_room_name || 'Unknown'}
                    </p>
                  )}
                </div>
                <button onClick={() => handleDelete(selectedPatient.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--danger-400)', cursor: 'pointer' }}>
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-secondary)', borderRadius: '10px', padding: '0.25rem', border: '1px solid var(--bg-tertiary)' }}>
              {[
                { key: 'info', label: t('patient.tab.info'), icon: Users },
                { key: 'realtime', label: t('patient.tab.realtime'), icon: Activity },
                { key: 'routines', label: t('patient.tab.routines'), icon: Calendar },
                { key: 'analytics', label: t('patient.tab.analytics'), icon: BarChart3 },
                { key: 'timeline', label: t('patient.tab.timeline'), icon: Clock },
              ].map(tab => (
                <button key={tab.key} onClick={() => setDetailTab(tab.key as any)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                    padding: '0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                    background: detailTab === tab.key ? 'var(--primary-500)' : 'transparent',
                    color: detailTab === tab.key ? 'white' : 'var(--text-secondary)',
                  }}>
                  <tab.icon size={14} /> {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)', minHeight: '300px' }}>
              {detailTab === 'info' && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem' }}>{t('patient.details')}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div><label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('patient.nameTH')}</label><p>{selectedPatient.name}</p></div>
                    <div><label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('patient.nameEN')}</label><p>{selectedPatient.name_en || '-'}</p></div>
                    <div><label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('admin.patients.condition')}</label><p>{selectedPatient.condition || '-'}</p></div>
                    <div><label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('patient.wheelchair')}</label><p>{selectedPatient.wheelchair_name || t('patient.notAssigned')}</p></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('admin.patients.notes')}</label><p>{selectedPatient.notes || '-'}</p></div>
                  </div>
                </div>
              )}

              {detailTab === 'realtime' && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem' }}>{t('patient.realtimeData')}</h4>
                  {wcPosition ? (
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                      <div className="stat-card"><div className="stat-content"><h3>{wcPosition.distance_m?.toFixed(2) || '0'} m</h3><p>Distance</p></div></div>
                      <div className="stat-card"><div className="stat-content"><h3>{wcPosition.speed_ms?.toFixed(2) || '0'} m/s</h3><p>Speed</p></div></div>
                      <div className="stat-card"><div className="stat-content"><h3>{wcPosition.rssi || '-'} dBm</h3><p>RSSI</p></div></div>
                      <div className="stat-card"><div className="stat-content"><h3>{wcPosition.room_name || 'Unknown'}</h3><p>Current Room</p></div></div>
                    </div>
                  ) : (
                    <div className="empty-state"><Accessibility size={32} /><h3>{t('patient.noWheelchair')}</h3></div>
                  )}
                </div>
              )}

              {detailTab === 'routines' && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem' }}>{t('patient.tab.routines')} ({patientRoutines.length})</h4>
                  {patientRoutines.length === 0 ? (
                    <div className="empty-state"><Calendar size={32} /><h3>{t('patient.noRoutines')}</h3></div>
                  ) : (
                    patientRoutines.map((r: any) => (
                      <div key={r.id} className="list-item" style={{ marginBottom: '0.5rem' }}>
                        <div className="list-item-content">
                          <div className="list-item-title">{r.title}</div>
                          <div className="list-item-subtitle">{r.time} • {r.room_name_en || r.room_name || 'No room'}</div>
                        </div>
                        <span className={`list-item-badge ${r.enabled ? 'online' : 'offline'}`}>{r.enabled ? 'Active' : 'Off'}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'analytics' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 style={{ margin: 0 }}>{t('admin.patients.healthScore')}</h4>
                    <button onClick={() => handleCalculateHealth(selectedPatient.id)}
                      style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.4rem 0.75rem', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                      <Heart size={14} /> {t('patient.calculateNow')}
                    </button>
                  </div>
                  {healthScores.length === 0 ? (
                    <div className="empty-state"><BarChart3 size={32} /><h3>{t('patient.noScoresYet')}</h3><p>{t('patient.generateScores')}</p></div>
                  ) : (
                    healthScores.map((hs: any, i: number) => (
                      <div key={i} className="list-item" style={{ marginBottom: '0.5rem' }}>
                        <div className="list-item-avatar" style={{
                          background: hs.score >= 70 ? 'var(--success-500)' : hs.score >= 40 ? 'var(--warning-500)' : 'var(--danger-500)', fontSize: '0.75rem'
                        }}>{hs.score}%</div>
                        <div className="list-item-content">
                          <div className="list-item-title">Health Score: {hs.score}/100</div>
                          <div className="list-item-subtitle">{new Date(hs.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'timeline' && (
                <div>
                  <h4 style={{ margin: '0 0 0.75rem' }}>{t('patient.tab.timeline')} ({patientTimeline.length})</h4>
                  {patientTimeline.length === 0 ? (
                    <div className="empty-state"><Clock size={32} /><h3>{t('patient.noEvents')}</h3></div>
                  ) : (
                    patientTimeline.map((ev: any) => (
                      <div key={ev.id} className="list-item" style={{ marginBottom: '0.5rem' }}>
                        <div className="list-item-avatar" style={{ fontSize: '0.6rem' }}>{ev.event_type === 'enter' ? '🚪' : ev.event_type === 'exit' ? '🚶' : '📌'}</div>
                        <div className="list-item-content">
                          <div className="list-item-title">{ev.description || ev.event_type}</div>
                          <div className="list-item-subtitle">{new Date(ev.timestamp).toLocaleString()} • {ev.to_room_name || ev.from_room_name || ''}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Patient Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', padding: '1.5rem', width: '90%', maxWidth: '500px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>{t('admin.patients.addPatient')}</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { key: 'name', label: 'Name (TH)', type: 'text' },
                { key: 'name_en', label: 'Name (EN)', type: 'text' },
                { key: 'age', label: 'Age', type: 'number' },
                { key: 'condition', label: 'Condition', type: 'text' },
                { key: 'notes', label: 'Notes', type: 'text' },
              ].map(f => (
                <input key={f.key} placeholder={f.label} type={f.type}
                  value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }} />
              ))}
              <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
                <option value="">{t('patient.gender')}</option>
                <option value="Male">{t('patient.gender.male')}</option>
                <option value="Female">{t('patient.gender.female')}</option>
                <option value="Other">{t('patient.gender.other')}</option>
              </select>
              <select value={form.wheelchair_id} onChange={e => setForm({ ...form, wheelchair_id: e.target.value })}
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }}>
                <option value="">{t('admin.patients.assignWheelchair')}</option>
                {wheelchairs.filter(w => !w.patient_id).map(w => <option key={w.id} value={w.id}>{w.name} ({w.id})</option>)}
              </select>
              <button onClick={handleCreate}
                style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {t('patient.createPatient')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
