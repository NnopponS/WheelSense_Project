"use client";
"use no memo";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, LocateFixed, Monitor, ShieldAlert } from "lucide-react";
import { z } from "zod";
import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListAlertsResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

const predictionSchema = z
  .object({
    id: z.number(),
    device_id: z.string(),
    timestamp: z.string().nullable().optional(),
    predicted_room_id: z.number().nullable().optional(),
    predicted_room_name: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    model_type: z.string().nullable().optional(),
  })
  .passthrough();

const roomSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    description: z.string().optional().default(""),
    room_type: z.string().optional().default("room"),
  })
  .passthrough();

type RoomRow = {
  roomId: number;
  roomName: string;
  description: string;
  roomType: string;
  patients: number;
  activeAlerts: number;
  trackedDevices: number;
  avgConfidence: number | null;
};

type AlertRow = {
  id: number;
  title: string;
  description: string;
  severity: string;
  patientId: number | null;
  patientName: string;
  roomName: string;
  timestamp: string;
};

export default function ObserverZonePage() {
  const roomsQuery = useQuery({
    queryKey: ["observer", "dashboard", "rooms"],
    queryFn: async () => {
      const raw = await api.listRooms();
      if (!Array.isArray(raw)) return [] as z.infer<typeof roomSchema>[];
      return raw
        .map((item) => roomSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);
    },
  });

  const patientsQuery = useQuery({
    queryKey: ["observer", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["observer", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 250 }),
  });

  const predictionsQuery = useQuery({
    queryKey: ["observer", "dashboard", "predictions"],
    queryFn: async () => {
      const raw = await api.listLocalizationPredictionsRaw({ limit: 250 });
      if (!Array.isArray(raw)) return [] as z.infer<typeof predictionSchema>[];
      return raw
        .map((item) => predictionSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);
    },
    refetchInterval: 30_000,
  });

  const rooms = useMemo(() => roomsQuery.data ?? [], [roomsQuery.data]);
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );
  const predictions = useMemo(
    () => predictionsQuery.data ?? [],
    [predictionsQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const latestPredictionByDevice = useMemo(() => {
    const latest = new Map<string, z.infer<typeof predictionSchema>>();
    for (const prediction of predictions) {
      const existing = latest.get(prediction.device_id);
      const existingTimestamp = existing?.timestamp ?? "";
      const currentTimestamp = prediction.timestamp ?? "";
      if (!existing || currentTimestamp > existingTimestamp) {
        latest.set(prediction.device_id, prediction);
      }
    }
    return latest;
  }, [predictions]);

  const roomRows = useMemo<RoomRow[]>(() => {
    const latestPredictions = Array.from(latestPredictionByDevice.values());

    return rooms.map((room) => {
      const roomPredictions = latestPredictions.filter(
        (prediction) =>
          prediction.predicted_room_id === room.id ||
          prediction.predicted_room_name === room.name,
      );

      const roomAlerts = alerts.filter((alert) => {
        const data = alert.data as Record<string, unknown>;
        const alertRoomId = typeof data.room_id === "number" ? data.room_id : null;
        const alertRoomName = typeof data.room_name === "string" ? data.room_name : null;

        if (alertRoomId != null) return alertRoomId === room.id;
        if (alertRoomName != null) return alertRoomName === room.name;

        if (!alert.device_id) return false;
        const prediction = latestPredictionByDevice.get(alert.device_id);
        if (!prediction) return false;
        return (
          prediction.predicted_room_id === room.id ||
          prediction.predicted_room_name === room.name
        );
      });

      const confidenceValues = roomPredictions
        .map((prediction) => prediction.confidence)
        .filter((confidence): confidence is number => typeof confidence === "number");

      const avgConfidence = confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
        : null;

      return {
        roomId: room.id,
        roomName: room.name,
        description: room.description,
        roomType: room.room_type,
        patients: patients.filter((patient) => patient.room_id === room.id).length,
        activeAlerts: roomAlerts.length,
        trackedDevices: roomPredictions.length,
        avgConfidence,
      };
    });
  }, [alerts, latestPredictionByDevice, patients, rooms]);

  const alertRows = useMemo<AlertRow[]>(() => {
    return [...alerts]
      .filter((alert) => alert.status === "active")
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((alert) => {
        const patient = alert.patient_id ? patientMap.get(alert.patient_id) : null;
        const data = alert.data as Record<string, unknown>;
        const roomName =
          typeof data.room_name === "string" ? data.room_name : "Unknown room";

        return {
          id: alert.id,
          title: alert.title,
          description: alert.description,
          severity: alert.severity,
          patientId: alert.patient_id,
          patientName: patient
            ? `${patient.first_name} ${patient.last_name}`.trim()
            : "Unlinked patient",
          roomName,
          timestamp: alert.timestamp,
        };
      });
  }, [alerts, patientMap]);

  const roomColumns = useMemo<ColumnDef<RoomRow>[]>(
    () => [
      {
        accessorKey: "roomName",
        header: "Room",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.roomName}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {row.original.description || "Clinical room"}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "roomType",
        header: "Type",
      },
      {
        accessorKey: "patients",
        header: "Patients",
      },
      {
        accessorKey: "activeAlerts",
        header: "Active alerts",
      },
      {
        accessorKey: "trackedDevices",
        header: "Tracked devices",
      },
      {
        accessorKey: "avgConfidence",
        header: "Avg confidence",
        cell: ({ row }) =>
          row.original.avgConfidence != null
            ? `${Math.round(row.original.avgConfidence * 100)}%`
            : "-",
      },
    ],
    [],
  );

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
        accessorKey: "patientName",
        header: "Patient",
      },
      {
        accessorKey: "roomName",
        header: "Room",
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
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={row.original.patientId ? `/observer/patients/${row.original.patientId}` : "/observer/patients"}>
              Open patient
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const trackedDevices = latestPredictionByDevice.size;
  const highConfidenceCount = Array.from(latestPredictionByDevice.values()).filter(
    (prediction) => (prediction.confidence ?? 0) >= 0.8,
  ).length;
  const activeAlertCount = alerts.filter((item) => item.status === "active").length;

  const isLoadingAny =
    roomsQuery.isLoading ||
    patientsQuery.isLoading ||
    alertsQuery.isLoading ||
    predictionsQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Zone Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live room watch with active alerts and localization confidence.
        </p>
      </div>

      <FloorplanRoleViewer />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStatCard icon={Monitor} label="Rooms monitored" value={rooms.length} tone="info" />
        <SummaryStatCard icon={ShieldAlert} label="Active alerts" value={activeAlertCount} tone={activeAlertCount > 0 ? "warning" : "success"} />
        <SummaryStatCard icon={LocateFixed} label="Located devices" value={trackedDevices} tone="info" />
        <SummaryStatCard icon={AlertTriangle} label="High confidence" value={highConfidenceCount} tone="warning" />
      </section>

      <DataTableCard
        title="Room Watchlist"
        description="Room-level patient, alert, and localization signal overview."
        data={roomRows}
        columns={roomColumns}
        isLoading={isLoadingAny}
        emptyText="No rooms are configured in this workspace."
      />

      <DataTableCard
        title="Active Alerts"
        description="Current active alerts mapped to room and patient context."
        data={alertRows}
        columns={alertColumns}
        isLoading={isLoadingAny}
        emptyText="No active alerts right now."
        rightSlot={
          <Button asChild size="sm" variant="outline">
            <Link href="/observer/alerts">Open alerts board</Link>
          </Button>
        }
      />
    </div>
  );
}
