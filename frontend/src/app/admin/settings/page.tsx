'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { getHealth, HealthResponse } from '@/lib/api';
import {
  Settings, Users, Shield, Bell, Database, Palette, Globe,
  Lock, Monitor, Smartphone, Save, RefreshCw, Download, Upload,
  Trash2, Key, User, Mail, Phone, AlertTriangle, Check, Loader2,
  Server, Radio, Home, Wifi
} from 'lucide-react';

interface ConfirmDialog {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface LoadingState {
  [key: string]: boolean;
}

interface ApiTestStatus {
  gemini?: 'testing' | 'success' | 'error';
  geminiMessage?: string;
  ollama?: 'testing' | 'success' | 'error';
  ollamaMessage?: string;
  saved?: boolean;
}

export default function SettingsPage() {
  const { role, theme, setTheme, language, setLanguage } = useWheelSenseStore();
  const [activeTab, setActiveTab] = useState(role === 'user' ? 'profile' : 'general');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState<LoadingState>({});
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState({
    // General
    autoRefresh: true,
    refreshInterval: 5,
    // Notifications
    notifications: true,
    soundAlerts: true,
    lineNotify: false,
    emailNotify: false,
    emergencyContact: '1669',
    lineToken: '',
    // Security
    twoFactor: false,
    sessionTimeout: 30,
    // Permissions
    staffCanEditMap: false,
    staffCanEditDevices: false,
    userViewLevel: 'basic',
    // Display
    compactMode: false,
    showOfflineDevices: true,
    mapAutoCenter: true,
    // API
    geminiApiKey: '',
    ollamaHost: 'http://localhost:11434',
    // MQTT & HA
    mqttBroker: process.env.NEXT_PUBLIC_MQTT_BROKER || 'localhost',
    mqttPort: '1883',
    mqttTopic: 'WheelSense/data',
    haUrl: process.env.NEXT_PUBLIC_HA_URL || 'http://localhost:8123',
    haToken: '',
    apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    staleTimeout: '30',
    nodeTimeout: '30',
  });

  const [apiTestStatus, setApiTestStatus] = useState<ApiTestStatus>({});

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedGeminiKey = localStorage.getItem('gemini_api_key') || '';
      const savedOllamaHost = localStorage.getItem('ollama_host') || 'http://localhost:11434';
      setSettings(prev => ({
        ...prev,
        geminiApiKey: savedGeminiKey,
        ollamaHost: savedOllamaHost,
      }));
    }
  }, []);

  // Fetch health status
  const fetchHealth = async () => {
    try {
      const res = await getHealth();
      if (res.data) setHealth(res.data);
    } catch (error) {
      console.error('Error fetching health:', error);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = (key: string) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key as keyof typeof settings] }));
  };

  const handleSave = () => {
    // Save API keys to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('gemini_api_key', settings.geminiApiKey);
      localStorage.setItem('ollama_host', settings.ollamaHost);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // API Test Handlers
  const handleTestGeminiApi = async () => {
    if (!settings.geminiApiKey) {
      setApiTestStatus({ gemini: 'error', geminiMessage: 'Please enter an API key first' });
      return;
    }

    setApiTestStatus(prev => ({ ...prev, gemini: 'testing' }));

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${settings.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Hello, just testing. Reply with "OK".' }] }]
          })
        }
      );

      if (response.ok) {
        setApiTestStatus(prev => ({ ...prev, gemini: 'success', geminiMessage: 'API connection successful!' }));
      } else {
        const error = await response.json();
        setApiTestStatus(prev => ({
          ...prev,
          gemini: 'error',
          geminiMessage: error.error?.message || `Error: ${response.status}`
        }));
      }
    } catch (error) {
      setApiTestStatus(prev => ({
        ...prev,
        gemini: 'error',
        geminiMessage: `Network error: ${error instanceof Error ? error.message : 'Unknown'}`
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
        setApiTestStatus(prev => ({
          ...prev,
          ollama: 'success',
          ollamaMessage: models.length > 0
            ? `Connected! Models: ${models.map((m: { name: string }) => m.name).join(', ')}`
            : 'Connected! No models installed'
        }));
      } else {
        setApiTestStatus(prev => ({
          ...prev,
          ollama: 'error',
          ollamaMessage: `Error: ${response.status}`
        }));
      }
    } catch {
      setApiTestStatus(prev => ({
        ...prev,
        ollama: 'error',
        ollamaMessage: 'Cannot connect to Ollama server'
      }));
    }
  };

  // Data Management Handlers
  const handleExportBackup = async () => {
    setLoading(prev => ({ ...prev, exportBackup: true }));
    try {
      const response = await fetch(`${settings.apiUrl}/api/data/export/backup`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wheelsense_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Export failed');
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
    setLoading(prev => ({ ...prev, exportBackup: false }));
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(prev => ({ ...prev, import: true }));
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // TODO: Implement import API call
      console.log('Import data:', data);
      alert('Import functionality will be available soon');
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
    setLoading(prev => ({ ...prev, import: false }));
    event.target.value = '';
  };

  const handleResetDefaults = () => {
    setConfirmDialog({
      title: 'Reset All Defaults',
      message: 'This will reset ALL settings to defaults. This action CANNOT be undone!',
      confirmText: 'Reset Everything',
      danger: true,
      onConfirm: async () => {
        // TODO: Implement reset API call
        alert('Reset functionality will be available soon');
        setConfirmDialog(null);
      }
    });
  };

  const adminTabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'system', label: 'System Status', icon: Server },
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
          <h2>⚙️ Settings</h2>
          <p>{role === 'admin' ? 'System configuration and connection status' : 'Personal settings'}</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
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
                style={{ width: '100%', textAlign: 'left' }}
              >
                <tab.icon size={18} /> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Settings Content */}
        <div className="card">
          {/* System Status Tab */}
          {activeTab === 'system' && (
            <>
              <div className="card-header">
                <span className="card-title"><Server size={18} /> System Status</span>
              </div>
              <div className="card-body">
                {healthLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
                  </div>
                ) : (
                  <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <div className="stat-card">
                      <div className="stat-icon primary"><Database size={20} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{health?.database === 'connected' ? '✓' : '✗'}</div>
                        <div className="stat-label">Database</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon info"><Radio size={20} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{health?.mqtt_connected ? '✓' : '✗'}</div>
                        <div className="stat-label">MQTT Broker</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon warning"><Home size={20} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{health?.ha_connected ? '✓' : '✗'}</div>
                        <div className="stat-label">Home Assistant</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon success"><Wifi size={20} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{health?.online_nodes || 0}</div>
                        <div className="stat-label">Nodes Online</div>
                      </div>
                    </div>
                  </div>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  {/* MQTT Config */}
                  <div>
                    <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Radio size={18} /> MQTT Configuration
                    </h4>
                    <div className="form-group">
                      <label className="form-label">Broker Address</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settings.mqttBroker}
                        onChange={(e) => setSettings({ ...settings, mqttBroker: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Port</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settings.mqttPort}
                        onChange={(e) => setSettings({ ...settings, mqttPort: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Topic</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settings.mqttTopic}
                        onChange={(e) => setSettings({ ...settings, mqttTopic: e.target.value })}
                      />
                    </div>
                    <p className="form-hint">* MQTT settings are configured via environment variables on the backend</p>
                  </div>

                  {/* HA Config */}
                  <div>
                    <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Home size={18} /> Home Assistant
                    </h4>
                    <div className="form-group">
                      <label className="form-label">URL</label>
                      <input
                        type="text"
                        className="form-input"
                        value={settings.haUrl}
                        onChange={(e) => setSettings({ ...settings, haUrl: e.target.value })}
                        placeholder="http://localhost:8123"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Access Token</label>
                      <input
                        type="password"
                        className="form-input"
                        value={settings.haToken}
                        onChange={(e) => setSettings({ ...settings, haToken: e.target.value })}
                        placeholder="••••••••••••••••"
                      />
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-md)'
                    }}>
                      {health?.ha_connected ? (
                        <>
                          <Check size={18} style={{ color: 'var(--success-500)' }} />
                          <span style={{ color: 'var(--success-500)', fontSize: '0.875rem' }}>
                            Connected to Home Assistant
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={18} style={{ color: 'var(--danger-500)' }} />
                          <span style={{ color: 'var(--danger-500)', fontSize: '0.875rem' }}>
                            Not connected - Check token and URL
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                {/* RSSI Settings */}
                <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Wifi size={18} /> RSSI Fingerprinting
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Stale Data Timeout (seconds)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={settings.staleTimeout}
                      onChange={(e) => setSettings({ ...settings, staleTimeout: e.target.value })}
                    />
                    <p className="form-hint">Mark wheelchair data as stale after this time without updates</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Node Timeout (seconds)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={settings.nodeTimeout}
                      onChange={(e) => setSettings({ ...settings, nodeTimeout: e.target.value })}
                    />
                    <p className="form-hint">Mark node as offline after this time without detection</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* General Settings Tab */}
          {activeTab === 'general' && (
            <>
              <div className="card-header">
                <span className="card-title"><Settings size={18} /> General Settings</span>
              </div>
              <div className="card-body">
                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: 0 }}><Globe size={14} /> Language</label>
                    <p className="form-hint">Select interface language</p>
                  </div>
                  <select
                    className="form-input"
                    style={{ width: '150px' }}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'en' | 'th')}
                  >
                    <option value="en">English</option>
                    <option value="th">ไทย</option>
                  </select>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: 0 }}><RefreshCw size={14} /> Auto Refresh</label>
                    <p className="form-hint">Auto refresh data</p>
                  </div>
                  <div
                    className={`toggle-switch ${settings.autoRefresh ? 'active' : ''}`}
                    onClick={() => handleToggle('autoRefresh')}
                  />
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

          {/* Display Settings Tab */}
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
                      onClick={() => setTheme('light')}
                      style={{ flex: 1 }}
                    >
                      ☀️ Light Mode
                    </button>
                    <button
                      className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setTheme('dark')}
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
                  <div
                    className={`toggle-switch ${settings.compactMode ? 'active' : ''}`}
                    onClick={() => handleToggle('compactMode')}
                  />
                </div>

                {role === 'admin' && (
                  <>
                    <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <label className="form-label" style={{ marginBottom: 0 }}>Show Offline Devices</label>
                        <p className="form-hint">Show devices that are not connected</p>
                      </div>
                      <div
                        className={`toggle-switch ${settings.showOfflineDevices ? 'active' : ''}`}
                        onClick={() => handleToggle('showOfflineDevices')}
                      />
                    </div>

                    <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <label className="form-label" style={{ marginBottom: 0 }}>Map Auto-Center</label>
                        <p className="form-hint">Auto scroll map to new events</p>
                      </div>
                      <div
                        className={`toggle-switch ${settings.mapAutoCenter ? 'active' : ''}`}
                        onClick={() => handleToggle('mapAutoCenter')}
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* Notifications Tab */}
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
                  <div
                    className={`toggle-switch ${settings.notifications ? 'active' : ''}`}
                    onClick={() => handleToggle('notifications')}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: 0 }}>🔊 Sound Alerts</label>
                    <p className="form-hint">Enable sound alerts</p>
                  </div>
                  <div
                    className={`toggle-switch ${settings.soundAlerts ? 'active' : ''}`}
                    onClick={() => handleToggle('soundAlerts')}
                  />
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '1.5rem 0' }} />

                <h4 style={{ marginBottom: '1rem' }}>Notification Channels</h4>

                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: 0 }}>📱 LINE Notify</label>
                    <p className="form-hint">Send notifications via LINE</p>
                  </div>
                  <div
                    className={`toggle-switch ${settings.lineNotify ? 'active' : ''}`}
                    onClick={() => handleToggle('lineNotify')}
                  />
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
                  <div
                    className={`toggle-switch ${settings.emailNotify ? 'active' : ''}`}
                    onClick={() => handleToggle('emailNotify')}
                  />
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

          {/* Permissions Tab (Admin only) */}
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
                  <div
                    className={`toggle-switch ${settings.staffCanEditMap ? 'active' : ''}`}
                    onClick={() => handleToggle('staffCanEditMap')}
                  />
                </div>

                <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: 0 }}>Edit Devices</label>
                    <p className="form-hint">Allow Staff to edit devices</p>
                  </div>
                  <div
                    className={`toggle-switch ${settings.staffCanEditDevices ? 'active' : ''}`}
                    onClick={() => handleToggle('staffCanEditDevices')}
                  />
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

          {/* Security Tab */}
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
                  <div
                    className={`toggle-switch ${settings.twoFactor ? 'active' : ''}`}
                    onClick={() => handleToggle('twoFactor')}
                  />
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

          {/* API Configuration Tab (Admin only) */}
          {activeTab === 'api' && role === 'admin' && (
            <>
              <div className="card-header">
                <span className="card-title"><Key size={18} /> API Configuration</span>
              </div>
              <div className="card-body">
                <h4 style={{ marginBottom: '1rem' }}>🤖 Gemini AI API</h4>
                <p className="form-hint" style={{ marginBottom: '1rem' }}>
                  Get your API key from{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-500)' }}>
                    Google AI Studio
                  </a>
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

                <button className="btn btn-primary" onClick={handleSave}>
                  <Save size={16} /> {saved ? 'Saved!' : 'Save API Settings'}
                </button>
                <p className="form-hint" style={{ marginTop: '0.5rem' }}>
                  API keys are stored securely in your browser.
                </p>
              </div>
            </>
          )}

          {/* Data Management Tab (Admin only) */}
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
                    onClick={handleResetDefaults}
                  >
                    <Trash2 size={16} /> Reset All Defaults
                  </button>
                </div>
              </div>
            </>
          )}

          {/* User Profile Tab */}
          {activeTab === 'profile' && role === 'user' && (
            <>
              <div className="card-header">
                <span className="card-title"><User size={18} /> My Profile</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
                  <div className="user-avatar" style={{ width: 80, height: 80, fontSize: '2rem' }}>
                    👤
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>User</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Wheelchair: N/A</p>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
                      Change Profile Picture
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Name (Thai) / ชื่อภาษาไทย</label>
                  <input type="text" className="form-input" placeholder="ชื่อภาษาไทย" />
                </div>

                <div className="form-group">
                  <label className="form-label">Name (English)</label>
                  <input type="text" className="form-input" placeholder="English Name" />
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
        </div>
      </div>

      {/* About Section */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-body">
          <h3 style={{ marginBottom: '1rem' }}>About WheelSense v2.0</h3>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <p><strong>Version:</strong> 2.0.0</p>
            <p><strong>Technology:</strong> RSSI Fingerprint Localization using M5StickCPlus2</p>
            <p><strong>Frontend:</strong> Next.js 16 with TypeScript</p>
            <p><strong>Backend:</strong> Python FastAPI with SQLite</p>
            <p><strong>Integration:</strong> MQTT + Home Assistant</p>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div style={{
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
          <div className="card" style={{
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
