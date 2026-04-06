"use client";

import Link from "next/link";
import { useQuery } from "@/hooks/useQuery";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  HeartPulse,
  ShieldAlert,
  Stethoscope,
  Users,
} from "lucide-react";
import type { Alert, Caregiver, Device, Patient, TimelineEvent } from "@/lib/types";

interface WardSummary {
  total_patients: number;
  active_alerts: number;
  critical_patients: number;
}

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

interface CareTask {
  id: number;
  title: string;
  priority: "low" | "normal" | "high" | "critical";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_at: string | null;
}

interface CareSchedule {
  id: number;
  title: string;
  starts_at: string;
  status: string;
}

export default function HeadNurseHomePage() {
  const nowMs = useFixedNowMs();
  const { data: wardSummary } = useQuery<WardSummary>("/analytics/wards/summary");
  const { data: alertSummary } = useQuery<AlertSummary>("/analytics/alerts/summary");
  const { data: vitalsAverage } = useQuery<VitalsAverage>("/analytics/vitals/averages?hours=24");
  const { data: alerts } = useQuery<Alert[]>("/alerts");
  const { data: caregivers } = useQuery<Caregiver[]>("/caregivers");
  const { data: timeline } = useQuery<TimelineEvent[]>("/timeline?limit=8");
  const { data: tasks } = useQuery<CareTask[]>("/workflow/tasks?status=pending");
  const { data: schedules } = useQuery<CareSchedule[]>("/workflow/schedules?status=scheduled");
  const { data: patients } = useQuery<Patient[]>("/patients");
  const { data: devices } = useQuery<Device[]>("/devices");

  const activeAlerts = alerts?.filter((item) => item.status === "active") ?? [];
  const criticalActiveAlerts = activeAlerts.filter(
    (item) => item.severity === "critical",
  );
  const onDutyCount = caregivers?.filter((item) => item.is_active).length ?? 0;
  const onlineDevices = (devices ?? []).filter((d) => {
    if (!d.last_seen) return false;
    return nowMs - new Date(d.last_seen).getTime() <= 5 * 60 * 1000;
  }).length;

  const stats = [
    {
      label: "Patients",
      value: wardSummary?.total_patients ?? patients?.length ?? 0,
      icon: Users,
      color: "text-primary",
      href: "/head-nurse/patients",
    },
    {
      label: "Active alerts",
      value: wardSummary?.active_alerts ?? alertSummary?.total_active ?? activeAlerts.length,
      icon: Bell,
      color: criticalActiveAlerts.length > 0 ? "text-critical" : "text-warning",
      href: "/head-nurse/alerts",
    },
    {
      label: "Critical patients",
      value:
        wardSummary?.critical_patients ??
        (patients?.filter((item) => item.care_level === "critical").length ?? 0),
      icon: ShieldAlert,
      color: "text-critical",
      href: "/head-nurse/patients",
    },
    {
      label: "On-duty staff",
      value: onDutyCount,
      icon: Stethoscope,
      color: "text-info",
      href: "/head-nurse/staff",
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Ward overview</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Real-time census, alert load, staffing status, and handoff priorities.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="surface-card p-4 transition-smooth hover:bg-surface-container-low"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">
                {item.label}
              </p>
              <item.icon className={`w-4 h-4 ${item.color}`} />
            </div>
            <p className="text-2xl font-bold text-on-surface mt-2">{item.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold text-on-surface mb-3">Alert severity mix</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Critical</span>
              <span className="font-semibold text-critical">
                {criticalActiveAlerts.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Warning</span>
              <span className="font-semibold text-warning">
                {activeAlerts.filter((item) => item.severity === "warning").length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Info</span>
              <span className="font-semibold text-info">
                {activeAlerts.filter((item) => item.severity === "info").length}
              </span>
            </div>
            <div className="flex justify-between border-t border-outline-variant/20 pt-2">
              <span className="text-on-surface-variant">Resolved (all time)</span>
              <span className="font-semibold text-success">
                {alertSummary?.total_resolved ?? 0}
              </span>
            </div>
          </div>
        </section>

        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold text-on-surface mb-3">
            24h vitals average
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Heart rate</span>
              <span className="font-semibold text-on-surface">
                {vitalsAverage?.heart_rate_bpm_avg != null
                  ? `${vitalsAverage.heart_rate_bpm_avg.toFixed(1)} bpm`
                  : "No data"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">SpO2</span>
              <span className="font-semibold text-on-surface">
                {vitalsAverage?.spo2_avg != null
                  ? `${vitalsAverage.spo2_avg.toFixed(1)} %`
                  : "No data"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Skin temp</span>
              <span className="font-semibold text-on-surface">
                {vitalsAverage?.skin_temperature_avg != null
                  ? `${vitalsAverage.skin_temperature_avg.toFixed(1)} C`
                  : "No data"}
              </span>
            </div>
          </div>
        </section>

        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold text-on-surface mb-3">Current load</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <CalendarClock className="w-4 h-4 text-info" />
                Active rounds/schedules
              </div>
              <span className="font-semibold text-on-surface">{schedules?.length ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Open tasks
              </div>
              <span className="font-semibold text-on-surface">
                {tasks?.filter((item) => item.status !== "completed").length ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <HeartPulse className="w-4 h-4 text-primary" />
                Alert types tracked
              </div>
              <span className="font-semibold text-on-surface">
                {Object.keys(alertSummary?.by_type ?? {}).length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Users className="w-4 h-4 text-info" />
                Device connectivity
              </div>
              <span className="font-semibold text-on-surface">
                {onlineDevices}/{devices?.length ?? 0} online
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-on-surface">Latest active alerts</h3>
            <Link className="text-xs text-primary hover:underline" href="/head-nurse/alerts">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {activeAlerts.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-surface-container-low px-3 py-2 flex items-start justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-medium text-on-surface">{item.alert_type}</p>
                  <p className="text-xs text-on-surface-variant">{item.description}</p>
                </div>
                <span
                  className={`text-[10px] px-2 py-1 rounded-full uppercase font-semibold ${
                    item.severity === "critical"
                      ? "care-critical"
                      : item.severity === "warning"
                        ? "severity-warning"
                        : "care-normal"
                  }`}
                >
                  {item.severity}
                </span>
              </div>
            ))}
            {activeAlerts.length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">No active alerts.</p>
            )}
          </div>
        </section>

        <section className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-on-surface">Recent event feed</h3>
            <Link className="text-xs text-primary hover:underline" href="/head-nurse/reports">
              Audit & reports
            </Link>
          </div>
          <div className="space-y-2">
            {(timeline ?? []).slice(0, 7).map((event) => (
              <div
                key={event.id}
                className="rounded-xl bg-surface-container-low px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-on-surface">{event.event_type}</p>
                  <span className="text-xs text-outline">
                    {new Date(event.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant">{event.description}</p>
              </div>
            ))}
            {timeline?.length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">No recent timeline events.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
