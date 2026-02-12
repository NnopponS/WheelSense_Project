'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import {
  getPatients, Patient, getRoutines, createRoutine, updateRoutine,
  deleteRoutine, resetRoutines, RoutineApi, getRooms, Room
} from '@/lib/api';
import {
  Clock, Plus, Edit2, Trash2, Check, X, Save, Zap,
  Home, Power, PowerOff, RotateCcw, RefreshCw, Calendar
} from 'lucide-react';

interface DeviceAction {
  device: string;
  state: string;
}

const formatActions = (actions: DeviceAction[]) => {
  if (!actions || actions.length === 0) return '';
  return actions.map(a => `Turn ${a.state} ${a.device}`).join(', ');
};

export default function RoutinesPage() {
  const { role } = useWheelSenseStore();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [routines, setRoutines] = useState<RoutineApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ time: '', title: '', actions: [] as DeviceAction[], room_id: '' });
  const [newRoutine, setNewRoutine] = useState({ time: '', title: '', actions: [] as DeviceAction[], room_id: '', patient_id: '' });
  const [saving, setSaving] = useState(false);

  // Device options per room type
  const ROOM_DEVICES: Record<string, string[]> = {
    'bedroom': ['Light', 'AC', 'Alarm', 'Fan'],
    'living-room': ['Light', 'AC', 'TV', 'Fan'],
    'kitchen': ['Light'],
    'bathroom': ['Light'],
  };

  const getDevicesForRoom = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return [];
    // Try matching by room id directly, then by common names
    return ROOM_DEVICES[roomId] || ROOM_DEVICES[room.name?.toLowerCase()] || ['Light', 'AC', 'Fan'];
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [patientsRes, routinesRes, roomsRes] = await Promise.all([
        getPatients(),
        getRoutines(selectedPatient !== 'all' ? selectedPatient : undefined),
        getRooms(),
      ]);
      if (patientsRes.data) setPatients(patientsRes.data.patients);
      if (routinesRes.data) setRoutines(routinesRes.data.routines);
      if (roomsRes.data) setRooms(roomsRes.data.rooms);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
    setLoading(false);
  }, [selectedPatient]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleResetSchedule = async () => {
    if (!confirm('Reset schedule to defaults? This will clear all changes.')) return;
    setSaving(true);
    const res = await resetRoutines(selectedPatient !== 'all' ? selectedPatient : undefined);
    if (res.data?.routines) setRoutines(res.data.routines);
    else await loadData();
    setSaving(false);
  };

  const handleDeleteRoutine = async (id: string) => {
    if (!confirm('Do you want to delete this routine?')) return;
    setSaving(true);
    await deleteRoutine(id);
    setRoutines(prev => prev.filter(r => r.id !== id));
    setSaving(false);
  };

  const handleEditStart = (routine: RoutineApi) => {
    setEditingId(routine.id);
    setEditForm({
      time: routine.time,
      title: routine.title,
      actions: routine.actions ? [...routine.actions] : [],
      room_id: routine.room_id || '',
    });
  };

  const handleEditSave = async (id: string) => {
    setSaving(true);
    const res = await updateRoutine(id, {
      title: editForm.title,
      time: editForm.time,
      room_id: editForm.room_id || undefined,
      actions: editForm.actions,
    });
    if (res.data) {
      setRoutines(prev => prev.map(r => r.id === id ? res.data! : r));
    }
    setEditingId(null);
    setSaving(false);
  };

  const handleAddRoutine = async () => {
    if (!newRoutine.time || !newRoutine.title) {
      alert('Please enter time and activity name');
      return;
    }
    setSaving(true);
    const res = await createRoutine({
      title: newRoutine.title,
      time: newRoutine.time,
      room_id: newRoutine.room_id || undefined,
      actions: newRoutine.actions,
      patient_id: newRoutine.patient_id || undefined,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    });
    if (res.data) {
      setRoutines(prev => [...prev, res.data!].sort((a, b) => a.time.localeCompare(b.time)));
    }
    setNewRoutine({ time: '', title: '', actions: [], room_id: '', patient_id: '' });
    setShowAddModal(false);
    setSaving(false);
  };

  const addAction = (setter: React.Dispatch<React.SetStateAction<typeof editForm>>) => {
    setter(prev => ({
      ...prev,
      actions: [...prev.actions, { device: '', state: 'on' }]
    }));
  };

  const updateAction = (setter: React.Dispatch<React.SetStateAction<typeof editForm>>, index: number, field: string, value: string) => {
    setter(prev => ({
      ...prev,
      actions: prev.actions.map((a, i) => i === index ? { ...a, [field]: value } : a)
    }));
  };

  const removeAction = (setter: React.Dispatch<React.SetStateAction<typeof editForm>>, index: number) => {
    setter(prev => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index)
    }));
  };

  const displayRoutines = routines;

  const renderActionInputs = (form: typeof editForm, formSetter: React.Dispatch<React.SetStateAction<typeof editForm>>) => {
    const devices = form.room_id ? getDevicesForRoom(form.room_id) : [];
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <label className="form-label" style={{ margin: 0 }}>Actions</label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => addAction(formSetter)}
            disabled={!form.room_id}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
          >
            <Plus size={14} /> Add Device
          </button>
        </div>
        {form.actions.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.75rem', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
            {form.room_id ? 'No actions. Click + Add Device to add.' : 'Select a room first'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {form.actions.map((action, index) => (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                <select
                  className="form-input"
                  value={action.device}
                  onChange={(e) => updateAction(formSetter, index, 'device', e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Select Device</option>
                  {devices.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '0' }}>
                  <button
                    type="button"
                    onClick={() => updateAction(formSetter, index, 'state', 'on')}
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      background: action.state === 'on' ? 'var(--success-500)' : 'var(--bg-secondary)',
                      color: action.state === 'on' ? 'white' : 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      fontSize: '0.75rem', fontWeight: 500
                    }}
                  >
                    <Power size={12} /> ON
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAction(formSetter, index, 'state', 'off')}
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                      border: '1px solid var(--border-color)',
                      borderLeft: 'none',
                      background: action.state === 'off' ? 'var(--danger-500)' : 'var(--bg-secondary)',
                      color: action.state === 'off' ? 'white' : 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.25rem',
                      fontSize: '0.75rem', fontWeight: 500
                    }}
                  >
                    <PowerOff size={12} /> OFF
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeAction(formSetter, index)}
                  style={{ padding: '0.4rem', background: 'transparent', border: 'none', color: 'var(--danger-500)', cursor: 'pointer' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>📅 {role === 'user' ? 'My Schedule' : 'Routines'}</h2>
          <p>{role === 'user' ? 'Your daily activities' : 'Manage patient daily activity schedules'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={handleResetSchedule} disabled={saving}>
            <RotateCcw size={14} /> Reset
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Add Activity
          </button>
        </div>
      </div>

      {/* Admin patient filter */}
      {role === 'admin' && patients.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>Patient:</span>
            <select
              className="form-input"
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="all">All</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Schedule Card */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Clock size={18} /> Activity Schedule ({displayRoutines.length})</span>
        </div>
        <div className="card-body">
          {displayRoutines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Clock size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3>No activities scheduled yet</h3>
              <p>Add a new activity to get started</p>
            </div>
          ) : (
            <div className="schedule-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {displayRoutines.map(routine => {
                const isEditing = editingId === routine.id;

                return (
                  <div
                    key={routine.id}
                    className="schedule-item"
                    style={{
                      display: 'flex',
                      alignItems: isEditing ? 'stretch' : 'center',
                      flexDirection: isEditing ? 'column' : 'row',
                      gap: '1rem',
                      padding: '1rem',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      borderLeft: '4px solid var(--primary-500)',
                      transition: '0.2s'
                    }}
                  >
                    {isEditing ? (
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Time</label>
                            <input
                              type="text"
                              className="form-input"
                              value={editForm.time}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9:]/g, '');
                                if (val.length <= 5) setEditForm(prev => ({ ...prev, time: val }));
                              }}
                              placeholder="HH:MM"
                              maxLength={5}
                              style={{ textAlign: 'center' }}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Activity</label>
                            <input
                              type="text"
                              className="form-input"
                              value={editForm.title}
                              onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                              placeholder="Activity Name"
                            />
                          </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                          <label className="form-label" style={{ fontSize: '0.75rem' }}>Room</label>
                          <select
                            className="form-input"
                            value={editForm.room_id}
                            onChange={(e) => setEditForm(prev => ({ ...prev, room_id: e.target.value, actions: [] }))}
                          >
                            <option value="">Select Room (Optional)</option>
                            {rooms.map(r => <option key={r.id} value={r.id}>{r.name_en || r.name}</option>)}
                          </select>
                        </div>
                        {renderActionInputs(editForm, setEditForm)}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                          <button className="btn btn-secondary" onClick={() => setEditingId(null)}>
                            <X size={16} /> Cancel
                          </button>
                          <button className="btn btn-success" onClick={() => handleEditSave(routine.id)} disabled={saving}>
                            <Check size={16} /> Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          fontWeight: 700,
                          fontSize: '1.1rem',
                          color: 'var(--primary-500)',
                          minWidth: '60px'
                        }}>
                          {routine.time}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{routine.title}</div>
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {formatActions(routine.actions || []) && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--warning-500)', fontSize: '0.8rem' }}>
                                <Zap size={12} /> {formatActions(routine.actions || [])}
                              </span>
                            )}
                            {(routine.room_name || routine.room_name_en) && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--info-500)', fontSize: '0.8rem' }}>
                                <Home size={12} /> {routine.room_name_en || routine.room_name}
                              </span>
                            )}
                            {role === 'admin' && routine.patient_name && (
                              <span style={{ color: 'var(--primary-400)', fontSize: '0.8rem' }}>• {routine.patient_name}</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button
                            className="btn btn-secondary btn-icon"
                            onClick={() => handleEditStart(routine)}
                            style={{ padding: '0.4rem' }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="btn btn-danger btn-icon"
                            onClick={() => handleDeleteRoutine(routine.id)}
                            style={{ padding: '0.4rem' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Routine Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowAddModal(false)}>
          <div className="card" style={{ maxWidth: '500px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title"><Plus size={18} /> Add New Activity</span>
              <button className="btn btn-icon" onClick={() => setShowAddModal(false)} style={{ padding: '0.25rem', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Time *</label>
                <input
                  type="text"
                  className="form-input"
                  value={newRoutine.time}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9:]/g, '');
                    if (val.length <= 5) setNewRoutine(prev => ({ ...prev, time: val }));
                  }}
                  placeholder="HH:MM"
                  maxLength={5}
                  style={{ textAlign: 'center' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Activity *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Wake up, Breakfast, Work"
                  value={newRoutine.title}
                  onChange={(e) => setNewRoutine(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Room</label>
                <select
                  className="form-input"
                  value={newRoutine.room_id}
                  onChange={(e) => setNewRoutine(prev => ({ ...prev, room_id: e.target.value, actions: [] }))}
                >
                  <option value="">Select Room (Optional)</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name_en || r.name}</option>)}
                </select>
              </div>
              {renderActionInputs(newRoutine, setNewRoutine as React.Dispatch<React.SetStateAction<typeof editForm>>)}
              {role === 'admin' && patients.length > 0 && (
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">Patient</label>
                  <select
                    className="form-input"
                    value={newRoutine.patient_id}
                    onChange={(e) => setNewRoutine(prev => ({ ...prev, patient_id: e.target.value }))}
                  >
                    <option value="">Select Patient</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddRoutine} disabled={saving}>
                <Save size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
