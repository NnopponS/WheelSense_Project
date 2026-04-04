"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import type { Alert, Patient, VitalReading } from "@/lib/types";
import { CheckCircle2, ClipboardList, Siren, Stethoscope } from "lucide-react";
import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";

interface CareTask {
  id: number;
  patient_id: number | null;
  title: string;
  priority: "low" | "normal" | "high" | "critical";
  due_at: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

interface CareDirective {
  id: number;
  patient_id: number | null;
  title: string;
  directive_text: string;
  status: "active" | "acknowledged" | "closed";
  target_role: string | null;
}

interface CareSchedule {
  id: number;
  patient_id: number | null;
  title: string;
  starts_at: string;
  status: "scheduled" | "completed" | "cancelled";
}

export default function SupervisorDashboardPage() {
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [acknowledgingDirectiveId, setAcknowledgingDirectiveId] = useState<number | null>(null);

  const { data: patients } = useQuery<Patient[]>("/patients");
  const { data: alerts } = useQuery<Alert[]>("/alerts");
  const { data: vitals } = useQuery<VitalReading[]>("/vitals/readings?limit=120");
  const { data: tasks, refetch: refetchTasks } = useQuery<CareTask[]>("/workflow/tasks?limit=80");
  const { data: directives, refetch: refetchDirectives } = useQuery<CareDirective[]>(
    "/workflow/directives?limit=80",
  );
  const { data: schedules } = useQuery<CareSchedule[]>("/workflow/schedules?status=scheduled&limit=80");

  const patientById = useMemo(
    () => new Map((patients ?? []).map((patient) => [patient.id, patient])),
    [patients],
  );

  const latestVitalsByPatient = useMemo(() => {
    const map = new Map<number, VitalReading>();
    for (const reading of vitals ?? []) {
      if (!map.has(reading.patient_id)) {
        map.set(reading.patient_id, reading);
      }
    }
    return map;
  }, [vitals]);

  const activeAlerts = useMemo(
    () => (alerts ?? []).filter((alert) => alert.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((alert) => alert.severity === "critical"),
    [activeAlerts],
  );

  const openTasks = useMemo(
    () =>
      (tasks ?? [])
        .filter((task) => task.status !== "completed" && task.status !== "cancelled")
        .sort((a, b) => {
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return a.due_at.localeCompare(b.due_at);
        }),
    [tasks],
  );

  const activeDirectives = useMemo(
    () => (directives ?? []).filter((directive) => directive.status === "active"),
    [directives],
  );

  const nextSchedules = useMemo(() => {
    const now = Date.now();
    const twelveHoursAhead = now + 12 * 60 * 60 * 1000;
    return (schedules ?? [])
      .filter((schedule) => {
        if (schedule.status !== "scheduled") return false;
        const startsAt = new Date(schedule.starts_at).getTime();
        return startsAt >= now && startsAt <= twelveHoursAhead;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [schedules]);

  const patientAttentionRows = useMemo(() => {
    return (patients ?? [])
      .map((patient) => {
        const alertCount = activeAlerts.filter((alert) => alert.patient_id === patient.id).length;
        const criticalCount = criticalAlerts.filter((alert) => alert.patient_id === patient.id).length;
        const latestVitals = latestVitalsByPatient.get(patient.id);
        const hasVitalRisk =
          (latestVitals?.spo2 ?? 100) < 92 || (latestVitals?.heart_rate_bpm ?? 0) > 120;
        return { patient, alertCount, criticalCount, latestVitals, hasVitalRisk };
      })
      .filter((row) => row.alertCount > 0 || row.hasVitalRisk)
      .sort((a, b) => b.criticalCount - a.criticalCount || b.alertCount - a.alertCount)
      .slice(0, 6);
  }, [patients, activeAlerts, criticalAlerts, latestVitalsByPatient]);

  async function completeTask(taskId: number) {
    try {
      setUpdatingTaskId(taskId);
      await api.patch(`/workflow/tasks/${taskId}`, { status: "completed" });
      await refetchTasks();
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function acknowledgeDirective(directiveId: number) {
    try {
      setAcknowledgingDirectiveId(directiveId);
      await api.post(`/workflow/directives/${directiveId}/acknowledge`, {
        note: "Supervisor acknowledged from dashboard",
      });
      await refetchDirectives();
    } finally {
      setAcknowledgingDirectiveId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Supervisor Command Center</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Prioritize active risks, close care tasks, and track care directives in one workflow.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <DashboardStat
          icon={Siren}
          label="Critical alerts"
          value={criticalAlerts.length}
          accent={criticalAlerts.length > 0 ? "critical" : "success"}
          href="/supervisor/emergency"
        />
        <DashboardStat
          icon={ClipboardList}
          label="Open care tasks"
          value={openTasks.length}
          accent={openTasks.length > 0 ? "warning" : "success"}
          href="/supervisor/directives"
        />
        <DashboardStat
          icon={Stethoscope}
          label="Patients needing review"
          value={patientAttentionRows.length}
          accent={patientAttentionRows.length > 0 ? "warning" : "info"}
          href="/supervisor/patients"
        />
        <DashboardStat
          icon={CheckCircle2}
          label="Next 12h schedules"
          value={nextSchedules.length}
          accent="info"
          href="/supervisor/directives"
        />
      </section>

      <FloorplanRoleViewer />

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
              Immediate Task Queue
            </h3>
            <Link className="text-xs text-primary hover:underline" href="/supervisor/directives">
              Manage all tasks
            </Link>
          </div>
          <div className="space-y-3">
            {openTasks.slice(0, 6).map((task) => {
              const patient = task.patient_id ? patientById.get(task.patient_id) : null;
              return (
                <div key={task.id} className="rounded-xl bg-surface-container-low p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{task.title}</p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {patient
                          ? `${patient.first_name} ${patient.last_name}`
                          : "Unassigned patient"}
                        {task.due_at
                          ? ` · due ${new Date(task.due_at).toLocaleString()}`
                          : " · no due time"}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase px-2 py-1 rounded-full bg-warning-bg text-warning font-semibold">
                      {task.priority}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      disabled={updatingTaskId === task.id}
                      onClick={() => void completeTask(task.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-success-bg text-success font-medium hover:opacity-80 disabled:opacity-60 cursor-pointer"
                    >
                      Mark completed
                    </button>
                  </div>
                </div>
              );
            })}
            {openTasks.length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">
                No open tasks. The care queue is clear right now.
              </p>
            )}
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
              Directives Awaiting Acknowledgement
            </h3>
            <Link className="text-xs text-primary hover:underline" href="/supervisor/directives">
              Open directives board
            </Link>
          </div>
          <div className="space-y-3">
            {activeDirectives.slice(0, 5).map((directive) => {
              const patient = directive.patient_id ? patientById.get(directive.patient_id) : null;
              return (
                <div key={directive.id} className="rounded-xl bg-surface-container-low p-3">
                  <p className="text-sm font-semibold text-on-surface">{directive.title}</p>
                  <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                    {directive.directive_text}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-2">
                    {patient
                      ? `${patient.first_name} ${patient.last_name}`
                      : "Applies across unit"}
                    {directive.target_role ? ` · target ${directive.target_role}` : ""}
                  </p>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      disabled={acknowledgingDirectiveId === directive.id}
                      onClick={() => void acknowledgeDirective(directive.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary/15 text-primary font-medium hover:opacity-80 disabled:opacity-60 cursor-pointer"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              );
            })}
            {activeDirectives.length === 0 && (
              <p className="text-sm text-on-surface-variant py-2">
                All directives are acknowledged.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="surface-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
            Patient Insight Priority List
          </h3>
          <Link className="text-xs text-primary hover:underline" href="/supervisor/patients">
            View full patient list
          </Link>
        </div>
        {patientAttentionRows.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No patient currently meets alert or vital-risk escalation criteria.
          </p>
        ) : (
          <div className="space-y-2">
            {patientAttentionRows.map(({ patient, alertCount, criticalCount, latestVitals }) => (
              <Link
                key={patient.id}
                href={`/supervisor/patients/${patient.id}`}
                className="flex items-center justify-between rounded-xl px-4 py-3 bg-surface-container-low hover:bg-surface-container transition-smooth"
              >
                <div>
                  <p className="text-sm font-semibold text-on-surface">
                    {patient.first_name} {patient.last_name}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {criticalCount > 0 ? `${criticalCount} critical alert(s)` : `${alertCount} active alert(s)`}
                    {latestVitals
                      ? ` · HR ${latestVitals.heart_rate_bpm ?? "—"} · SpO2 ${latestVitals.spo2 ?? "—"}`
                      : ""}
                  </p>
                </div>
                <span className="text-xs text-primary font-medium">Open detail</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DashboardStat({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: "critical" | "warning" | "success" | "info";
  href: string;
}) {
  const accentClass =
    accent === "critical"
      ? "bg-critical-bg text-critical"
      : accent === "warning"
      ? "bg-warning-bg text-warning"
      : accent === "success"
      ? "bg-success-bg text-success"
      : "bg-info-bg text-info";

  return (
    <Link href={href} className="surface-card p-4 hover:shadow-sm transition-smooth">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="text-2xl font-bold text-on-surface mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accentClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </Link>
  );
}
