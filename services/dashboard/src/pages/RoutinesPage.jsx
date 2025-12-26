import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Clock, Plus, Edit2, Trash2, Check, X, Bot, Sparkles, Save } from 'lucide-react';

export function RoutinesPage() {
    const { routines, addRoutine, updateRoutine, deleteRoutine, patients, role, currentUser, language } = useApp();
    const { t } = useTranslation(language);
    const [selectedPatient, setSelectedPatient] = useState(role === 'user' ? currentUser?.id : 'all');
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ time: '', title: '', description: '' });
    const [newRoutine, setNewRoutine] = useState({ time: '', title: '', description: '', patientId: '' });
    const [aiGenerating, setAiGenerating] = useState(false);

    // Filter routines based on role
    const filteredRoutines = role === 'user'
        ? routines.filter(r => r.patientId === currentUser?.id)
        : selectedPatient === 'all'
            ? routines
            : routines.filter(r => r.patientId === selectedPatient);

    const handleDeleteRoutine = (id) => {
        if (confirm(t('Do you want to delete this routine?'))) {
            deleteRoutine(id);
        }
    };

    const handleEditStart = (routine) => {
        setEditingId(routine.id);
        setEditForm({ time: routine.time, title: routine.title, description: routine.description });
    };

    const handleEditSave = (id) => {
        updateRoutine(id, editForm);
        setEditingId(null);
        setEditForm({ time: '', title: '', description: '' });
    };

    const handleEditCancel = () => {
        setEditingId(null);
        setEditForm({ time: '', title: '', description: '' });
    };

    const handleAddRoutine = () => {
        if (!newRoutine.time || !newRoutine.title) {
            alert(t('Please enter time and activity name'));
            return;
        }
        const patientId = role === 'user' ? currentUser?.id : (newRoutine.patientId || patients[0]?.id);
        addRoutine({ ...newRoutine, patientId, completed: false });
        setNewRoutine({ time: '', title: '', description: '', patientId: '' });
        setShowAddModal(false);
    };

    const handleToggleComplete = (id, currentStatus) => {
        updateRoutine(id, { completed: !currentStatus });
    };

    const handleAiGenerate = async () => {
        setAiGenerating(true);
        setTimeout(() => {
            const targetPatient = role === 'user' ? currentUser?.id : (selectedPatient !== 'all' ? selectedPatient : patients[0]?.id);
            const newRoutines = [
                { time: '09:00', title: 'Physical Therapy', description: 'Light exercise in living room', patientId: targetPatient, completed: false },
                { time: '15:00', title: 'Take Medicine', description: 'Daily medication', patientId: targetPatient, completed: false },
            ];
            newRoutines.forEach(r => addRoutine(r));
            setAiGenerating(false);
            alert(t('AI generated 2 new routines!'));
        }, 2000);
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📅 {role === 'user' ? t('My Schedule') : t('Routines')}</h2>
                <p>{role === 'user' ? t('Your daily activities') : t('Manage patient daily activity schedules')}</p>
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {role === 'admin' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{t('Patient')}:</span>
                            <select className="filter-select" value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)}>
                                <option value="all">{t('All')}</option>
                                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={handleAiGenerate} disabled={aiGenerating}>
                            <Sparkles size={16} />
                            {aiGenerating ? t('Generating...') : t('AI Generate Schedule')}
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                            <Plus size={16} /> {t('Add Activity')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Clock size={18} /> {t('Activity Schedule')} ({filteredRoutines.length})</span>
                </div>
                <div className="card-body">
                    {filteredRoutines.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <h3>{t('No activities scheduled yet')}</h3>
                            <p>{t('Add a new activity or let AI generate one')}</p>
                        </div>
                    ) : (
                        <div className="schedule-container">
                            {filteredRoutines.sort((a, b) => a.time.localeCompare(b.time)).map(routine => {
                                const patient = patients.find(p => p.id === routine.patientId);
                                const isEditing = editingId === routine.id;

                                return (
                                    <div key={routine.id} className={`schedule-item ${routine.completed ? 'completed' : ''}`}>
                                        {isEditing ? (
                                            // Edit Mode
                                            <>
                                                <input
                                                    type="time"
                                                    className="form-input"
                                                    value={editForm.time}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, time: e.target.value }))}
                                                    style={{ width: '100px' }}
                                                />
                                                <div className="schedule-details" style={{ flex: 1 }}>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={editForm.title}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                                        placeholder={t('Activity Name')}
                                                        style={{ marginBottom: '0.5rem' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        value={editForm.description}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                                        placeholder={t('Description')}
                                                    />
                                                </div>
                                                <div className="schedule-actions">
                                                    <button className="btn btn-success btn-icon" onClick={() => handleEditSave(routine.id)}>
                                                        <Check size={16} />
                                                    </button>
                                                    <button className="btn btn-secondary btn-icon" onClick={handleEditCancel}>
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            // View Mode
                                            <>
                                                <div className="schedule-time">{routine.time}</div>
                                                <div className="schedule-details">
                                                    <div className="schedule-title">{routine.title}</div>
                                                    <div className="schedule-desc">
                                                        {routine.description}
                                                        {role === 'admin' && patient && <span style={{ color: 'var(--primary-400)' }}> • {patient.name}</span>}
                                                    </div>
                                                </div>
                                                <div className="schedule-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={routine.completed}
                                                        onChange={() => handleToggleComplete(routine.id, routine.completed)}
                                                        style={{ width: 20, height: 20, cursor: 'pointer' }}
                                                    />
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

            {/* AI Analysis Section */}
            <div className="card" style={{ marginTop: '1rem' }}>
                <div className="card-header">
                    <span className="card-title"><Bot size={18} /> {t('AI Behavior Analysis')}</span>
                </div>
                <div className="card-body">
                    <div style={{
                        padding: '2rem',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                        borderRadius: 'var(--radius-lg)',
                        textAlign: 'center'
                    }}>
                        <Bot size={48} style={{ color: 'var(--primary-400)', marginBottom: '1rem' }} />
                        <h3 style={{ marginBottom: '0.5rem' }}>{t('AI Daily Data Analysis')}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            {role === 'user' ? t('The system will automatically analyze your activities and behavior.') : t('The system will automatically analyze patient activities and behavior.')}
                            <br />{t('If emergencies or unusual behavior are detected, alerts will be sent immediately.')}
                        </p>
                        <button className="btn btn-primary btn-lg">
                            <Sparkles size={18} /> {t('Start Analysis')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Add Routine Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t('Add New Activity')}</h3>
                            <button className="btn btn-icon" onClick={() => setShowAddModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('Time')}</label>
                                <input
                                    type="time"
                                    className="form-input"
                                    value={newRoutine.time}
                                    onChange={(e) => setNewRoutine(prev => ({ ...prev, time: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('Activity Name')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={t('e.g. Take Medicine, Physical Therapy')}
                                    value={newRoutine.title}
                                    onChange={(e) => setNewRoutine(prev => ({ ...prev, title: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('Description')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={t('Additional details')}
                                    value={newRoutine.description}
                                    onChange={(e) => setNewRoutine(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>
                            {role === 'admin' && (
                                <div className="form-group">
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
