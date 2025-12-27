/**
 * UserHomePage - Main home page for wheelchair users
 * Shows status, location, appliance control, and routines
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import {
    Heart, Activity, MapPin, Clock, Zap, Calendar,
    CheckCircle, AlertTriangle, Lightbulb, Thermometer,
    Tv, Fan, Wind, Power
} from 'lucide-react';
import { pageToPath } from '../../App';

export function UserHomePage() {
    const { currentUser, rooms, appliances, toggleAppliance, setApplianceValue, routines, wheelchairs, wheelchairPositions, openDrawer, language, setCurrentPage } = useApp();
    const { t } = useTranslation(language);
    const navigate = useNavigate();

    // Early return if currentUser is not available
    if (!currentUser) {
        return (
            <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                    <p>{t ? t('Loading user data...') : 'Loading user data...'}</p>
                </div>
            </div>
        );
    }

    // Find wheelchair: Try by wheelchairId matches, OR by patientId matches
    const myWheelchair = wheelchairs.find(w =>
        (currentUser?.wheelchairId && w.id === currentUser.wheelchairId) ||
        (currentUser?.id && w.patientId === currentUser.id)
    );

    // Find room using flexible matching (by id, roomType, or nameEn)
    let myRoom = rooms.find(r => r.id === currentUser?.room);
    if (!myRoom && currentUser?.room) {
        myRoom = rooms.find(r => r.roomType?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser?.room) {
        myRoom = rooms.find(r => r.nameEn?.toLowerCase() === currentUser.room?.toLowerCase());
    }
    if (!myRoom && currentUser?.room) {
        myRoom = rooms.find(r => r.name?.toLowerCase().includes(currentUser.room?.toLowerCase() || ''));
    }

    const todayRoutines = routines.filter(r => r.patientId === currentUser?.id);
    const completedRoutines = todayRoutines.filter(r => r.completed).length;
    const nextRoutine = todayRoutines.find(r => !r.completed);

    // Appliances for current room
    const myAppliances = appliances[currentUser?.room] || [];

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
                <h1>{t('Hello')}, {currentUser?.name?.split(' ')[0] || t('User')} 👋</h1>
                <p>{t('How is your health today?')}</p>

                <div className="user-profile-card">
                    <div className="avatar">{currentUser?.avatar || '👤'}</div>
                    <div className="info">
                        <h3>{currentUser?.name || t('Unknown User')}</h3>
                        <p>{myWheelchair?.name} • {myRoom?.name || t('Unknown Location')}</p>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{currentUser?.healthScore || '--'}</div>
                        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{t('Health Score')}</div>
                    </div>
                </div>
            </div>

            {/* Section 1: Quick Stats + Next Routine (side by side) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {/* Quick Stats (compact) - Header removed */}
                <div className="card">
                    <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                            <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-500)' }}>{currentUser?.todaySteps || 0}</div>
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

            {/* Section 2: Large Map (full width) - Header removed, enlarged */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-body" style={{ padding: 0 }}>
                    <div className="map-container" style={{ minHeight: '500px', borderRadius: 'var(--radius-lg)' }}>
                        <div className="map-canvas" style={{ minHeight: '500px' }}>
                            {rooms.map(room => (
                                <div
                                    key={room.id}
                                    className={`room ${room.occupied ? 'occupied' : ''}`}
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
                                    <span className="room-status" style={{
                                        display: 'block',
                                        marginTop: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 'normal',
                                        color: room.occupied ? 'var(--success-500)' : 'var(--text-muted)'
                                    }}>
                                        {room.occupied ? `🟢 ${t('Occupied')}` : `⚪ ${t('Vacant')}`}
                                    </span>
                                </div>
                            ))}

                            {(() => {
                                // Try to get position from real-time data first
                                const storedPos = myWheelchair ? wheelchairPositions[myWheelchair.id] : null;

                                let markerX, markerY;

                                if (storedPos) {
                                    markerX = storedPos.x;
                                    markerY = storedPos.y;
                                } else if (myRoom) {
                                    // Fallback to room center
                                    markerX = myRoom.x + myRoom.width / 2;
                                    markerY = myRoom.y + myRoom.height / 2;
                                } else {
                                    // No position available
                                    return null;
                                }

                                if (!myWheelchair) return null;

                                return (
                                    <div
                                        className="wheelchair-marker"
                                        style={{
                                            left: `${markerX}%`,
                                            top: `${markerY}%`,
                                            // Inline styles to ensure appearance matches request exactly
                                            position: 'absolute',
                                            width: '36px',
                                            height: '36px',
                                            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                                            borderRadius: '50%',
                                            border: '3px solid white',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            zIndex: 20,
                                            transform: 'translate(-50%, -50%)',
                                            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                        title={`${myWheelchair.name} - ${currentUser?.name || t('User')}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-accessibility" style={{ color: 'white' }}>
                                            <circle cx="16" cy="4" r="1"></circle>
                                            <path d="m18 19 1-7-6 1"></path>
                                            <path d="m5 8 3-3 5.5 3-2.36 3.5"></path>
                                            <path d="M4.24 14.5a5 5 0 0 0 6.88 6"></path>
                                            <path d="M13.76 17.5a5 5 0 0 0-6.88-6"></path>
                                        </svg>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 2: Appliance Control */}
            <div id="appliance-control" className="card" style={{ marginBottom: '1.5rem' }}>
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
                                                onClick={() => currentUser?.room && toggleAppliance(currentUser.room, app.id)}
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
                                                            onChange={(e) => currentUser?.room && setApplianceValue(currentUser.room, app.id, 'temperature', parseInt(e.target.value))}
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
                                                            onChange={(e) => currentUser?.room && setApplianceValue(currentUser.room, app.id, 'speed', parseInt(e.target.value))}
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
                                                            onChange={(e) => currentUser?.room && setApplianceValue(currentUser.room, app.id, 'volume', parseInt(e.target.value))}
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

            {/* Section 4: Quick Menu - Smaller and functional */}
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>🎯 {t('Quick Menu')}</h3>
            <div className="action-cards" style={{ gap: '0.75rem' }}>
                <div
                    className="action-card"
                    style={{ padding: '0.75rem', cursor: 'pointer' }}
                    onClick={() => {
                        const path = pageToPath['user-health'];
                        if (path) {
                            navigate(path);
                            setCurrentPage('user-health');
                        }
                    }}
                >
                    <div className="icon" style={{ width: '32px', height: '32px', fontSize: '16px' }}><Heart size={16} /></div>
                    <h4 style={{ fontSize: '0.85rem', margin: '0.25rem 0' }}>{t('Health')}</h4>
                    <p style={{ fontSize: '0.7rem', margin: 0 }}>{t('View Health Status')}</p>
                </div>
                <div
                    className="action-card"
                    style={{ padding: '0.75rem', cursor: 'pointer' }}
                    onClick={() => {
                        const path = pageToPath['user-routines'];
                        if (path) {
                            navigate(path);
                            setCurrentPage('user-routines');
                        }
                    }}
                >
                    <div className="icon" style={{ width: '32px', height: '32px', fontSize: '16px' }}><Calendar size={16} /></div>
                    <h4 style={{ fontSize: '0.85rem', margin: '0.25rem 0' }}>{t('Today Schedule')}</h4>
                    <p style={{ fontSize: '0.7rem', margin: 0 }}>{todayRoutines.length} {t('Activities')}</p>
                </div>
                <div
                    className="action-card"
                    style={{ padding: '0.75rem', cursor: 'pointer' }}
                    onClick={() => {
                        const path = pageToPath['user-appliances'];
                        if (path) {
                            navigate(path);
                            setCurrentPage('user-appliances');
                        }
                    }}
                >
                    <div className="icon" style={{ width: '32px', height: '32px', fontSize: '16px' }}><Zap size={16} /></div>
                    <h4 style={{ fontSize: '0.85rem', margin: '0.25rem 0' }}>{t('Appliances')}</h4>
                    <p style={{ fontSize: '0.7rem', margin: 0 }}>{myAppliances.length} {t('Devices')}</p>
                </div>
                <div
                    className="action-card"
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderColor: 'var(--danger-500)',
                        padding: '0.75rem',
                        cursor: 'pointer'
                    }}
                    onClick={() => {
                        // Emergency action - could open emergency modal or navigate to alerts
                        const path = pageToPath['user-alerts'];
                        if (path) {
                            navigate(path);
                            setCurrentPage('user-alerts');
                        }
                    }}
                >
                    <div className="icon" style={{
                        background: 'linear-gradient(135deg, var(--danger-500), var(--danger-600))',
                        width: '32px',
                        height: '32px',
                        fontSize: '16px'
                    }}><AlertTriangle size={16} /></div>
                    <h4 style={{ color: 'var(--danger-500)', fontSize: '0.85rem', margin: '0.25rem 0' }}>{t('Emergency')}</h4>
                    <p style={{ fontSize: '0.7rem', margin: 0 }}>{t('Report Emergency')}</p>
                </div>
            </div>
        </div>
    );
}

export default UserHomePage;
