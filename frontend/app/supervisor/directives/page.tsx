"use client";

import { useMemo, useState, type ComponentType } from "react";
import { api } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";
import type { Patient } from "@/lib/types";
import { ClipboardList, History, ListTodo, ShieldCheck } from "lucide-react";

interface CareDirective {
  id: number;
  patient_id: number | null;
  title: string;
  directive_text: string;
  status: "active" | "acknowledged" | "closed";
  target_role: string | null;
  effective_from: string;
}

interface CareTask {
  id: number;
  patient_id: number | null;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  due_at: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

interface CareSchedule {
  id: number;
  patient_id: number | null;
  title: string;
  schedule_type: string;
  starts_at: string;
  status: "scheduled" | "completed" | "cancelled";
}

interface AuditEvent {
  id: number;
  actor_user_id: number | null;
  patient_id: number | null;
  domain: string;
  action: string;
  entity_type: string;
  created_at: string;
}

export default function SupervisorDirectivesPage() {
  const [acknowledgingDirectiveId, setAcknowledgingDirectiveId] = useState<number | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updatingScheduleId, setUpdatingScheduleId] = useState<number | null>(null);

  const { data: patients } = useQuery<Patient[]>("/patients");
  const { data: directives, refetch: refetchDirectives } = useQuery<CareDirective[]>(
    "/workflow/directives?limit=100",
  );
  const { data: tasks, refetch: refetchTasks } = useQuery<CareTask[]>("/workflow/tasks?limit=100");
  const { data: schedules, refetch: refetchSchedules } = useQuery<CareSchedule[]>(
    "/workflow/schedules?limit=100",
  );
  const { data: auditEvents, refetch: refetchAudit } = useQuery<AuditEvent[]>(
    "/workflow/audit?limit=40",
  );

  const patientById = useMemo(
    () => new Map((patients ?? []).map((patient) => [patient.id, patient])),
    [patients],
  );

  const activeDirectives = useMemo(
    () => (directives ?? []).filter((directive) => directive.status === "active"),
    [directives],
  );

  const pendingTasks = useMemo(
    () =>
      (tasks ?? [])
        .filter((task) => task.status === "pending" || task.status === "in_progress")
        .sort((a, b) => {
          if (!a.due_at) return 1;
          if (!b.due_at) return -1;
          return a.due_at.localeCompare(b.due_at);
        }),
    [tasks],
  );

  const upcomingSchedules = useMemo(
    () =>
      (schedules ?? [])
        .filter((schedule) => schedule.status === "scheduled")
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .slice(0, 8),
    [schedules],
  );

  async function acknowledgeDirective(id: number) {
    try {
      setAcknowledgingDirectiveId(id);
      await api.post(`/workflow/directives/${id}/acknowledge`, {
        note: "Supervisor acknowledged directive",
      });
      await Promise.all([refetchDirectives(), refetchAudit()]);
    } finally {
      setAcknowledgingDirectiveId(null);
    }
  }

  async function updateTaskStatus(id: number, status: CareTask["status"]) {
    try {
      setUpdatingTaskId(id);
      await api.patch(`/workflow/tasks/${id}`, { status });
      await Promise.all([refetchTasks(), refetchAudit()]);
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function updateScheduleStatus(id: number, status: CareSchedule["status"]) {
    try {
      setUpdatingScheduleId(id);
      await api.patch(`/workflow/schedules/${id}`, { status });
      await Promise.all([refetchSchedules(), refetchAudit()]);
    } finally {
      setUpdatingScheduleId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Directives & Care Operations</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Run shift execution from one board: acknowledge directives, progress tasks, and close schedules.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <WorkflowStat icon={ShieldCheck} label="Active directives" value={activeDirectives.length} tone="critical" />
        <WorkflowStat icon={ListTodo} label="Open tasks" value={pendingTasks.length} tone="warning" />
        <WorkflowStat icon={ClipboardList} label="Scheduled rounds" value={upcomingSchedules.length} tone="info" />
      </section>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4">
          Directive Acknowledgement Queue
        </h3>
        {activeDirectives.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            There are no active directives waiting for acknowledgement.
          </p>
        ) : (
          <div className="space-y-3">
            {activeDirectives.map((directive) => {
              const patient = directive.patient_id ? patientById.get(directive.patient_id) : null;
              return (
                <div key={directive.id} className="rounded-xl bg-surface-container-low p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{directive.title}</p>
                      <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                        {directive.directive_text}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-2">
                        {patient
                          ? `${patient.first_name} ${patient.last_name}`
                          : "Applies across the unit"}
                        {directive.target_role ? ` · target ${directive.target_role}` : ""}
                        {" · "}
                        {new Date(directive.effective_from).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={acknowledgingDirectiveId === directive.id}
                      onClick={() => void acknowledgeDirective(directive.id)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary/15 text-primary font-medium hover:opacity-80 disabled:opacity-60 cursor-pointer shrink-0"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="surface-card p-5">
          <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4">
            Task Execution
          </h3>
          {pendingTasks.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No pending or in-progress tasks are currently assigned.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingTasks.slice(0, 10).map((task) => {
                const patient = task.patient_id ? patientById.get(task.patient_id) : null;
                return (
                  <div key={task.id} className="rounded-xl bg-surface-container-low p-3">
                    <p className="text-sm font-semibold text-on-surface">{task.title}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {patient
                        ? `${patient.first_name} ${patient.last_name}`
                        : "No linked patient"}
                      {task.due_at ? ` · due ${new Date(task.due_at).toLocaleString()}` : ""}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] uppercase px-2 py-1 rounded-full bg-warning-bg text-warning font-semibold">
                        {task.status} · {task.priority}
                      </span>
                      <div className="flex gap-2">
                        {task.status === "pending" && (
                          <button
                            type="button"
                            disabled={updatingTaskId === task.id}
                            onClick={() => void updateTaskStatus(task.id, "in_progress")}
                            className="px-2.5 py-1.5 text-xs rounded-lg bg-info-bg text-info font-medium disabled:opacity-60 cursor-pointer"
                          >
                            Start
                          </button>
                        )}
                        {task.status !== "completed" && (
                          <button
                            type="button"
                            disabled={updatingTaskId === task.id}
                            onClick={() => void updateTaskStatus(task.id, "completed")}
                            className="px-2.5 py-1.5 text-xs rounded-lg bg-success-bg text-success font-medium disabled:opacity-60 cursor-pointer"
                          >
                            Complete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="surface-card p-5">
          <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4">
            Schedule Control
          </h3>
          {upcomingSchedules.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              No upcoming schedules need action.
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingSchedules.map((schedule) => {
                const patient = schedule.patient_id ? patientById.get(schedule.patient_id) : null;
                return (
                  <div key={schedule.id} className="rounded-xl bg-surface-container-low p-3">
                    <p className="text-sm font-semibold text-on-surface">{schedule.title}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {patient
                        ? `${patient.first_name} ${patient.last_name}`
                        : "Unit-wide schedule"}
                      {" · "}
                      {new Date(schedule.starts_at).toLocaleString()}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] uppercase px-2 py-1 rounded-full bg-info-bg text-info font-semibold">
                        {schedule.schedule_type}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={updatingScheduleId === schedule.id}
                          onClick={() => void updateScheduleStatus(schedule.id, "completed")}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-success-bg text-success font-medium disabled:opacity-60 cursor-pointer"
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          disabled={updatingScheduleId === schedule.id}
                          onClick={() => void updateScheduleStatus(schedule.id, "cancelled")}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-critical-bg text-critical font-medium disabled:opacity-60 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide mb-4 flex items-center gap-2">
          <History className="w-4 h-4 text-on-surface-variant" />
          Workflow Audit Trail
        </h3>
        {!auditEvents || auditEvents.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No workflow audit activity has been recorded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {auditEvents.slice(0, 12).map((event) => {
              const patient = event.patient_id ? patientById.get(event.patient_id) : null;
              return (
                <div
                  key={event.id}
                  className="rounded-xl bg-surface-container-low p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-on-surface">
                      {event.domain} · {event.action}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {event.entity_type}
                      {patient ? ` · ${patient.first_name} ${patient.last_name}` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-on-surface-variant shrink-0">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function WorkflowStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "critical" | "warning" | "info";
}) {
  const toneClass =
    tone === "critical"
      ? "bg-critical-bg text-critical"
      : tone === "warning"
      ? "bg-warning-bg text-warning"
      : "bg-info-bg text-info";

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="text-2xl font-bold text-on-surface mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
