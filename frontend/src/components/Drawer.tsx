'use client';

import React from 'react';
import { useWheelSenseStore } from '@/store';
import {
    X, Accessibility, MapPin, Video, User, Power,
    Lightbulb, Thermometer, Tv, Fan
} from 'lucide-react';

export default function Drawer() {
    const {
        drawerOpen, drawerContent, closeDrawer,
        rooms, appliances, toggleAppliance
    } = useWheelSenseStore();

    if (!drawerOpen || !drawerContent) return null;

    const { type, data } = drawerContent;

    const getApplianceIcon = (appType: string) => {
        switch (appType) {
            case 'light': return Lightbulb;
            case 'AC': return Thermometer;
            case 'tv': return Tv;
            case 'fan': return Fan;
            default: return Power;
        }
    };

    return (
        <>
            {/* Overlay */}
            <div className="drawer-overlay" onClick={closeDrawer} />

            {/* Drawer Panel */}
            <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
                {/* Header */}
                <div className="drawer-header">
                    <h2 className="drawer-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {type === 'wheelchair' && <><Accessibility size={20} /> Wheelchair Details</>}
                        {type === 'room' && <><MapPin size={20} /> Room Details</>}
                        {type === 'patient' && <><User size={20} /> Patient Details</>}
                    </h2>
                    <button className="drawer-close" onClick={closeDrawer}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="drawer-body">

                    {/* Wheelchair Content */}
                    {type === 'wheelchair' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div className="stat-icon primary" style={{
                                    width: '80px', height: '80px', borderRadius: '50%',
                                    margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Accessibility size={40} />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>{data.name}</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{data.id}</p>
                                <span className={`list-item-badge ${data.status === 'online' || data.status === 'normal' ? 'online' : 'offline'}`}
                                    style={{ marginTop: '0.75rem', display: 'inline-block' }}>
                                    {data.status}
                                </span>
                            </div>

                            <div className="card">
                                <div className="card-header">
                                    <span className="card-title"><User size={16} /> User</span>
                                </div>
                                <div className="card-body">
                                    {data.patientName ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div className="list-item-avatar">{data.patientName.charAt(0)}</div>
                                            <div>
                                                <div style={{ fontWeight: 500 }}>{data.patientName}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {data.patientId}</div>
                                            </div>
                                        </div>
                                    ) : (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No User Assigned</p>
                                    )}
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-header">
                                    <span className="card-title"><MapPin size={16} /> Location</span>
                                </div>
                                <div className="card-body">
                                    <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--primary-500)' }}>
                                        {data.currentRoom
                                            ? (rooms.find(r => r.id === data.currentRoom)?.nameEn || data.currentRoom)
                                            : 'Unknown Location'}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                        Last seen: {data.lastSeen ? new Date(data.lastSeen).toLocaleTimeString() : 'Never'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Room Content */}
                    {type === 'room' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: '80px', height: '80px', margin: '0 auto 1rem',
                                    background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-xl)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem'
                                }}>
                                    🏠
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>{data.nameEn || data.name}</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{data.roomType}</p>
                            </div>

                            {/* Video Feed Placeholder */}
                            <div className="video-stream">
                                <div className="video-stream-placeholder">
                                    <Video size={48} />
                                    <p>Live Camera Feed</p>
                                    <p style={{ fontSize: '0.75rem' }}>(Waiting for stream...)</p>
                                </div>
                                <div className="video-overlay">
                                    <span className="video-live-badge">LIVE</span>
                                </div>
                            </div>

                            {/* Appliances */}
                            <div className="card">
                                <div className="card-header">
                                    <span className="card-title"><Power size={16} /> Appliances</span>
                                </div>
                                <div className="card-body">
                                    <div className="device-grid">
                                        {(appliances[data.id] || []).length > 0 ? (
                                            appliances[data.id].map(app => {
                                                const Icon = getApplianceIcon(app.type);
                                                return (
                                                    <div
                                                        key={app.id}
                                                        className={`device-card ${app.state ? 'active' : ''}`}
                                                        onClick={() => toggleAppliance(data.id, app.id)}
                                                    >
                                                        <div className="device-icon">
                                                            <Icon size={24} />
                                                        </div>
                                                        <span className="device-name">{app.name}</span>
                                                        <span className="device-status">{app.state ? 'ON' : 'OFF'}</span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="empty-state" style={{ gridColumn: 'span 2' }}>
                                                <Power size={32} />
                                                <h3>No appliances</h3>
                                                <p>No appliances controlled in this room</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </>
    );
}
