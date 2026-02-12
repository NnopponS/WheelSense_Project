'use client';

import React, { useEffect, useState } from 'react';
import { Clock, MapPin, Lightbulb, AlertTriangle, RefreshCw, Filter, Calendar } from 'lucide-react';
import { getTimeline, TimelineEvent } from '@/lib/api';

export default function TimelinePage() {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [total, setTotal] = useState(0);

  const fetchData = async () => {
    try {
      const params: { limit: number; event_type?: string } = { limit: 100 };
      if (filter !== 'all') {
        params.event_type = filter;
      }
      const res = await getTimeline(params);
      if (res.data) {
        setTimeline(res.data.timeline);
        setTotal(res.data.total);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching timeline:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [filter]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'location_change': return MapPin;
      case 'appliance_control': return Lightbulb;
      case 'alert': return AlertTriangle;
      default: return Clock;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'location_change': return { bg: 'var(--info-500)', gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)' };
      case 'appliance_control': return { bg: 'var(--warning-500)', gradient: 'linear-gradient(135deg, #eab308, #f97316)' };
      case 'alert': return { bg: 'var(--danger-500)', gradient: 'linear-gradient(135deg, #ef4444, #ec4899)' };
      default: return { bg: 'var(--text-muted)', gradient: 'linear-gradient(135deg, #6b7280, #4b5563)' };
    }
  };

  const getEventLabel = (type: string) => {
    switch (type) {
      case 'location_change': return 'Location';
      case 'appliance_control': return 'Appliance';
      case 'alert': return 'Alert';
      default: return 'Event';
    }
  };

  const groupEventsByDate = (events: TimelineEvent[]) => {
    const groups: Record<string, TimelineEvent[]> = {};
    events.forEach(event => {
      const date = new Date(event.timestamp).toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
    });
    return groups;
  };

  const groupedTimeline = groupEventsByDate(timeline);

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>📅 Timeline</h2>
          <p>Activity history and event logs</p>
        </div>
        <select
          className="form-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: '200px' }}
        >
          <option value="all">All Events</option>
          <option value="location_change">Location Changes</option>
          <option value="appliance_control">Appliance Control</option>
          <option value="alert">Alerts</option>
        </select>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-icon primary"><Clock /></div>
          <div className="stat-content">
            <h3>{total}</h3>
            <p>Total Events</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info"><MapPin /></div>
          <div className="stat-content">
            <h3>{timeline.filter(e => e.event_type === 'location_change').length}</h3>
            <p>Location Changes</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success"><Lightbulb /></div>
          <div className="stat-content">
            <h3>{timeline.filter(e => e.event_type === 'appliance_control').length}</h3>
            <p>Appliance Events</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning"><AlertTriangle /></div>
          <div className="stat-content">
            <h3>{timeline.filter(e => e.event_type === 'alert').length}</h3>
            <p>Alerts</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Calendar size={18} /> Events</span>
        </div>
        <div className="card-body" style={{ padding: '1.5rem' }}>
          {Object.keys(groupedTimeline).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Clock size={64} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Events</h3>
              <p>Activity will appear here as events occur</p>
            </div>
          ) : (
            Object.entries(groupedTimeline).map(([date, events]) => (
              <div key={date} style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <Calendar size={18} style={{ color: 'var(--text-muted)' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{date}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>({events.length} events)</span>
                </div>

                <div style={{ position: 'relative', paddingLeft: '2rem', borderLeft: '2px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {events.map((event) => {
                    const Icon = getEventIcon(event.event_type);
                    const colors = getEventColor(event.event_type);
                    return (
                      <div key={event.id} style={{ position: 'relative' }}>
                        {/* Timeline dot */}
                        <div style={{
                          position: 'absolute',
                          left: '-2.55rem',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: colors.gradient,
                          border: '2px solid var(--bg-primary)',
                          top: '0.75rem'
                        }} />

                        <div style={{
                          background: 'var(--bg-tertiary)',
                          borderRadius: 'var(--radius-lg)',
                          padding: '1rem',
                          transition: '0.2s'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                            <div style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: 'var(--radius-md)',
                              background: colors.gradient,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              flexShrink: 0
                            }}>
                              <Icon size={20} />
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <span style={{
                                  fontSize: '0.7rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: 'var(--radius-sm)',
                                  background: colors.gradient,
                                  color: 'white',
                                  fontWeight: 500
                                }}>
                                  {getEventLabel(event.event_type)}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  {new Date(event.timestamp).toLocaleTimeString('th-TH')}
                                </span>
                              </div>

                              <p style={{ fontWeight: 500 }}>
                                {event.description || (
                                  event.event_type === 'location_change'
                                    ? `${event.patient_name || event.wheelchair_name} moved to ${event.to_room_name}`
                                    : 'Event occurred'
                                )}
                              </p>

                              {event.event_type === 'location_change' && event.from_room_name && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  From: {event.from_room_name} → To: {event.to_room_name}
                                </p>
                              )}

                              {(event.patient_name || event.wheelchair_name) && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  {event.patient_name && `Patient: ${event.patient_name}`}
                                  {event.wheelchair_name && ` • Wheelchair: ${event.wheelchair_name}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
