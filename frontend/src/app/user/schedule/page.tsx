'use client';

import { useEffect, useState } from 'react';
import {
    Calendar, Plus, Edit3, Trash2, Save, X, Check, Clock
} from 'lucide-react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { getRoutines, createRoutine, updateRoutine, deleteRoutine } from '@/lib/api';

export default function UserSchedulePage() {
    const { currentUser } = useWheelSenseStore();
    const { t, language } = useTranslation();
    const [routines, setRoutines] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [form, setForm] = useState({ title: '', time: '08:00', description: '' });

    const fetchData = async () => {
        if (!currentUser) { setLoading(false); return; }
        const res = await getRoutines(currentUser.id);
        if (res.data) {
            const sorted = (res.data.routines || []).sort((a: any, b: any) => a.time.localeCompare(b.time));
            setRoutines(sorted);
        }
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreate = async () => {
        if (!form.title.trim()) return;
        await createRoutine({ patient_id: currentUser?.id, title: form.title, time: form.time, description: form.description || undefined });
        setShowAdd(false);
        setForm({ title: '', time: '08:00', description: '' });
        fetchData();
    };

    const handleUpdate = async () => {
        if (!editing) return;
        await updateRoutine(editing, form);
        setEditing(null);
        setForm({ title: '', time: '08:00', description: '' });
        fetchData();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this routine?')) return;
        await deleteRoutine(id);
        fetchData();
    };

    const startEdit = (r: any) => {
        setEditing(r.id);
        setForm({ title: r.title, time: r.time, description: r.description || '' });
    };

    const now = new Date().toTimeString().slice(0, 5);

    if (loading) return <div className="empty-state" style={{ height: '80vh' }}><div className="loading-spinner" /><h3>{t('common.loading')}</h3></div>;

    return (
        <div style={{ maxWidth: '100%', margin: '0 auto' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={24} /> Routines</h2>
                <p>Manage patient daily activity schedules</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginBottom: '0.8rem' }}>
                <button className="btn btn-secondary" onClick={fetchData}>Reset Schedule</button>
                <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditing(null); }}>
                    <Plus size={16} /> Add Activity
                </button>
            </div>

            {(showAdd || editing) && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--bg-tertiary)', marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem' }}>{editing ? t('schedule.editRoutine') : t('schedule.newRoutine')}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <input placeholder={t('schedule.titlePlaceholder')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }} />
                        <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }} />
                        <input placeholder={t('schedule.descPlaceholder')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.5rem' }} />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={editing ? handleUpdate : handleCreate}
                                style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer' }}>
                                <Save size={14} style={{ display: 'inline', marginRight: '4px' }} /> {editing ? t('common.update') : t('common.create')}
                            </button>
                            <button onClick={() => { setShowAdd(false); setEditing(null); setForm({ title: '', time: '08:00', description: '' }); }}
                                style={{ background: 'var(--border-color)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer' }}>{t('common.cancel')}</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="list-container">
                <div className="list-header">
                    <span className="list-title"><Clock size={16} /> Activity Schedule ({routines.length})</span>
                </div>
                <div className="list-body" style={{ padding: '0.8rem' }}>
                    {routines.length === 0 ? (
                        <div className="empty-state"><Calendar size={48} /><h3>{t('schedule.noRoutines')}</h3><p>{t('schedule.addFirstRoutine')}</p></div>
                    ) : (
                        routines.map(r => {
                            const isPast = r.time <= now;
                            return (
                                <div key={r.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                    borderRadius: '10px', padding: '0.8rem 0.9rem', marginBottom: '0.55rem', opacity: isPast ? 0.65 : 1
                                }}>
                                    <div style={{ minWidth: 74, fontWeight: 800, color: 'var(--primary-400)', fontSize: '1.05rem' }}>{r.time}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, textDecoration: isPast ? 'line-through' : 'none' }}>{r.title}</div>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.description || ''}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <button className="btn btn-icon" onClick={() => startEdit(r)}><Edit3 size={14} /></button>
                                        <button className="btn btn-danger btn-icon" onClick={() => handleDelete(r.id)}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
