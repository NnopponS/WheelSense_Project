"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import {
  Activity,
  Bell,
  ClipboardCheck,
  FileText,
  HeartPulse,
  ShieldAlert,
} from "lucide-react";

interface AlertSummary {
  total_active: number;
  total_resolved: number;
  by_type: Record<string, number>;
}

interface VitalsAverage {
  heart_rate_bpm_avg: number | null;
  rr_interval_ms_avg: number | null;
  spo2_avg: number | null;
  skin_temperature_avg: number | null;
}

interface WardSummary {
  total_patients: number;
  active_alerts: number;
  critical_patients: number;
}

interface HandoverNote {
  id: number;
  patient_id: number | null;
  target_role: string | null;
  shift_label: string;
  priority: string;
  note: string;
  created_at: string;
}

interface AuditEvent {
  id: number;
  actor_user_id: number | null;
  patient_id: number | null;
  domain: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  created_at: string;
}

export default function HeadNurseReportsPage() {
  const [hours, setHours] = useState(24);
  const [auditDomain, setAuditDomain] = useState("all");

  const { data: alertSummary } = useQuery<AlertSummary>("/analytics/alerts/summary");
  const { data: wardSummary } = useQuery<WardSummary>("/analytics/wards/summary");
  const { data: vitalsAverage } = useQuery<VitalsAverage>(
    `/analytics/vitals/averages?hours=${hours}`,
  );
  const { data: handovers, isLoading: handoversLoading } =
    useQuery<HandoverNote[]>("/workflow/handovers?limit=40");
  const { data: auditEvents, isLoading: auditLoading } =
    useQuery<AuditEvent[]>("/workflow/audit?limit=80");

  const filteredAudit = useMemo(() => {
    const source = auditEvents ?? [];
    if (auditDomain === "all") return source;
    return source.filter((event) => event.domain === auditDomain);
  }, [auditDomain, auditEvents]);

  const domains = useMemo(() => {
    const unique = new Set<string>();
    (auditEvents ?? []).forEach((event) => unique.add(event.domain));
    return Array.from(unique).sort();
  }, [auditEvents]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Clinical reports</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Live operational analytics, handovers, and workflow audit trail.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          icon={Bell}
          label="Active alerts"
          value={wardSummary?.active_alerts ?? alertSummary?.total_active ?? 0}
          tone="text-warning"
        />
        <Stat
          icon={ShieldAlert}
          label="Critical patients"
          value={wardSummary?.critical_patients ?? 0}
          tone="text-critical"
        />
        <Stat
          icon={FileText}
          label="Resolved alerts"
          value={alertSummary?.total_resolved ?? 0}
          tone="text-success"
        />
        <Stat
          icon={ClipboardCheck}
          label="Audit events"
          value={auditEvents?.length ?? 0}
          tone="text-info"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="surface-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <Activity className="w-4 h-4 text-info" />
              Alert distribution by type
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(alertSummary?.by_type ?? {}).map(([type, count]) => (
              <div key={type} className="rounded-xl bg-surface-container-low px-3 py-2 text-sm">
                <p className="font-medium text-on-surface">{type}</p>
                <p className="text-xs text-on-surface-variant mt-1">{count} active</p>
              </div>
            ))}
            {Object.keys(alertSummary?.by_type ?? {}).length === 0 && (
              <p className="text-sm text-on-surface-variant">No alert types to report.</p>
            )}
          </div>
        </section>

        <section className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-primary" />
              Vitals average window
            </h3>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="input-field py-1.5 text-xs max-w-[100px]"
            >
              <option value={6}>6h</option>
              <option value={12}>12h</option>
              <option value={24}>24h</option>
              <option value={72}>72h</option>
            </select>
          </div>
          <div className="space-y-2 text-sm">
            <Metric
              label="Heart rate"
              value={
                vitalsAverage?.heart_rate_bpm_avg != null
                  ? `${vitalsAverage.heart_rate_bpm_avg.toFixed(1)} bpm`
                  : "No data"
              }
            />
            <Metric
              label="SpO2"
              value={
                vitalsAverage?.spo2_avg != null
                  ? `${vitalsAverage.spo2_avg.toFixed(1)} %`
                  : "No data"
              }
            />
            <Metric
              label="RR interval"
              value={
                vitalsAverage?.rr_interval_ms_avg != null
                  ? `${vitalsAverage.rr_interval_ms_avg.toFixed(1)} ms`
                  : "No data"
              }
            />
            <Metric
              label="Skin temperature"
              value={
                vitalsAverage?.skin_temperature_avg != null
                  ? `${vitalsAverage.skin_temperature_avg.toFixed(1)} C`
                  : "No data"
              }
            />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold text-on-surface mb-3">Recent handovers</h3>
          {handoversLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {(handovers ?? []).slice(0, 20).map((note) => (
                <div key={note.id} className="rounded-xl bg-surface-container-low px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-on-surface">
                      {note.shift_label || "General handover"}
                    </p>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-surface text-on-surface-variant uppercase font-semibold">
                      {note.priority}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">{note.note}</p>
                  <p className="text-xs text-outline mt-1">
                    {new Date(note.created_at).toLocaleString()} · target:{" "}
                    {note.target_role || "all staff"}
                  </p>
                </div>
              ))}
              {(handovers ?? []).length === 0 && (
                <p className="text-sm text-on-surface-variant py-2">No handover notes yet.</p>
              )}
            </div>
          )}
        </section>

        <section className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-on-surface">Workflow audit trail</h3>
            <select
              value={auditDomain}
              onChange={(e) => setAuditDomain(e.target.value)}
              className="input-field py-1.5 text-xs max-w-[160px]"
            >
              <option value="all">All domains</option>
              {domains.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </div>
          {auditLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredAudit.slice(0, 30).map((event) => (
                <div key={event.id} className="rounded-xl bg-surface-container-low px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-on-surface">
                      {event.domain} · {event.action}
                    </p>
                    <span className="text-xs text-outline">
                      {new Date(event.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {event.entity_type}
                    {event.entity_id ? ` #${event.entity_id}` : ""} · actor{" "}
                    {event.actor_user_id ?? "system"}
                    {event.patient_id ? ` · patient ${event.patient_id}` : ""}
                  </p>
                </div>
              ))}
              {filteredAudit.length === 0 && (
                <p className="text-sm text-on-surface-variant py-2">
                  No audit events for this filter.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p>
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <p className="text-2xl font-bold text-on-surface mt-2">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-on-surface-variant">{label}</p>
      <p className="font-semibold text-on-surface">{value}</p>
    </div>
  );
}
