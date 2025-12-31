import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Clock, Plus, Edit2, Trash2, Check, X, Save, Zap, Home, Power, PowerOff } from 'lucide-react';

// Default schedule items with actions and rooms
const DEFAULT_SCHEDULE = [
    { time: '07:00', title: 'Wake up', actions: [{ device: 'Alarm', state: 'on' }, { device: 'Light', state: 'on' }], room: 'Bedroom' },
    { time: '07:30', title: 'Morning exercise', actions: [], room: '' },
    { time: '08:00', title: 'Breakfast', actions: [], room: 'Kitchen' },
    { time: '09:00', title: 'Work', actions: [{ device: 'Light', state: 'on' }, { device: 'AC', state: 'on' }], room: 'Living room' },
    { time: '12:00', title: 'Lunch', actions: [], room: 'Kitchen' },
    { time: '13:00', title: 'Continue Working', actions: [{ device: 'Light', state: 'on' }, { device: 'AC', state: 'on' }], room: 'Living room' },
    { time: '18:00', title: 'Dinner', actions: [], room: 'Kitchen' },
    { time: '20:00', title: 'Relaxation time', actions: [], room: '' },
    { time: '22:00', title: 'Prepare for bed', actions: [{ device: 'AC', state: 'on' }, { device: 'Light', state: 'on' }], room: 'Bedroom' },
    { time: '23:00', title: 'Sleep', actions: [{ device: 'Light', state: 'off' }], room: 'Bedroom' },
];

// Room options for dropdown
const ROOM_OPTIONS = ['Bedroom', 'Living room', 'Kitchen', 'Bathroom'];

// Devices per room
const ROOM_DEVICES = {
    'Bedroom': ['Light', 'AC', 'Alarm', 'Fan'],
    'Living room': ['Light', 'AC', 'TV', 'Fan'],
    'Kitchen': ['Light'],
    'Bathroom': ['Light'],
    '': []
};

// Helper to format actions for display
const formatActions = (actions) => {
    if (!actions || actions.length === 0) return '';
    return actions.map(a => `Turn ${a.state} ${a.device}`).join(', ');
};

// Helper to convert actions array to description string
const actionsToDescription = (actions, room) => {
    if (!actions || actions.length === 0) return room || '';
    const actionStr = actions.map(a => `Turn ${a.state} ${room ? room.toLowerCase() + ' ' : ''}${a.device}`).join(' and ');
    return actionStr;
};

export function RoutinesPage() {
    const { routines, addRoutine, updateRoutine, deleteRoutine, patients, role, currentUser, language } = useApp();
    const { t } = useTranslation(language);
    const [selectedPatient, setSelectedPatient] = useState(role === 'user' ? currentUser?.id : 'all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ time: '', title: '', actions: [], room: '' });
    const [newRoutine, setNewRoutine] = useState({ time: '', title: '', actions: [], room: '', patientId: '' });
    const initializedRef = useRef(false);

    // Initialize default schedule for current user if routines are empty (only once)
    useEffect(() => {
        if (!initializedRef.current && currentUser?.id) {
            const userRoutines = routines.filter(r => r.patientId === currentUser?.id);
            if (userRoutines.length === 0) {
                initializedRef.current = true;
                // Add default schedule for current user
                DEFAULT_SCHEDULE.forEach((item, index) => {
                    addRoutine({
                        ...item,
                        id: `routine-default-${index}`,
                        patientId: currentUser.id,
                        completed: false,
                        action: formatActions(item.actions),
                        description: actionsToDescription(item.actions, item.room)
                    });
                });
            } else {
                initializedRef.current = true;
            }
        }
    }, [currentUser?.id]);

    // Filter routines based on role
    const filteredRoutines = role === 'user'
        ? routines.filter(r => r.patientId === currentUser?.id)
        : selectedPatient === 'all'
            ? routines
            : routines.filter(r => r.patientId === selectedPatient);

    // Remove duplicates by time+title combination
    const uniqueRoutines = filteredRoutines.reduce((acc, routine) => {
        const key = `${routine.time}-${routine.title}`;
        if (!acc.find(r => `${r.time}-${r.title}` === key)) {
            acc.push(routine);
        }
        return acc;
    }, []);

    const handleDeleteRoutine = (id) => {
        if (confirm(t('Do you want to delete this routine?'))) {
            deleteRoutine(id);
        }
    };

    const handleEditStart = (routine) => {
        setEditingId(routine.id);
        // Parse existing actions or create empty array
        const actions = routine.actions || [];
        setEditForm({
            time: routine.time,
            title: routine.title,
            actions: actions,
            room: routine.room || ''
        });
    };

    const handleEditSave = (id) => {
        const action = formatActions(editForm.actions);
        const description = actionsToDescription(editForm.actions, editForm.room);
        updateRoutine(id, { ...editForm, action, description });
        setEditingId(null);
        setEditForm({ time: '', title: '', actions: [], room: '' });
    };

    const handleEditCancel = () => {
        setEditingId(null);
        setEditForm({ time: '', title: '', actions: [], room: '' });
    };

    const handleAddRoutine = () => {
        if (!newRoutine.time || !newRoutine.title) {
            alert(t('Please enter time and activity name'));
            return;
        }
        const patientId = role === 'user' ? currentUser?.id : (newRoutine.patientId || patients[0]?.id);
        const action = formatActions(newRoutine.actions);
        const description = actionsToDescription(newRoutine.actions, newRoutine.room);
        addRoutine({ ...newRoutine, action, description, patientId, completed: false });
        setNewRoutine({ time: '', title: '', actions: [], room: '', patientId: '' });
        setShowAddModal(false);
    };

    // Get available devices for selected room
    const getDevicesForRoom = (room) => {
        return ROOM_DEVICES[room] || [];
    };

    // Add action to form
    const addAction = (formSetter) => {
        formSetter(prev => ({
            ...prev,
            actions: [...prev.actions, { device: '', state: 'on' }]
        }));
    };

    // Update action in form
    const updateAction = (formSetter, index, field, value) => {
        formSetter(prev => ({
            ...prev,
            actions: prev.actions.map((a, i) => i === index ? { ...a, [field]: value } : a)
        }));
    };

    // Remove action from form
    const removeAction = (formSetter, index) => {
        formSetter(prev => ({
            ...prev,
            actions: prev.actions.filter((_, i) => i !== index)
        }));
    };

    // Render action inputs
    const renderActionInputs = (form, formSetter, room) => {
        const devices = getDevicesForRoom(room);

        return (
            <div style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>{t('Actions')}</label>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => addAction(formSetter)}
                        disabled={!room}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    >
                        <Plus size={14} /> {t('Add Device')}
                    </button>
                </div>

                {form.actions.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.5rem', textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                        {room ? t('No actions. Click + Add Device to add.') : t('Select a room first')}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {form.actions.map((action, index) => (
                            <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                                {/* Device dropdown */}
                                <select
                                    className="form-input"
                                    value={action.device}
                                    onChange={(e) => updateAction(formSetter, index, 'device', e.target.value)}
                                    style={{ flex: 1 }}
                                >
                                    <option value="">{t('Select Device')}</option>
                                    {devices.map(device => (
                                        <option key={device} value={device}>{device}</option>
                                    ))}
                                </select>

                                {/* On/Off Toggle */}
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
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
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 500
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
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 500
                                        }}
                                    >
                                        <PowerOff size={12} /> OFF
                                    </button>
                                </div>

                                {/* Remove button */}
                                <button
                                    type="button"
                                    onClick={() => removeAction(formSetter, index)}
                                    style={{
                                        padding: '0.4rem',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--danger-500)',
                                        cursor: 'pointer'
                                    }}
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

    return (
        <div className="page-content">
            {/* Header with Add Button aligned */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2>📅 {role === 'user' ? t('My Schedule') : t('Routines')}</h2>
                    <p>{role === 'user' ? t('Your daily activities') : t('Manage patient daily activity schedules')}</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    <Plus size={16} /> {t('Add Activity')}
                </button>
            </div>

            {/* Admin patient filter only */}
            {role === 'admin' && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <span>{t('Patient')}:</span>
                        <select className="filter-select" value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)}>
                            <option value="all">{t('All')}</option>
                            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Clock size={18} /> {t('Activity Schedule')} ({uniqueRoutines.length})</span>
                </div>
                <div className="card-body">
                    {uniqueRoutines.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <h3>{t('No activities scheduled yet')}</h3>
                            <p>{t('Add a new activity to get started')}</p>
                        </div>
                    ) : (
                        <div className="schedule-container">
                            {uniqueRoutines.sort((a, b) => a.time.localeCompare(b.time)).map(routine => {
                                const patient = patients.find(p => p.id === routine.patientId);
                                const isEditing = editingId === routine.id;

                                return (
                                    <div key={routine.id} className="schedule-item" style={isEditing ? { flexDirection: 'column', alignItems: 'stretch' } : {}}>
                                        {isEditing ? (
                                            // Edit Mode - Full form
                                            <div style={{ width: '100%' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>{t('Time')}</label>
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
                                                    <div>
                                                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>{t('Activity')}</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            value={editForm.title}
                                                            onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                                            placeholder={t('Activity Name')}
                                                        />
                                                    </div>
                                                </div>
                                                <div style={{ marginBottom: '0.75rem' }}>
                                                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>{t('Room')}</label>
                                                    <select
                                                        className="form-input"
                                                        value={editForm.room}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, room: e.target.value, actions: [] }))}
                                                    >
                                                        <option value="">{t('Select Room (Optional)')}</option>
                                                        {ROOM_OPTIONS.map(room => (
                                                            <option key={room} value={room}>{room}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {renderActionInputs(editForm, setEditForm, editForm.room)}
                                                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                                    <button className="btn btn-secondary" onClick={handleEditCancel}>
                                                        <X size={16} /> {t('Cancel')}
                                                    </button>
                                                    <button className="btn btn-success" onClick={() => handleEditSave(routine.id)}>
                                                        <Check size={16} /> {t('Save')}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            // View Mode
                                            <>
                                                <div className="schedule-time">{routine.time}</div>
                                                <div className="schedule-details">
                                                    <div className="schedule-title">{t(routine.title)}</div>
                                                    <div className="schedule-desc" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                                        {routine.action && (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--warning-500)', fontSize: '0.8rem' }}>
                                                                <Zap size={12} /> {t(routine.action)}
                                                            </span>
                                                        )}
                                                        {routine.room && (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--info-500)', fontSize: '0.8rem' }}>
                                                                <Home size={12} /> {t(routine.room)}
                                                            </span>
                                                        )}
                                                        {role === 'admin' && patient && <span style={{ color: 'var(--primary-400)' }}> • {patient.name}</span>}
                                                    </div>
                                                </div>
                                                <div className="schedule-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                                                    <button className="btn btn-secondary btn-icon" onClick={() => handleEditStart(routine)}>
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button className="btn btn-danger btn-icon" onClick={() => handleDeleteRoutine(routine.id)}>
                                                        <Trash2 size={16} />
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
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t('Add New Activity')}</h3>
                            <button className="btn btn-icon" onClick={() => setShowAddModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Time')} *</label>
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
                                <label className="form-label">{t('Activity')} *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={t('e.g. Wake up, Breakfast, Work')}
                                    value={newRoutine.title}
                                    onChange={(e) => setNewRoutine(prev => ({ ...prev, title: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('Room')}</label>
                                <select
                                    className="form-input"
                                    value={newRoutine.room}
                                    onChange={(e) => setNewRoutine(prev => ({ ...prev, room: e.target.value, actions: [] }))}
                                >
                                    <option value="">{t('Select Room (Optional)')}</option>
                                    {ROOM_OPTIONS.map(room => (
                                        <option key={room} value={room}>{room}</option>
                                    ))}
                                </select>
                            </div>
                            {renderActionInputs(newRoutine, setNewRoutine, newRoutine.room)}
                            {role === 'admin' && (
                                <div className="form-group" style={{ marginTop: '1rem' }}>
                                    <label className="form-label">{t('Patient')}</label>
                                    <select
                                        className="form-input"
                                        value={newRoutine.patientId}
                                        onChange={(e) => setNewRoutine(prev => ({ ...prev, patientId: e.target.value }))}
                                    >
                                        <option value="">{t('Select Patient')}</option>
                                        {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                                {t('Cancel')}
                            </button>
                            <button className="btn btn-primary" onClick={handleAddRoutine}>
                                <Save size={16} /> {t('Save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
