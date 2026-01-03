import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import {
    Zap, Lightbulb, Thermometer, Tv, Fan, Power, Wind, Droplets,
    ChevronRight, Home, Moon, Sun, Film
} from 'lucide-react';

export function ApplianceControlPage() {
    const { rooms, appliances, toggleAppliance, setApplianceValue, role, currentUser, language } = useApp();
    const { t } = useTranslation(language);
    // Default to user's room if user mode, but allow changing to other rooms
    const defaultRoom = role === 'user' ? (currentUser?.room || 'bedroom') : 'bedroom';
    const [selectedRoom, setSelectedRoom] = useState(defaultRoom);

    const roomAppliances = appliances[selectedRoom] || [];

    // Allow user to see and select all rooms
    const safeRooms = rooms || [];
    const availableRooms = safeRooms;

    const getApplianceIcon = (type) => {
        switch (type) {
            case 'light': return Lightbulb;
            case 'AC': return Thermometer;
            case 'tv': return Tv;
            case 'fan': return Fan;
            case 'heater': return Droplets;
            case 'curtain': return Wind;
            default: return Power;
        }
    };

    const scenes = [
        { id: 'morning', name: t('Wake Up'), icon: Sun, color: 'var(--warning-500)', description: t('Turn on light, turn off AC, open curtain') },
        { id: 'sleep', name: t('Sleep'), icon: Moon, color: 'var(--primary-500)', description: t('Turn off light, turn on AC, close curtain') },
        { id: 'movie', name: t('Watch Movie'), icon: Film, color: 'var(--info-500)', description: t('Dim light, turn on TV') },
        { id: 'away', name: t('Away'), icon: Home, color: 'var(--success-500)', description: t('Turn off everything') },
    ];

    const handleSceneActivate = (sceneId) => {
        // Simulate scene activation
        if (sceneId === 'sleep') {
            if (appliances[selectedRoom]) {
                appliances[selectedRoom].forEach(app => {
                    if (app.type === 'light' && app.state) toggleAppliance(selectedRoom, app.id);
                    if (app.type === 'AC' && !app.state) toggleAppliance(selectedRoom, app.id);
                });
            }
        }
        // Add more scene logic here
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>⚡ {t('Appliance Control')}</h2>
                <p>{t('Control appliances in all rooms')}</p>
            </div>

            {/* Room Selector - Show for all users */}
            <div className="tabs" style={{ marginBottom: '1.5rem' }}>
                {availableRooms.map(room => {
                    const isUserHere = currentUser?.room &&
                        (currentUser.room.toLowerCase() === room.id.toLowerCase() ||
                            currentUser.room.toLowerCase() === room.roomType?.toLowerCase() ||
                            currentUser.room.toLowerCase().replace(/\s+/g, '') === room.id.toLowerCase().replace(/\s+/g, ''));

                    return (
                        <button
                            key={room.id}
                            className={`tab ${selectedRoom === room.id ? 'active' : ''}`}
                            onClick={() => setSelectedRoom(room.id)}
                            style={{
                                position: 'relative',
                                ...(isUserHere ? {
                                    borderColor: 'var(--success-500)',
                                    boxShadow: '0 0 8px var(--success-500)'
                                } : {})
                            }}
                        >
                            {room.nameEn || room.name}
                            {isUserHere && (
                                <span style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    width: '8px',
                                    height: '8px',
                                    background: 'var(--success-500)',
                                    borderRadius: '50%'
                                }} title="You are here" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Scene Presets */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Power size={18} /> {t('Scene Presets')}</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
                        {scenes.map(scene => (
                            <div
                                key={scene.id}
                                className="device-card"
                                onClick={() => handleSceneActivate(scene.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="device-icon" style={{ background: scene.color }}>
                                    <scene.icon size={24} color="white" />
                                </div>
                                <div className="device-name">{scene.name}</div>
                                <div className="device-status" style={{ fontSize: '0.7rem' }}>{scene.description}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Room Info */}
            {rooms.find(r => r.id === selectedRoom) && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="card-body" style={{ display: 'flex', justifyContent: 'space-around', padding: '1rem' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--info-500)' }}>
                                {rooms.find(r => r.id === selectedRoom)?.temperature}°C
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('Temperature')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--info-500)' }}>
                                {rooms.find(r => r.id === selectedRoom)?.humidity}%
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('Humidity')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-500)' }}>
                                {roomAppliances.filter(a => a.state).length}/{roomAppliances.length}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('On')}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Appliance Grid */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Zap size={18} /> {rooms.find(r => r.id === selectedRoom)?.name}</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                        roomAppliances.forEach(app => {
                            if (app.state) toggleAppliance(selectedRoom, app.id);
                        });
                    }}>
                        {t('Turn All Off')}
                    </button>
                </div>
                <div className="card-body">
                    {roomAppliances.length === 0 ? (
                        <div className="empty-state">
                            <Zap size={48} />
                            <h3>{t('No Devices Found')}</h3>
                            <p>{t('No Appliances in This Room')}</p>
                        </div>
                    ) : (
                        <div className="room-panel">
                            {roomAppliances.map(app => {
                                const Icon = getApplianceIcon(app.type);
                                return (
                                    <div key={app.id} className="room-panel-item">
                                        <h4>
                                            <Icon size={18} />
                                            {app.name}
                                        </h4>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            <span style={{ color: app.state ? 'var(--success-500)' : 'var(--text-muted)' }}>
                                                {app.state ? t('On') : t('Off')}
                                            </span>
                                            <div
                                                className={`toggle-switch ${app.state ? 'active' : ''}`}
                                                onClick={() => toggleAppliance(selectedRoom, app.id)}
                                            />
                                        </div>

                                        {/* Additional controls based on type */}
                                        {app.type === 'light' && app.state && (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                                                    <span>{t('Brightness')}</span>
                                                    <span>{app.brightness}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={app.brightness || 100}
                                                    onChange={(e) => setApplianceValue(selectedRoom, app.id, 'brightness', parseInt(e.target.value))}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                        )}

                                        {app.type === 'AC' && app.state && (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                                                    <span>{t('Temperature')}</span>
                                                    <span style={{ fontWeight: 600, color: 'var(--info-500)' }}>{app.temperature}°C</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="16"
                                                    max="30"
                                                    value={app.temperature || 25}
                                                    onChange={(e) => setApplianceValue(selectedRoom, app.id, 'temperature', parseInt(e.target.value))}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                        )}

                                        {app.type === 'tv' && app.state && (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                                                    <span>{t('Volume')}</span>
                                                    <span>{app.volume}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={app.volume || 50}
                                                    onChange={(e) => setApplianceValue(selectedRoom, app.id, 'volume', parseInt(e.target.value))}
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
