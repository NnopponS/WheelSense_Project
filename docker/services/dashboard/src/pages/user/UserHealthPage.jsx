/**
 * UserHealthPage - Health tracking page for users
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../hooks/useTranslation';
import { getUserInfo, updateUserInfo } from '../../services/api';
import { Heart, User, Sparkles, Edit2, Save, X } from 'lucide-react';

export function UserHealthPage() {
    const { currentUser, aiAnalysis, language } = useApp();
    const { t } = useTranslation(language);
    const [condition, setCondition] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadUserInfo();
    }, []);

    const loadUserInfo = async () => {
        setLoading(true);
        try {
            const info = await getUserInfo();
            setCondition(info.condition || '');
        } catch (error) {
            console.error('Failed to load user info:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateUserInfo({ condition });
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to save condition:', error);
            alert('Failed to save: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        loadUserInfo();
        setIsEditing(false);
    };

    // Parse condition text into list items (split by newlines or bullets)
    const parseConditions = (text) => {
        if (!text) return [];
        return text
            .split(/\n|•|-\s*/)
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => ({
                title: line,
                description: ''
            }));
    };

    const userConditions = parseConditions(condition);

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

            {/* User Condition - Editable */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title"><User size={18} /> {t('User Condition')}</span>
                    {!isEditing ? (
                        <button 
                            className="btn btn-secondary btn-sm"
                            onClick={() => setIsEditing(true)}
                            disabled={loading}
                        >
                            <Edit2 size={14} /> {t('Edit')}
                        </button>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                                className="btn btn-primary btn-sm"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                <Save size={14} /> {saving ? t('Saving...') : t('Save')}
                            </button>
                            <button 
                                className="btn btn-secondary btn-sm"
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                <X size={14} /> {t('Cancel')}
                            </button>
                        </div>
                    )}
                </div>
                <div className="card-body">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
                    ) : isEditing ? (
                        <textarea
                            className="form-input"
                            value={condition}
                            onChange={(e) => setCondition(e.target.value)}
                            placeholder={t('Enter your medical conditions, one per line')}
                            rows={6}
                            style={{ width: '100%', fontFamily: 'inherit' }}
                        />
                    ) : userConditions.length > 0 ? (
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
                                        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{cond.title}</div>
                                        {cond.description && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{cond.description}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            {t('No conditions recorded. Click Edit to add.')}
                        </div>
                    )}
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
