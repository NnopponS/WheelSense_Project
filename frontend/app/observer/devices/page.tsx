"use client";
"use no memo";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, LocateFixed, Signal, Tablet } from "lucide-react";
import { z } from "zod";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import type {
  ListAlertsResponse,
  ListVitalReadingsResponse,
} from "@/lib/api/task-scope-types";

const deviceSchema = z
  .object({
    id: z.number(),
    device_id: z.string(),
    hardware_type: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    last_seen: z.string().nullable().optional(),
  })
  .passthrough();

const predictionSchema = z
  .object({
    device_id: z.string(),
    timestamp: z.string().nullable().optional(),
    predicted_room_name: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
  })
  .passthrough();

type DeviceRow = {
  id: number;
  deviceId: string;
  displayName: string;
  hardwareType: string;
  isOnline: boolean;
  lastSeen: string | null;
  predictedRoom: string;
  confidence: number | null;
  alertCount: number;
  heartRate: number | null;
  battery: number | null;
};

export default function ObserverDevicesPage() {
  const nowMs = useFixedNowMs();

  const devicesQuery = useQuery({
    queryKey: ["observer", "devices", "list"],
    queryFn: async () => {
      const raw = await api.listDevicesRaw();
      if (!Array.isArray(raw)) return [] as z.infer<typeof deviceSchema>[];
      return raw
        .map((item) => deviceSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);
    },
    refetchInterval: 30_000,
  });

  const predictionsQuery = useQuery({
    queryKey: ["observer", "devices", "predictions"],
    queryFn: async () => {
      const raw = await api.listLocalizationPredictionsRaw({ limit: 240 });
      if (!Array.isArray(raw)) return [] as z.infer<typeof predictionSchema>[];
      return raw
        .map((item) => predictionSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data);
    },
    refetchInterval: 30_000,
  });

  const alertsQuery = useQuery({
    queryKey: ["observer", "devices", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 240 }),
  });

  const vitalsQuery = useQuery({
    queryKey: ["observer", "devices", "vitals"],
    queryFn: () => api.listVitalReadings({ limit: 300 }),
  });

  const devices = useMemo(
    () => devicesQuery.data ?? [],
    [devicesQuery.data],
  );
  const predictions = useMemo(
    () => predictionsQuery.data ?? [],
    [predictionsQuery.data],
  );
  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );
  const vitals = useMemo(
    () => (vitalsQuery.data ?? []) as ListVitalReadingsResponse,
    [vitalsQuery.data],
  );

  const latestPredictionByDevice = useMemo(() => {
    const latest = new Map<string, z.infer<typeof predictionSchema>>();
    for (const prediction of predictions) {
      const existing = latest.get(prediction.device_id);
      const existingTs = existing?.timestamp ?? "";
      const currentTs = prediction.timestamp ?? "";
      if (!existing || currentTs > existingTs) latest.set(prediction.device_id, prediction);
    }
    return latest;
  }, [predictions]);

  const latestVitalByDevice = useMemo(() => {
    const latest = new Map<string, ListVitalReadingsResponse[number]>();
    for (const vital of vitals) {
      const existing = latest.get(vital.device_id);
      if (!existing || vital.timestamp > existing.timestamp) {
        latest.set(vital.device_id, vital);
      }
    }
    return latest;
  }, [vitals]);

  const rows = useMemo<DeviceRow[]>(() => {
    return devices.map((device) => {
      const prediction = latestPredictionByDevice.get(device.device_id);
      const lastSeenMs = device.last_seen ? new Date(device.last_seen).getTime() : null;
      const isOnline = lastSeenMs != null && nowMs - lastSeenMs <= 5 * 60 * 1000;
      const alertCount = alerts.filter((alert) => alert.device_id === device.device_id).length;
      const latestVital = latestVitalByDevice.get(device.device_id);

      return {
        id: device.id,
        deviceId: device.device_id,
        displayName: device.display_name || device.device_id,
        hardwareType: device.hardware_type || "unknown",
        isOnline,
        lastSeen: device.last_seen ?? null,
        predictedRoom: prediction?.predicted_room_name || "No prediction",
        confidence: prediction?.confidence ?? null,
        alertCount,
        heartRate: latestVital?.heart_rate_bpm ?? null,
        battery: latestVital?.sensor_battery ?? null,
      };
    });
  }, [alerts, devices, latestPredictionByDevice, latestVitalByDevice, nowMs]);

  const onlineCount = rows.filter((row) => row.isOnline).length;
  const offlineCount = rows.length - onlineCount;
  const highConfidenceCount = rows.filter((row) => (row.confidence ?? 0) >= 0.8).length;

  const columns = useMemo<ColumnDef<DeviceRow>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: "Device",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.displayName}</p>
            <p className="text-xs text-muted-foreground">{row.original.deviceId}</p>
          </div>
        ),
      },
      {
        accessorKey: "hardwareType",
        header: "Hardware",
      },
      {
        accessorKey: "isOnline",
        header: "Status",
        cell: ({ row }) =>
          row.original.isOnline ? <Badge variant="success">Online</Badge> : <Badge variant="destructive">Offline</Badge>,
      },
      {
        accessorKey: "lastSeen",
        header: "Last seen",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.lastSeen)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.lastSeen)}</p>
          </div>
        ),
      },
      {
        accessorKey: "predictedRoom",
        header: "Predicted room",
      },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) =>
          row.original.confidence != null ? `${Math.round(row.original.confidence * 100)}%` : "-",
      },
      {
        accessorKey: "alertCount",
        header: "Alerts",
      },
      {
        accessorKey: "heartRate",
        header: "HR",
        cell: ({ row }) => row.original.heartRate ?? "-",
      },
      {
        accessorKey: "battery",
        header: "Battery",
        cell: ({ row }) => (row.original.battery != null ? `${row.original.battery}%` : "-"),
      },
    ],
    [],
  );

  const isLoadingAny =
    devicesQuery.isLoading ||
    predictionsQuery.isLoading ||
    alertsQuery.isLoading ||
    vitalsQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Device Status</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connectivity, localization confidence, and active alert load by device.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStatCard icon={Tablet} label="Total devices" value={rows.length} tone="info" />
        <SummaryStatCard icon={Signal} label="Online now" value={onlineCount} tone={onlineCount > 0 ? "success" : "warning"} />
        <SummaryStatCard icon={AlertTriangle} label="Offline/stale" value={offlineCount} tone={offlineCount > 0 ? "warning" : "success"} />
        <SummaryStatCard icon={LocateFixed} label="High confidence" value={highConfidenceCount} tone="info" />
      </section>

      <DataTableCard
        title="Device Fleet"
        description="Device telemetry health and latest localization prediction."
        data={rows}
        columns={columns}
        isLoading={isLoadingAny}
        emptyText="No devices are registered in this workspace."
      />
    </div>
  );
}
