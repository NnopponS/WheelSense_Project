'use client';

import { useState } from 'react';
import { Settings, Bell, Moon, Globe, Shield, Info } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function UserSettingsPage() {
  const { t, language: currentLang } = useTranslation();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [language, setLanguage] = useState('th');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">⚙️ {t('settings.title')}</h1>
        <p className="text-[var(--text-secondary)] text-sm">{t('settings.subtitle')}</p>
      </div>

      {/* Preferences */}
      <div className="glass-card p-4 mb-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Settings size={18} />
          {t('settings.preferences')}
        </h3>

        <div className="space-y-4">
          {/* Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                <Bell size={20} />
              </div>
              <div>
                <p className="font-medium">{t('settings.notifications')}</p>
                <p className="text-xs text-[var(--text-secondary)]">{t('settings.notificationsDesc')}</p>
              </div>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`w-12 h-7 rounded-full transition-colors ${notifications ? 'bg-emerald-500' : 'bg-[var(--border-color)]'
                }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-1 ${notifications ? 'translate-x-5' : 'translate-x-0'
                }`} />
            </button>
          </div>

          {/* Dark Mode */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                <Moon size={20} />
              </div>
              <div>
                <p className="font-medium">{t('settings.darkMode')}</p>
                <p className="text-xs text-[var(--text-secondary)]">{t('settings.darkModeDesc')}</p>
              </div>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-12 h-7 rounded-full transition-colors ${darkMode ? 'bg-emerald-500' : 'bg-[var(--border-color)]'
                }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-1 ${darkMode ? 'translate-x-5' : 'translate-x-0'
                }`} />
            </button>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400">
                <Globe size={20} />
              </div>
              <div>
                <p className="font-medium">{t('settings.language')}</p>
                <p className="text-xs text-[var(--text-secondary)]">{t('settings.languageDesc')}</p>
              </div>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-[var(--bg-secondary)] rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="th">ไทย</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="glass-card p-4 mb-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Shield size={18} />
          {t('settings.security')}
        </h3>
        <div className="space-y-3">
          <button className="w-full flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg hover:bg-[var(--bg-secondary)] transition">
            <span>{t('settings.changePassword')}</span>
            <span className="text-[var(--text-muted)]">→</span>
          </button>
          <button className="w-full flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg hover:bg-[var(--bg-secondary)] transition">
            <span>{t('settings.privacy')}</span>
            <span className="text-[var(--text-muted)]">→</span>
          </button>
        </div>
      </div>

      {/* About */}
      <div className="glass-card p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Info size={18} />
          {t('settings.about')}
        </h3>
        <div className="text-sm text-[var(--text-secondary)] space-y-2">
          <p><strong>WheelSense</strong> v2.0</p>
          <p>{t('settings.smartIndoor')}</p>
          <p className="text-xs">Using RSSI Fingerprint Localization</p>
        </div>
      </div>
    </div>
  );
}
