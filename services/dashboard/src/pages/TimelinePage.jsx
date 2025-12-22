import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Clock, LogIn, LogOut, AlertTriangle, Zap, Filter, Calendar } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

export function TimelinePage() {
    const { timeline, patients, rooms, language } = useApp();
    const { t } = useTranslation(language);
    const [filter, setFilter] = useState('all');
    const [selectedDate, setSelectedDate] = useState(new Date());

    // Helper function to check if two dates are on the same day
    const isSameDay = (date1, date2) => {
        if (!date1 || !date2) return false;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    };

    const filteredTimeline = timeline.filter(item => {
        // Filter by type
        if (filter !== 'all' && item.type !== filter) {
            return false;
        }
        // Filter by selected date
        if (selectedDate && !isSameDay(item.time, selectedDate)) {
            return false;
        }
        return true;
    });

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const getIcon = (type) => {
        switch (type) {
            case 'enter': return LogIn;
            case 'exit': return LogOut;
            case 'alert': return AlertTriangle;
            case 'appliance': return Zap;
            default: return Clock;
        }
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📋 {t('Timeline & Alerts')}</h2>
                <p>{t('Event history and notifications')}</p>
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Filter size={16} />
                        <span>{t('Filter')}:</span>
                    </div>
                    <div className="list-filters">
                        <span className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>{t('All')}</span>
                        <span className={`filter-chip ${filter === 'enter' ? 'active' : ''}`} onClick={() => setFilter('enter')}>{t('Enter Room')}</span>
                        <span className={`filter-chip ${filter === 'exit' ? 'active' : ''}`} onClick={() => setFilter('exit')}>{t('Exit Room')}</span>
                        <span className={`filter-chip ${filter === 'alert' ? 'active' : ''}`} onClick={() => setFilter('alert')}>⚠️ {t('Alert')}</span>
                        <span className={`filter-chip ${filter === 'appliance' ? 'active' : ''}`} onClick={() => setFilter('appliance')}>{t('Appliances')}</span>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={16} />
                        <DatePicker
                            selected={selectedDate}
                            onChange={(date) => setSelectedDate(date)}
                            dateFormat="dd/MM/yyyy"
                            className="filter-select"
                            wrapperClassName="date-picker-wrapper"
                            placeholderText={t('Select Date')}
                            showPopperArrow={false}
                        />
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Clock size={18} /> {t('Events')} ({filteredTimeline.length})</span>
                </div>
                <div className="timeline">
                    {filteredTimeline.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <h3>{t('No Events Found')}</h3>
                            <p>{t('No events match the selected criteria')}</p>
                        </div>
                    ) : (
                        filteredTimeline.map(item => {
                            const Icon = getIcon(item.type);
                            const room = rooms.find(r => r.id === item.room);
                            return (
                                <div key={item.id} className="timeline-item">
                                    <div className={`timeline-icon ${item.type}`}>
                                        <Icon size={16} />
                                    </div>
                                    <div className="timeline-content">
                                        <div className="timeline-title">
                                            {item.patient && <strong>{item.patient}</strong>} {item.message}
                                            {room && <span style={{ color: 'var(--primary-400)' }}> • {room.nameEn || room.name}</span>}
                                        </div>
                                        <div className="timeline-time">
                                            {formatTime(item.time)} • {formatDate(item.time)}
                                        </div>
                                    </div>
                                    {item.type === 'alert' && (
                                        <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                                            {t('View Details')}
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
