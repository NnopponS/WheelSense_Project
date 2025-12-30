/**
 * UserHealthPage - Health tracking page for users
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Heart, User, Sparkles } from 'lucide-react';

export function UserHealthPage() {
    const { currentUser, aiAnalysis, language } = useApp();
    const { t } = useTranslation(language);

    // User medical conditions (no emoji)
    const userConditions = [
        { title: 'Mild Diabetes (Type 2)', description: 'Requires blood sugar monitoring' },
        { title: 'Allergic to Dust Mites', description: 'Avoid dusty environments' },
        { title: 'Uses Wheelchair for Mobility', description: 'Primary mode of transportation' }
    ];

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>❤️ {t('My Health')}</h2>
                <p>{t('Track health status and activities')}</p>
            </div>

            {/* Health Score - Simple display, no popup */}
            <div
                className={`health-card ${currentUser.healthScore < 50 ? 'danger' : currentUser.healthScore < 80 ? 'warning' : ''}`}
                style={{ marginBottom: '1.5rem' }}
            >
                <div>
                    <h3>{t('Health Score')}: {currentUser.healthScore}</h3>
                    <p>{currentUser.healthScore >= 80 ? t('Very Good Health!') : currentUser.healthScore >= 50 ? t('Fair Health') : t('Caution Required')}</p>
                </div>
                <div className="icon">
                    <Heart size={32} />
                </div>
            </div>

            {/* User Condition - Simple list only */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header">
                    <span className="card-title"><User size={18} /> {t('User Condition')}</span>
                </div>
                <div className="card-body">
                    {/* Medical Conditions List - No status summary, no emoji */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {userConditions.map((cond, index) => (
                            <div
                                key={index}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '0.75rem 1rem',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border-color)'
                                }}
                            >
                                <div style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: 'var(--primary-500)',
                                    flexShrink: 0
                                }} />
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t(cond.title)}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t(cond.description)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* AI Recommendations */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Sparkles size={18} /> {t('AI Recommendations')}</span>
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

export default UserHealthPage;
