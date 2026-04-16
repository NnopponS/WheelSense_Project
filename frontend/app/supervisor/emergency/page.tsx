"use client";
"use no memo";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
import { useTranslation } from "@/lib/i18n";
import { useAlertRowHighlight } from "@/hooks/useAlertRowHighlight";
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
  const { t } = useTranslation();
  const searchParams = useSearchParams();
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
      const roomName = prediction.predicted_room_name ?? t("supervisor.emergency.unknownRoom");
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
  }, [latestPredictionByDevice, t]);

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
    const severityRank = (s: string) => {
      const v = s.toLowerCase();
      if (v === "critical") return 0;
      if (v === "warning" || v === "high") return 1;
      return 2;
    };
    const sevMap = new Map(alerts.map((a) => [a.id, a.severity]));
    return alerts
      .filter((alert) => alert.status === "active")
      .map((alert) => {
        const patient = alert.patient_id ? patientById.get(alert.patient_id) : null;
        return {
          alertId: alert.id,
          title: alert.title,
          description: alert.description,
          patientName: patient
            ? `${patient.first_name} ${patient.last_name}`.trim()
            : t("supervisor.emergency.patientNotLinked"),
          patientId: alert.patient_id,
          timestamp: alert.timestamp,
        };
      })
      .sort((left, right) => {
        const d =
          severityRank(String(sevMap.get(left.alertId) ?? "")) -
          severityRank(String(sevMap.get(right.alertId) ?? ""));
        if (d !== 0) return d;
        return right.timestamp.localeCompare(left.timestamp);
      });
  }, [alerts, patientById, t]);

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
        roomName: prediction.predicted_room_name ?? t("supervisor.emergency.unknownRoom"),
        confidence: prediction.confidence ?? null,
        modelType: prediction.model_type || "-",
        timestamp: prediction.timestamp ?? null,
      }));
  }, [latestPredictionByDevice, t]);

  const alertColumns = useMemo<ColumnDef<AlertRow>[]>(
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
      { accessorKey: "patientName", header: t("clinical.table.patient") },
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
        id: "actions",
        header: t("clinical.table.actions"),
        cell: ({ row }) => {
          const href = row.original.patientId ? `/supervisor/personnel/${row.original.patientId}` : "/supervisor/personnel";
          return (
            <Button asChild size="sm" variant="outline">
              <Link href={href}>{t("headNurse.alerts.openPatient")}</Link>
            </Button>
          );
        },
      },
    ],
    [t],
  );

  const roomColumns = useMemo<ColumnDef<RoomRow>[]>(
    () => [
      {
        accessorKey: "roomName",
        header: t("clinical.table.room"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.roomName}</p>
            <p className="text-xs capitalize text-muted-foreground">{row.original.roomType}</p>
          </div>
        ),
      },
      {
        accessorKey: "localizedDevices",
        header: t("clinical.table.localizedDevices"),
      },
      {
        accessorKey: "averageConfidence",
        header: t("clinical.table.avgConfidence"),
        cell: ({ row }) =>
          row.original.averageConfidence != null
            ? `${Math.round(row.original.averageConfidence * 100)}%`
            : "-",
      },
      {
        accessorKey: "lastSignal",
        header: t("clinical.table.lastSignal"),
        cell: ({ row }) => formatDateTime(row.original.lastSignal),
      },
      {
        accessorKey: "isCritical",
        header: t("clinical.table.risk"),
        cell: ({ row }) =>
          row.original.isCritical ? (
            <Badge variant="destructive">{t("supervisor.emergency.riskCritical")}</Badge>
          ) : (
            <Badge variant="outline">{t("supervisor.emergency.riskNormal")}</Badge>
          ),
      },
    ],
    [t],
  );

  const predictionColumns = useMemo<ColumnDef<PredictionRow>[]>(
    () => [
      {
        accessorKey: "deviceId",
        header: t("clinical.table.device"),
      },
      { accessorKey: "roomName", header: t("clinical.table.predictedRoom") },
      {
        accessorKey: "confidence",
        header: t("clinical.table.confidence"),
        cell: ({ row }) =>
          row.original.confidence != null ? `${Math.round(row.original.confidence * 100)}%` : "-",
      },
      { accessorKey: "modelType", header: t("clinical.table.model") },
      {
        accessorKey: "timestamp",
        header: t("clinical.table.timestamp"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
    ],
    [t],
  );

  const isLoadingAny =
    alertsQuery.isLoading || roomsQuery.isLoading || predictionsQuery.isLoading || patientsQuery.isLoading;

  const highlightAlertId = useMemo(() => {
    const raw = searchParams.get("alert");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const highlightReady =
    !isLoadingAny &&
    highlightAlertId != null &&
    alertRows.some((r) => r.alertId === highlightAlertId);

  const flashAlertId = useAlertRowHighlight(highlightAlertId, highlightReady);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("supervisor.emergency.pageTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("supervisor.emergency.pageSubtitle")}</p>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryStatCard
          icon={Siren}
          label={t("supervisor.emergency.statCriticalAlerts")}
          value={activeCriticalAlerts.length}
          tone={activeCriticalAlerts.length > 0 ? "critical" : "success"}
        />
        <SummaryStatCard
          icon={Radio}
          label={t("supervisor.emergency.statTrackedDevices")}
          value={latestPredictionByDevice.length}
          tone="info"
        />
        <SummaryStatCard
          icon={MapPin}
          label={t("supervisor.emergency.statRoomsLive")}
          value={occupancyByRoom.size}
          tone="warning"
        />
      </section>

      <DataTableCard
        title={t("supervisor.emergency.alertQueueTitle")}
        description={t("supervisor.emergency.alertQueueDesc")}
        data={alertRows}
        columns={alertColumns}
        isLoading={isLoadingAny}
        emptyText={t("supervisor.emergency.alertQueueEmpty")}
        rightSlot={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
        pageSize={200}
        getRowDomId={(row) => `ws-alert-${row.alertId}`}
        getRowClassName={(row) =>
          flashAlertId != null && flashAlertId === row.alertId
            ? "bg-primary/10 ring-2 ring-primary/30 transition-colors"
            : undefined
        }
      />

      <DataTableCard
        title={t("supervisor.emergency.floorCoverageTitle")}
        description={t("supervisor.emergency.floorCoverageDesc")}
        data={roomRows}
        columns={roomColumns}
        isLoading={isLoadingAny}
        emptyText={t("supervisor.emergency.floorCoverageEmpty")}
      />

      <DataTableCard
        title={t("supervisor.emergency.localizationFeedTitle")}
        description={t("supervisor.emergency.localizationFeedDesc")}
        data={predictionRows}
        columns={predictionColumns}
        isLoading={isLoadingAny}
        emptyText={t("supervisor.emergency.localizationFeedEmpty")}
      />
    </div>
  );
}

