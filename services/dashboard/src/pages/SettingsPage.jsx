import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import {
    exportPatientsCSV,
    exportTimelineCSV,
    exportAIReport,
    exportBackupJSON,
    importData,
    clearTimelineData,
    resetAllDefaults
} from '../services/api';
import {
    Settings, Users, Shield, Bell, Database, Palette, Globe,
    Lock, Monitor, Smartphone, Save, RefreshCw, Download, Upload,
    Trash2, Key, User, Mail, Phone, AlertTriangle, Check, Loader2
} from 'lucide-react';

export function SettingsPage() {
    const { role, theme, toggleTheme, currentUser, compactMode, setCompactMode, language, setLanguage } = useApp();
    const { t } = useTranslation(language);
    const [activeTab, setActiveTab] = useState(role === 'user' ? 'profile' : 'general');
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState({});
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [importFile, setImportFile] = useState(null);
    const fileInputRef = useRef(null);

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
        // API Configuration
        geminiApiKey: localStorage.getItem('gemini_api_key') || '',
        ollamaHost: localStorage.getItem('ollama_host') || 'http://localhost:11434',
    });

    // State for API testing
    const [apiTestStatus, setApiTestStatus] = useState({});

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

    // ==================== Data Management Handlers ====================

    const downloadBlob = (blob, filename) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    };

    const handleExportPatients = async () => {
        setLoading(prev => ({ ...prev, exportPatients: true }));
        try {
            const blob = await exportPatientsCSV();
            downloadBlob(blob, `patients_export_${new Date().toISOString().split('T')[0]}.csv`);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed: ' + error.message);
        }
        setLoading(prev => ({ ...prev, exportPatients: false }));
    };

    const handleExportTimeline = async () => {
        setLoading(prev => ({ ...prev, exportTimeline: true }));
        try {
            const blob = await exportTimelineCSV(30);
            downloadBlob(blob, `timeline_export_${new Date().toISOString().split('T')[0]}.csv`);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed: ' + error.message);
        }
        setLoading(prev => ({ ...prev, exportTimeline: false }));
    };

    const handleExportAIReport = async () => {
        setLoading(prev => ({ ...prev, exportAIReport: true }));
        try {
            const report = await exportAIReport();
            // Download as JSON (frontend can convert to PDF if needed)
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
            downloadBlob(blob, `ai_report_${new Date().toISOString().split('T')[0]}.json`);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed: ' + error.message);
        }
        setLoading(prev => ({ ...prev, exportAIReport: false }));
    };

    const handleExportBackup = async () => {
        setLoading(prev => ({ ...prev, exportBackup: true }));
        try {
            const blob = await exportBackupJSON();
            downloadBlob(blob, `wheelsense_backup_${new Date().toISOString().split('T')[0]}.json`);
        } catch (error) {
            console.error('Backup failed:', error);
            alert('Backup failed: ' + error.message);
        }
        setLoading(prev => ({ ...prev, exportBackup: false }));
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(prev => ({ ...prev, import: true }));
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // If it's a full backup, import each collection
            if (data.data && typeof data.data === 'object') {
                for (const [collection, items] of Object.entries(data.data)) {
                    if (Array.isArray(items) && items.length > 0) {
                        await importData(collection, items, false);
                    }
                }
                alert('Import successful! All data imported.');
            } else if (Array.isArray(data)) {
                // Single collection import - ask user which collection
                const collection = prompt('Enter collection name (patients, routines, etc):');
                if (collection) {
                    await importData(collection, data, false);
                    alert(`Import successful! ${data.length} items imported to ${collection}.`);
                }
            }
        } catch (error) {
            console.error('Import failed:', error);
            alert('Import failed: ' + error.message);
        }
        setLoading(prev => ({ ...prev, import: false }));
        event.target.value = ''; // Reset file input
    };

    const handleClearTimeline = () => {
        setConfirmDialog({
            title: 'Clear Timeline Data',
            message: 'This will delete all timeline data older than 30 days. This action cannot be undone.',
            confirmText: 'Clear Data',
            onConfirm: async () => {
                setLoading(prev => ({ ...prev, clearTimeline: true }));
                try {
                    const result = await clearTimelineData(30);
                    alert(`Cleared ${result.timeline_deleted} timeline entries and ${result.activities_deleted} activity entries.`);
                } catch (error) {
                    console.error('Clear failed:', error);
                    alert('Clear failed: ' + error.message);
                }
                setLoading(prev => ({ ...prev, clearTimeline: false }));
                setConfirmDialog(null);
            }
        });
    };

    const handleResetDefaults = () => {
        setConfirmDialog({
            title: 'Reset All Defaults',
            message: 'This will reset ALL settings to defaults and clear ALL user data including timeline, activities, routines, and doctor notes. This action CANNOT be undone!',
            confirmText: 'Reset Everything',
            danger: true,
            onConfirm: async () => {
                setLoading(prev => ({ ...prev, resetDefaults: true }));
                try {
                    const result = await resetAllDefaults();
                    alert('All data has been reset to defaults.');
                    window.location.reload();
                } catch (error) {
                    console.error('Reset failed:', error);
                    alert('Reset failed: ' + error.message);
                }
                setLoading(prev => ({ ...prev, resetDefaults: false }));
                setConfirmDialog(null);
            }
        });
    };

    // ==================== API Configuration Handlers ====================

    const handleSaveApiKeys = () => {
        // Save to localStorage
        localStorage.setItem('gemini_api_key', settings.geminiApiKey);
        localStorage.setItem('ollama_host', settings.ollamaHost);

        // Also save to backend (environment-like storage)
        fetch('/api/settings/api-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gemini_api_key: settings.geminiApiKey,
                ollama_host: settings.ollamaHost
            })
        }).catch(err => console.warn('Could not sync API keys to backend:', err));

        setApiTestStatus({ saved: true });
        setTimeout(() => setApiTestStatus({}), 2000);
    };

    const handleTestGeminiApi = async () => {
        if (!settings.geminiApiKey) {
            setApiTestStatus({ gemini: 'error', geminiMessage: 'Please enter an API key first' });
            return;
        }

        setApiTestStatus(prev => ({ ...prev, gemini: 'testing' }));

        try {
            // Test by making a simple request to Gemini
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${settings.geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Hello, just testing the API connection. Reply with "OK".' }] }]
                })
            });

            if (response.ok) {
                setApiTestStatus(prev => ({ ...prev, gemini: 'success', geminiMessage: 'API connection successful!' }));
            } else {
                const error = await response.json();
                const errorMessage = error.error?.message || `Error: ${response.status}`;
                
                // Check for quota/rate limit errors
                const isQuotaError = response.status === 429 || response.status === 503 || 
                    errorMessage.toLowerCase().includes('quota') || 
                    errorMessage.toLowerCase().includes('rate limit') ||
                    errorMessage.toLowerCase().includes('free tier');
                
                // Check if limit is 0 (quota completely exhausted)
                const isLimitZero = /limit:\s*0/i.test(errorMessage);
                
                let displayMessage = errorMessage;
                if (isQuotaError) {
                    if (isLimitZero) {
                        displayMessage = `Free tier quota exhausted (limit: 0). Your Gemini API free tier quota has been completely used. Please upgrade your plan at https://ai.google.dev/pricing or check your usage at https://ai.dev/usage?tab=rate-limit`;
                    } else {
                        // Extract retry time if available (check for seconds first, then milliseconds)
                        const retryMatchSeconds = errorMessage.match(/Please retry in ([\d.]+)s/i);
                        const retryMatchMs = errorMessage.match(/Please retry in ([\d.]+)ms/i);
                        
                        if (retryMatchSeconds) {
                            const retrySeconds = Math.ceil(parseFloat(retryMatchSeconds[1]));
                            displayMessage = `Quota exceeded. Please check your Gemini API quota and billing. Retry after ${retrySeconds} seconds. For more info: https://ai.google.dev/gemini-api/docs/rate-limits`;
                        } else if (retryMatchMs) {
                            const retryMs = parseFloat(retryMatchMs[1]);
                            const retrySeconds = Math.ceil(retryMs / 1000);
                            displayMessage = `Quota exceeded. Please check your Gemini API quota and billing. Retry after ${retrySeconds} seconds. For more info: https://ai.google.dev/gemini-api/docs/rate-limits`;
                        } else {
                            displayMessage = `Quota exceeded: ${errorMessage}. Please check your Gemini API quota and billing at https://ai.dev/usage?tab=rate-limit`;
                        }
                    }
                }
                
                setApiTestStatus(prev => ({
                    ...prev,
                    gemini: 'error',
                    geminiMessage: displayMessage
                }));
            }
        } catch (error) {
            setApiTestStatus(prev => ({
                ...prev,
                gemini: 'error',
                geminiMessage: `Network error: ${error.message}`
            }));
        }
    };

    const handleTestOllamaApi = async () => {
        setApiTestStatus(prev => ({ ...prev, ollama: 'testing' }));

        try {
            const response = await fetch(`${settings.ollamaHost}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                const models = data.models || [];
                const modelNames = models.map(m => m.name).join(', ');
                setApiTestStatus(prev => ({
                    ...prev,
                    ollama: 'success',
                    ollamaMessage: models.length > 0
                        ? `Connected! Models: ${modelNames}`
                        : 'Connected! No models installed'
                }));
            } else {
                setApiTestStatus(prev => ({
                    ...prev,
                    ollama: 'error',
                    ollamaMessage: `Error: ${response.status}`
                }));
            }
        } catch (error) {
            setApiTestStatus(prev => ({
                ...prev,
                ollama: 'error',
                ollamaMessage: 'Cannot connect to Ollama server'
            }));
        }
    };

    const adminTabs = [
        { id: 'general', label: 'General', icon: Settings },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'display', label: 'Display', icon: Monitor },
        { id: 'roles', label: 'Permissions', icon: Shield },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'api', label: 'API Configuration', icon: Key },
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
                                        {currentUser?.avatar || '👤'}
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{currentUser?.name || 'Unknown User'}</h3>
                                        <p style={{ color: 'var(--text-secondary)' }}>Wheelchair: {currentUser?.wheelchairId || 'N/A'}</p>
                                        <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
                                            Change Profile Picture
                                        </button>
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="form-label">Full Name</label>
                                        <input type="text" className="form-input" defaultValue={currentUser?.name || ''} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Age</label>
                                        <input type="number" className="form-input" defaultValue={currentUser?.age || ''} />
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

                    {/* API Configuration (Admin only) */}
                    {activeTab === 'api' && role === 'admin' && (
                        <>
                            <div className="card-header">
                                <span className="card-title"><Key size={18} /> API Configuration</span>
                            </div>
                            <div className="card-body">
                                <h4 style={{ marginBottom: '1rem' }}>🤖 Gemini AI API</h4>
                                <p className="form-hint" style={{ marginBottom: '1rem' }}>
                                    Get your API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-500)' }}>Google AI Studio</a>
                                </p>

                                <div className="form-group">
                                    <label className="form-label">Gemini API Key</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="AIzaSy..."
                                            value={settings.geminiApiKey}
                                            onChange={(e) => setSettings(prev => ({ ...prev, geminiApiKey: e.target.value }))}
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleTestGeminiApi}
                                            disabled={apiTestStatus.gemini === 'testing'}
                                        >
                                            {apiTestStatus.gemini === 'testing' ? 'Testing...' : 'Test'}
                                        </button>
                                    </div>
                                    {apiTestStatus.geminiMessage && (
                                        <p className="form-hint" style={{
                                            marginTop: '0.5rem',
                                            color: apiTestStatus.gemini === 'success' ? 'var(--success-500)' : 'var(--danger-500)'
                                        }}>
                                            {apiTestStatus.gemini === 'success' ? '✓ ' : '✗ '}{apiTestStatus.geminiMessage}
                                        </p>
                                    )}
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem' }}>🦙 Ollama (Local AI)</h4>
                                <p className="form-hint" style={{ marginBottom: '1rem' }}>
                                    Ollama host for local AI inference. Default: http://localhost:11434
                                </p>

                                <div className="form-group">
                                    <label className="form-label">Ollama Host URL</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="http://localhost:11434"
                                            value={settings.ollamaHost}
                                            onChange={(e) => setSettings(prev => ({ ...prev, ollamaHost: e.target.value }))}
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleTestOllamaApi}
                                            disabled={apiTestStatus.ollama === 'testing'}
                                        >
                                            {apiTestStatus.ollama === 'testing' ? 'Testing...' : 'Test'}
                                        </button>
                                    </div>
                                    {apiTestStatus.ollamaMessage && (
                                        <p className="form-hint" style={{
                                            marginTop: '0.5rem',
                                            color: apiTestStatus.ollama === 'success' ? 'var(--success-500)' : 'var(--danger-500)'
                                        }}>
                                            {apiTestStatus.ollama === 'success' ? '✓ ' : '✗ '}{apiTestStatus.ollamaMessage}
                                        </p>
                                    )}
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <button
                                    className="btn btn-primary"
                                    onClick={handleSaveApiKeys}
                                >
                                    <Save size={16} /> {apiTestStatus.saved ? 'Saved!' : 'Save API Settings'}
                                </button>
                                <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                                    API keys are stored securely in your browser and synced with the backend.
                                </p>
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
                                    <button
                                        className="btn btn-secondary"
                                        style={{ justifyContent: 'flex-start' }}
                                        onClick={handleExportPatients}
                                        disabled={loading.exportPatients}
                                    >
                                        {loading.exportPatients ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                                        {' '}Export Patient Data (CSV)
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ justifyContent: 'flex-start' }}
                                        onClick={handleExportTimeline}
                                        disabled={loading.exportTimeline}
                                    >
                                        {loading.exportTimeline ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                                        {' '}Export Timeline (CSV)
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ justifyContent: 'flex-start' }}
                                        onClick={handleExportAIReport}
                                        disabled={loading.exportAIReport}
                                    >
                                        {loading.exportAIReport ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                                        {' '}Export AI Analysis Report (JSON)
                                    </button>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ justifyContent: 'flex-start' }}
                                        onClick={handleExportBackup}
                                        disabled={loading.exportBackup}
                                    >
                                        {loading.exportBackup ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                                        {' '}Backup All Data (JSON)
                                    </button>
                                </div>

                                <h4 style={{ marginBottom: '1rem' }}>📤 Import Data</h4>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        accept=".json"
                                        style={{ display: 'none' }}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        style={{ justifyContent: 'flex-start' }}
                                        onClick={handleImportClick}
                                        disabled={loading.import}
                                    >
                                        {loading.import ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                                        {' '}Import Data
                                    </button>
                                    <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                                        Supports JSON backup files exported from this system
                                    </p>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                                <h4 style={{ marginBottom: '1rem', color: 'var(--danger-500)' }}>⚠️ Danger Zone</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button
                                        className="btn btn-danger"
                                        style={{ justifyContent: 'flex-start' }}
                                        onClick={handleClearTimeline}
                                        disabled={loading.clearTimeline}
                                    >
                                        {loading.clearTimeline ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                                        {' '}Clear Timeline Data (30 days ago)
                                    </button>
                                    <button
                                        className="btn btn-danger"
                                        style={{ justifyContent: 'flex-start' }}
                                        onClick={handleResetDefaults}
                                        disabled={loading.resetDefaults}
                                    >
                                        {loading.resetDefaults ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                                        {' '}Reset All Defaults
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Confirmation Dialog */}
            {confirmDialog && (
                <div className="modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="modal-content card" style={{
                        maxWidth: '400px',
                        width: '90%',
                        padding: '1.5rem'
                    }}>
                        <h3 style={{
                            marginBottom: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: confirmDialog.danger ? 'var(--danger-500)' : 'inherit'
                        }}>
                            <AlertTriangle size={20} />
                            {confirmDialog.title}
                        </h3>
                        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                            {confirmDialog.message}
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setConfirmDialog(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className={`btn ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
                                onClick={confirmDialog.onConfirm}
                            >
                                {confirmDialog.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
