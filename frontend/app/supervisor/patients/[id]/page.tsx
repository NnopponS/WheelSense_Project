"use client";
"use no memo";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Activity, ClipboardList, HeartPulse, Siren } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useTranslation } from "@/lib/i18n";
import type {
  CareDirectiveOut,
  CareTaskOut,
  GetPatientResponse,
  ListAlertsResponse,
  ListVitalReadingsResponse,
} from "@/lib/api/task-scope-types";

type VitalsRow = {
  id: number;
  timestamp: string;
  heartRate: number | null;
  spo2: number | null;
  rrInterval: number | null;
  battery: number | null;
  source: string;
};

type AlertRow = {
  id: number;
  title: string;
  severity: string;
  status: string;
  description: string;
  timestamp: string;
};

type TaskRow = {
  id: number;
  title: string;
  priority: string;
  status: string;
  dueAt: string | null;
};

type DirectiveRow = {
  id: number;
  title: string;
  text: string;
  status: string;
  effectiveFrom: string;
};

export default function SupervisorPatientDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const queryClient = useQueryClient();
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
  const [pendingDirectiveId, setPendingDirectiveId] = useState<number | null>(null);

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const patientId = Number(rawId);
  const hasValidPatientId = Number.isFinite(patientId) && patientId > 0;

  const patientQuery = useQuery({
    queryKey: ["supervisor", "patient-detail", patientId, "patient"],
    enabled: hasValidPatientId,
    queryFn: () => api.getPatient(patientId),
  });

  const alertsQuery = useQuery({
    queryKey: ["supervisor", "patient-detail", patientId, "alerts"],
    enabled: hasValidPatientId,
    queryFn: () => api.listAlerts({ patient_id: patientId, limit: 150 }),
  });

  const vitalsQuery = useQuery({
    queryKey: ["supervisor", "patient-detail", patientId, "vitals"],
    enabled: hasValidPatientId,
    queryFn: () => api.listVitalReadings({ patient_id: patientId, limit: 150 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["supervisor", "patient-detail", patientId, "tasks"],
    enabled: hasValidPatientId,
    queryFn: () => api.listWorkflowTasks({ limit: 150 }),
  });

  const directivesQuery = useQuery({
    queryKey: ["supervisor", "patient-detail", patientId, "directives"],
    enabled: hasValidPatientId,
    queryFn: () => api.listWorkflowDirectives({ limit: 150 }),
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await api.updateWorkflowTask(taskId, { status: "completed" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "patient-detail", patientId, "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "directives"] });
    },
    onSettled: () => {
      setPendingTaskId(null);
    },
  });

  const acknowledgeDirectiveMutation = useMutation({
    mutationFn: async (directiveId: number) => {
      await api.acknowledgeWorkflowDirective(directiveId, {
        note: "Supervisor acknowledged from patient detail",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "patient-detail", patientId, "directives"] });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["supervisor", "directives"] });
    },
    onSettled: () => {
      setPendingDirectiveId(null);
    },
  });

  const patient = useMemo(
    () => (patientQuery.data ?? null) as GetPatientResponse | null,
    [patientQuery.data],
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

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((alert) => alert.severity === "critical"),
    [activeAlerts],
  );

  const patientTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.patient_id === patientId)
        .sort((left, right) => {
          if (!left.due_at) return 1;
          if (!right.due_at) return -1;
          return left.due_at.localeCompare(right.due_at);
        }),
    [patientId, tasks],
  );

  const patientDirectives = useMemo(
    () => directives.filter((directive) => directive.patient_id === patientId),
    [directives, patientId],
  );

  const vitalsRows = useMemo<VitalsRow[]>(() => {
    return vitals
      .map((reading) => ({
        id: reading.id,
        timestamp: reading.timestamp,
        heartRate: reading.heart_rate_bpm,
        spo2: reading.spo2,
        rrInterval: reading.rr_interval_ms,
        battery: reading.sensor_battery,
        source: reading.source,
      }))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [vitals]);

  const alertRows = useMemo<AlertRow[]>(() => {
    return alerts
      .map((alert) => ({
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        status: alert.status,
        description: alert.description,
        timestamp: alert.timestamp,
      }))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [alerts]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return patientTasks.map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueAt: task.due_at,
    }));
  }, [patientTasks]);

  const directiveRows = useMemo<DirectiveRow[]>(() => {
    return patientDirectives.map((directive) => ({
      id: directive.id,
      title: directive.title,
      text: directive.directive_text,
      status: directive.status,
      effectiveFrom: directive.effective_from,
    }));
  }, [patientDirectives]);

  const vitalsColumns = useMemo<ColumnDef<VitalsRow>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: t("clinical.table.time"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      {
        accessorKey: "heartRate",
        header: t("clinical.table.hr"),
        cell: ({ row }) => row.original.heartRate ?? "-",
      },
      {
        accessorKey: "spo2",
        header: t("clinical.table.spo2"),
        cell: ({ row }) => row.original.spo2 ?? "-",
      },
      {
        accessorKey: "rrInterval",
        header: t("clinical.table.rrInterval"),
        cell: ({ row }) => (row.original.rrInterval != null ? `${row.original.rrInterval} ms` : "-"),
      },
      {
        accessorKey: "battery",
        header: t("clinical.table.battery"),
        cell: ({ row }) => (row.original.battery != null ? `${row.original.battery}%` : "-"),
      },
      {
        accessorKey: "source",
        header: t("clinical.table.source"),
      },
    ],
    [t],
  );

  const alertsColumns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("clinical.table.alert"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        accessorKey: "severity",
        header: t("clinical.table.severity"),
        cell: ({ row }) => {
          const severity = row.original.severity;
          const variant =
            severity === "critical"
              ? "destructive"
              : severity === "warning"
                ? "warning"
                : "secondary";
          return <Badge variant={variant}>{severity}</Badge>;
        },
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "destructive" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: t("clinical.table.time"),
        cell: ({ row }) => formatDateTime(row.original.timestamp),
      },
    ],
    [t],
  );

  const tasksColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("clinical.table.task"),
      },
      {
        accessorKey: "priority",
        header: t("clinical.table.priority"),
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
        accessorKey: "status",
        header: t("clinical.table.status"),
      },
      {
        accessorKey: "dueAt",
        header: t("clinical.table.due"),
        cell: ({ row }) => formatDateTime(row.original.dueAt),
      },
      {
        id: "actions",
        header: t("clinical.table.actions"),
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            disabled={
              row.original.status === "completed" ||
              (completeTaskMutation.isPending && pendingTaskId === row.original.id)
            }
            onClick={() => {
              setPendingTaskId(row.original.id);
              completeTaskMutation.mutate(row.original.id);
            }}
          >
            {t("clinical.action.complete")}
          </Button>
        ),
      },
    ],
    [completeTaskMutation, pendingTaskId, t],
  );

  const directivesColumns = useMemo<ColumnDef<DirectiveRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("clinical.table.directive"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.text}</p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "warning" : "outline"}>{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "effectiveFrom",
        header: t("clinical.table.effective"),
        cell: ({ row }) => formatDateTime(row.original.effectiveFrom),
      },
      {
        id: "actions",
        header: t("clinical.table.actions"),
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              row.original.status !== "active" ||
              (acknowledgeDirectiveMutation.isPending && pendingDirectiveId === row.original.id)
            }
            onClick={() => {
              setPendingDirectiveId(row.original.id);
              acknowledgeDirectiveMutation.mutate(row.original.id);
            }}
          >
            {t("supervisor.page.acknowledge")}
          </Button>
        ),
      },
    ],
    [acknowledgeDirectiveMutation, pendingDirectiveId, t],
  );

  if (!hasValidPatientId) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-xl font-semibold text-foreground">{t("clinical.patient.invalidIdTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("clinical.patient.invalidIdDesc")}</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/supervisor/patients">{t("clinical.patient.backToPatients")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isLoadingAny =
    patientQuery.isLoading ||
    alertsQuery.isLoading ||
    vitalsQuery.isLoading ||
    tasksQuery.isLoading ||
    directivesQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {patient ? `${patient.first_name} ${patient.last_name}` : t("clinical.patient.fallbackTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("supervisor.patientDetail.pageSubtitle")}</p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard
          icon={Siren}
          label={t("clinical.patientDetail.statActiveAlerts")}
          value={activeAlerts.length}
          tone={activeAlerts.length > 0 ? "warning" : "success"}
        />
        <SummaryStatCard
          icon={Activity}
          label={t("clinical.patientDetail.statCriticalAlerts")}
          value={criticalAlerts.length}
          tone={criticalAlerts.length > 0 ? "critical" : "success"}
        />
        <SummaryStatCard
          icon={HeartPulse}
          label={t("clinical.patientDetail.statRecentVitals")}
          value={vitalsRows.length}
          tone="info"
        />
        <SummaryStatCard
          icon={ClipboardList}
          label={t("supervisor.patientDetail.statOpenTasks")}
          value={taskRows.filter((task) => task.status !== "completed").length}
          tone="warning"
        />
      </section>

      <DataTableCard
        title={t("clinical.patientDetail.vitalsTitle")}
        description={t("clinical.patientDetail.vitalsDesc")}
        data={vitalsRows}
        columns={vitalsColumns}
        isLoading={isLoadingAny}
        emptyText={t("clinical.patientDetail.vitalsEmpty")}
      />

      <DataTableCard
        title={t("clinical.patientDetail.alertsTitle")}
        description={t("clinical.patientDetail.alertsDesc")}
        data={alertRows}
        columns={alertsColumns}
        isLoading={isLoadingAny}
        emptyText={t("clinical.patientDetail.alertsEmpty")}
      />

      <DataTableCard
        title={t("supervisor.patientDetail.tasksTitle")}
        description={t("supervisor.patientDetail.tasksDesc")}
        data={taskRows}
        columns={tasksColumns}
        isLoading={isLoadingAny}
        emptyText={t("supervisor.patientDetail.tasksEmpty")}
      />

      <DataTableCard
        title={t("supervisor.patientDetail.directivesTitle")}
        description={t("supervisor.patientDetail.directivesDesc")}
        data={directiveRows}
        columns={directivesColumns}
        isLoading={isLoadingAny}
        emptyText={t("supervisor.patientDetail.directivesEmpty")}
      />
    </div>
  );
}

