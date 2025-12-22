import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import {
    Heart, Activity, MapPin, Clock, Zap, Calendar,
    CheckCircle, AlertTriangle, TrendingUp, Battery, Thermometer,
    Lightbulb, Fan, Wind, Tv, Power, Phone, Bell, Video, X, Maximize2, Minimize2
} from 'lucide-react';

export function UserHomePage() {
    const { currentUser, rooms, appliances, toggleAppliance, setApplianceValue, routines, wheelchairs, wheelchairPositions, openDrawer, language } = useApp();
    const { t } = useTranslation(language);

    const myWheelchair = wheelchairs.find(w => w.id === currentUser.wheelchairId);

    // Find room using flexible matching (by id, roomType, or nameEn)
    let myRoom = rooms.find(r => r.id === currentUser.room);
    if (!myRoom && currentUser.room) {
        myRoom = rooms.find(r => r.roomType?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser.room) {
        myRoom = rooms.find(r => r.nameEn?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser.room) {
        myRoom = rooms.find(r => r.name?.toLowerCase().includes(currentUser.room?.toLowerCase() || ''));
    }

    const todayRoutines = routines.filter(r => r.patientId === currentUser.id);
    const completedRoutines = todayRoutines.filter(r => r.completed).length;
    const nextRoutine = todayRoutines.find(r => !r.completed);

    // Appliances for current room
    const myAppliances = appliances[currentUser.room] || [];

    const getApplianceIcon = (type) => {
        switch (type) {
            case 'light': return Lightbulb;
            case 'AC': return Thermometer;
            case 'tv': return Tv;
            case 'fan': return Fan;
            case 'heater': return Wind;
            default: return Power;
        }
    };

    // Check if appliance is slider type (fan, aircon, tv volume)
    const isSliderType = (type) => ['AC', 'fan', 'tv'].includes(type);

    return (
        <div className="page-content">
            {/* User Header */}
            <div className="user-mode-header">
                <h1>{t('Hello')}, {currentUser.name.split(' ')[0]} 👋</h1>
                <p>{t('How is your health today?')}</p>

                <div className="user-profile-card">
                    <div className="avatar">{currentUser.avatar}</div>
                    <div className="info">
                        <h3>{currentUser.name}</h3>
                        <p>{myWheelchair?.name} • {myRoom?.name || t('Unknown Location')}</p>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{currentUser.healthScore}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Health Score')}</div>
                    </div>
                </div>
            </div>

            {/* Section 1: Quick Stats + Next Routine (side by side) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {/* Quick Stats (compact) */}
                <div className="card">
                    <div className="card-header" style={{ padding: '0.75rem 1rem' }}>
                        <span className="card-title"><Activity size={18} /> {t('Today Status')}</span>
                    </div>
                    <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-500)' }}>{currentUser.todaySteps}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('Steps Today')}</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success-500)' }}>{completedRoutines}/{todayRoutines.length}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('Activities Today')}</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: myWheelchair?.battery < 20 ? 'var(--danger-500)' : 'var(--success-500)' }}>{myWheelchair?.battery || 0}%</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('Battery')}</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--info-500)' }}>{myRoom?.temperature || '--'}°C</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('Temperature')}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Next Routine (compact) */}
                <div className="card">
                    <div className="card-header" style={{ padding: '0.75rem 1rem' }}>
                        <span className="card-title"><Clock size={18} /> {t('Next Activity')}</span>
                    </div>
                    <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
                        {nextRoutine ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 'var(--radius-md)',
                                    background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                }}>
                                    <Clock size={22} color="white" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{nextRoutine.time} - {nextRoutine.title}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{nextRoutine.description}</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '0.75rem', color: 'var(--text-muted)' }}>
                                <CheckCircle size={28} style={{ marginBottom: '0.25rem', opacity: 0.5 }} />
                                <p style={{ fontSize: '0.85rem' }}>{t('All Completed!')} 🎉</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Section 2: Large Map (full width) */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><MapPin size={18} /> {t('Current Location')}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--primary-500)', fontWeight: 500 }}>📍 {myRoom?.name}</span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                    <div className="map-container" style={{ minHeight: '300px', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
                        <div className="map-canvas" style={{ minHeight: '300px' }}>
                            {rooms.map(room => (
                                <div
                                    key={room.id}
                                    className={`room ${room.id === currentUser.room ? 'occupied' : ''}`}
                                    style={{
                                        left: `${room.x}%`,
                                        top: `${room.y}%`,
                                        width: `${room.width}%`,
                                        height: `${room.height}%`,
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => openDrawer({ type: 'room', data: room })}
                                >
                                    <span className="room-label">{room.nameEn || room.name}</span>
                                    {room.sizeLabel && (
                                        <span style={{
                                            position: 'absolute',
                                            bottom: '5px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            fontSize: '0.65rem',
                                            color: 'var(--text-muted)',
                                            fontWeight: 500
                                        }}>
                                            {room.sizeLabel}
                                        </span>
                                    )}
                                </div>
                            ))}

                            {myRoom && myWheelchair && (() => {
                                const storedPos = wheelchairPositions[myWheelchair.id];
                                const markerX = storedPos ? storedPos.x : (myRoom.x + myRoom.width / 2);
                                const markerY = storedPos ? storedPos.y : (myRoom.y + myRoom.height / 2);
                                return (
                                    <div
                                        className="wheelchair-marker"
                                        style={{
                                            left: `${markerX}%`,
                                            top: `${markerY}%`
                                        }}
                                    >
                                        <span style={{ fontSize: '1.25rem' }}>📍</span>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                    {/* Room Info Bar */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-around', padding: '0.75rem',
                        background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)',
                        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--info-500)' }}>{myRoom?.temperature}°C</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('Temperature')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--info-500)' }}>{myRoom?.humidity}%</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('Humidity')}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--success-500)' }}>{myWheelchair?.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Wheelchair</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 2: Appliance Control */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Zap size={18} /> {t('Appliance Control')} - {myRoom?.name}</span>
                </div>
                <div className="card-body">
                    {myAppliances.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                            <Zap size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                            <p>{t('No Appliances in This Room')}</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                            {myAppliances.map(app => {
                                const Icon = getApplianceIcon(app.type);
                                const isSlider = isSliderType(app.type);

                                return (
                                    <div key={app.id} className="room-panel-item">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                                    background: app.state ? 'linear-gradient(135deg, var(--primary-500), var(--primary-700))' : 'var(--bg-hover)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    <Icon size={18} color={app.state ? 'white' : 'var(--text-muted)'} />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{app.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: app.state ? 'var(--success-500)' : 'var(--text-muted)' }}>
                                                        {app.state ? (isSlider ? `${app.type === 'AC' ? app.temperature + '°C' : (app.brightness || app.volume || 50) + '%'}` : t('On')) : t('Off')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div
                                                className={`toggle-switch ${app.state ? 'active' : ''}`}
                                                onClick={() => toggleAppliance(currentUser.room, app.id)}
                                            />
                                        </div>

                                        {/* Slider for fan/aircon/tv when ON */}
                                        {isSlider && app.state && (
                                            <div style={{ marginTop: '0.5rem' }}>
                                                {app.type === 'AC' && (
                                                    <>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                                            <span>{t('Temperature')}</span>
                                                            <span style={{ color: 'var(--info-500)', fontWeight: 600 }}>{app.temperature}°C</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="16"
                                                            max="30"
                                                            value={app.temperature || 25}
                                                            onChange={(e) => setApplianceValue(currentUser.room, app.id, 'temperature', parseInt(e.target.value))}
                                                            style={{ width: '100%' }}
                                                        />
                                                    </>
                                                )}
                                                {app.type === 'fan' && (
                                                    <>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                                            <span>{t('Speed')}</span>
                                                            <span style={{ color: 'var(--primary-500)', fontWeight: 600 }}>{app.speed || 50}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="100"
                                                            value={app.speed || 50}
                                                            onChange={(e) => setApplianceValue(currentUser.room, app.id, 'speed', parseInt(e.target.value))}
                                                            style={{ width: '100%' }}
                                                        />
                                                    </>
                                                )}
                                                {app.type === 'tv' && (
                                                    <>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                                            <span>{t('Volume')}</span>
                                                            <span style={{ color: 'var(--primary-500)', fontWeight: 600 }}>{app.volume || 50}%</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="100"
                                                            value={app.volume || 50}
                                                            onChange={(e) => setApplianceValue(currentUser.room, app.id, 'volume', parseInt(e.target.value))}
                                                            style={{ width: '100%' }}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Section 3: Today's Routines */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Calendar size={18} /> {t('Today Schedule')}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{completedRoutines}/{todayRoutines.length} {t('Completed')}</span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                    <div className="schedule-container" style={{ padding: '0.5rem' }}>
                        {todayRoutines.map(routine => (
                            <div
                                key={routine.id}
                                className={`schedule-item ${routine.completed ? 'completed' : ''} ${routine.id === nextRoutine?.id ? 'current' : ''}`}
                            >
                                <div className="schedule-time">{routine.time}</div>
                                <div className="schedule-details">
                                    <div className="schedule-title">{routine.title}</div>
                                    <div className="schedule-desc">{routine.description}</div>
                                </div>
                                {routine.completed && <CheckCircle size={20} color="var(--success-500)" />}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section 4: Quick Menu */}
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>🎯 {t('Quick Menu')}</h3>
            <div className="action-cards">
                <div className="action-card">
                    <div className="icon"><Heart /></div>
                    <h4>{t('Health')}</h4>
                    <p>{t('View Health Status')}</p>
                </div>
                <div className="action-card">
                    <div className="icon"><Calendar /></div>
                    <h4>{t('Today Schedule')}</h4>
                    <p>{todayRoutines.length} {t('Activities')}</p>
                </div>
                <div className="action-card">
                    <div className="icon"><MapPin /></div>
                    <h4>{t('Location')}</h4>
                    <p>{myRoom?.name}</p>
                </div>
                <div className="action-card" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--danger-500)' }}>
                    <div className="icon" style={{ background: 'linear-gradient(135deg, var(--danger-500), var(--danger-600))' }}><AlertTriangle /></div>
                    <h4 style={{ color: 'var(--danger-500)' }}>{t('Emergency')}</h4>
                    <p>{t('Report Emergency')}</p>
                </div>
            </div>
        </div>
    );
}

export function UserHealthPage() {
    const { currentUser, aiAnalysis } = useApp();

    const circumference = 2 * Math.PI * 45;
    const progress = (currentUser.healthScore / 100) * circumference;

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>❤️ {t('My Health')}</h2>
                <p>{t('Track health status and activities')}</p>
            </div>

            {/* Health Score */}
            <div className={`health-card ${currentUser.healthScore < 50 ? 'danger' : currentUser.healthScore < 80 ? 'warning' : ''}`} style={{ marginBottom: '1.5rem' }}>
                <div>
                    <h3>{t('Today Health Score')}: {currentUser.healthScore}</h3>
                    <p>{currentUser.healthScore >= 80 ? t('Very Good Health!') : currentUser.healthScore >= 50 ? t('Fair Health') : t('Caution Required')}</p>
                </div>
                <div className="icon">
                    <Heart size={32} />
                </div>
            </div>

            {/* Activity Ring */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Activity size={18} /> {t('Activities Today')}</span>
                </div>
                <div className="card-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem' }}>
                    <div className="activity-ring">
                        <svg viewBox="0 0 100 100">
                            <circle className="bg" cx="50" cy="50" r="45" />
                            <circle
                                className="progress"
                                cx="50" cy="50" r="45"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference - progress}
                            />
                        </svg>
                        <div className="center">
                            <h4>{currentUser.healthScore}%</h4>
                            <p>{t('Health')}</p>
                        </div>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Steps')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-500)' }}>{currentUser.todaySteps}</div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Goal')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>2,000</div>
                        </div>
                        <div className="progress-bar" style={{ width: 120 }}>
                            <div className="progress-bar-fill" style={{ width: `${(currentUser.todaySteps / 2000) * 100}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Recommendations */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title"><TrendingUp size={18} /> {t('AI Recommendations')}</span>
                </div>
                <div className="card-body">
                    <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>{aiAnalysis.dailySummary}</p>
                    <ul style={{ paddingLeft: '1.25rem' }}>
                        {aiAnalysis.recommendations.map((rec, i) => (
                            <li key={i} style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{rec}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export function UserLocationPage() {
    const { currentUser, rooms, wheelchairs, wheelchairPositions } = useApp();

    const myWheelchair = wheelchairs.find(w => w.id === currentUser.wheelchairId);

    // Find room using flexible matching (by id, roomType, or nameEn)
    let myRoom = rooms.find(r => r.id === currentUser.room);
    if (!myRoom && currentUser.room) {
        myRoom = rooms.find(r => r.roomType?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser.room) {
        myRoom = rooms.find(r => r.nameEn?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser.room) {
        myRoom = rooms.find(r => r.name?.toLowerCase().includes(currentUser.room?.toLowerCase() || ''));
    }

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📍 {t('My Location')}</h2>
                <p>{t('View current location on map')}</p>
            </div>

            {/* Current Location Card */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{
                        width: 80, height: 80, margin: '0 auto 1rem',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <MapPin size={36} color="white" />
                    </div>
                    <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{myRoom?.name || t('Unknown Location')}</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>{myRoom?.nameEn}</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1rem' }}>
                        <div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--info-500)' }}>{myRoom?.temperature}°C</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('Temperature')}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--info-500)' }}>{myRoom?.humidity}%</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('Humidity')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map - Same as Admin */}
            <div className="map-container" style={{ minHeight: '400px' }}>
                <div className="map-canvas">
                    {rooms.map(room => (
                        <div
                            key={room.id}
                            className={`room ${room.id === currentUser.room ? 'occupied' : ''}`}
                            style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%` }}
                        >
                            <span className="room-label">{room.nameEn || room.name}</span>
                        </div>
                    ))}
                    {/* Only show user's own position */}
                    {myRoom && myWheelchair && (() => {
                        const storedPos = wheelchairPositions[myWheelchair.id];
                        const markerX = storedPos ? storedPos.x : (myRoom.x + myRoom.width / 2);
                        const markerY = storedPos ? storedPos.y : (myRoom.y + myRoom.height / 2);
                        return (
                            <div
                                className="wheelchair-marker"
                                style={{
                                    left: `${markerX}%`,
                                    top: `${markerY}%`
                                }}
                            >
                                <span style={{ fontSize: '1rem' }}>📍</span>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Wheelchair Info */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Battery size={18} /> {t('Wheelchair Information')}</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Model')}</div>
                            <div style={{ fontWeight: 500 }}>{myWheelchair?.name}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>ID</div>
                            <div style={{ fontWeight: 500 }}>{myWheelchair?.id}</div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Battery')}</div>
                            <div style={{ fontWeight: 500, color: myWheelchair?.battery < 20 ? 'var(--danger-500)' : 'var(--success-500)' }}>
                                {myWheelchair?.battery}%
                            </div>
                        </div>
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Status')}</div>
                            <div style={{ fontWeight: 500, color: 'var(--success-500)' }}>{t('Normal')}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// User Alerts Page - Only shows user's own alerts
export function UserAlertsPage() {
    const { currentUser, timeline, notifications, markNotificationRead } = useApp();

    // Filter only user's own alerts
    const myAlerts = timeline.filter(t =>
        t.patientId === currentUser.id ||
        (t.type === 'alert' && t.patientId === currentUser.id)
    );

    const myNotifications = notifications.filter(n => !n.read);

    const formatTime = (date) => {
        const d = new Date(date);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date) => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>🔔 {t('My Notifications')}</h2>
                <p>{t('Notifications and important events')}</p>
            </div>

            {/* Emergency Contact Button */}
            <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, var(--danger-500), var(--danger-600))', border: 'none', color: 'white' }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 'var(--radius-full)',
                        background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Phone size={28} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{t('Emergency Contact Admin')}</h4>
                        <p style={{ opacity: 0.9, fontSize: '0.85rem' }}>{t('Press to report emergency immediately')}</p>
                    </div>
                    <button style={{
                        padding: '0.75rem 1.5rem', background: 'white', color: 'var(--danger-600)',
                        border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer'
                    }}>
                        📞 {t('Call Now')}
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {myNotifications.length > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header">
                        <span className="card-title"><Bell size={18} /> {t('New Notifications')}</span>
                        <span className="list-item-badge alert">{myNotifications.length}</span>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        {myNotifications.map(n => (
                            <div
                                key={n.id}
                                className="list-item"
                                onClick={() => markNotificationRead(n.id)}
                                style={{ borderBottom: '1px solid var(--border-color)' }}
                            >
                                <div className="list-item-avatar" style={{
                                    background: n.type === 'alert' ? 'var(--danger-500)' : n.type === 'warning' ? 'var(--warning-500)' : 'var(--info-500)'
                                }}>
                                    <AlertTriangle size={18} />
                                </div>
                                <div className="list-item-content">
                                    <div className="list-item-title">{n.title}</div>
                                    <div className="list-item-subtitle">{n.message}</div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(n.time)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Activity Timeline */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Clock size={18} /> {t('My Activity History')}</span>
                </div>
                <div className="card-body">
                    {myAlerts.length > 0 ? (
                        <div className="timeline">
                            {myAlerts.map(event => (
                                <div key={event.id} className="timeline-item">
                                    <div className={`timeline-icon ${event.type}`}>
                                        {event.type === 'enter' && <MapPin size={14} />}
                                        {event.type === 'exit' && <MapPin size={14} />}
                                        {event.type === 'alert' && <AlertTriangle size={14} />}
                                        {event.type === 'appliance' && <Zap size={14} />}
                                    </div>
                                    <div className="timeline-content">
                                        <div className="timeline-title">{event.message}</div>
                                        <div className="timeline-time">{formatTime(event.time)} • {formatDate(event.time)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            <Clock size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                            <p>{t('No Activities Yet')}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// User Video Streaming Page - Real WebSocket Video
export function UserVideoPage() {
    const { rooms, currentUser, appliances, toggleAppliance, openDrawer } = useApp();
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [videoSrc, setVideoSrc] = useState('');
    const [streamMode, setStreamMode] = useState('loading'); // 'loading', 'websocket', 'offline'
    const wsRef = React.useRef(null);

    const myRoom = rooms.find(r => r.id === currentUser.room);

    // Setup WebSocket video stream when room is selected
    React.useEffect(() => {
        if (!selectedRoom) {
            setVideoSrc('');
            setStreamMode('loading');
            disconnectWebSocket();
            return;
        }

        connectWebSocket(selectedRoom);

        return () => {
            disconnectWebSocket();
        };
    }, [selectedRoom]);

    const connectWebSocket = async (roomId) => {
        disconnectWebSocket();

        try {
            // Import API function dynamically
            const { getStreamUrlInfo } = await import('../services/api');
            const streamInfo = await getStreamUrlInfo(roomId);

            // Use relative WebSocket URL that works with nginx proxy
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = streamInfo.ws_url || `${protocol}//${host}/api/ws/stream/${roomId}`;

            console.log(`[UserVideo] Connecting to WebSocket: ${wsUrl}`);
            setStreamMode('loading');

            const ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';

            ws.onopen = () => {
                console.log(`[UserVideo] WebSocket connected for room: ${roomId}`);
                setStreamMode('websocket');
            };

            ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    // Binary JPEG frame
                    const blob = new Blob([event.data], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    setVideoSrc(prev => {
                        if (prev && prev.startsWith('blob:')) {
                            URL.revokeObjectURL(prev);
                        }
                        return url;
                    });
                } else if (typeof event.data === 'string') {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'ping') {
                            ws.send(JSON.stringify({ type: 'pong' }));
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            };

            ws.onerror = (error) => {
                console.error('[UserVideo] WebSocket error:', error);
                setStreamMode('offline');
            };

            ws.onclose = () => {
                console.log('[UserVideo] WebSocket disconnected');
                setStreamMode('offline');
            };

            wsRef.current = ws;
        } catch (error) {
            console.error('[UserVideo] Failed to connect WebSocket:', error);
            setStreamMode('offline');
        }
    };

    const disconnectWebSocket = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (videoSrc && videoSrc.startsWith('blob:')) {
            URL.revokeObjectURL(videoSrc);
        }
    };

    const selectedRoomData = selectedRoom ? rooms.find(r => r.id === selectedRoom) : null;
    const selectedRoomAppliances = selectedRoom ? (appliances[selectedRoom] || []) : [];

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📹 {t('Room Video')}</h2>
                <p>{t('View CCTV cameras of each room')}</p>
            </div>

            {/* Room Selection */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Video size={18} /> {t('Select Room to View')}</span>
                </div>
                <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
                        {rooms.map(room => (
                            <button
                                key={room.id}
                                onClick={() => setSelectedRoom(room.id)}
                                style={{
                                    padding: '1rem',
                                    background: selectedRoom === room.id
                                        ? 'linear-gradient(135deg, var(--primary-500), var(--primary-700))'
                                        : room.id === currentUser.room
                                            ? 'var(--success-600)'
                                            : 'var(--bg-tertiary)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-lg)',
                                    color: selectedRoom === room.id || room.id === currentUser.room ? 'white' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    textAlign: 'center'
                                }}
                            >
                                <Video size={24} style={{ marginBottom: '0.5rem' }} />
                                <div style={{ fontWeight: 500 }}>{room.nameEn || room.name}</div>
                                {room.id === currentUser.room && (
                                    <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', opacity: 0.8 }}>📍 {t('Your Location')}</div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Video Player with Real WebSocket Stream */}
            {selectedRoom && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header">
                        <span className="card-title">
                            <Video size={18} /> {t('Camera')} - {selectedRoomData?.name}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {streamMode === 'websocket' && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                                    ● WebSocket
                                </span>
                            )}
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setIsFullscreen(!isFullscreen)}
                            >
                                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedRoom(null)}>
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <div className="video-stream" style={{
                            aspectRatio: '16/10',
                            minHeight: isFullscreen ? '70vh' : '300px',
                            position: 'relative',
                            background: 'linear-gradient(135deg, var(--dark-bg), var(--dark-surface))'
                        }}>
                            {videoSrc && (
                                <img
                                    src={videoSrc}
                                    alt={`${selectedRoomData?.name} Camera`}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        display: 'block',
                                        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
                                    }}
                                    onLoad={(e) => {
                                        const img = e.target;
                                        const placeholder = document.getElementById(`user-video-placeholder-${selectedRoom}`);
                                        if (img.naturalWidth <= 10 || img.naturalHeight <= 10) {
                                            if (placeholder) placeholder.style.display = 'flex';
                                            img.style.display = 'none';
                                        } else {
                                            if (placeholder) placeholder.style.display = 'none';
                                            img.style.display = 'block';
                                        }
                                    }}
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        const placeholder = document.getElementById(`user-video-placeholder-${selectedRoom}`);
                                        if (placeholder) placeholder.style.display = 'flex';
                                    }}
                                />
                            )}
                            <div
                                id={`user-video-placeholder-${selectedRoom}`}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'linear-gradient(135deg, var(--dark-bg), var(--dark-surface))',
                                    color: 'var(--dark-text-muted)',
                                    fontSize: '0.9rem',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    zIndex: 1
                                }}
                            >
                                {streamMode === 'loading' && (
                                    <div style={{
                                        marginBottom: '1rem',
                                        width: '48px',
                                        height: '48px',
                                        border: '4px solid rgba(255,255,255,0.1)',
                                        borderTop: '4px solid var(--primary-500)',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }} />
                                )}
                                <Video size={48} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '1rem' }} />
                                <p style={{ margin: 0, textAlign: 'center' }}>
                                    {streamMode === 'loading' && t('Connecting WebSocket...')}
                                    {streamMode === 'offline' && t('Camera Offline')}
                                    {streamMode === 'websocket' && !videoSrc && t('Waiting for video from camera')}
                                </p>
                            </div>
                            {streamMode === 'websocket' && (
                                <span className="video-live-badge" style={{ zIndex: 2 }}>LIVE</span>
                            )}

                            {/* Room Info Overlay */}
                            <div style={{
                                position: 'absolute',
                                bottom: 16,
                                left: 16,
                                right: 16,
                                display: 'flex',
                                justifyContent: 'space-between',
                                color: 'rgba(255,255,255,0.8)',
                                fontSize: '0.8rem',
                                zIndex: 3
                            }}>
                                <span>🌡️ {selectedRoomData?.temperature || '--'}°C</span>
                                <span>💧 {selectedRoomData?.humidity || '--'}%</span>
                                <span>📍 {selectedRoomData?.name}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Appliance Control for Selected Room */}
            {selectedRoom && selectedRoomAppliances.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span className="card-title"><Zap size={18} /> {t('Appliance Control')} - {selectedRoomData?.name}</span>
                    </div>
                    <div className="card-body">
                        <div className="device-grid">
                            {selectedRoomAppliances.map(app => {
                                const getIcon = (type) => {
                                    switch (type) {
                                        case 'light': return Lightbulb;
                                        case 'AC': return Thermometer;
                                        case 'tv': return Tv;
                                        case 'fan': return Fan;
                                        default: return Power;
                                    }
                                };
                                const Icon = getIcon(app.type);
                                return (
                                    <div
                                        key={app.id}
                                        className={`device-card ${app.state ? 'active' : ''}`}
                                        onClick={() => toggleAppliance(selectedRoom, app.id)}
                                    >
                                        <div className="device-icon"><Icon size={24} /></div>
                                        <div className="device-name">{app.name}</div>
                                        <div className="device-status">{app.state ? t('On') : t('Off')}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Info when no room selected */}
            {!selectedRoom && (
                <div className="card">
                    <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
                        <Video size={64} style={{ color: 'var(--text-muted)', opacity: 0.3, marginBottom: '1rem' }} />
                        <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{t('Select Room to View Camera')}</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            {t('Click the room button above to view video streaming and control appliances')}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

