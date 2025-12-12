import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
    Zap, Lightbulb, Thermometer, Tv, Fan, Power, Wind, Droplets,
    ChevronRight, Home, Moon, Sun, Film
} from 'lucide-react';

export function ApplianceControlPage() {
    const { rooms, appliances, toggleAppliance, setApplianceValue, role, currentUser } = useApp();
    const [selectedRoom, setSelectedRoom] = useState(role === 'user' ? currentUser.room : 'bedroom');

    const roomAppliances = appliances[selectedRoom] || [];

    // User mode: only show their room
    const availableRooms = role === 'user' ? [rooms.find(r => r.id === currentUser.room)] : rooms;

    const getApplianceIcon = (type) => {
        switch (type) {
            case 'light': return Lightbulb;
            case 'aircon': return Thermometer;
            case 'tv': return Tv;
            case 'fan': return Fan;
            case 'heater': return Droplets;
            case 'curtain': return Wind;
            default: return Power;
        }
    };

    const scenes = [
        { id: 'morning', name: 'ตื่นนอน', icon: Sun, color: 'var(--warning-500)', description: 'เปิดไฟ ปิดแอร์ เปิดม่าน' },
        { id: 'sleep', name: 'นอนหลับ', icon: Moon, color: 'var(--primary-500)', description: 'ปิดไฟ เปิดแอร์ ปิดม่าน' },
        { id: 'movie', name: 'ดูหนัง', icon: Film, color: 'var(--info-500)', description: 'หรี่ไฟ เปิดทีวี' },
        { id: 'away', name: 'ออกจากบ้าน', icon: Home, color: 'var(--success-500)', description: 'ปิดทุกอย่าง' },
    ];

    const handleSceneActivate = (sceneId) => {
        // Simulate scene activation
        if (sceneId === 'sleep') {
            if (appliances[selectedRoom]) {
                appliances[selectedRoom].forEach(app => {
                    if (app.type === 'light' && app.state) toggleAppliance(selectedRoom, app.id);
                    if (app.type === 'aircon' && !app.state) toggleAppliance(selectedRoom, app.id);
                });
            }
        }
        // Add more scene logic here
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>⚡ {role === 'user' ? 'ควบคุมเครื่องใช้ไฟฟ้า' : 'Appliance Control'}</h2>
                <p>{role === 'user' ? 'ควบคุมเครื่องใช้ไฟฟ้าในห้องของคุณ' : 'ควบคุมเครื่องใช้ไฟฟ้าทุกห้อง'}</p>
            </div>

            {/* Room Selector (Admin only sees all rooms) */}
            {role === 'admin' && (
                <div className="tabs" style={{ marginBottom: '1.5rem' }}>
                    {rooms.map(room => (
                        <button
                            key={room.id}
                            className={`tab ${selectedRoom === room.id ? 'active' : ''}`}
                            onClick={() => setSelectedRoom(room.id)}
                        >
                            {room.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Scene Presets */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><Power size={18} /> Scene Presets</span>
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
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>อุณหภูมิ</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--info-500)' }}>
                                {rooms.find(r => r.id === selectedRoom)?.humidity}%
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ความชื้น</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-500)' }}>
                                {roomAppliances.filter(a => a.state).length}/{roomAppliances.length}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>เปิดอยู่</div>
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
                        ปิดทั้งหมด
                    </button>
                </div>
                <div className="card-body">
                    {roomAppliances.length === 0 ? (
                        <div className="empty-state">
                            <Zap size={48} />
                            <h3>ไม่พบอุปกรณ์</h3>
                            <p>ยังไม่มีเครื่องใช้ไฟฟ้าในห้องนี้</p>
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
                                                {app.state ? 'เปิด' : 'ปิด'}
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
                                                    <span>ความสว่าง</span>
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

                                        {app.type === 'aircon' && app.state && (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                                                    <span>อุณหภูมิ</span>
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
                                                    <span>เสียง</span>
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
