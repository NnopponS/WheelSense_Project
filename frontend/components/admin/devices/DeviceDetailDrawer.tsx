"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Clock3, Link2, Link2Off, Loader2, MapPin, RefreshCw, Trash2, UserRound } from "lucide-react";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability } from "@/lib/permissions";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { isDeviceOnline } from "@/lib/deviceOnline";
import {
  preferredRoomNodeDeviceKey,
  roomNodeDeviceMatchesDevice,
} from "@/lib/nodeDeviceRoomKey";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";

/** Matches `RequireRole` on `GET /api/devices/activity`. */
const ROLES_DEVICE_ACTIVITY_POLL = new Set<string>(["admin", "head_nurse", "supervisor"]);
import type {
  DeviceActivityEventOut,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";
import type { TranslationKey } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const EMPTY_SELECT_VALUE = "__empty__";
const UNASSIGNED_FACILITY_KEY = "__facility_unassigned__";
const UNASSIGNED_FLOOR_KEY = "__floor_unassigned__";

const hardwareTypeSchema = z.enum(["node", "wheelchair", "mobile_phone", "polar_sense"]);

type HardwareType = z.infer<typeof hardwareTypeSchema>;

type TFn = (key: TranslationKey) => string;

const roomOptionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    floor_id: z.number().nullable().optional(),
    floor_name: z.string().nullish(),
    floor_number: z.number().nullable().optional(),
    facility_id: z.number().nullable().optional(),
    facility_name: z.string().nullish(),
    node_device_id: z.string().nullish(),
  })
  .passthrough();

type RoomOption = z.infer<typeof roomOptionSchema>;

const deviceDetailSchema = z
  .object({
    id: z.number().optional(),
    device_id: z.string(),
    device_type: z.string().nullish(),
    hardware_type: z.string().nullish(),
    display_name: z.string().nullish(),
    config: z.record(z.string(), z.unknown()).optional(),
    firmware: z.string().nullish(),
    last_seen: z.string().nullable().optional(),
    patient: z
      .object({
        patient_id: z.number(),
        patient_name: z.string().nullish(),
        device_role: z.string().nullish(),
        assigned_at: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    location: z
      .object({
        room_id: z.number().nullable().optional(),
        room_name: z.string().nullish(),
        predicted_room_name: z.string().nullish(),
        prediction_confidence: z.number().nullable().optional(),
        prediction_at: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    realtime: z
      .object({
        timestamp: z.string().nullable().optional(),
        battery_pct: z.number().nullable().optional(),
        battery_v: z.number().nullable().optional(),
        velocity_ms: z.number().nullable().optional(),
        distance_m: z.number().nullable().optional(),
        accel_ms2: z.number().nullable().optional(),
      })
      .optional(),
    wheelchair_metrics: z
      .object({
        timestamp: z.string().nullable().optional(),
        battery_pct: z.number().nullable().optional(),
        battery_v: z.number().nullable().optional(),
        charging: z.boolean().nullable().optional(),
        velocity_ms: z.number().nullable().optional(),
        distance_m: z.number().nullable().optional(),
        accel_ms2: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    node_metrics: z
      .object({
        timestamp: z.string().nullable().optional(),
        battery_pct: z.number().nullable().optional(),
        battery_v: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    mobile_metrics: z
      .object({
        timestamp: z.string().nullable().optional(),
        battery_pct: z.number().nullable().optional(),
        battery_v: z.number().nullable().optional(),
        charging: z.boolean().nullable().optional(),
        steps: z.number().nullable().optional(),
        polar_connected: z.boolean().nullable().optional(),
        linked_person_type: z.string().nullable().optional(),
        linked_person_id: z.number().nullable().optional(),
        rssi_vector: z.record(z.string(), z.number()).nullable().optional(),
      })
      .nullable()
      .optional(),
    polar_metrics: z
      .object({
        timestamp: z.string().nullable().optional(),
        heart_rate_bpm: z.number().nullable().optional(),
        rr_interval_ms: z.number().nullable().optional(),
        spo2: z.number().nullable().optional(),
        sensor_battery: z.number().nullable().optional(),
        source: z.string().nullable().optional(),
        ppg: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    polar_vitals: z
      .object({
        timestamp: z.string().nullable().optional(),
        heart_rate_bpm: z.number().nullable().optional(),
        rr_interval_ms: z.number().nullable().optional(),
        spo2: z.number().nullable().optional(),
        sensor_battery: z.number().nullable().optional(),
        source: z.string().nullable().optional(),
        ppg: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
    latest_photo: z
      .object({
        url: z.string(),
        timestamp: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const patientAssignmentSchema = z.object({
  patientId: z.string().refine((value) => value !== EMPTY_SELECT_VALUE, {
    message: "Select a patient",
  }),
});

type PatientAssignmentValues = z.infer<typeof patientAssignmentSchema>;

const roomAssignmentSchema = z.object({
  roomId: z.string().refine((value) => value !== EMPTY_SELECT_VALUE, {
    message: "Select a room",
  }),
});

type RoomAssignmentValues = z.infer<typeof roomAssignmentSchema>;

export interface DeviceDetailDrawerProps {
  deviceId: string | null;
  onClose: () => void;
  t: TFn;
  onMutate: () => void;
}

function resolveHardwareType(raw: string | null | undefined): HardwareType {
  const parsed = hardwareTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "wheelchair";
}

function defaultDeviceRole(hardwareType: HardwareType): string {
  if (hardwareType === "polar_sense") return "polar_hr";
  if (hardwareType === "mobile_phone") return "mobile";
  return "wheelchair_sensor";
}

function mapApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

/** Short BLE beacon label (WSN_001) — avoid long MAC in UI when config has ble_node_id. */
function nodeBeaconShortLabel(detail: {
  device_id: string;
  display_name?: string | null;
  config?: unknown;
}): string {
  const cfg = detail.config as { ble_node_id?: string } | undefined;
  if (cfg?.ble_node_id?.trim()) return cfg.ble_node_id.trim();
  const dn = detail.display_name?.trim();
  if (dn) {
    const head = dn.split(/\s+/)[0];
    if (head.startsWith("WSN_")) return head;
  }
  return detail.device_id;
}

function roomLabel(room: RoomOption): string {
  return room.floor_name ? `${room.name} - ${room.floor_name}` : room.name;
}

function facilityKey(room: RoomOption): string {
  return room.facility_id != null ? String(room.facility_id) : UNASSIGNED_FACILITY_KEY;
}

function floorKey(room: RoomOption): string {
  return room.floor_id != null ? String(room.floor_id) : UNASSIGNED_FLOOR_KEY;
}

function roomMatchesBuilding(room: RoomOption, buildingSel: string): boolean {
  if (buildingSel === EMPTY_SELECT_VALUE) return false;
  return facilityKey(room) === buildingSel;
}

function roomMatchesFloor(room: RoomOption, buildingSel: string, floorSel: string): boolean {
  if (floorSel === EMPTY_SELECT_VALUE) return false;
  return roomMatchesBuilding(room, buildingSel) && floorKey(room) === floorSel;
}

function EventItem({ event }: { event: DeviceActivityEventOut }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{event.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">{event.event_type}</p>
        </div>
        <p className="text-xs text-muted-foreground">{formatRelativeTime(event.occurred_at)}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(event.occurred_at)}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export default function DeviceDetailDrawer({ deviceId, onClose, t, onMutate }: DeviceDetailDrawerProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManageDevices = user ? hasCapability(user.role, "devices.manage") : false;
  const nowMs = useFixedNowMs();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [scopeBuilding, setScopeBuilding] = useState(EMPTY_SELECT_VALUE);
  const [scopeFloor, setScopeFloor] = useState(EMPTY_SELECT_VALUE);
  const [fastPollUntilMs, setFastPollUntilMs] = useState(0);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [latestPhotoImageBroken, setLatestPhotoImageBroken] = useState(false);

  const deviceQuery = useQuery({
    queryKey: ["device-detail-drawer", "detail", deviceId],
    enabled: Boolean(deviceId),
    staleTime: 1_500,
    refetchInterval: () => {
      // Keep node/camera cards fresher, especially right after snapshot requests.
      if (Date.now() < fastPollUntilMs) return 1_000;
      return 2_500;
    },
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const raw = await api.getDeviceDetailRaw(deviceId as string);
      return deviceDetailSchema.parse(raw);
    },
  });

  const detail = deviceQuery.data ?? null;
  const hardwareType = resolveHardwareType(detail?.hardware_type);
  const isNodeDevice = hardwareType === "node";
  const isPatientAssignable =
    hardwareType === "wheelchair" || hardwareType === "mobile_phone" || hardwareType === "polar_sense";

  const userRole = user?.role;
  const deviceActivityPollEnabled =
    Boolean(deviceId) &&
    userRole != null &&
    ROLES_DEVICE_ACTIVITY_POLL.has(userRole);

  const activityQuery = useQuery({
    queryKey: ["device-detail-drawer", "activity", deviceId],
    enabled: deviceActivityPollEnabled,
    staleTime: 3_000,
    refetchInterval: () => {
      if (!deviceActivityPollEnabled) return false;
      return Date.now() < fastPollUntilMs ? 2_000 : 8_000;
    },
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const rows = await api.listDeviceActivity(80);
      return rows.filter((row) => row.registry_device_id === deviceId).slice(0, 20);
    },
  });

  const patientsQuery = useQuery({
    queryKey: ["device-detail-drawer", "patients"],
    enabled: Boolean(deviceId) && isPatientAssignable,
    queryFn: () => api.listPatients({ is_active: true, limit: 200 }),
  });

  const roomsQuery = useQuery({
    queryKey: ["device-detail-drawer", "rooms"],
    enabled: Boolean(deviceId) && isNodeDevice,
    queryFn: async () => {
      const raw = await api.listRooms();
      if (!Array.isArray(raw)) return [] as RoomOption[];
      return raw
        .map((item) => roomOptionSchema.safeParse(item))
        .filter((item) => item.success)
        .map((item) => item.data)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
  });

  const patientForm = useForm<PatientAssignmentValues>({
    resolver: zodResolver(patientAssignmentSchema),
    defaultValues: {
      patientId: EMPTY_SELECT_VALUE,
    },
  });

  const roomForm = useForm<RoomAssignmentValues>({
    resolver: zodResolver(roomAssignmentSchema),
    defaultValues: {
      roomId: EMPTY_SELECT_VALUE,
    },
  });

  const patientOptions = useMemo(() => {
    const rows = (patientsQuery.data ?? []) as ListPatientsResponse;
    return rows
      .map((row) => ({
        id: row.id,
        name: `${row.first_name} ${row.last_name}`.trim() || `Patient #${row.id}`,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [patientsQuery.data]);

  const currentRoom = useMemo(() => {
    const rooms = roomsQuery.data ?? [];
    if (!detail) return null;

    const detailRoomId = detail.location?.room_id;
    if (typeof detailRoomId === "number") {
      const byLoc = rooms.find((room) => room.id === detailRoomId);
      if (byLoc) return byLoc;
    }

    const byNode = rooms.find((room) =>
      roomNodeDeviceMatchesDevice(room.node_device_id, {
        device_id: detail.device_id,
        display_name: detail.display_name,
        config: detail.config,
      }),
    );
    return byNode ?? null;
  }, [detail, roomsQuery.data]);

  const facilityOptions = useMemo(() => {
    const rooms = roomsQuery.data ?? [];
    const labels = new Map<string, string>();
    for (const room of rooms) {
      const key = facilityKey(room);
      const label =
        room.facility_id != null
          ? (room.facility_name?.trim() || `${t("devicesDetail.building")} #${room.facility_id}`)
          : t("devicesDetail.buildingUnassigned");
      if (!labels.has(key)) labels.set(key, label);
    }
    return [...labels.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [roomsQuery.data, t]);

  const floorOptions = useMemo(() => {
    if (scopeBuilding === EMPTY_SELECT_VALUE) return [];
    const rooms = roomsQuery.data ?? [];
    const rows = new Map<string, { label: string; sort: number }>();
    for (const room of rooms) {
      if (!roomMatchesBuilding(room, scopeBuilding)) continue;
      const key = floorKey(room);
      const sort = room.floor_number ?? room.floor_id ?? 999_999;
      const label =
        room.floor_id != null
          ? (room.floor_name?.trim() ||
              (room.floor_number != null
                ? `${t("devicesDetail.floor")} ${room.floor_number}`
                : `${t("devicesDetail.floor")} #${room.floor_id}`))
          : t("devicesDetail.floorUnassigned");
      const prev = rows.get(key);
      if (!prev || label.length < prev.label.length) rows.set(key, { label, sort });
    }
    return [...rows.entries()]
      .map(([id, meta]) => ({ id, label: meta.label, sort: meta.sort }))
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  }, [roomsQuery.data, scopeBuilding, t]);

  const filteredRooms = useMemo(() => {
    if (scopeFloor === EMPTY_SELECT_VALUE) return [];
    const rooms = roomsQuery.data ?? [];
    return rooms
      .filter((room) => roomMatchesFloor(room, scopeBuilding, scopeFloor))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roomsQuery.data, scopeBuilding, scopeFloor]);

  const polarSnapshot = detail?.polar_metrics ?? detail?.polar_vitals ?? null;

  useEffect(() => {
    if (!detail || detail.device_id !== deviceId) return;
    setDisplayNameDraft(detail.display_name ?? "");
  }, [deviceId, detail?.device_id, detail?.display_name]);

  useEffect(() => {
    setLatestPhotoImageBroken(false);
  }, [detail?.latest_photo?.url, detail?.device_id]);

  useEffect(() => {
    if (!detail) return;

    patientForm.reset({
      patientId: detail.patient?.patient_id ? String(detail.patient.patient_id) : EMPTY_SELECT_VALUE,
    });

    if (currentRoom) {
      setScopeBuilding(facilityKey(currentRoom));
      setScopeFloor(floorKey(currentRoom));
      roomForm.reset({
        roomId: String(currentRoom.id),
      });
    } else {
      setScopeBuilding(EMPTY_SELECT_VALUE);
      setScopeFloor(EMPTY_SELECT_VALUE);
      roomForm.reset({
        roomId: EMPTY_SELECT_VALUE,
      });
    }
  }, [currentRoom, detail, patientForm, roomForm]);

  const refreshAfterMutation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "devices"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["device-detail-drawer"] }),
      queryClient.invalidateQueries({ queryKey: ["device-detail-drawer", "rooms"] }),
    ]);
    onMutate();
  };

  const assignPatientMutation = useMutation({
    mutationFn: async (form: PatientAssignmentValues) => {
      if (!detail) throw new Error("Device detail unavailable");
      const patientId = Number(form.patientId);
      await api.assignPatientFromDevice(detail.device_id, {
        patient_id: patientId,
        device_role: detail.patient?.device_role ?? defaultDeviceRole(hardwareType),
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Patient assignment updated." });
      await refreshAfterMutation();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const unlinkPatientMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Device detail unavailable");
      await api.assignPatientFromDevice(detail.device_id, {
        patient_id: null,
        device_role: detail.patient?.device_role ?? defaultDeviceRole(hardwareType),
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Patient unlinked." });
      await refreshAfterMutation();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const assignRoomMutation = useMutation({
    mutationFn: async (form: RoomAssignmentValues) => {
      if (!detail) throw new Error("Device detail unavailable");
      const nextRoomId = Number(form.roomId);
      const currentRoomId = currentRoom?.id ?? detail.location?.room_id ?? null;

      if (typeof currentRoomId === "number" && currentRoomId !== nextRoomId) {
        await api.patchRoom(currentRoomId, { node_device_id: null });
      }

      await api.patchRoom(nextRoomId, {
        node_device_id: preferredRoomNodeDeviceKey({
          device_id: detail.device_id,
          display_name: detail.display_name,
          config: detail.config,
        }),
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Room assignment updated." });
      await refreshAfterMutation();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const unlinkRoomMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Device detail unavailable");
      const currentRoomId = currentRoom?.id ?? detail.location?.room_id ?? null;
      if (typeof currentRoomId !== "number") return;
      await api.patchRoom(currentRoomId, { node_device_id: null });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Room unlinked." });
      await refreshAfterMutation();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Device detail unavailable");
      await api.cameraCheckSnapshot(detail.device_id);
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: t("devicesDetail.cameraCheckSent") });
      // Burst-poll for a short window so new image/status appears quickly.
      setFastPollUntilMs(Date.now() + 20_000);
      await refreshAfterMutation();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const deleteRegistryMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Device detail unavailable");
      await api.deleteRegistryDevice(detail.device_id);
    },
    onSuccess: async () => {
      setRemoveDialogOpen(false);
      await refreshAfterMutation();
      onClose();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const patchDisplayNameMutation = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error("Device detail unavailable");
      await api.patchRegistryDevice(detail.device_id, {
        display_name: displayNameDraft.trim() || "",
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: t("devicesDetail.displayNameUpdated") });
      await refreshAfterMutation();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const displayNameDirty =
    Boolean(detail) && displayNameDraft.trim() !== (detail?.display_name ?? "").trim();

  const busy =
    assignPatientMutation.isPending ||
    unlinkPatientMutation.isPending ||
    assignRoomMutation.isPending ||
    unlinkRoomMutation.isPending ||
    snapshotMutation.isPending ||
    deleteRegistryMutation.isPending ||
    patchDisplayNameMutation.isPending;

  const online = detail ? isDeviceOnline(detail.last_seen ?? null, nowMs) : false;
  const batteryPct =
    detail?.realtime?.battery_pct ??
    detail?.wheelchair_metrics?.battery_pct ??
    detail?.node_metrics?.battery_pct ??
    detail?.mobile_metrics?.battery_pct ??
    detail?.polar_metrics?.sensor_battery ??
    detail?.polar_vitals?.sensor_battery ??
    null;
  const healthStatus: "healthy" | "warning" | "critical" = !online
    ? "critical"
    : batteryPct != null && batteryPct < 20
      ? "warning"
      : "healthy";

  if (!deviceId) return null;

  return (
    <>
    <Sheet open={Boolean(deviceId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="p-0">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>
              {detail && hardwareType === "node"
                ? nodeBeaconShortLabel(detail)
                : detail?.display_name?.trim() || detail?.device_id || deviceId}
            </SheetTitle>
            <SheetDescription>
              Device assignment and recent IoT activity.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {deviceQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : null}

            {deviceQuery.error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {mapApiError(deviceQuery.error)}
              </div>
            ) : null}

            {detail ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={online ? "success" : "warning"}>
                    {online ? t("devices.online") : t("devices.offline")}
                  </Badge>
                  <Badge variant="outline">{detail.device_id}</Badge>
                  <Badge variant="outline">{hardwareType}</Badge>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("devicesDetail.identity")}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {canManageDevices ? (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="device-display-name">{t("devicesDetail.displayName")}</Label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            id="device-display-name"
                            value={displayNameDraft}
                            onChange={(e) => setDisplayNameDraft(e.target.value)}
                            placeholder={detail.device_id}
                            autoComplete="off"
                            disabled={busy}
                            className="sm:max-w-md"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={!displayNameDirty || busy}
                            onClick={() => patchDisplayNameMutation.mutate()}
                          >
                            {t("devicesDetail.save")}
                          </Button>
                        </div>
                        {hardwareType === "node" ? (
                          <p className="text-xs text-muted-foreground">{t("devicesDetail.displayNameMqttNodeHint")}</p>
                        ) : null}
                      </div>
                    ) : (
                      <Metric
                        label={t("devicesDetail.displayName")}
                        value={
                          hardwareType === "node"
                            ? nodeBeaconShortLabel(detail)
                            : detail.display_name?.trim() || detail.device_id
                        }
                      />
                    )}
                    <Metric label={t("devicesDetail.hardware")} value={hardwareType} />
                    <Metric
                      label={t("devices.lastSeen")}
                      value={detail.last_seen ? formatDateTime(detail.last_seen) : "-"}
                    />
                    <Metric
                      label="Relative"
                      value={detail.last_seen ? formatRelativeTime(detail.last_seen) : "-"}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Health Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    <Metric label="Status" value={healthStatus} />
                    <Metric label="Connectivity" value={online ? "online" : "offline"} />
                    <Metric
                      label={t("devicesDetail.battery")}
                      value={batteryPct != null ? `${batteryPct}%` : "-"}
                    />
                    <Metric
                      label={t("devices.lastSeen")}
                      value={detail.last_seen ? formatRelativeTime(detail.last_seen) : "-"}
                    />
                  </CardContent>
                </Card>

                {hardwareType === "wheelchair" && detail.wheelchair_metrics ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t("devicesDetail.realtime")}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <Metric
                        label={t("devicesDetail.battery")}
                        value={
                          detail.wheelchair_metrics.battery_pct != null
                            ? `${detail.wheelchair_metrics.battery_pct}%`
                            : "-"
                        }
                      />
                      <Metric
                        label={t("patient.sensors.acceleration")}
                        value={
                          detail.wheelchair_metrics.accel_ms2 != null
                            ? `${detail.wheelchair_metrics.accel_ms2.toFixed(2)} m/s²`
                            : "-"
                        }
                      />
                      <Metric
                        label={t("patient.sensors.velocity")}
                        value={
                          detail.wheelchair_metrics.velocity_ms != null
                            ? `${detail.wheelchair_metrics.velocity_ms.toFixed(2)} m/s`
                            : "-"
                        }
                      />
                      <Metric
                        label={t("patient.sensors.distance")}
                        value={
                          detail.wheelchair_metrics.distance_m != null
                            ? `${detail.wheelchair_metrics.distance_m.toFixed(2)} m`
                            : "-"
                        }
                      />
                    </CardContent>
                  </Card>
                ) : null}

                {hardwareType === "polar_sense" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t("devicesDetail.realtime")}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <Metric
                        label={t("patient.sensors.heartRate")}
                        value={
                          polarSnapshot?.heart_rate_bpm != null
                            ? `${Math.round(polarSnapshot.heart_rate_bpm)} bpm`
                            : "-"
                        }
                      />
                      <Metric
                        label={t("patient.sensors.ppg")}
                        value={
                          typeof polarSnapshot?.ppg === "number" && !Number.isNaN(polarSnapshot.ppg)
                            ? polarSnapshot.ppg.toFixed(3)
                            : polarSnapshot?.ppg != null && typeof polarSnapshot.ppg !== "object"
                              ? String(polarSnapshot.ppg)
                              : "-"
                        }
                      />
                      <Metric
                        label={t("patient.sensors.sensorBattery")}
                        value={
                          polarSnapshot?.sensor_battery != null
                            ? `${Math.round(polarSnapshot.sensor_battery)}%`
                            : "-"
                        }
                      />
                      <Metric label={t("devicesDetail.spo2")} value={polarSnapshot?.spo2 != null ? `${polarSnapshot.spo2}%` : "-"} />
                    </CardContent>
                  </Card>
                ) : null}

                {hardwareType === "mobile_phone" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t("devicesDetail.mobileTelemetry")}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <Metric
                        label={t("devicesDetail.polarConnected")}
                        value={
                          detail.mobile_metrics?.polar_connected === true
                            ? t("devicesDetail.polarConnectedYes")
                            : detail.mobile_metrics?.polar_connected === false
                              ? t("devicesDetail.polarConnectedNo")
                              : "-"
                        }
                      />
                      <Metric
                        label={t("devicesDetail.battery")}
                        value={
                          detail.mobile_metrics?.battery_pct != null
                            ? `${Math.round(detail.mobile_metrics.battery_pct)}%`
                            : "-"
                        }
                      />
                      <Metric
                        label={t("devicesDetail.steps")}
                        value={
                          detail.mobile_metrics?.steps != null
                            ? String(Math.round(detail.mobile_metrics.steps))
                            : "-"
                        }
                      />
                    </CardContent>
                  </Card>
                ) : null}

                {isNodeDevice ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Camera className="h-4 w-4" />
                        {t("devicesDetail.camera")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">{t("devicesDetail.cameraCheckHint")}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => snapshotMutation.mutate()}
                      >
                        {snapshotMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                        {t("devicesDetail.cameraCheck")}
                      </Button>
                      {detail.latest_photo?.url && !latestPhotoImageBroken ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">{t("devicesDetail.latestSnapshot")}</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={detail.latest_photo.url}
                            alt=""
                            className="max-h-56 w-full rounded-xl border border-border object-contain bg-muted/20"
                            loading="eager"
                            fetchPriority="high"
                            decoding="async"
                            onError={() => setLatestPhotoImageBroken(true)}
                          />
                          {detail.latest_photo.timestamp ? (
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(detail.latest_photo.timestamp)} ·{" "}
                              {formatRelativeTime(detail.latest_photo.timestamp)}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t("devicesDetail.noSnapshotYet")}</p>
                      )}
                    </CardContent>
                  </Card>
                ) : null}

                {isNodeDevice ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="h-4 w-4" />
                        {t("devicesDetail.roomAssignment")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {t("devicesDetail.currentRoomLabel")}{" "}
                        {currentRoom ? roomLabel(currentRoom) : t("devicesDetail.noRoom")}
                      </p>

                      <form
                        className="space-y-3"
                        onSubmit={roomForm.handleSubmit((values) => assignRoomMutation.mutate(values))}
                      >
                        <div className="space-y-2">
                          <Label>{t("devicesDetail.selectBuilding")}</Label>
                          <Select
                            value={scopeBuilding}
                            onValueChange={(value) => {
                              setScopeBuilding(value);
                              setScopeFloor(EMPTY_SELECT_VALUE);
                              roomForm.setValue("roomId", EMPTY_SELECT_VALUE);
                            }}
                            disabled={busy || roomsQuery.isLoading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("devicesDetail.selectBuilding")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_SELECT_VALUE}>{t("devicesDetail.selectBuilding")}</SelectItem>
                              {facilityOptions.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>{t("devicesDetail.selectFloor")}</Label>
                          <Select
                            value={scopeFloor}
                            onValueChange={(value) => {
                              setScopeFloor(value);
                              roomForm.setValue("roomId", EMPTY_SELECT_VALUE);
                            }}
                            disabled={busy || roomsQuery.isLoading || scopeBuilding === EMPTY_SELECT_VALUE}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t("devicesDetail.selectFloor")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_SELECT_VALUE}>{t("devicesDetail.selectFloor")}</SelectItem>
                              {floorOptions.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>{t("devicesDetail.selectRoom")}</Label>
                          <Controller
                            control={roomForm.control}
                            name="roomId"
                            render={({ field }) => (
                              <Select
                                value={field.value || EMPTY_SELECT_VALUE}
                                onValueChange={field.onChange}
                                disabled={
                                  busy || roomsQuery.isLoading || scopeFloor === EMPTY_SELECT_VALUE
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={t("devicesDetail.selectRoom")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={EMPTY_SELECT_VALUE}>{t("devicesDetail.selectRoom")}</SelectItem>
                                  {filteredRooms.map((room) => (
                                    <SelectItem key={room.id} value={String(room.id)}>
                                      {room.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                          {roomForm.formState.errors.roomId ? (
                            <p className="text-xs text-destructive">{roomForm.formState.errors.roomId.message}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button type="submit" disabled={busy}>
                            {assignRoomMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                            Link room
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy || !currentRoom}
                            onClick={() => unlinkRoomMutation.mutate()}
                          >
                            {unlinkRoomMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link2Off className="h-4 w-4" />
                            )}
                            Unlink room
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                ) : null}

                {isPatientAssignable ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <UserRound className="h-4 w-4" />
                        Patient Assignment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {detail.patient
                          ? `${detail.patient.patient_name || `Patient #${detail.patient.patient_id}`} (${detail.patient.device_role || defaultDeviceRole(hardwareType)})`
                          : t("devicesDetail.noPatient")}
                      </p>

                      <form
                        className="space-y-2"
                        onSubmit={patientForm.handleSubmit((values) => assignPatientMutation.mutate(values))}
                      >
                        <Label>{t("devicesDetail.selectPatient")}</Label>
                        <Controller
                          control={patientForm.control}
                          name="patientId"
                          render={({ field }) => (
                            <Select
                              value={field.value || EMPTY_SELECT_VALUE}
                              onValueChange={field.onChange}
                              disabled={busy || patientsQuery.isLoading}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t("devicesDetail.selectPatient")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_SELECT_VALUE}>Select patient</SelectItem>
                                {patientOptions.map((patient) => (
                                  <SelectItem key={patient.id} value={String(patient.id)}>
                                    {patient.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {patientForm.formState.errors.patientId ? (
                          <p className="text-xs text-destructive">{patientForm.formState.errors.patientId.message}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button type="submit" disabled={busy}>
                            {assignPatientMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link2 className="h-4 w-4" />
                            )}
                            Link patient
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy || !detail.patient}
                            onClick={() => unlinkPatientMutation.mutate()}
                          >
                            {unlinkPatientMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Link2Off className="h-4 w-4" />
                            )}
                            Unlink patient
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-destructive/25">
                  <CardHeader>
                    <CardTitle className="text-base text-destructive">
                      {t("devicesDetail.removeFromRegistry")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {t("devicesDetail.removeFromRegistryBody")}
                    </p>
                    <Button
                      type="button"
                      variant="destructive"
                      className="mt-4"
                      disabled={busy}
                      onClick={() => setRemoveDialogOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("devicesDetail.removeFromRegistry")}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Clock3 className="h-4 w-4" />
                      Activity Log
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {activityQuery.isLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : null}

                    {!activityQuery.isLoading && (activityQuery.data?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">No recent activity for this device.</p>
                    ) : null}

                    {(activityQuery.data ?? []).map((event) => (
                      <EventItem key={event.id} event={event} />
                    ))}
                  </CardContent>
                </Card>

                {feedback ? (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      feedback.tone === "error"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-emerald-300/50 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                    }`}
                  >
                    {feedback.text}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={deviceQuery.isFetching || activityQuery.isFetching || busy}
              onClick={() => {
                void deviceQuery.refetch();
                void activityQuery.refetch();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {t("devicesDetail.refresh")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("devicesDetail.removeFromRegistryTitle")}</DialogTitle>
          <DialogDescription>{t("devicesDetail.removeFromRegistryBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRemoveDialogOpen(false)}
            disabled={deleteRegistryMutation.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteRegistryMutation.isPending || !detail}
            onClick={() => deleteRegistryMutation.mutate()}
          >
            {deleteRegistryMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t("devicesDetail.removeFromRegistryConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
