import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { TranslationLoadingIndicator } from '../components/TranslationLoadingIndicator';
import { preloadPageStrings } from '../i18n/translate';
import { Users, Plus, Edit2, Trash2, X, Accessibility, MapPin } from 'lucide-react';

export function PatientsPage() {
    const { patients, setPatients, wheelchairs, setWheelchairs, openDrawer, role, rooms, language } = useApp();
    const { t, hasPending } = useTranslation(language);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingPatient, setEditingPatient] = useState(null);
    const [activeTab, setActiveTab] = useState('patients');

    // Warm-up: Preload page-specific strings when TH is selected
    useEffect(() => {
        if (language === 'th') {
            const pageStrings = [
                'Wheelchairs & Patients',
                'Manage wheelchairs and patients',
                'Patients',
                'Wheelchairs',
                'Patient List',
                'Add Patient',
                'Add Wheelchair',
                'Wheelchair List',
                'Name',
                'Age',
                'Status',
                'Wheelchair',
                'Current Room',
                'Actions',
                'User',
                'Location',
                'years old',
                'Normal',
                'Warning',
                'Emergency',
                'Offline',
                'No User',
                'Do you want to delete this patient?',
            ];
            preloadPageStrings(pageStrings, language);
        }
    }, [language]);

    const handleDeletePatient = (id) => {
        if (confirm(t('Do you want to delete this patient?'))) {
            setPatients(prev => prev.filter(p => p.id !== id));
        }
    };

    const handleAssignWheelchair = (patientId, wheelchairId) => {
        // Unassign from previous patient
        setWheelchairs(prev => prev.map(wc => wc.id === wheelchairId ? { ...wc, patientId, patientName: patients.find(p => p.id === patientId)?.name } : wc));
        setPatients(prev => prev.map(p => p.id === patientId ? { ...p, wheelchairId } : p));
    };

    return (
        <div className="page-content">
            <TranslationLoadingIndicator isPending={hasPending && language === 'th'} />
            <div className="page-header">
                <h2>👥 {t('Wheelchairs & Patients')}</h2>
                <p>{t('Manage wheelchairs and patients')}</p>
            </div>

            {/* Tabs for switching between patients and wheelchairs */}
            <div className="tabs">
                <button className={`tab ${activeTab === 'patients' ? 'active' : ''}`} onClick={() => setActiveTab('patients')}>
                    {t('Patients')} ({patients.length})
                </button>
                <button className={`tab ${activeTab === 'wheelchairs' ? 'active' : ''}`} onClick={() => setActiveTab('wheelchairs')}>
                    {t('Wheelchairs')} ({wheelchairs.length})
                </button>
            </div>

            {activeTab === 'patients' && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Users size={18} /> {t('Patient List')}</span>
                        {role === 'admin' && (
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <Plus size={16} /> {t('Add Patient')}
                            </button>
                        )}
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>{t('Name')}</th>
                                    <th>{t('Age')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Wheelchair')}</th>
                                    <th>{t('Current Room')}</th>
                                    {role === 'admin' && <th>{t('Actions')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {patients.map(patient => {
                                    const wc = wheelchairs.find(w => w.id === patient.wheelchairId);
                                    return (
                                        <tr key={patient.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <div className="list-item-avatar" style={{ width: 36, height: 36, fontSize: '0.8rem' }}>{patient.avatar}</div>
                                                    <span>{patient.name}</span>
                                                </div>
                                            </td>
                                            <td>{patient.age} {t('years old')}</td>
                                            <td>
                                                <span className={`list-item-badge ${patient.condition === 'Normal' ? 'normal' : 'warning'}`}>
                                                    {t(patient.condition)}
                                                </span>
                                            </td>
                                            <td>{wc?.name || '-'}</td>
                                            <td>{patient.room ? (rooms.find(r => r.id === patient.room)?.nameEn || rooms.find(r => r.id === patient.room)?.name || patient.room) : '-'}</td>
                                            {role === 'admin' && (
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button className="btn btn-secondary btn-icon" onClick={() => openDrawer({ type: 'patient-edit', data: patient })}>
                                                            <Edit2 size={16} />
                                                        </button>
                                                        <button className="btn btn-danger btn-icon" onClick={() => handleDeletePatient(patient.id)}>
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'wheelchairs' && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Accessibility size={18} /> {t('Wheelchair List')}</span>
                        {role === 'admin' && (
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <Plus size={16} /> {t('Add Wheelchair')}
                            </button>
                        )}
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>{t('ID')}</th>
                                    <th>{t('Name')}</th>
                                    <th>{t('User')}</th>
                                    <th>{t('Location')}</th>
                                    <th>{t('Status')}</th>
                                    {role === 'admin' && <th>{t('Actions')}</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {wheelchairs.map(wc => (
                                    <tr key={wc.id}>
                                        <td><code>{wc.id}</code></td>
                                        <td>{wc.name}</td>
                                        <td>{wc.patientName || <span style={{ color: 'var(--dark-text-muted)' }}>{t('No User')}</span>}</td>
                                        <td>{wc.room ? (rooms.find(r => r.id === wc.room)?.nameEn || rooms.find(r => r.id === wc.room)?.name || wc.room) : '-'}</td>
                                        <td>
                                            <span className={`list-item-badge ${wc.status}`}>
                                                {wc.status === 'online' || wc.status === 'normal' ? t('Normal') : wc.status === 'warning' ? t('Warning') : wc.status === 'alert' ? t('Emergency') : t('Offline')}
                                            </span>
                                        </td>
                                        {role === 'admin' && (
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-secondary btn-icon" onClick={() => openDrawer({ type: 'wheelchair-edit', data: wc })}>
                                                        <Edit2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
