import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
    Settings, Users, Shield, Bell, Database, Palette, Globe,
    Lock, Monitor, Smartphone, Save, RefreshCw, Download, Upload,
    Trash2, Key, User, Mail, Phone
} from 'lucide-react';

export function SettingsPage() {
    const { role, theme, toggleTheme, currentUser, compactMode, setCompactMode } = useApp();
    const [activeTab, setActiveTab] = useState(role === 'user' ? 'profile' : 'general');
    const [saved, setSaved] = useState(false);

    const [settings, setSettings] = useState({
        // General
        language: 'th',
        autoRefresh: true,
        refreshInterval: 5,
        // Notifications
        notifications: true,
        soundAlerts: true,
        lineNotify: true,
        emailNotify: false,
        emergencyContact: '1669',
        lineToken: '',
        // Security
        twoFactor: false,
        sessionTimeout: 30,
        // Admin - Permissions
        staffCanEditMap: false,
        staffCanEditDevices: false,
        userViewLevel: 'basic',
        // Display
        compactModeLocal: compactMode,
        showOfflineDevices: true,
        mapAutoCenter: true,
    });

    // Sync local settings with global compactMode
    useEffect(() => {
        setSettings(prev => ({ ...prev, compactModeLocal: compactMode }));
    }, [compactMode]);

    const handleToggle = (key) => {
        if (key === 'compactModeLocal') {
            // Toggle both local state and global context
            setCompactMode(!compactMode);
            setSettings(prev => ({ ...prev, compactModeLocal: !prev.compactModeLocal }));
        } else {
            setSettings(prev => ({ ...prev, [key]: !prev[key] }));
        }
    };

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const adminTabs = [
        { id: 'general', label: 'ทั่วไป', icon: Settings },
        { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
        { id: 'display', label: 'การแสดงผล', icon: Monitor },
        { id: 'roles', label: 'สิทธิ์การใช้งาน', icon: Shield },
        { id: 'security', label: 'ความปลอดภัย', icon: Lock },
        { id: 'data', label: 'จัดการข้อมูล', icon: Database },
    ];

    const userTabs = [
        { id: 'profile', label: 'โปรไฟล์', icon: User },
        { id: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
        { id: 'display', label: 'การแสดงผล', icon: Monitor },
        { id: 'security', label: 'ความปลอดภัย', icon: Lock },
    ];

    const tabs = role === 'admin' ? adminTabs : userTabs;

    return (
        <div className="page-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2>⚙️ {role === 'admin' ? 'Settings' : 'ตั้งค่า'}</h2>
                    <p>{role === 'admin' ? 'ตั้งค่าระบบและการแจ้งเตือน' : 'ตั้งค่าส่วนตัว'}</p>
                </div>
                <button className="btn btn-primary" onClick={handleSave}>
                    <Save size={16} /> {saved ? 'บันทึกแล้ว!' : 'บันทึกการตั้งค่า'}
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>
                {/* Settings Navigation */}
                <div className="card">
                    <div className="card-body" style={{ padding: '0.5rem' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <tab.icon size={18} /> {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Settings Content */}
                <div className="card">
                    {/* User Profile (User mode only) */}
                    {activeTab === 'profile' && role === 'user' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><User size={18} /> โปรไฟล์ของฉัน</span>
                            </div>
                            <div className="card-body">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                                    <div className="user-avatar" style={{ width: 80, height: 80, fontSize: '2rem' }}>
                                        {currentUser.avatar}
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{currentUser.name}</h3>
                                        <p style={{ color: 'var(--text-secondary)' }}>Wheelchair: {currentUser.wheelchairId}</p>
                                        <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
                                            เปลี่ยนรูปโปรไฟล์
                                        </button>
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">ชื่อ-นามสกุล</label>
                                        <input type="text" className="form-input" defaultValue={currentUser.name} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">อายุ</label>
                                        <input type="number" className="form-input" defaultValue={currentUser.age} />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label"><Phone size={14} /> เบอร์โทรศัพท์</label>
                                    <input type="tel" className="form-input" placeholder="08x-xxx-xxxx" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label"><Mail size={14} /> อีเมล</label>
                                    <input type="email" className="form-input" placeholder="example@email.com" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">เบอร์ติดต่อฉุกเฉิน</label>
                                    <input type="tel" className="form-input" placeholder="08x-xxx-xxxx" />
                                    <p className="form-hint">จะถูกติดต่อเมื่อเกิดเหตุฉุกเฉิน</p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* General Settings */}
                    {activeTab === 'general' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Settings size={18} /> ตั้งค่าทั่วไป</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group">
                                    <label className="form-label"><Globe size={14} /> ภาษา</label>
                                    <select
                                        className="form-input"
                                        value={settings.language}
                                        onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value }))}
                                        style={{ maxWidth: '200px' }}
                                    >
                                        <option value="th">ไทย 🇹🇭</option>
                                        <option value="en">English 🇬🇧</option>
                                    </select>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}><RefreshCw size={14} /> Auto Refresh</label>
                                        <p className="form-hint">รีเฟรชข้อมูลอัตโนมัติ</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.autoRefresh ? 'active' : ''}`} onClick={() => handleToggle('autoRefresh')} />
                                </div>

                                {settings.autoRefresh && (
                                    <div className="form-group">
                                        <label className="form-label">Refresh Interval (วินาที)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={settings.refreshInterval}
                                            onChange={(e) => setSettings(prev => ({ ...prev, refreshInterval: parseInt(e.target.value) }))}
                                            style={{ maxWidth: '100px' }}
                                            min="1"
                                            max="60"
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Notification Settings */}
                    {activeTab === 'notifications' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Bell size={18} /> การแจ้งเตือน</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>Push Notifications</label>
                                        <p className="form-hint">รับการแจ้งเตือนผ่านเบราว์เซอร์</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.notifications ? 'active' : ''}`} onClick={() => handleToggle('notifications')} />
                                </div>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>🔊 Sound Alerts</label>
                                        <p className="form-hint">เปิดเสียงแจ้งเตือน</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.soundAlerts ? 'active' : ''}`} onClick={() => handleToggle('soundAlerts')} />
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem' }}>ช่องทางการแจ้งเตือน</h4>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>📱 LINE Notify</label>
                                        <p className="form-hint">ส่งแจ้งเตือนผ่าน LINE</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.lineNotify ? 'active' : ''}`} onClick={() => handleToggle('lineNotify')} />
                                </div>

                                {settings.lineNotify && (
                                    <div className="form-group">
                                        <label className="form-label">LINE Notify Token</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="ใส่ token ที่ได้จาก LINE Notify"
                                            value={settings.lineToken}
                                            onChange={(e) => setSettings(prev => ({ ...prev, lineToken: e.target.value }))}
                                        />
                                    </div>
                                )}

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>📧 Email Notification</label>
                                        <p className="form-hint">ส่งสรุปประจำวันทางอีเมล</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.emailNotify ? 'active' : ''}`} onClick={() => handleToggle('emailNotify')} />
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <div className="form-group">
                                    <label className="form-label">🚨 เบอร์ติดต่อฉุกเฉิน</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={settings.emergencyContact}
                                        onChange={(e) => setSettings(prev => ({ ...prev, emergencyContact: e.target.value }))}
                                        style={{ maxWidth: '200px' }}
                                    />
                                    <p className="form-hint">จะถูกโทรหาเมื่อเกิดเหตุฉุกเฉิน</p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Display Settings */}
                    {activeTab === 'display' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Monitor size={18} /> การแสดงผล</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group">
                                    <label className="form-label"><Palette size={14} /> ธีม</label>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                        <button
                                            className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => theme !== 'light' && toggleTheme()}
                                            style={{ flex: 1 }}
                                        >
                                            ☀️ Light Mode
                                        </button>
                                        <button
                                            className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() => theme !== 'dark' && toggleTheme()}
                                            style={{ flex: 1 }}
                                        >
                                            🌙 Dark Mode
                                        </button>
                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>Compact Mode</label>
                                        <p className="form-hint">แสดงผลแบบกระชับ</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.compactModeLocal ? 'active' : ''}`} onClick={() => handleToggle('compactModeLocal')} />
                                </div>

                                {role === 'admin' && (
                                    <>
                                        <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <label className="form-label" style={{ marginBottom: 0 }}>แสดง Devices Offline</label>
                                                <p className="form-hint">แสดงอุปกรณ์ที่ไม่ได้เชื่อมต่อ</p>
                                            </div>
                                            <div className={`toggle-switch ${settings.showOfflineDevices ? 'active' : ''}`} onClick={() => handleToggle('showOfflineDevices')} />
                                        </div>

                                        <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <label className="form-label" style={{ marginBottom: 0 }}>Map Auto-Center</label>
                                                <p className="form-hint">เลื่อนแผนที่ไปยังเหตุการณ์ใหม่อัตโนมัติ</p>
                                            </div>
                                            <div className={`toggle-switch ${settings.mapAutoCenter ? 'active' : ''}`} onClick={() => handleToggle('mapAutoCenter')} />
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* Roles & Permissions (Admin only) */}
                    {activeTab === 'roles' && role === 'admin' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Shield size={18} /> สิทธิ์การใช้งาน</span>
                            </div>
                            <div className="card-body">
                                <h4 style={{ marginBottom: '1rem' }}>👤 สิทธิ์ของ Staff</h4>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>แก้ไข Map</label>
                                        <p className="form-hint">อนุญาตให้ Staff แก้ไขแผนที่</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.staffCanEditMap ? 'active' : ''}`} onClick={() => handleToggle('staffCanEditMap')} />
                                </div>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>แก้ไข Devices</label>
                                        <p className="form-hint">อนุญาตให้ Staff แก้ไขอุปกรณ์</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.staffCanEditDevices ? 'active' : ''}`} onClick={() => handleToggle('staffCanEditDevices')} />
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem' }}>👥 สิทธิ์ของ User</h4>

                                <div className="form-group">
                                    <label className="form-label">ระดับการดูข้อมูล</label>
                                    <select
                                        className="form-input"
                                        value={settings.userViewLevel}
                                        onChange={(e) => setSettings(prev => ({ ...prev, userViewLevel: e.target.value }))}
                                        style={{ maxWidth: '200px' }}
                                    >
                                        <option value="basic">พื้นฐาน - ดูได้เฉพาะข้อมูลตัวเอง</option>
                                        <option value="standard">มาตรฐาน - ดูข้อมูลห้อง</option>
                                        <option value="full">เต็มรูปแบบ - ดูทุกอย่าง</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Security Settings */}
                    {activeTab === 'security' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Lock size={18} /> ความปลอดภัย</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}><Key size={14} /> Two-Factor Authentication</label>
                                        <p className="form-hint">เพิ่มความปลอดภัยด้วยการยืนยันตัวตน 2 ชั้น</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.twoFactor ? 'active' : ''}`} onClick={() => handleToggle('twoFactor')} />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Session Timeout (นาที)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={settings.sessionTimeout}
                                        onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                                        style={{ maxWidth: '100px' }}
                                        min="5"
                                        max="120"
                                    />
                                    <p className="form-hint">ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน</p>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <button className="btn btn-secondary" style={{ marginRight: '0.5rem' }}>
                                    <Key size={16} /> เปลี่ยนรหัสผ่าน
                                </button>
                                <button className="btn btn-danger">
                                    ออกจากระบบทุกอุปกรณ์
                                </button>
                            </div>
                        </>
                    )}

                    {/* Data Management (Admin only) */}
                    {activeTab === 'data' && role === 'admin' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Database size={18} /> จัดการข้อมูล</span>
                            </div>
                            <div className="card-body">
                                <h4 style={{ marginBottom: '1rem' }}>📥 Export ข้อมูล</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Export ข้อมูลผู้ป่วย (CSV)
                                    </button>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Export Timeline (CSV)
                                    </button>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Export AI Analysis Report (PDF)
                                    </button>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Backup ข้อมูลทั้งหมด (JSON)
                                    </button>
                                </div>

                                <h4 style={{ marginBottom: '1rem' }}>📤 Import ข้อมูล</h4>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Upload size={16} /> Import ข้อมูล
                                    </button>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem', color: 'var(--danger-500)' }}>⚠️ Danger Zone</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button className="btn btn-danger" style={{ justifyContent: 'flex-start' }}>
                                        <Trash2 size={16} /> ล้างข้อมูล Timeline (30 วันก่อน)
                                    </button>
                                    <button className="btn btn-danger" style={{ justifyContent: 'flex-start' }}>
                                        <Trash2 size={16} /> Reset ค่าเริ่มต้นทั้งหมด
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
