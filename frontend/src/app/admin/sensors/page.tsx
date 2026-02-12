'use client';

import { useWheelSenseStore } from '@/store';
import { useTranslation } from '@/lib/i18n';
import { Gauge, Wifi, Signal } from 'lucide-react';

export default function SensorsPage() {
  const { devices, rooms, nearbyNodes } = useWheelSenseStore();

  const nodes = devices.filter((d) => d.type === 'node');

  const getRoomName = (roomId?: string) => {
    if (!roomId) return '-';
    const room = rooms.find((r) => r.id === roomId);
    return room?.nameEn || room?.name || roomId;
  };

  const getRSSIClass = (rssi: number) => {
    if (rssi >= -50) return 'rssi-excellent';
    if (rssi >= -60) return 'rssi-good';
    if (rssi >= -70) return 'rssi-fair';
    return 'rssi-weak';
  };

  const getRSSIPercentage = (rssi: number) => {
    const min = -90;
    const max = -30;
    const percentage = ((rssi - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, percentage));
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <h2>📡 RSSI Monitoring</h2>
        <p>Real-time signal strength monitoring for fingerprint localization</p>
      </div>

      {/* Live RSSI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {nodes.map((node) => (
          <div key={node.id} className="card">
            <div className="card-header">
              <span className="card-title">
                <Signal size={18} />
                {node.name}
              </span>
              <span
                className={`list-item-badge ${node.status === 'online' ? 'normal' : 'offline'}`}
              >
                {node.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Room: {getRoomName(node.room)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Node ID: <code>{node.id}</code>
                </div>
              </div>

              {node.rssi && node.status === 'online' ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: '2rem', fontWeight: 700 }}>
                      {node.rssi}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>dBm</span>
                  </div>
                  <div className="rssi-bar" style={{ height: '12px' }}>
                    <div
                      className={`rssi-bar-fill ${getRSSIClass(node.rssi)}`}
                      style={{ width: `${getRSSIPercentage(node.rssi)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>-90</span>
                    <span>-30</span>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                  <Wifi size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                  <p>No signal data</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Nearby Nodes (from MQTT) */}
      {nearbyNodes.length > 0 && (
        <div className="card mt-4">
          <div className="card-header">
            <span className="card-title">
              <Gauge size={18} />
              Nearby Nodes (Live from Gateway)
            </span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Node ID</th>
                  <th>RSSI</th>
                  <th>Distance Estimate</th>
                </tr>
              </thead>
              <tbody>
                {nearbyNodes.map((node, idx) => (
                  <tr key={idx}>
                    <td><code>{node.node_id}</code></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{node.rssi} dBm</span>
                        <div className="rssi-bar" style={{ width: '80px' }}>
                          <div
                            className={`rssi-bar-fill ${getRSSIClass(node.rssi)}`}
                            style={{ width: `${getRSSIPercentage(node.rssi)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>{node.distance_estimate.toFixed(2)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="card mt-4">
        <div className="card-body">
          <h4 className="flex items-center gap-2 mb-3">
            <Gauge size={18} style={{ color: 'var(--primary-500)' }} />
            RSSI Signal Interpretation
          </h4>
          <div className="flex gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: 'var(--success-500)' }} />
              <span>Excellent (&gt; -50 dBm) - Very close</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: 'var(--info-500)' }} />
              <span>Good (-50 to -60 dBm) - Same room</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: 'var(--warning-500)' }} />
              <span>Fair (-60 to -70 dBm) - Adjacent room</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ background: 'var(--danger-500)' }} />
              <span>Weak (&lt; -70 dBm) - Far away</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
