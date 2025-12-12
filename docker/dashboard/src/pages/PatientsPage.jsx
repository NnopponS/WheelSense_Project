import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Users, Plus, Edit2, Trash2, X, Accessibility, MapPin } from 'lucide-react';

export function PatientsPage() {
    const { patients, setPatients, wheelchairs, setWheelchairs, openDrawer, role } = useApp();
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingPatient, setEditingPatient] = useState(null);
    const [activeTab, setActiveTab] = useState('patients');

    const handleDeletePatient = (id) => {
        if (confirm('คุณต้องการลบข้อมูลผู้ป่วยนี้?')) {
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
            <div className="page-header">
                <h2>👥 Wheelchairs & Patients</h2>
                <p>จัดการข้อมูลรถเข็นและผู้ป่วย</p>
            </div>

            <div className="tabs">
                <button className={`tab ${activeTab === 'patients' ? 'active' : ''}`} onClick={() => setActiveTab('patients')}>
                    ผู้ป่วย ({patients.length})
                </button>
                <button className={`tab ${activeTab === 'wheelchairs' ? 'active' : ''}`} onClick={() => setActiveTab('wheelchairs')}>
                    Wheelchairs ({wheelchairs.length})
                </button>
            </div>

            {activeTab === 'patients' && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Users size={18} /> รายชื่อผู้ป่วย</span>
                        {role === 'admin' && (
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <Plus size={16} /> เพิ่มผู้ป่วย
                            </button>
                        )}
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ชื่อ</th>
                                    <th>อายุ</th>
                                    <th>สถานะ</th>
                                    <th>Wheelchair</th>
                                    <th>ห้องปัจจุบัน</th>
                                    {role === 'admin' && <th>Actions</th>}
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
                                            <td>{patient.age} ปี</td>
                                            <td>
                                                <span className={`list-item-badge ${patient.condition === 'ปกติ' ? 'normal' : 'warning'}`}>
                                                    {patient.condition}
                                                </span>
                                            </td>
                                            <td>{wc?.name || '-'}</td>
                                            <td>{patient.room || '-'}</td>
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
                        <span className="card-title"><Accessibility size={18} /> รายการ Wheelchair</span>
                        {role === 'admin' && (
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <Plus size={16} /> เพิ่ม Wheelchair
                            </button>
                        )}
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>ชื่อ</th>
                                    <th>ผู้ใช้งาน</th>
                                    <th>ตำแหน่ง</th>
                                    <th>สถานะ</th>
                                    {role === 'admin' && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {wheelchairs.map(wc => (
                                    <tr key={wc.id}>
                                        <td><code>{wc.id}</code></td>
                                        <td>{wc.name}</td>
                                        <td>{wc.patientName || <span style={{ color: 'var(--dark-text-muted)' }}>ไม่มีผู้ใช้</span>}</td>
                                        <td>{wc.room || '-'}</td>
                                        <td>
                                            <span className={`list-item-badge ${wc.status}`}>
                                                {wc.status === 'online' || wc.status === 'normal' ? 'ปกติ' : wc.status === 'warning' ? 'ระวัง' : wc.status === 'alert' ? 'ฉุกเฉิน' : 'Offline'}
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
