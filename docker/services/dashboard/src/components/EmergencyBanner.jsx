import React from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { AlertTriangle, X, Phone, CheckCircle } from 'lucide-react';

export function EmergencyBanner() {
    const { emergencies, resolveEmergency, rooms, language } = useApp();
    const { t } = useTranslation(language);

    const safeEmergencies = emergencies || [];
    const safeRooms = rooms || [];
    const activeEmergency = safeEmergencies.find(e => !e.resolved);
    if (!activeEmergency) return null;

    const room = safeRooms.find(r => r.id === activeEmergency.room);

    return (
        <div className="emergency-banner" style={{ margin: '1rem 1.5rem 0' }}>
            <AlertTriangle size={32} />
            <div className="content">
                <h4>🚨 {t('Emergency')}: {activeEmergency.patient}</h4>
                <p>{activeEmergency.message} • {room?.nameEn || room?.name}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    onClick={() => window.open('tel:1669')}
                >
                    <Phone size={16} /> {t('Call 1669')}
                </button>
                <button
                    style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--success-500)' }}
                    onClick={() => resolveEmergency(activeEmergency.id)}
                >
                    <CheckCircle size={16} /> {t('Resolved')}
                </button>
            </div>
        </div>
    );
}
