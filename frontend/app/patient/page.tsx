"use client";
"use no memo";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Bell, Heart, MessageCircle, Siren, Sparkles } from "lucide-react";
import DashboardFloorplanPanel from "@/components/dashboard/DashboardFloorplanPanel";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type { Room } from "@/lib/types";
import type {
  CareTaskOut,
  CreateAlertRequest,
  GetPatientResponse,
  ListAlertsResponse,
  ListPatientsResponse,
  ListSmartDevicesResponse,
  ListVitalReadingsResponse,
  ListWorkflowMessagesResponse,
} from "@/lib/api/task-scope-types";

type AssistanceKind = "assistance" | "sos";

type AlertRow = {
  id: number;
  title: string;
  description: string;
  severity: string;
  timestamp: string;
};

type TaskRow = {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
};

type MessageRow = {
  id: number;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

function parseError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const previewRaw = searchParams.get("previewAs");
  const previewNum = previewRaw != null && previewRaw !== "" ? Number(previewRaw) : NaN;
  const previewPatientId = Number.isFinite(previewNum) && previewNum > 0 ? Math.floor(previewNum) : null;

  const isAdminPreview = user?.role === "admin" && previewPatientId != null;
  const showAdminPatientPicker = user?.role === "admin" && user.patient_id == null && previewPatientId == null;

  const effectivePatientId = useMemo(() => {
    if (isAdminPreview) return previewPatientId;
    return user?.patient_id ?? null;
  }, [isAdminPreview, previewPatientId, user?.patient_id]);

  const adminPatientsQuery = useQuery({
    queryKey: ["patient", "admin-picker", "patients"],
    enabled: showAdminPatientPicker,
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const patientQuery = useQuery({
    queryKey: ["patient", "dashboard", "patient", effectivePatientId],
    enabled: effectivePatientId != null,
    queryFn: () => api.getPatient(Number(effectivePatientId)),
  });

  const vitalsQuery = useQuery({
    queryKey: ["patient", "dashboard", "vitals", effectivePatientId],
    enabled: effectivePatientId != null,
    queryFn: () => api.listVitalReadings({ patient_id: Number(effectivePatientId), limit: 24 }),
    refetchInterval: 30_000,
  });

  const alertsQuery = useQuery({
    queryKey: ["patient", "dashboard", "alerts", effectivePatientId],
    enabled: effectivePatientId != null,
    queryFn: () =>
      api.listAlerts({ status: "active", patient_id: Number(effectivePatientId), limit: 20 }),
    refetchInterval: 20_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["patient", "dashboard", "messages", effectivePatientId],
    enabled: effectivePatientId != null,
    queryFn: () => api.listWorkflowMessages({ inbox_only: true, limit: 80 }),
  });

  const smartDevicesQuery = useQuery({
    queryKey: ["patient", "dashboard", "smart-devices"],
    enabled: effectivePatientId != null,
    queryFn: () => api.listSmartDevices(),
  });

  const roomsQuery = useQuery({
    queryKey: ["patient", "dashboard", "rooms"],
    enabled: effectivePatientId != null,
    queryFn: () => api.listRooms(),
  });

  const tasksQuery = useQuery({
    queryKey: ["patient", "dashboard", "tasks", effectivePatientId],
    enabled: effectivePatientId != null,
    retry: false,
    queryFn: async () => {
      try {
        const items = await api.listWorkflowTasks({ limit: 80 });
        return { items, restricted: false };
      } catch (error) {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          return { items: [] as CareTaskOut[], restricted: true };
        }
        throw error;
      }
    },
  });

  const raiseAssistanceMutation = useMutation({
    mutationFn: async (kind: AssistanceKind) => {
      if (!effectivePatientId) return;
      const payload = {
        patient_id: Number(effectivePatientId),
        alert_type: kind === "sos" ? "emergency_sos" : "patient_assistance",
        severity: kind === "sos" ? "critical" : "warning",
        title: kind === "sos" ? "Emergency SOS from patient" : "Patient assistance request",
        description:
          kind === "sos"
            ? "Patient pressed emergency SOS from patient dashboard."
            : "Patient requested non-emergency assistance from patient dashboard.",
        data: {
          source: "patient_dashboard",
          kind,
        },
      } satisfies CreateAlertRequest;

      await api.createAlert(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patient", "dashboard", "alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["patient", "dashboard"] });
    },
  });

  const controlDeviceMutation = useMutation({
    mutationFn: async (variables: { deviceId: number; action: "turn_on" | "turn_off" | "toggle" }) => {
      await api.controlSmartDevice(variables.deviceId, {
        action: variables.action,
        parameters: {},
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patient", "dashboard", "smart-devices"] });
    },
  });

  const patient = useMemo(
    () => (patientQuery.data ?? null) as GetPatientResponse | null,
    [patientQuery.data],
  );

  const adminPatients = useMemo(
    () => (adminPatientsQuery.data ?? []) as ListPatientsResponse,
    [adminPatientsQuery.data],
  );

  const vitals = useMemo(
    () => (vitalsQuery.data ?? []) as ListVitalReadingsResponse,
    [vitalsQuery.data],
  );

  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );

  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );

  const smartDevices = useMemo(
    () => (smartDevicesQuery.data ?? []) as ListSmartDevicesResponse,
    [smartDevicesQuery.data],
  );

  const rooms = useMemo(() => (roomsQuery.data ?? []) as Room[], [roomsQuery.data]);
  const patientRoom = useMemo(
    () => rooms.find((room) => room.id === patient?.room_id) ?? null,
    [patient?.room_id, rooms],
  );

  const tasksData = useMemo(
    () => tasksQuery.data ?? { items: [] as CareTaskOut[], restricted: false },
    [tasksQuery.data],
  );

  const patientTasks = useMemo(
    () =>
      tasksData.items.filter(
        (task) => task.patient_id === effectivePatientId || task.patient_id == null,
      ),
    [effectivePatientId, tasksData.items],
  );

  const patientMessages = useMemo(
    () =>
      messages.filter(
        (message) => message.patient_id === effectivePatientId || message.patient_id == null,
      ),
    [effectivePatientId, messages],
  );

  const roomDevices = useMemo(() => {
    if (!patient?.room_id) return [] as ListSmartDevicesResponse;
    return smartDevices.filter((device) => device.room_id === patient.room_id && device.is_active);
  }, [patient, smartDevices]);

  const latestVitals = vitals[0] ?? null;

  const alertRows = useMemo<AlertRow[]>(() => {
    return alerts
      .map((alert) => ({
        id: alert.id,
        title: alert.title,
        description: alert.description,
        severity: alert.severity,
        timestamp: alert.timestamp,
      }))
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [alerts]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return patientTasks
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueAt: task.due_at,
      }))
      .sort((left, right) => {
        if (!left.dueAt) return 1;
        if (!right.dueAt) return -1;
        return left.dueAt.localeCompare(right.dueAt);
      })
      .slice(0, 20);
  }, [patientTasks]);

  const messageRows = useMemo<MessageRow[]>(() => {
    return patientMessages
      .map((message) => ({
        id: message.id,
        subject: message.subject || "Care team update",
        body: message.body,
        isRead: message.is_read,
        createdAt: message.created_at,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 20);
  }, [patientMessages]);

  const alertColumns = useMemo<ColumnDef<AlertRow>[]>(
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

  const taskColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
      },
      {
        accessorKey: "priority",
        header: "Priority",
        cell: ({ row }) => <Badge variant="outline">{row.original.priority}</Badge>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "dueAt",
        header: "Due",
        cell: ({ row }) => formatDateTime(row.original.dueAt),
      },
    ],
    [],
  );

  const messageColumns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Message",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.subject}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: "isRead",
        header: "Read",
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "success" : "warning"}>
            {row.original.isRead ? "read" : "unread"}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  if (showAdminPatientPicker) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-xl font-bold text-foreground">Choose Patient Preview</h2>
          <p className="text-sm text-muted-foreground">
            Select a patient to preview patient portal as admin.
          </p>
          <Select
            onValueChange={(value) => {
              router.push(`/patient?previewAs=${value}`);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select patient" />
            </SelectTrigger>
            <SelectContent>
              {adminPatients.map((patientOption) => (
                <SelectItem key={patientOption.id} value={String(patientOption.id)}>
                  {patientOption.first_name} {patientOption.last_name} (#{patientOption.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    );
  }

  if (!effectivePatientId) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-destructive">
        Your account is not linked to a patient record.
      </div>
    );
  }

  const isLoadingAny =
    patientQuery.isLoading ||
    vitalsQuery.isLoading ||
    alertsQuery.isLoading ||
    messagesQuery.isLoading ||
    smartDevicesQuery.isLoading ||
    roomsQuery.isLoading ||
    tasksQuery.isLoading;

  if (isLoadingAny && !patient) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-destructive">
        Unable to load patient dashboard.
      </div>
    );
  }

  const assistanceError = raiseAssistanceMutation.error
    ? parseError(raiseAssistanceMutation.error)
    : null;
  const deviceError = controlDeviceMutation.error ? parseError(controlDeviceMutation.error) : null;

  return (
    <div className="space-y-8 animate-fade-in">
      {isAdminPreview ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <p className="text-foreground">Preview mode: patient portal</p>
          <Link href="/patient" className="font-semibold text-primary hover:underline">
            Clear preview
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-foreground">
            Welcome, {patient.nickname || patient.first_name}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Room {patient.room_id ?? "Unassigned"} • Care level {patient.care_level}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["patient", "dashboard"] });
          }}
        >
          Refresh
        </Button>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStatCard
          icon={Heart}
          label="Heart rate"
          value={latestVitals?.heart_rate_bpm ?? 0}
          tone={latestVitals?.heart_rate_bpm ? "info" : "warning"}
        />
        <SummaryStatCard
          icon={Sparkles}
          label="SpO2"
          value={latestVitals?.spo2 ?? 0}
          tone={latestVitals?.spo2 ? "info" : "warning"}
        />
        <SummaryStatCard
          icon={Bell}
          label="Skin temp"
          value={latestVitals?.skin_temperature != null ? Number(latestVitals.skin_temperature.toFixed(1)) : 0}
          tone={latestVitals?.skin_temperature != null ? "info" : "warning"}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.04fr_0.96fr]">
        {patientRoom ? (
          <DashboardFloorplanPanel
            className="min-w-0"
            initialFacilityId={patientRoom.facility_id ?? null}
            initialFloorId={patientRoom.floor_id ?? null}
            initialRoomName={patientRoom.name}
          />
        ) : (
          <Card className="border-border/70">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="text-base">Room context</CardTitle>
              <CardDescription>
                {patient.room_id != null
                  ? "Your room map will appear when room metadata is available."
                  : "Your account is not linked to a room yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/70 px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Assigned room</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {patient.room_id != null ? `Room #${patient.room_id}` : "Unassigned"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {patient.room_id != null
                    ? "Map loading failed or the room record is still unavailable."
                    : "A room can be linked after account setup."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border/70">
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-base">Room context</CardTitle>
            <CardDescription>
              {patientRoom
                ? `${patientRoom.name}${patientRoom.floor_name ? ` • ${patientRoom.floor_name}` : ""}${patientRoom.facility_name ? ` • ${patientRoom.facility_name}` : ""}`
                : "Nearby equipment and room metadata will appear here."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/70 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Room</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {patientRoom?.name ?? `#${patient.room_id ?? "—"}`}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 px-3 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Devices</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{roomDevices.length}</p>
            </div>
            <p className="col-span-2 text-sm text-muted-foreground">
              {patientRoom
                ? "The compact floorplan above stays within the first viewport and can still show basic presence metadata when available."
                : "Once room metadata is available, the map panel will seed itself to the right room and floor."}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-lg font-semibold text-foreground">Assistance & SOS</h3>
            <p className="text-sm text-muted-foreground">
              Send assistance request directly to your care team.
            </p>
            {assistanceError ? <p className="text-sm text-destructive">{assistanceError}</p> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button
                type="button"
                disabled={raiseAssistanceMutation.isPending}
                onClick={() => raiseAssistanceMutation.mutate("assistance")}
              >
                {raiseAssistanceMutation.isPending ? "Sending..." : "Request Assistance"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={raiseAssistanceMutation.isPending}
                onClick={() => raiseAssistanceMutation.mutate("sos")}
              >
                <Siren className="h-4 w-4" />
                {raiseAssistanceMutation.isPending ? "Sending SOS..." : "Emergency SOS"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-lg font-semibold text-foreground">Room Device Control</h3>
            <p className="text-sm text-muted-foreground">
              Smart devices currently mapped to your room.
            </p>
            {deviceError ? <p className="text-sm text-destructive">{deviceError}</p> : null}
            <div className="space-y-3">
              {roomDevices.length > 0 ? (
                roomDevices.map((device) => (
                  <div key={device.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{device.name}</p>
                        <p className="text-xs text-muted-foreground">State: {device.state}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={controlDeviceMutation.isPending}
                          onClick={() => controlDeviceMutation.mutate({ deviceId: device.id, action: "turn_on" })}
                        >
                          On
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={controlDeviceMutation.isPending}
                          onClick={() => controlDeviceMutation.mutate({ deviceId: device.id, action: "turn_off" })}
                        >
                          Off
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No active smart-home devices are mapped to your room.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <DataTableCard
        title="Active Alerts"
        description="Current patient alerts that require awareness."
        data={alertRows}
        columns={alertColumns}
        isLoading={isLoadingAny}
        emptyText="No active alerts right now."
      />

      <DataTableCard
        title="Care Tasks"
        description="Current care tasks visible in your account scope."
        data={taskRows}
        columns={taskColumns}
        isLoading={isLoadingAny}
        emptyText={tasksData.restricted ? "Care tasks are managed by staff for your account." : "No open tasks assigned."}
      />

      <DataTableCard
        title="Latest Messages"
        description="Recent care-team communication for your case."
        data={messageRows}
        columns={messageColumns}
        isLoading={isLoadingAny}
        emptyText="No messages in your inbox."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/patient/messages">
              <MessageCircle className="h-4 w-4" />
              Open messages
            </Link>
          </Button>
        }
      />
    </div>
  );
}
