"use client";
"use no memo";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, MapPin, Radio, Siren } from "lucide-react";
import { z } from "zod";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type { ListAlertsResponse, ListPatientsResponse } from "@/lib/api/task-scope-types";

const roomSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    room_type: z.string().nullable().optional(),
  })
  .passthrough();

const predictionSchema = z
  .object({
    id: z.number(),
    device_id: z.string(),
    timestamp: z.string().nullable().optional(),
    predicted_room_id: z.number().nullable().optional(),
    predicted_room_name: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    model_type: z.string().optional(),
  })
  .passthrough();

type RoomRow = {
  roomId: number;
  roomName: string;
  roomType: string;
  localizedDevices: number;
  averageConfidence: number | null;
  lastSignal: string | null;
  isCritical: boolean;
};

type AlertRow = {
  alertId: number;
  title: string;
  description: string;
  patientName: string;
  patientId: number | null;
  timestamp: string;
};

type PredictionRow = {
  deviceId: string;
  roomName: string;
  confidence: number | null;
  modelType: string;
  timestamp: string | null;
};

export default function SupervisorEmergencyPage() {
  const alertsQuery = useQuery({
    queryKey: ["supervisor", "emergency", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 200 }),
  });

  const roomsQuery = useQuery({
    queryKey: ["supervisor", "emergency", "rooms"],
    queryFn: async () => {
      const raw = await api.listRooms();
      if (!Array.isArray(raw)) return [] as z.infer<typeof roomSchema>[];
      return raw
        .map((item) => roomSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);
    },
  });

  const predictionsQuery = useQuery({
    queryKey: ["supervisor", "emergency", "predictions"],
    queryFn: async () => {
      const raw = await api.listLocalizationPredictionsRaw({ limit: 200 });
      if (!Array.isArray(raw)) return [] as z.infer<typeof predictionSchema>[];
      return raw
        .map((item) => predictionSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);
    },
    refetchInterval: 30_000,
  });

  const patientsQuery = useQuery({
    queryKey: ["supervisor", "emergency", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );
  const rooms = useMemo(
    () => roomsQuery.data ?? [],
    [roomsQuery.data],
  );
  const predictions = useMemo(
    () => predictionsQuery.data ?? [],
    [predictionsQuery.data],
  );
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const activeCriticalAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active" && alert.severity === "critical"),
    [alerts],
  );

  const latestPredictionByDevice = useMemo(() => {
    const map = new Map<string, z.infer<typeof predictionSchema>>();
    for (const prediction of predictions) {
      const existing = map.get(prediction.device_id);
      if (!existing) {
        map.set(prediction.device_id, prediction);
        continue;
      }
      const existingTs = existing.timestamp ?? "";
      const nextTs = prediction.timestamp ?? "";
      if (nextTs > existingTs) {
        map.set(prediction.device_id, prediction);
      }
    }
    return Array.from(map.values());
  }, [predictions]);

  const occupancyByRoom = useMemo(() => {
    const map = new Map<string, { devices: number; avgConfidence: number; latestSeen: string | null }>();
    for (const prediction of latestPredictionByDevice) {
      const roomName = prediction.predicted_room_name ?? "Unknown room";
      const existing = map.get(roomName);
      const confidence = prediction.confidence ?? 0;
      if (!existing) {
        map.set(roomName, {
          devices: 1,
          avgConfidence: confidence,
          latestSeen: prediction.timestamp ?? null,
        });
        continue;
      }

      const nextDevices = existing.devices + 1;
      map.set(roomName, {
        devices: nextDevices,
        avgConfidence: (existing.avgConfidence * existing.devices + confidence) / nextDevices,
        latestSeen:
          prediction.timestamp && (!existing.latestSeen || prediction.timestamp > existing.latestSeen)
            ? prediction.timestamp
            : existing.latestSeen,
      });
    }
    return map;
  }, [latestPredictionByDevice]);

  const criticalRooms = useMemo(() => {
    const names = new Set<string>();
    for (const alert of activeCriticalAlerts) {
      const data = alert.data as Record<string, unknown>;
      const roomName = typeof data.room_name === "string" ? data.room_name : null;
      if (roomName) names.add(roomName);
    }
    return names;
  }, [activeCriticalAlerts]);

  const alertRows = useMemo<AlertRow[]>(() => {
    return activeCriticalAlerts
      .map((alert) => {
        const patient = alert.patient_id ? patientById.get(alert.patient_id) : null;
        return {
          alertId: alert.id,
          title: alert.title,
          description: alert.description,
          patientName: patient
            ? `${patient.first_name} ${patient.last_name}`.trim()
            : "Patient not linked",
          patientId: alert.patient_id,
          timestamp: alert.timestamp,
        };
      })
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [activeCriticalAlerts, patientById]);

  const roomRows = useMemo<RoomRow[]>(() => {
    return rooms.map((room) => {
      const occupancy = occupancyByRoom.get(room.name);
      return {
        roomId: room.id,
        roomName: room.name,
        roomType: room.room_type || "room",
        localizedDevices: occupancy?.devices ?? 0,
        averageConfidence:
          typeof occupancy?.avgConfidence === "number" ? occupancy.avgConfidence : null,
        lastSignal: occupancy?.latestSeen ?? null,
        isCritical: criticalRooms.has(room.name),
      };
    });
  }, [criticalRooms, occupancyByRoom, rooms]);

  const predictionRows = useMemo<PredictionRow[]>(() => {
    return [...latestPredictionByDevice]
      .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))
      .map((prediction) => ({
        deviceId: prediction.device_id,
        roomName: prediction.predicted_room_name ?? "Unknown room",
        confidence: prediction.confidence ?? null,
        modelType: prediction.model_type || "-",
        timestamp: prediction.timestamp ?? null,
      }));
  }, [latestPredictionByDevice]);

  const alertColumns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Alert",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      { accessorKey: "patientName", header: "Patient" },
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
          const href = row.original.patientId ? `/supervisor/patients/${row.original.patientId}` : "/supervisor/patients";
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

  const roomColumns = useMemo<ColumnDef<RoomRow>[]>(
    () => [
      {
        accessorKey: "roomName",
        header: "Room",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.roomName}</p>
            <p className="text-xs capitalize text-muted-foreground">{row.original.roomType}</p>
          </div>
        ),
      },
      {
        accessorKey: "localizedDevices",
        header: "Localized devices",
      },
      {
        accessorKey: "averageConfidence",
        header: "Avg confidence",
        cell: ({ row }) =>
          row.original.averageConfidence != null
            ? `${Math.round(row.original.averageConfidence * 100)}%`
            : "-",
      },
      {
        accessorKey: "lastSignal",
        header: "Last signal",
        cell: ({ row }) => formatDateTime(row.original.lastSignal),
      },
      {
        accessorKey: "isCritical",
        header: "Risk",
        cell: ({ row }) =>
          row.original.isCritical ? <Badge variant="destructive">Critical</Badge> : <Badge variant="outline">Normal</Badge>,
      },
    ],
    [],
  );

  const predictionColumns = useMemo<ColumnDef<PredictionRow>[]>(
    () => [
      {
        accessorKey: "deviceId",
        header: "Device",
      },
      { accessorKey: "roomName", header: "Predicted room" },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) =>
          row.original.confidence != null ? `${Math.round(row.original.confidence * 100)}%` : "-",
      },
      { accessorKey: "modelType", header: "Model" },
      {
        accessorKey: "timestamp",
        header: "Timestamp",
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
    alertsQuery.isLoading || roomsQuery.isLoading || predictionsQuery.isLoading || patientsQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Emergency Monitoring</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track room-level risk using critical alerts and live localization predictions.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStatCard
          icon={Siren}
          label="Active critical alerts"
          value={activeCriticalAlerts.length}
          tone={activeCriticalAlerts.length > 0 ? "critical" : "success"}
        />
        <SummaryStatCard icon={Radio} label="Tracked devices" value={latestPredictionByDevice.length} tone="info" />
        <SummaryStatCard icon={MapPin} label="Rooms with live signals" value={occupancyByRoom.size} tone="warning" />
      </section>

      <DataTableCard
        title="Critical Alert Queue"
        description="Active critical alerts with quick path to patient detail."
        data={alertRows}
        columns={alertColumns}
        isLoading={isLoadingAny}
        emptyText="No active critical alerts at this time."
        rightSlot={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
      />

      <DataTableCard
        title="Floor Coverage by Room"
        description="Latest room-level occupancy signals from localization predictions."
        data={roomRows}
        columns={roomColumns}
        isLoading={isLoadingAny}
        emptyText="No rooms are available for this workspace."
      />

      <DataTableCard
        title="Live Device Localization Feed"
        description="Most recent prediction for each tracked device."
        data={predictionRows}
        columns={predictionColumns}
        isLoading={isLoadingAny}
        emptyText="No localization predictions are currently streaming."
      />
    </div>
  );
}

