'use client';

import React, { useState, useEffect } from 'react';
import { getRoutines, RoutineApi } from '@/lib/api';
import { Clock, Zap, Home, RefreshCw } from 'lucide-react';

export default function UserRoutinesPage() {
  const [routines, setRoutines] = useState<RoutineApi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getRoutines();
        if (res.data) setRoutines(res.data.routines);
      } catch (err) {
        console.error('Failed to load routines:', err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const formatActions = (actions: { device: string; state: string }[]) => {
    if (!actions || actions.length === 0) return '';
    return actions.map(a => `Turn ${a.state} ${a.device}`).join(', ');
  };

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <RefreshCw size={40} className="animate-spin" style={{ color: 'var(--primary-500)' }} />
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>📅 My Schedule</h2>
        <p>Your daily activities</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><Clock size={18} /> Today&apos;s Schedule ({routines.length})</span>
        </div>
        <div className="card-body">
          {routines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <Clock size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3>No activities scheduled</h3>
              <p>Ask your caretaker to set up your daily routine.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {routines.map(routine => (
                <div
                  key={routine.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem', background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    borderLeft: '4px solid var(--primary-500)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary-500)', minWidth: '60px' }}>
                    {routine.time}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{routine.title}</div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {formatActions(routine.actions || []) && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--warning-500)', fontSize: '0.8rem' }}>
                          <Zap size={12} /> {formatActions(routine.actions || [])}
                        </span>
                      )}
                      {(routine.room_name || routine.room_name_en) && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--info-500)', fontSize: '0.8rem' }}>
                          <Home size={12} /> {routine.room_name_en || routine.room_name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
