"use client";
"use no memo";

import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Activity, Bell, HeartPulse, Tablet } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  GetPatientResponse,
  ListAlertsResponse,
  ListPatientDeviceAssignmentsResponse,
  ListTimelineEventsResponse,
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

type TimelineRow = {
  id: number;
  eventType: string;
  description: string;
  roomName: string;
  timestamp: string;
  source: string;
};

type AssignmentRow = {
  id: number;
  deviceId: string;
  deviceRole: string;
  assignedAt: string;
  isActive: boolean;
};

export default function HeadNursePatientDetailPage() {
  const params = useParams();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const patientId = Number(rawId);
  const hasValidPatientId = Number.isFinite(patientId) && patientId > 0;

  const patientQuery = useQuery({
    queryKey: ["head-nurse", "patient-detail", patientId, "patient"],
    enabled: hasValidPatientId,
    queryFn: () => api.getPatient(patientId),
  });

  const vitalsQuery = useQuery({
    queryKey: ["head-nurse", "patient-detail", patientId, "vitals"],
    enabled: hasValidPatientId,
    queryFn: () => api.listVitalReadings({ patient_id: patientId, limit: 120 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["head-nurse", "patient-detail", patientId, "alerts"],
    enabled: hasValidPatientId,
    queryFn: () => api.listAlerts({ patient_id: patientId, limit: 120 }),
  });

  const timelineQuery = useQuery({
    queryKey: ["head-nurse", "patient-detail", patientId, "timeline"],
    enabled: hasValidPatientId,
    queryFn: () => api.listTimelineEvents({ patient_id: patientId, limit: 120 }),
  });

  const assignmentsQuery = useQuery({
    queryKey: ["head-nurse", "patient-detail", patientId, "assignments"],
    enabled: hasValidPatientId,
    queryFn: () => api.listPatientDeviceAssignments(patientId),
  });

  const patient = useMemo(
    () => (patientQuery.data ?? null) as GetPatientResponse | null,
    [patientQuery.data],
  );
  const vitals = useMemo(
    () => (vitalsQuery.data ?? []) as ListVitalReadingsResponse,
    [vitalsQuery.data],
  );
  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );
  const timeline = useMemo(
    () => (timelineQuery.data ?? []) as ListTimelineEventsResponse,
    [timelineQuery.data],
  );
  const assignments = useMemo(
    () => (assignmentsQuery.data ?? []) as ListPatientDeviceAssignmentsResponse,
    [assignmentsQuery.data],
  );

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((alert) => alert.severity === "critical"),
    [activeAlerts],
  );

  const vitalsRows = useMemo<VitalsRow[]>(() => {
    return [...vitals]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((item) => ({
        id: item.id,
        timestamp: item.timestamp,
        heartRate: item.heart_rate_bpm,
        spo2: item.spo2,
        rrInterval: item.rr_interval_ms,
        battery: item.sensor_battery,
        source: item.source,
      }));
  }, [vitals]);

  const alertRows = useMemo<AlertRow[]>(() => {
    return [...alerts]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((item) => ({
        id: item.id,
        title: item.title,
        severity: item.severity,
        status: item.status,
        description: item.description,
        timestamp: item.timestamp,
      }));
  }, [alerts]);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    return [...timeline]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((item) => ({
        id: item.id,
        eventType: item.event_type,
        description: item.description,
        roomName: item.room_name,
        timestamp: item.timestamp,
        source: item.source,
      }));
  }, [timeline]);

  const assignmentRows = useMemo<AssignmentRow[]>(() => {
    return assignments.map((item) => ({
      id: item.id,
      deviceId: item.device_id,
      deviceRole: item.device_role,
      assignedAt: item.assigned_at,
      isActive: item.is_active,
    }));
  }, [assignments]);

  const vitalsColumns = useMemo<ColumnDef<VitalsRow>[]>(
    () => [
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
        accessorKey: "heartRate",
        header: "HR",
        cell: ({ row }) => row.original.heartRate ?? "-",
      },
      {
        accessorKey: "spo2",
        header: "SpO2",
        cell: ({ row }) => row.original.spo2 ?? "-",
      },
      {
        accessorKey: "rrInterval",
        header: "RR interval",
        cell: ({ row }) => (row.original.rrInterval != null ? `${row.original.rrInterval} ms` : "-"),
      },
      {
        accessorKey: "battery",
        header: "Battery",
        cell: ({ row }) => (row.original.battery != null ? `${row.original.battery}%` : "-"),
      },
      {
        accessorKey: "source",
        header: "Source",
      },
    ],
    [],
  );

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
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "destructive" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => formatDateTime(row.original.timestamp),
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
      { accessorKey: "roomName", header: "Room" },
      { accessorKey: "source", header: "Source" },
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

  const assignmentColumns = useMemo<ColumnDef<AssignmentRow>[]>(
    () => [
      {
        accessorKey: "deviceId",
        header: "Device",
      },
      {
        accessorKey: "deviceRole",
        header: "Role",
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "outline"}>
            {row.original.isActive ? "active" : "inactive"}
          </Badge>
        ),
      },
      {
        accessorKey: "assignedAt",
        header: "Assigned",
        cell: ({ row }) => formatDateTime(row.original.assignedAt),
      },
    ],
    [],
  );

  if (!hasValidPatientId) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-xl font-semibold text-foreground">Invalid patient ID</h2>
          <p className="text-sm text-muted-foreground">
            The route parameter is invalid. Return to the patient roster and select a patient.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/head-nurse/patients">Back to patients</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isLoadingAny =
    patientQuery.isLoading ||
    vitalsQuery.isLoading ||
    alertsQuery.isLoading ||
    timelineQuery.isLoading ||
    assignmentsQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {patient ? `${patient.first_name} ${patient.last_name}` : "Patient detail"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Clinical detail view for real-time vitals, alerts, timeline, and linked devices.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard icon={Bell} label="Active alerts" value={activeAlerts.length} tone={activeAlerts.length > 0 ? "warning" : "success"} />
        <SummaryStatCard icon={Activity} label="Critical alerts" value={criticalAlerts.length} tone={criticalAlerts.length > 0 ? "critical" : "success"} />
        <SummaryStatCard icon={HeartPulse} label="Recent vitals" value={vitalsRows.length} tone="info" />
        <SummaryStatCard icon={Tablet} label="Linked devices" value={assignmentRows.length} tone="info" />
      </section>

      <DataTableCard
        title="Recent Vitals"
        description="Latest sensor readings captured for this patient."
        data={vitalsRows}
        columns={vitalsColumns}
        isLoading={isLoadingAny}
        emptyText="No vitals available for this patient."
      />

      <DataTableCard
        title="Alerts"
        description="Alert timeline sorted by recency."
        data={alertRows}
        columns={alertsColumns}
        isLoading={isLoadingAny}
        emptyText="No alerts found for this patient."
      />

      <DataTableCard
        title="Activity Timeline"
        description="Recent room and event movements for the patient."
        data={timelineRows}
        columns={timelineColumns}
        isLoading={isLoadingAny}
        emptyText="No timeline events found for this patient."
      />

      <DataTableCard
        title="Device Assignments"
        description="Devices currently or previously linked to this patient."
        data={assignmentRows}
        columns={assignmentColumns}
        isLoading={isLoadingAny}
        emptyText="No device assignments found for this patient."
      />
    </div>
  );
}
