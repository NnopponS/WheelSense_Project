import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useTranslation } from '../hooks/useTranslation';
import { Clock, LogIn, LogOut, AlertTriangle, Zap, Filter, Calendar, MapPin, BarChart3, RefreshCw } from 'lucide-react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import * as api from '../services/api';

export function TimelinePage() {
    const { timeline: localTimeline, patients, rooms, currentUser } = useApp();
    const { t } = useTranslation();
    const [filter, setFilter] = useState('all');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('live'); // 'live' or 'history'
    const [apiTimeline, setApiTimeline] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);

    // Fetch timeline from API
    const fetchTimeline = useCallback(async () => {
        setLoading(true);
        try {
            if (viewMode === 'history') {
                // Fetch historical timeline for selected date
                const dateStr = selectedDate.toISOString().split('T')[0];
                const result = await api.getTimelineHistory(dateStr, currentUser?.id);
                const timelineData = result.timeline || result || [];
                console.log('[TimelinePage] Fetched history timeline:', timelineData.length, 'events');
                setApiTimeline(Array.isArray(timelineData) ? timelineData : []);

                // Use first patient as fallback if currentUser is not set
                const patientId = currentUser?.id || patients[0]?.id;
                if (patientId) {
                    const summaryData = await api.getTimelineSummary(patientId, dateStr);
                    setSummary(summaryData);
                }
            } else {
                // Fetch recent timeline
                const events = await api.getTimeline({ limit: 100 });
                const timelineData = events.timeline || events || [];
                console.log('[TimelinePage] Fetched live timeline:', Array.isArray(timelineData) ? timelineData.length : 0, 'events');
                setApiTimeline(Array.isArray(timelineData) ? timelineData : []);
                setSummary(null);
            }
        } catch (error) {
            console.error('[TimelinePage] Failed to fetch timeline:', error);
            setApiTimeline([]);
        } finally {
            setLoading(false);
        }
    }, [viewMode, selectedDate, currentUser, patients]);

    useEffect(() => {
        fetchTimeline();
    }, [fetchTimeline]);

    // Combine local timeline with API timeline
    const combinedTimeline = React.useMemo(() => {
        const api = Array.isArray(apiTimeline) ? apiTimeline : [];
        const local = Array.isArray(localTimeline) ? localTimeline : [];
        const combined = viewMode === 'live' ? [...api, ...local] : api;
        console.log('[TimelinePage] Combined timeline:', {
            apiCount: api.length,
            localCount: local.length,
            combinedCount: combined.length,
            viewMode
        });
        return combined;
    }, [apiTimeline, localTimeline, viewMode]);

    // Helper function to check if two dates are on the same day
    const isSameDay = (date1, date2) => {
        if (!date1 || !date2) return false;
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();
    };

    const filteredTimeline = combinedTimeline.filter(item => {
        if (!item) return false;

        const itemType = item.type || (item.fromRoom ? 'location_change' : 'enter');

        // Filter by type
        if (filter !== 'all') {
            if (filter === 'location' && itemType !== 'location_change') return false;
            if (filter !== 'location' && itemType !== filter) return false;
        }

        // Filter by selected date in live mode (only if date is explicitly selected and not today)
        if (viewMode === 'live' && selectedDate) {
            const today = new Date();
            const isToday = isSameDay(selectedDate, today);
            // If filtering by today, show all recent events
            // If filtering by past date, only show events from that date
            if (!isToday) {
                const itemTime = item.time || item.timestamp;
                if (!itemTime) return false;
                if (!isSameDay(itemTime, selectedDate)) return false;
            }
        }

        return true;
    }).sort((a, b) => {
        const timeA = new Date(a.time || a.timestamp || 0);
        const timeB = new Date(b.time || b.timestamp || 0);
        return timeB - timeA; // Most recent first
    });

    const formatTime = (date) => {
        if (!date) return '--:--';
        return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date) => {
        if (!date) return '';
        return new Date(date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    const getIcon = (type) => {
        switch (type) {
            case 'enter': return LogIn;
            case 'exit': return LogOut;
            case 'alert': return AlertTriangle;
            case 'appliance': return Zap;
            case 'location_change': return MapPin;
            default: return Clock;
        }
    };

    const getEventMessage = (item) => {
        if (item.type === 'location_change') {
            const fromRoom = rooms.find(r => r.id === item.fromRoom || r.roomType === item.fromRoom);
            const toRoom = rooms.find(r => r.id === item.toRoom || r.roomType === item.toRoom);
            const fromName = fromRoom?.nameEn || fromRoom?.name || item.fromRoom || 'Unknown';
            const toName = toRoom?.nameEn || toRoom?.name || item.toRoom || 'Unknown';

            if (!item.fromRoom) {
                return `${t('Detected at')} ${toName}`;
            }
            return `${t('Moved from')} ${fromName} → ${toName}`;
        }
        return item.message || '';
    };

    return (
        <div className="page-content">
            <div className="page-header">
                <h2>📋 {t('Timeline & Location History')}</h2>
                <p>{t('Track user movements and events')}</p>
            </div>

            {/* View Mode Tabs */}
            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div className="list-filters">
                        <span
                            className={`filter-chip ${viewMode === 'live' ? 'active' : ''}`}
                            onClick={() => setViewMode('live')}
                        >
                            🔴 {t('Live')}
                        </span>
                        <span
                            className={`filter-chip ${viewMode === 'history' ? 'active' : ''}`}
                            onClick={() => setViewMode('history')}
                        >
                            📊 {t('Historical Analysis')}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Filter size={16} />
                        <span>{t('Filter')}:</span>
                    </div>
                    <div className="list-filters">
                        <span className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>{t('All')}</span>
                        <span className={`filter-chip ${filter === 'location' ? 'active' : ''}`} onClick={() => setFilter('location')}>📍 {t('Location')}</span>
                        <span className={`filter-chip ${filter === 'enter' ? 'active' : ''}`} onClick={() => setFilter('enter')}>{t('Enter')}</span>
                        <span className={`filter-chip ${filter === 'exit' ? 'active' : ''}`} onClick={() => setFilter('exit')}>{t('Exit')}</span>
                        <span className={`filter-chip ${filter === 'appliance' ? 'active' : ''}`} onClick={() => setFilter('appliance')}>{t('Appliance')}</span>
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
                        <button
                            className="btn btn-secondary"
                            onClick={fetchTimeline}
                            disabled={loading}
                            style={{ padding: '0.5rem' }}
                        >
                            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Summary Card (for Historical Analysis mode) */}
            {viewMode === 'history' && summary && (
                <div className="card" style={{ marginBottom: '1rem' }}>
                    <div className="card-header">
                        <span className="card-title"><BarChart3 size={18} /> {t('Daily Summary')}</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                            <div className="stat-item">
                                <div className="stat-value">{summary.totalEvents || 0}</div>
                                <div className="stat-label">{t('Total Events')}</div>
                            </div>
                            {summary.roomVisitCounts && Object.entries(summary.roomVisitCounts).map(([room, count]) => {
                                const roomData = rooms.find(r => r.id === room || r.roomType === room);
                                return (
                                    <div key={room} className="stat-item">
                                        <div className="stat-value">{count}</div>
                                        <div className="stat-label">{roomData?.nameEn || roomData?.name || room}</div>
                                    </div>
                                );
                            })}
                            {summary.roomTimeDistribution && Object.entries(summary.roomTimeDistribution).map(([room, seconds]) => {
                                const roomData = rooms.find(r => r.id === room || r.roomType === room);
                                return (
                                    <div key={`time-${room}`} className="stat-item">
                                        <div className="stat-value">{formatDuration(seconds)}</div>
                                        <div className="stat-label">{t('Time in')} {roomData?.nameEn || roomData?.name || room}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Clock size={18} /> {t('Events')} ({filteredTimeline.length})</span>
                </div>
                <div className="timeline">
                    {loading ? (
                        <div className="empty-state">
                            <RefreshCw size={48} className="spinning" />
                            <h3>{t('Loading...')}</h3>
                        </div>
                    ) : filteredTimeline.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <h3>{t('No Events Found')}</h3>
                            <p>{t('No events match the selected criteria')}</p>
                        </div>
                    ) : (
                        filteredTimeline.map((item, index) => {
                            const itemType = item.type || 'enter';
                            const Icon = getIcon(itemType);
                            const room = rooms.find(r => r.id === item.room || r.id === item.toRoom || r.roomType === item.toRoom);
                            const itemTime = item.time || item.timestamp;
                            const userName = item.userName || item.patient || patients.find(p => p.id === item.userId)?.name;

                            return (
                                <div key={item.id || item._id || index} className="timeline-item">
                                    <div className={`timeline-icon ${itemType}`}>
                                        <Icon size={16} />
                                    </div>
                                    <div className="timeline-content">
                                        <div className="timeline-title">
                                            {userName && <strong>{userName}</strong>} {getEventMessage(item)}
                                            {room && itemType !== 'location_change' && (
                                                <span style={{ color: 'var(--primary-400)' }}> • {room.nameEn || room.name}</span>
                                            )}
                                        </div>
                                        <div className="timeline-time">
                                            {formatTime(itemTime)} • {formatDate(itemTime)}
                                            {item.durationInPreviousRoom && (
                                                <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                                                    ({formatDuration(item.durationInPreviousRoom)} {t('in previous room')})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {itemType === 'alert' && (
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
