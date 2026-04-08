"use client";
"use no memo";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Bell, CalendarClock, ClipboardList, Stethoscope, Users } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  GetAlertSummaryResponse,
  GetVitalsAveragesResponse,
  GetWardSummaryResponse,
  ListAlertsResponse,
  ListCaregiversResponse,
  ListPatientsResponse,
  ListTimelineEventsResponse,
} from "@/lib/api/task-scope-types";

type AlertRow = {
  id: number;
  title: string;
  description: string;
  severity: string;
  patientId: number | null;
  patientName: string;
  timestamp: string;
};

type TaskRow = {
  id: number;
  title: string;
  priority: string;
  status: string;
  patientId: number | null;
  patientName: string;
  dueAt: string | null;
};

type ScheduleRow = {
  id: number;
  title: string;
  scheduleType: string;
  status: string;
  patientId: number | null;
  patientName: string;
  startsAt: string;
};

type TimelineRow = {
  id: number;
  eventType: string;
  description: string;
  patientId: number | null;
  patientName: string;
  roomName: string;
  timestamp: string;
};

const dashboardKeys = {
  ward: ["head-nurse", "dashboard", "ward-summary"] as QueryKey,
  alertSummary: ["head-nurse", "dashboard", "alert-summary"] as QueryKey,
  vitalsAverage: ["head-nurse", "dashboard", "vitals-average"] as QueryKey,
  alerts: ["head-nurse", "dashboard", "alerts"] as QueryKey,
  caregivers: ["head-nurse", "dashboard", "caregivers"] as QueryKey,
  patients: ["head-nurse", "dashboard", "patients"] as QueryKey,
  tasks: ["head-nurse", "dashboard", "tasks"] as QueryKey,
  schedules: ["head-nurse", "dashboard", "schedules"] as QueryKey,
  timeline: ["head-nurse", "dashboard", "timeline"] as QueryKey,
  directives: ["head-nurse", "dashboard", "directives"] as QueryKey,
};

export default function HeadNurseHomePage() {
  const wardSummaryQuery = useQuery({
    queryKey: dashboardKeys.ward,
    queryFn: () => api.getWardSummary(),
  });

  const alertSummaryQuery = useQuery({
    queryKey: dashboardKeys.alertSummary,
    queryFn: () => api.getAlertSummary(),
  });

  const vitalsAverageQuery = useQuery({
    queryKey: dashboardKeys.vitalsAverage,
    queryFn: () => api.getVitalsAverages(24),
  });

  const alertsQuery = useQuery({
    queryKey: dashboardKeys.alerts,
    queryFn: () => api.listAlerts({ status: "active", limit: 180 }),
  });

  const caregiversQuery = useQuery({
    queryKey: dashboardKeys.caregivers,
    queryFn: () => api.listCaregivers({ limit: 300 }),
  });

  const patientsQuery = useQuery({
    queryKey: dashboardKeys.patients,
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const tasksQuery = useQuery({
    queryKey: dashboardKeys.tasks,
    queryFn: () => api.listWorkflowTasks({ limit: 200 }),
  });

  const directivesQuery = useQuery({
    queryKey: dashboardKeys.directives,
    queryFn: () => api.listWorkflowDirectives({ status: "active", limit: 200 }),
  });

  const schedulesQuery = useQuery({
    queryKey: dashboardKeys.schedules,
    queryFn: () => api.listWorkflowSchedules({ status: "scheduled", limit: 200 }),
  });

  const timelineQuery = useQuery({
    queryKey: dashboardKeys.timeline,
    queryFn: () => api.listTimelineEvents({ limit: 80 }),
    refetchInterval: 30_000,
  });

  const wardSummary = useMemo(
    () => (wardSummaryQuery.data ?? null) as GetWardSummaryResponse | null,
    [wardSummaryQuery.data],
  );
  const alertSummary = useMemo(
    () => (alertSummaryQuery.data ?? null) as GetAlertSummaryResponse | null,
    [alertSummaryQuery.data],
  );
  const vitalsAverage = useMemo(
    () => (vitalsAverageQuery.data ?? null) as GetVitalsAveragesResponse | null,
    [vitalsAverageQuery.data],
  );
  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );
  const caregivers = useMemo(
    () => (caregiversQuery.data ?? []) as ListCaregiversResponse,
    [caregiversQuery.data],
  );
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
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
  const timeline = useMemo(
    () => (timelineQuery.data ?? []) as ListTimelineEventsResponse,
    [timelineQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const activeAlerts = useMemo(
    () => alerts.filter((item) => item.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((item) => item.severity === "critical"),
    [activeAlerts],
  );

  const onDutyStaffCount = useMemo(
    () => caregivers.filter((item) => item.is_active).length,
    [caregivers],
  );

  const openTasks = useMemo(
    () => tasks.filter((item) => item.status === "pending" || item.status === "in_progress"),
    [tasks],
  );

  const activeDirectivesCount = useMemo(
    () => directives.filter((item) => item.status === "active").length,
    [directives],
  );

  const upcomingSchedules = useMemo(
    () =>
      schedules
        .filter((item) => item.status === "scheduled")
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at)),
    [schedules],
  );

  const alertRows = useMemo<AlertRow[]>(() => {
    return [...activeAlerts]
      .sort((left, right) => {
        if (left.severity === right.severity) {
          return right.timestamp.localeCompare(left.timestamp);
        }
        if (left.severity === "critical") return -1;
        if (right.severity === "critical") return 1;
        if (left.severity === "warning") return -1;
        if (right.severity === "warning") return 1;
        return 0;
      })
      .slice(0, 16)
      .map((item) => {
        const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
        return {
          id: item.id,
          title: item.title,
          description: item.description,
          severity: item.severity,
          patientId: item.patient_id,
          patientName: patient
            ? `${patient.first_name} ${patient.last_name}`.trim()
            : "Unlinked patient",
          timestamp: item.timestamp,
        };
      });
  }, [activeAlerts, patientMap]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return [...openTasks]
      .sort((left, right) => {
        if (!left.due_at) return 1;
        if (!right.due_at) return -1;
        return left.due_at.localeCompare(right.due_at);
      })
      .slice(0, 18)
      .map((item) => {
        const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
        return {
          id: item.id,
          title: item.title,
          priority: item.priority,
          status: item.status,
          patientId: item.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Unit-wide",
          dueAt: item.due_at,
        };
      });
  }, [openTasks, patientMap]);

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    return upcomingSchedules.slice(0, 18).map((item) => {
      const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
      return {
        id: item.id,
        title: item.title,
        scheduleType: item.schedule_type,
        status: item.status,
        patientId: item.patient_id,
        patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Unit-wide",
        startsAt: item.starts_at,
      };
    });
  }, [patientMap, upcomingSchedules]);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    return [...timeline]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 20)
      .map((item) => {
        const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
        return {
          id: item.id,
          eventType: item.event_type,
          description: item.description,
          patientId: item.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Patient N/A",
          roomName: item.room_name,
          timestamp: item.timestamp,
        };
      });
  }, [patientMap, timeline]);

  const alertsColumns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Alert",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      { accessorKey: "patientName", header: "Patient" },
      {
        accessorKey: "severity",
        header: "Severity",
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
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const href = row.original.patientId
            ? `/head-nurse/patients/${row.original.patientId}`
            : "/head-nurse/patients";
          return (
            <Button asChild size="sm" variant="outline">
              <Link href={href}>Open patient</Link>
            </Button>
          );
        },
      },
    ],
    [],
  );

  const tasksColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.patientName}</p>
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
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
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
    ],
    [],
  );

  const schedulesColumns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Schedule",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.patientName}</p>
          </div>
        ),
      },
      { accessorKey: "scheduleType", header: "Type" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "startsAt",
        header: "Starts",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.startsAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.startsAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const timelineColumns = useMemo<ColumnDef<TimelineRow>[]>(
    () => [
      {
        accessorKey: "eventType",
        header: "Event",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.eventType}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      { accessorKey: "patientName", header: "Patient" },
      { accessorKey: "roomName", header: "Room" },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const isLoadingAny =
    wardSummaryQuery.isLoading ||
    alertSummaryQuery.isLoading ||
    vitalsAverageQuery.isLoading ||
    alertsQuery.isLoading ||
    caregiversQuery.isLoading ||
    patientsQuery.isLoading ||
    tasksQuery.isLoading ||
    schedulesQuery.isLoading ||
    timelineQuery.isLoading ||
    directivesQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Head Nurse Ward Operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Centralize alert pressure, staffing readiness, and ward workflow execution.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryStatCard icon={Users} label="Patients" value={wardSummary?.total_patients ?? patients.length} tone="info" />
        <SummaryStatCard
          icon={Bell}
          label="Active alerts"
          value={wardSummary?.active_alerts ?? alertSummary?.total_active ?? activeAlerts.length}
          tone={activeAlerts.length > 0 ? "warning" : "success"}
        />
        <SummaryStatCard
          icon={AlertTriangle}
          label="Critical alerts"
          value={criticalAlerts.length}
          tone={criticalAlerts.length > 0 ? "critical" : "success"}
        />
        <SummaryStatCard icon={Stethoscope} label="On-duty staff" value={onDutyStaffCount} tone="info" />
        <SummaryStatCard icon={ClipboardList} label="Open tasks" value={openTasks.length} tone="warning" />
        <SummaryStatCard icon={CalendarClock} label="Upcoming schedules" value={upcomingSchedules.length} tone="info" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">24h heart rate avg</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {vitalsAverage?.heart_rate_bpm_avg != null
              ? `${vitalsAverage.heart_rate_bpm_avg.toFixed(1)} bpm`
              : "No data"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">24h SpO2 avg</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {vitalsAverage?.spo2_avg != null ? `${vitalsAverage.spo2_avg.toFixed(1)} %` : "No data"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Active directives</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{activeDirectivesCount}</p>
        </div>
      </section>

      <DataTableCard
        title="Escalation Alerts"
        description="Active alerts prioritized by severity and recency."
        data={alertRows}
        columns={alertsColumns}
        isLoading={isLoadingAny}
        emptyText="No active alerts in this workspace."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/head-nurse/alerts">Open alerts board</Link>
          </Button>
        }
      />

      <DataTableCard
        title="Task Queue"
        description="Open tasks sorted by due time and operational priority."
        data={taskRows}
        columns={tasksColumns}
        isLoading={isLoadingAny}
        emptyText="No open tasks currently assigned."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/head-nurse/staff">Open staff operations</Link>
          </Button>
        }
      />

      <DataTableCard
        title="Upcoming Schedules"
        description="Scheduled rounds and activities queued for this ward."
        data={scheduleRows}
        columns={schedulesColumns}
        isLoading={isLoadingAny}
        emptyText="No scheduled rounds found."
      />

      <DataTableCard
        title="Recent Timeline Feed"
        description="Latest patient timeline events captured across the ward."
        data={timelineRows}
        columns={timelineColumns}
        isLoading={isLoadingAny}
        emptyText="No timeline events available."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/head-nurse/reports">Open reports</Link>
          </Button>
        }
      />
    </div>
  );
}
