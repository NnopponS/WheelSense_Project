import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import {
    Settings, Users, Shield, Bell, Database, Palette, Globe,
    Lock, Monitor, Smartphone, Save, RefreshCw, Download, Upload,
    Trash2, Key, User, Mail, Phone
} from 'lucide-react';

export function SettingsPage() {
    const { role, theme, toggleTheme, currentUser, compactMode, setCompactMode, language, setLanguage } = useApp();
    const { t } = useTranslation(language);
    const [activeTab, setActiveTab] = useState(role === 'user' ? 'profile' : 'general');
    const [saved, setSaved] = useState(false);

    const [settings, setSettings] = useState({
        // General
        language: language,
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

    // Sync local settings with global compactMode and language
    useEffect(() => {
        setSettings(prev => ({ ...prev, compactModeLocal: compactMode, language: language }));
    }, [compactMode, language]);

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
        { id: 'general', label: 'General', icon: Settings },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'display', label: 'Display', icon: Monitor },
        { id: 'roles', label: 'Permissions', icon: Shield },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'data', label: 'Data Management', icon: Database },
    ];

    const userTabs = [
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'display', label: 'Display', icon: Monitor },
        { id: 'security', label: 'Security', icon: Lock },
    ];

    const tabs = role === 'admin' ? adminTabs : userTabs;

    return (
        <div className="page-content">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2>⚙️ {t('Settings')}</h2>
                    <p>{role === 'admin' ? t('System and notification settings') : t('Personal settings')}</p>
                </div>
                <button className="btn btn-primary" onClick={handleSave}>
                    <Save size={16} /> {saved ? t('Saved!') : t('Save Settings')}
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
                                <tab.icon size={18} /> {t(tab.label)}
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
                                <span className="card-title"><User size={18} /> My Profile</span>
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
                                            Change Profile Picture
                                        </button>
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Full Name</label>
                                        <input type="text" className="form-input" defaultValue={currentUser.name} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Age</label>
                                        <input type="number" className="form-input" defaultValue={currentUser.age} />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label"><Phone size={14} /> Phone Number</label>
                                    <input type="tel" className="form-input" placeholder="08x-xxx-xxxx" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label"><Mail size={14} /> Email</label>
                                    <input type="email" className="form-input" placeholder="example@email.com" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Emergency Contact Number</label>
                                    <input type="tel" className="form-input" placeholder="08x-xxx-xxxx" />
                                    <p className="form-hint">Will be contacted in case of emergency</p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* General Settings */}
                    {activeTab === 'general' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Settings size={18} /> General Settings</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group">
                                    <label className="form-label"><Globe size={14} /> Language</label>
                                    <select
                                        className="form-input"
                                        value={language}
                                        onChange={(e) => {
                                            const newLang = e.target.value;
                                            setLanguage(newLang);
                                            setSettings(prev => ({ ...prev, language: newLang }));
                                        }}
                                        style={{ maxWidth: '200px' }}
                                    >
                                        <option value="th">Thai 🇹🇭</option>
                                        <option value="en">English 🇬🇧</option>
                                    </select>
                                    <p className="form-hint">
                                        {language === 'th' ? 'TH mode: Thai translations are active' : 'EN mode: English mode'}
                                    </p>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}><RefreshCw size={14} /> Auto Refresh</label>
                                        <p className="form-hint">Auto refresh data</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.autoRefresh ? 'active' : ''}`} onClick={() => handleToggle('autoRefresh')} />
                                </div>

                                {settings.autoRefresh && (
                                    <div className="form-group">
                                        <label className="form-label">Refresh Interval (seconds)</label>
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
                                <span className="card-title"><Bell size={18} /> Notifications</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>Push Notifications</label>
                                        <p className="form-hint">Receive notifications through browser</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.notifications ? 'active' : ''}`} onClick={() => handleToggle('notifications')} />
                                </div>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>🔊 Sound Alerts</label>
                                        <p className="form-hint">Enable sound alerts</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.soundAlerts ? 'active' : ''}`} onClick={() => handleToggle('soundAlerts')} />
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem' }}>Notification Channels</h4>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>📱 LINE Notify</label>
                                        <p className="form-hint">Send notifications via LINE</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.lineNotify ? 'active' : ''}`} onClick={() => handleToggle('lineNotify')} />
                                </div>

                                {settings.lineNotify && (
                                    <div className="form-group">
                                        <label className="form-label">LINE Notify Token</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="Enter token from LINE Notify"
                                            value={settings.lineToken}
                                            onChange={(e) => setSettings(prev => ({ ...prev, lineToken: e.target.value }))}
                                        />
                                    </div>
                                )}

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>📧 Email Notification</label>
                                        <p className="form-hint">Send daily summary via email</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.emailNotify ? 'active' : ''}`} onClick={() => handleToggle('emailNotify')} />
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <div className="form-group">
                                    <label className="form-label">🚨 Emergency Contact Number</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={settings.emergencyContact}
                                        onChange={(e) => setSettings(prev => ({ ...prev, emergencyContact: e.target.value }))}
                                        style={{ maxWidth: '200px' }}
                                    />
                                    <p className="form-hint">Will be called in case of emergency</p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Display Settings */}
                    {activeTab === 'display' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Monitor size={18} /> Display</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group">
                                    <label className="form-label"><Palette size={14} /> Theme</label>
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
                                        <p className="form-hint">Display in compact mode</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.compactModeLocal ? 'active' : ''}`} onClick={() => handleToggle('compactModeLocal')} />
                                </div>

                                {role === 'admin' && (
                                    <>
                                        <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <label className="form-label" style={{ marginBottom: 0 }}>Show Offline Devices</label>
                                                <p className="form-hint">Show devices that are not connected</p>
                                            </div>
                                            <div className={`toggle-switch ${settings.showOfflineDevices ? 'active' : ''}`} onClick={() => handleToggle('showOfflineDevices')} />
                                        </div>

                                        <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <label className="form-label" style={{ marginBottom: 0 }}>Map Auto-Center</label>
                                                <p className="form-hint">Auto scroll map to new events</p>
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
                                <span className="card-title"><Shield size={18} /> Permissions</span>
                            </div>
                            <div className="card-body">
                                <h4 style={{ marginBottom: '1rem' }}>👤 Staff Permissions</h4>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>Edit Map</label>
                                        <p className="form-hint">Allow Staff to edit map</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.staffCanEditMap ? 'active' : ''}`} onClick={() => handleToggle('staffCanEditMap')} />
                                </div>

                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}>Edit Devices</label>
                                        <p className="form-hint">Allow Staff to edit devices</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.staffCanEditDevices ? 'active' : ''}`} onClick={() => handleToggle('staffCanEditDevices')} />
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem' }}>👥 User Permissions</h4>

                                <div className="form-group">
                                    <label className="form-label">Data View Level</label>
                                    <select
                                        className="form-input"
                                        value={settings.userViewLevel}
                                        onChange={(e) => setSettings(prev => ({ ...prev, userViewLevel: e.target.value }))}
                                        style={{ maxWidth: '200px' }}
                                    >
                                        <option value="basic">Basic - View own data only</option>
                                        <option value="standard">Standard - View room data</option>
                                        <option value="full">Full - View everything</option>
                                    </select>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Security Settings */}
                    {activeTab === 'security' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Lock size={18} /> Security</span>
                            </div>
                            <div className="card-body">
                                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <label className="form-label" style={{ marginBottom: 0 }}><Key size={14} /> Two-Factor Authentication</label>
                                        <p className="form-hint">Increase security with two-factor authentication</p>
                                    </div>
                                    <div className={`toggle-switch ${settings.twoFactor ? 'active' : ''}`} onClick={() => handleToggle('twoFactor')} />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Session Timeout (minutes)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={settings.sessionTimeout}
                                        onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                                        style={{ maxWidth: '100px' }}
                                        min="5"
                                        max="120"
                                    />
                                    <p className="form-hint">Auto logout when inactive</p>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <button className="btn btn-secondary" style={{ marginRight: '0.5rem' }}>
                                    <Key size={16} /> Change Password
                                </button>
                                <button className="btn btn-danger">
                                    Logout All Devices
                                </button>
                            </div>
                        </>
                    )}

                    {/* Data Management (Admin only) */}
                    {activeTab === 'data' && role === 'admin' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Database size={18} /> Data Management</span>
                            </div>
                            <div className="card-body">
                                <h4 style={{ marginBottom: '1rem' }}>📥 Export Data</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Export Patient Data (CSV)
                                    </button>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Export Timeline (CSV)
                                    </button>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Export AI Analysis Report (PDF)
                                    </button>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Download size={16} /> Backup All Data (JSON)
                                    </button>
                                </div>

                                <h4 style={{ marginBottom: '1rem' }}>📤 Import Data</h4>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>
                                        <Upload size={16} /> Import Data
                                    </button>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem', color: 'var(--danger-500)' }}>⚠️ Danger Zone</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button className="btn btn-danger" style={{ justifyContent: 'flex-start' }}>
                                        <Trash2 size={16} /> Clear Timeline Data (30 days ago)
                                    </button>
                                    <button className="btn btn-danger" style={{ justifyContent: 'flex-start' }}>
                                        <Trash2 size={16} /> Reset All Defaults
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
