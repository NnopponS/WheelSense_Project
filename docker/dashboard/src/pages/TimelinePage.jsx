import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, LogIn, LogOut, AlertTriangle, Zap, Filter, Calendar } from 'lucide-react';

export function TimelinePage() {
    const { timeline, patients, rooms } = useApp();
    const [filter, setFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('today');

    const filteredTimeline = timeline.filter(item => {
        if (filter === 'all') return true;
        return item.type === filter;
    });

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
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
                <h2>📋 Timeline & Alerts</h2>
                <p>ประวัติเหตุการณ์และการแจ้งเตือน</p>
            </div>

            <div className="card" style={{ marginBottom: '1rem' }}>
                <div className="card-body" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Filter size={16} />
                        <span>กรอง:</span>
                    </div>
                    <div className="list-filters">
                        <span className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>ทั้งหมด</span>
                        <span className={`filter-chip ${filter === 'enter' ? 'active' : ''}`} onClick={() => setFilter('enter')}>เข้าห้อง</span>
                        <span className={`filter-chip ${filter === 'exit' ? 'active' : ''}`} onClick={() => setFilter('exit')}>ออกห้อง</span>
                        <span className={`filter-chip ${filter === 'alert' ? 'active' : ''}`} onClick={() => setFilter('alert')}>⚠️ Alert</span>
                        <span className={`filter-chip ${filter === 'appliance' ? 'active' : ''}`} onClick={() => setFilter('appliance')}>เครื่องใช้ไฟฟ้า</span>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar size={16} />
                        <select className="filter-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                            <option value="today">วันนี้</option>
                            <option value="yesterday">เมื่อวาน</option>
                            <option value="week">7 วันที่แล้ว</option>
                            <option value="month">30 วันที่แล้ว</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title"><Clock size={18} /> เหตุการณ์ ({filteredTimeline.length})</span>
                </div>
                <div className="timeline">
                    {filteredTimeline.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <h3>ไม่พบเหตุการณ์</h3>
                            <p>ยังไม่มีเหตุการณ์ที่ตรงกับเงื่อนไขที่เลือก</p>
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
                                            {room && <span style={{ color: 'var(--primary-400)' }}> • {room.name}</span>}
                                        </div>
                                        <div className="timeline-time">
                                            {formatTime(item.time)} • {formatDate(item.time)}
                                        </div>
                                    </div>
                                    {item.type === 'alert' && (
                                        <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                                            ดูรายละเอียด
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
