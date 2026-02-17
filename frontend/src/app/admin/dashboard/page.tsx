'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Layers,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Timer,
  Wifi,
  Wrench,
} from 'lucide-react';
import {
  getCameras,
  getDataQuality,
  getDeviceStats,
  getHealth,
  getSystemReadiness,
  getTodayTimeline,
  getWheelchairs,
  triggerHistoryRetention,
  type CameraNode,
  type DataQualityResponse,
  type DeviceStats,
  type HealthResponse,
  type HistoryRetentionResponse,
  type SystemReadinessResponse,
  type TimelineEvent,
  type Wheelchair,
} from '@/lib/api';

function formatAgo(value?: string | null): string {
  if (!value) return '-';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '-';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function asPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function statusClass(ok: boolean): string {
  return ok ? 'online' : 'offline';
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retentionPending, setRetentionPending] = useState(false);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<SystemReadinessResponse | null>(null);
  const [quality, setQuality] = useState<DataQualityResponse | null>(null);
  const [deviceStats, setDeviceStats] = useState<DeviceStats | null>(null);
  const [wheelchairs, setWheelchairs] = useState<Wheelchair[]>([]);
  const [cameras, setCameras] = useState<CameraNode[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [retentionResult, setRetentionResult] = useState<HistoryRetentionResponse | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    const [
      healthRes,
      readinessRes,
      qualityRes,
      statsRes,
      wheelchairsRes,
      camerasRes,
      timelineRes,
    ] = await Promise.all([
      getHealth(),
      getSystemReadiness(),
      getDataQuality(),
      getDeviceStats(),
      getWheelchairs(),
      getCameras(),
      getTodayTimeline(8),
    ]);

    const errors = [
      healthRes.error,
      readinessRes.error,
      qualityRes.error,
      statsRes.error,
      wheelchairsRes.error,
      camerasRes.error,
      timelineRes.error,
    ].filter(Boolean) as string[];

    if (healthRes.data) setHealth(healthRes.data);
    if (readinessRes.data) setReadiness(readinessRes.data);
    if (qualityRes.data) setQuality(qualityRes.data);
    if (statsRes.data) setDeviceStats(statsRes.data);
    if (wheelchairsRes.data) setWheelchairs(wheelchairsRes.data.wheelchairs || []);
    if (camerasRes.data) setCameras(camerasRes.data.cameras || []);
    if (timelineRes.data) setTimeline(timelineRes.data.timeline || []);

    setError(errors.length > 0 ? errors.join(' | ') : null);
    setLastUpdatedAt(new Date().toISOString());
    setLoading(false);
    if (silent) setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchData(true);
    }, 8000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData]);

  const runRetention = async (dryRun: boolean) => {
    if (!dryRun) {
      const ok = window.confirm(
        'Run retention now? This will delete old raw history rows based on retention policy.'
      );
      if (!ok) return;
    }

    setRetentionPending(true);
    const res = await triggerHistoryRetention({
      dry_run: dryRun,
      aggregate_hourly: true,
      aggregate_daily: true,
    });
    setRetentionPending(false);

    if (res.error) {
      setError(`Retention error: ${res.error}`);
      return;
    }

    if (res.data) {
      setRetentionResult(res.data);
    }
    fetchData(true);
  };

  const summary = useMemo(() => {
    const onlineWheelchairs = wheelchairs.filter((w) => w.status !== 'offline').length;
    const cameraMapped = quality?.mapping.cameras.mapped || 0;
    const cameraTotal = quality?.mapping.cameras.total || 0;
    const staleCount = quality?.stale_device_count || 0;
    const unknownRatio = quality?.unknown_room_ratio || 0;
    const readinessState = readiness?.state || 'degraded';
    const offlineCameras = cameras.filter((c) => c.status === 'offline').length;

    return {
      onlineWheelchairs,
      cameraMapped,
      cameraTotal,
      staleCount,
      unknownRatio,
      readinessState,
      offlineCameras,
    };
  }, [wheelchairs, quality, readiness, cameras]);

  if (loading) {
    return (
      <div className="empty-state" style={{ height: '80vh' }}>
        <div className="loading-spinner" />
        <h3>Loading dashboard...</h3>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ maxWidth: '1560px', margin: '0 auto' }}>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}
      >
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LayoutDashboard size={24} />
            Operations Dashboard
          </h2>
          <p>
            Pilot readiness, data quality, runtime diagnostics, and control actions in one place.
          </p>
          <p style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Last update: {formatAgo(lastUpdatedAt)} {refreshing ? '(refreshing...)' : ''}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label
            className="btn btn-secondary"
            style={{ gap: '0.35rem', cursor: 'pointer', userSelect: 'none' }}
            title="Refresh dashboard every 8 seconds"
          >
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: 'var(--primary-500)' }}
            />
            Auto refresh
          </label>
          <button className="btn btn-secondary" onClick={() => fetchData(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>
          <button className="btn btn-warning" onClick={() => runRetention(true)} disabled={retentionPending}>
            <Timer size={16} />
            Retention Dry Run
          </button>
          <button className="btn btn-danger" onClick={() => runRetention(false)} disabled={retentionPending}>
            <Wrench size={16} />
            Run Retention
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger-500)', marginBottom: '1rem' }}>
          <div className="card-body" style={{ color: 'var(--danger-400)', fontSize: '0.9rem' }}>
            {error}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.9rem',
          marginBottom: '1rem',
        }}
      >
        <div className="stat-card">
          <div className={`stat-icon ${summary.readinessState === 'ready' ? 'success' : 'warning'}`}>
            <ShieldCheck size={22} />
          </div>
          <div className="stat-content">
            <h3>{summary.readinessState.toUpperCase()}</h3>
            <p>System readiness</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary">
            <Wifi size={22} />
          </div>
          <div className="stat-content">
            <h3>{summary.onlineWheelchairs}/{wheelchairs.length}</h3>
            <p>Active wheelchairs</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon info">
            <Server size={22} />
          </div>
          <div className="stat-content">
            <h3>{deviceStats?.online || 0}/{deviceStats?.total || 0}</h3>
            <p>Online BLE nodes</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon success">
            <Layers size={22} />
          </div>
          <div className="stat-content">
            <h3>{summary.cameraMapped}/{summary.cameraTotal}</h3>
            <p>Mapped cameras</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon warning">
            <AlertTriangle size={22} />
          </div>
          <div className="stat-content">
            <h3>{asPercent(summary.unknownRatio)}</h3>
            <p>Unknown room ratio</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon danger">
            <Gauge size={22} />
          </div>
          <div className="stat-content">
            <h3>{summary.staleCount}</h3>
            <p>Stale devices</p>
          </div>
        </div>
      </div>

      <div className="dashboard-grid" style={{ gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Server size={18} />
                Infrastructure Readiness
              </span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: '0.6rem' }}>
              <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                <div className="list-item-content">
                  <div className="list-item-title">Database</div>
                  <div className="list-item-subtitle">Backend storage and query path</div>
                </div>
                <span className={`list-item-badge ${statusClass(Boolean(readiness?.infrastructure.database_connected))}`}>
                  {readiness?.infrastructure.database_connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                <div className="list-item-content">
                  <div className="list-item-title">MQTT Broker</div>
                  <div className="list-item-subtitle">
                    {health?.mqtt_metrics?.broker || '-'}:{health?.mqtt_metrics?.port || '-'} | topic {health?.mqtt_metrics?.topic || '-'}
                  </div>
                </div>
                <span className={`list-item-badge ${statusClass(Boolean(readiness?.infrastructure.mqtt_connected))}`}>
                  {readiness?.infrastructure.mqtt_connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                <div className="list-item-content">
                  <div className="list-item-title">Home Assistant</div>
                  <div className="list-item-subtitle">
                    {health?.ha_diagnostics?.url || '-'} | last code {health?.ha_diagnostics?.last_status_code ?? '-'}
                    {health?.ha_diagnostics?.last_error ? ` | ${health.ha_diagnostics.last_error}` : ''}
                  </div>
                </div>
                <span className={`list-item-badge ${statusClass(Boolean(readiness?.infrastructure.home_assistant_connected))}`}>
                  {readiness?.infrastructure.home_assistant_connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Layers size={18} />
                Mapping and Data Quality
              </span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Unknown room ratio</span>
                  <strong style={{ fontSize: '0.85rem' }}>{asPercent(quality?.unknown_room_ratio || 0)}</strong>
                </div>
                <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, (quality?.unknown_room_ratio || 0) * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--warning-500), var(--danger-500))',
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Camera mapping completeness</span>
                  <strong style={{ fontSize: '0.85rem' }}>{asPercent(quality?.mapping.cameras.completeness_ratio || 0)}</strong>
                </div>
                <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, (quality?.mapping.cameras.completeness_ratio || 0) * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--info-500), var(--success-500))',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unmapped cameras</div>
                  <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{quality?.mapping.cameras.unmapped || 0}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unmapped nodes</div>
                  <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{quality?.mapping.nodes.unmapped || 0}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {(quality?.unmapped_cameras || []).slice(0, 4).map((cam) => (
                  <div key={cam.device_id} className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '0.55rem 0.7rem' }}>
                    <div className="list-item-content">
                      <div className="list-item-title">{cam.device_id}</div>
                      <div className="list-item-subtitle">
                        room: {cam.room_name || cam.room_id || 'unassigned'} | last seen {formatAgo(cam.last_seen)}
                      </div>
                    </div>
                    <span className="list-item-badge warning">unmapped</span>
                  </div>
                ))}
                {(quality?.unmapped_cameras || []).length === 0 && (
                  <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                    <div className="list-item-content">
                      <div className="list-item-title">All cameras mapped</div>
                      <div className="list-item-subtitle">No unmapped camera records found.</div>
                    </div>
                    <CheckCircle2 size={16} style={{ color: 'var(--success-500)' }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Clock3 size={18} />
                Recent Timeline
              </span>
              <Link className="btn btn-secondary" href="/admin/timeline">
                Open Timeline
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="card-body" style={{ paddingTop: '0.8rem' }}>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {timeline.length > 0 ? (
                  timeline.map((event) => (
                    <div key={event.id} className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '0.55rem 0.7rem' }}>
                      <div className="list-item-content">
                        <div className="list-item-title">
                          {event.event_type}
                        </div>
                        <div className="list-item-subtitle">
                          {event.description || '-'}
                        </div>
                      </div>
                      <span className="list-item-badge info">{formatAgo(event.timestamp)}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state" style={{ padding: '1rem' }}>
                    <Clock3 size={28} />
                    <h3>No activity yet</h3>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Radio size={18} />
                Runtime Diagnostics
              </span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: '0.55rem' }}>
              <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                <div className="list-item-content">
                  <div className="list-item-title">MQTT publish failures</div>
                  <div className="list-item-subtitle">Since backend boot</div>
                </div>
                <span className={`list-item-badge ${(health?.mqtt_metrics?.publish_failures || 0) > 0 ? 'warning' : 'online'}`}>
                  {health?.mqtt_metrics?.publish_failures || 0}
                </span>
              </div>
              <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                <div className="list-item-content">
                  <div className="list-item-title">Config sync failures</div>
                  <div className="list-item-subtitle">MQTT config reply failures</div>
                </div>
                <span className={`list-item-badge ${(health?.mqtt_metrics?.config_sync_failures || 0) > 0 ? 'warning' : 'online'}`}>
                  {health?.mqtt_metrics?.config_sync_failures || 0}
                </span>
              </div>
              <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                <div className="list-item-content">
                  <div className="list-item-title">Stale devices</div>
                  <div className="list-item-subtitle">Wheelchairs + nodes + cameras</div>
                </div>
                <span className={`list-item-badge ${summary.staleCount > 0 ? 'warning' : 'online'}`}>
                  {summary.staleCount}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Thresholds: wheelchair {readiness?.thresholds_seconds.wheelchair_offline || '-'}s, node {readiness?.thresholds_seconds.node_offline || '-'}s, camera {readiness?.thresholds_seconds.camera_offline || '-'}s
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Database size={18} />
                Retention Result
              </span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: '0.55rem' }}>
              {retentionResult ? (
                <>
                  <div className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
                    <div className="list-item-content">
                      <div className="list-item-title">{retentionResult.dry_run ? 'Dry run' : 'Executed'}</div>
                      <div className="list-item-subtitle">Retention days: {retentionResult.retention_days}</div>
                    </div>
                    <span className="list-item-badge info">{formatAgo(retentionResult.executed_at)}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Raw rows deleted: <strong>{retentionResult.raw.deleted_rows}</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Hourly aggregate delta: <strong>{retentionResult.aggregates.hourly_delta}</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Daily aggregate delta: <strong>{retentionResult.aggregates.daily_delta}</strong>
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ padding: '1rem' }}>
                  <Timer size={28} />
                  <h3>No retention run yet</h3>
                  <p>Use "Retention Dry Run" first, then execute actual retention.</p>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Settings size={18} />
                Quick Actions
              </span>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: '0.5rem' }}>
              <Link href="/admin/devices" className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', textDecoration: 'none', color: 'inherit' }}>
                <div className="list-item-content">
                  <div className="list-item-title">Device Management</div>
                  <div className="list-item-subtitle">Assign rooms, sync configs, reboot boards</div>
                </div>
                <ArrowRight size={16} />
              </Link>
              <Link href="/admin/sensors" className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', textDecoration: 'none', color: 'inherit' }}>
                <div className="list-item-content">
                  <div className="list-item-title">Sensors</div>
                  <div className="list-item-subtitle">Inspect sensor stream and quality</div>
                </div>
                <ArrowRight size={16} />
              </Link>
              <Link href="/admin/monitoring" className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', textDecoration: 'none', color: 'inherit' }}>
                <div className="list-item-content">
                  <div className="list-item-title">Live Monitoring</div>
                  <div className="list-item-subtitle">Map, alerting, room activity</div>
                </div>
                <ArrowRight size={16} />
              </Link>
              <Link href="/admin/settings" className="list-item" style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', textDecoration: 'none', color: 'inherit' }}>
                <div className="list-item-content">
                  <div className="list-item-title">System Settings</div>
                  <div className="list-item-subtitle">MQTT/HA diagnostics and policy values</div>
                </div>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
