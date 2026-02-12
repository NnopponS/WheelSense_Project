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
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Calendar size={24} /> {t('schedule.title')}</h2>
                <button onClick={() => { setShowAdd(true); setEditing(null); }}
                    style={{ background: 'var(--primary-500)', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={16} /> {t('schedule.addRoutine')}
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
                <div className="list-body">
                    {routines.length === 0 ? (
                        <div className="empty-state"><Calendar size={48} /><h3>{t('schedule.noRoutines')}</h3><p>{t('schedule.addFirstRoutine')}</p></div>
                    ) : (
                        routines.map(r => {
                            const isPast = r.time <= now;
                            return (
                                <div key={r.id} className="list-item" style={{ padding: '0.75rem', opacity: isPast ? 0.6 : 1 }}>
                                    <div className="list-item-avatar" style={{ background: isPast ? 'var(--success-500)' : 'var(--primary-500)', fontSize: '0.75rem' }}>
                                        {isPast ? <Check size={18} /> : <Clock size={18} />}
                                    </div>
                                    <div className="list-item-content">
                                        <div className="list-item-title" style={{ textDecoration: isPast ? 'line-through' : 'none' }}>{r.title}</div>
                                        <div className="list-item-subtitle">{r.time} {r.description ? `• ${r.description}` : ''}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', color: 'var(--primary-400)', cursor: 'pointer' }}><Edit3 size={16} /></button>
                                        <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-400)', cursor: 'pointer' }}><Trash2 size={16} /></button>
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
