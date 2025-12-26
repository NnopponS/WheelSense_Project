/**
 * UserHealthPage - Health tracking page for users
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { Heart, Activity, TrendingUp } from 'lucide-react';

export function UserHealthPage() {
    const { currentUser, aiAnalysis, language } = useApp();
    const { t } = useTranslation(language);

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

export default UserHealthPage;
