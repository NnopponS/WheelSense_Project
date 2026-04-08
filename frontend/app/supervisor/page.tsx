"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, ClipboardList, Siren, Stethoscope } from "lucide-react";
import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import type {
  CareDirectiveOut,
  CareTaskOut,
  CareScheduleOut,
  ListAlertsResponse,
  ListPatientsResponse,
  ListVitalReadingsResponse,
} from "@/lib/api/task-scope-types";

type TaskRow = {
  id: number;
  title: string;
  patientId: number | null;
  patientName: string;
  priority: string;
  dueAt: string | null;
  status: string;
};

type DirectiveRow = {
  id: number;
  title: string;
  patientId: number | null;
  patientName: string;
  targetRole: string | null;
  status: string;
  text: string;
};

type PatientAttentionRow = {
  patientId: number;
  patientName: string;
  careLevel: string;
  alertCount: number;
  criticalCount: number;
  latestHeartRate: number | null;
  latestSpo2: number | null;
  lastVitalAt: string | null;
};

const dashboardKeys = {
  patients: ["supervisor", "dashboard", "patients"] as QueryKey,
  alerts: ["supervisor", "dashboard", "alerts"] as QueryKey,
  vitals: ["supervisor", "dashboard", "vitals"] as QueryKey,
  tasks: ["supervisor", "dashboard", "tasks"] as QueryKey,
  directives: ["supervisor", "dashboard", "directives"] as QueryKey,
  schedules: ["supervisor", "dashboard", "schedules"] as QueryKey,
};

export default function SupervisorDashboardPage() {
  const nowMs = useFixedNowMs();
  const queryClient = useQueryClient();
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [pendingDirectiveId, setPendingDirectiveId] = useState<number | null>(null);

  const patientsQuery = useQuery({
    queryKey: dashboardKeys.patients,
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const alertsQuery = useQuery({
    queryKey: dashboardKeys.alerts,
    queryFn: () => api.listAlerts({ status: "active", limit: 200 }),
  });

  const vitalsQuery = useQuery({
    queryKey: dashboardKeys.vitals,
    queryFn: () => api.listVitalReadings({ limit: 240 }),
    refetchInterval: 30_000,
  });

  const tasksQuery = useQuery({
    queryKey: dashboardKeys.tasks,
    queryFn: () => api.listWorkflowTasks({ limit: 120 }),
  });

  const directivesQuery = useQuery({
    queryKey: dashboardKeys.directives,
    queryFn: () => api.listWorkflowDirectives({ status: "active", limit: 120 }),
  });

  const schedulesQuery = useQuery({
    queryKey: dashboardKeys.schedules,
    queryFn: () => api.listWorkflowSchedules({ status: "scheduled", limit: 120 }),
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await api.updateWorkflowTask(taskId, { status: "completed" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.tasks });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "directives"] });
    },
    onSettled: () => {
      setPendingTaskId(null);
    },
  });

  const acknowledgeDirectiveMutation = useMutation({
    mutationFn: async (directiveId: number) => {
      await api.acknowledgeWorkflowDirective(directiveId, {
        note: "Supervisor acknowledged from command center",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.directives });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "directives"] });
    },
    onSettled: () => {
      setPendingDirectiveId(null);
    },
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );
  const vitals = useMemo(
    () => (vitalsQuery.data ?? []) as ListVitalReadingsResponse,
    [vitalsQuery.data],
  );
  const tasks = useMemo(
    () => (tasksQuery.data ?? []) as CareTaskOut[],
    [tasksQuery.data],
  );
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );
  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const latestVitalsByPatient = useMemo(() => {
    const map = new Map<number, ListVitalReadingsResponse[number]>();
    for (const reading of vitals) {
      const current = map.get(reading.patient_id);
      if (!current || reading.timestamp > current.timestamp) {
        map.set(reading.patient_id, reading);
      }
    }
    return map;
  }, [vitals]);

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((alert) => alert.severity === "critical"),
    [activeAlerts],
  );

  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.status === "pending" || task.status === "in_progress")
        .sort((left, right) => {
          if (!left.due_at) return 1;
          if (!right.due_at) return -1;
          return left.due_at.localeCompare(right.due_at);
        }),
    [tasks],
  );

  const activeDirectives = useMemo(
    () => directives.filter((directive) => directive.status === "active"),
    [directives],
  );

  const nextSchedules = useMemo(() => {
    const twelveHoursAhead = nowMs + 12 * 60 * 60 * 1000;
    return schedules
      .filter((schedule) => {
        if (schedule.status !== "scheduled") return false;
        const startsAt = new Date(schedule.starts_at).getTime();
        return startsAt >= nowMs && startsAt <= twelveHoursAhead;
      })
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  }, [nowMs, schedules]);

  const patientAttentionRows = useMemo<PatientAttentionRow[]>(() => {
    return patients
      .map((patient) => {
        const alertCount = activeAlerts.filter((alert) => alert.patient_id === patient.id).length;
        const criticalCount = criticalAlerts.filter((alert) => alert.patient_id === patient.id).length;
        const latestVitals = latestVitalsByPatient.get(patient.id);
        return {
          patientId: patient.id,
          patientName: `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`,
          careLevel: patient.care_level,
          alertCount,
          criticalCount,
          latestHeartRate: latestVitals?.heart_rate_bpm ?? null,
          latestSpo2: latestVitals?.spo2 ?? null,
          lastVitalAt: latestVitals?.timestamp ?? null,
        };
      })
      .filter((row) => row.alertCount > 0 || row.criticalCount > 0 || row.latestSpo2 != null || row.latestHeartRate != null)
      .sort((left, right) => {
        if (left.criticalCount !== right.criticalCount) return right.criticalCount - left.criticalCount;
        return right.alertCount - left.alertCount;
      })
      .slice(0, 12);
  }, [activeAlerts, criticalAlerts, latestVitalsByPatient, patients]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return openTasks.map((task) => {
      const patient = task.patient_id ? patientById.get(task.patient_id) : null;
      return {
        id: task.id,
        title: task.title,
        patientId: task.patient_id,
        patientName: patient
          ? `${patient.first_name} ${patient.last_name}`.trim()
          : "Unit-wide",
        priority: task.priority,
        dueAt: task.due_at,
        status: task.status,
      };
    });
  }, [openTasks, patientById]);

  const directiveRows = useMemo<DirectiveRow[]>(() => {
    return activeDirectives.map((directive) => {
      const patient = directive.patient_id ? patientById.get(directive.patient_id) : null;
      return {
        id: directive.id,
        title: directive.title,
        patientId: directive.patient_id,
        patientName: patient
          ? `${patient.first_name} ${patient.last_name}`.trim()
          : "Unit-wide",
        targetRole: directive.target_role,
        status: directive.status,
        text: directive.directive_text,
      };
    });
  }, [activeDirectives, patientById]);

  const taskColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.patientName}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => {
          const priority = row.original.priority;
          const variant =
            priority === "critical"
              ? "destructive"
              : priority === "high"
                ? "warning"
                : priority === "normal"
                  ? "secondary"
                  : "outline";
          return <Badge variant={variant}>{priority}</Badge>;
        },
      },
      {
        accessorKey: "dueAt",
        header: "Due",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.dueAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.dueAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            disabled={completeTaskMutation.isPending && pendingTaskId === row.original.id}
            onClick={() => {
              setPendingTaskId(row.original.id);
              completeTaskMutation.mutate(row.original.id);
            }}
          >
            Mark completed
          </Button>
        ),
      },
    ],
    [completeTaskMutation, pendingTaskId],
  );

  const directiveColumns = useMemo<ColumnDef<DirectiveRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Directive",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.text}</p>
          </div>
        ),
      },
      {
        accessorKey: "patientName",
        header: "Patient",
      },
      {
        accessorKey: "targetRole",
        header: "Target role",
        cell: ({ row }) => row.original.targetRole || "Any role",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={acknowledgeDirectiveMutation.isPending && pendingDirectiveId === row.original.id}
            onClick={() => {
              setPendingDirectiveId(row.original.id);
              acknowledgeDirectiveMutation.mutate(row.original.id);
            }}
          >
            Acknowledge
          </Button>
        ),
      },
    ],
    [acknowledgeDirectiveMutation, pendingDirectiveId],
  );

  const patientAttentionColumns = useMemo<ColumnDef<PatientAttentionRow>[]>(
    () => [
      {
        accessorKey: "patientName",
        header: "Patient",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.patientName}</p>
            <Badge
              variant={
                row.original.careLevel === "critical"
                  ? "destructive"
                  : row.original.careLevel === "special"
                    ? "warning"
                    : "success"
              }
            >
              {row.original.careLevel}
            </Badge>
          </div>
        ),
      },
      {
        accessorKey: "criticalCount",
        header: "Critical alerts",
      },
      {
        accessorKey: "alertCount",
        header: "Active alerts",
      },
      {
        accessorKey: "latestHeartRate",
        header: "HR",
        cell: ({ row }) => row.original.latestHeartRate ?? "-",
      },
      {
        accessorKey: "latestSpo2",
        header: "SpO2",
        cell: ({ row }) => row.original.latestSpo2 ?? "-",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/supervisor/patients/${row.original.patientId}`}>Open detail</Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const isLoadingAny =
    patientsQuery.isLoading ||
    alertsQuery.isLoading ||
    tasksQuery.isLoading ||
    directivesQuery.isLoading ||
    schedulesQuery.isLoading ||
    vitalsQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Supervisor Command Center</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prioritize active risks, close care tasks, and monitor directives in one operational view.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard
          icon={Siren}
          label="Critical alerts"
          value={criticalAlerts.length}
          tone={criticalAlerts.length > 0 ? "critical" : "success"}
        />
        <SummaryStatCard
          icon={ClipboardList}
          label="Open care tasks"
          value={openTasks.length}
          tone={openTasks.length > 0 ? "warning" : "success"}
        />
        <SummaryStatCard
          icon={Stethoscope}
          label="Patients needing review"
          value={patientAttentionRows.length}
          tone={patientAttentionRows.length > 0 ? "warning" : "info"}
        />
        <SummaryStatCard
          icon={CheckCircle2}
          label="Next 12h schedules"
          value={nextSchedules.length}
          tone="info"
        />
      </section>

      <FloorplanRoleViewer />

      <DataTableCard
        title="Immediate Task Queue"
        description="Pending and in-progress tasks sorted by due time."
        data={taskRows}
        columns={taskColumns}
        isLoading={isLoadingAny}
        emptyText="No open tasks."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/supervisor/directives">Manage all tasks</Link>
          </Button>
        }
      />

      <DataTableCard
        title="Directives Awaiting Acknowledgement"
        description="Active directives that still require supervisor acknowledgement."
        data={directiveRows}
        columns={directiveColumns}
        isLoading={isLoadingAny}
        emptyText="All directives are acknowledged."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/supervisor/directives">Open directives board</Link>
          </Button>
        }
      />

      <DataTableCard
        title="Patient Insight Priority"
        description="Patients ranked by critical/active alerts and latest vital risk signals."
        data={patientAttentionRows}
        columns={patientAttentionColumns}
        isLoading={isLoadingAny}
        emptyText="No patients currently match escalation criteria."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/supervisor/patients">View full patient list</Link>
          </Button>
        }
      />
    </div>
  );
}

