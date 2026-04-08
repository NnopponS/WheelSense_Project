"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Clock3, Link2, Link2Off, Loader2, MapPin, RefreshCw, UserRound } from "lucide-react";
import { z } from "zod";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import type {
  DeviceActivityEventOut,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";
import type { TranslationKey } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const EMPTY_SELECT_VALUE = "__empty__";

const hardwareTypeSchema = z.enum(["node", "wheelchair", "mobile_phone", "polar_sense"]);

type HardwareType = z.infer<typeof hardwareTypeSchema>;

type TFn = (key: TranslationKey) => string;

const roomOptionSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    floor_name: z.string().nullish(),
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

function roomLabel(room: RoomOption): string {
  return room.floor_name ? `${room.name} - ${room.floor_name}` : room.name;
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
  const nowMs = useFixedNowMs();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const deviceQuery = useQuery({
    queryKey: ["device-detail-drawer", "detail", deviceId],
    enabled: Boolean(deviceId),
    refetchInterval: 30_000,
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

  const activityQuery = useQuery({
    queryKey: ["device-detail-drawer", "activity", deviceId],
    enabled: Boolean(deviceId),
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

    const byNode = rooms.find((room) => room.node_device_id === detail.device_id);
    if (byNode) return byNode;

    const detailRoomId = detail.location?.room_id;
    if (typeof detailRoomId === "number") {
      return rooms.find((room) => room.id === detailRoomId) ?? null;
    }

    return null;
  }, [detail, roomsQuery.data]);

  useEffect(() => {
    if (!detail) return;

    patientForm.reset({
      patientId: detail.patient?.patient_id ? String(detail.patient.patient_id) : EMPTY_SELECT_VALUE,
    });

    roomForm.reset({
      roomId: currentRoom ? String(currentRoom.id) : EMPTY_SELECT_VALUE,
    });
  }, [currentRoom, detail, patientForm, roomForm]);

  const refreshAfterMutation = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["api"] }),
      queryClient.invalidateQueries({ queryKey: ["device-detail-drawer"] }),
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

      await api.patchRoom(nextRoomId, { node_device_id: detail.device_id });
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
      await refreshAfterMutation();
    },
    onError: (error) => {
      setFeedback({ tone: "error", text: mapApiError(error) });
    },
  });

  const busy =
    assignPatientMutation.isPending ||
    unlinkPatientMutation.isPending ||
    assignRoomMutation.isPending ||
    unlinkRoomMutation.isPending ||
    snapshotMutation.isPending;

  const online = detail ? isDeviceOnline(detail.last_seen ?? null, nowMs) : false;

  if (!deviceId) return null;

  return (
    <Sheet open={Boolean(deviceId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="p-0">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>{detail?.display_name?.trim() || detail?.device_id || deviceId}</SheetTitle>
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
                    <Metric
                      label={t("devicesDetail.displayName")}
                      value={detail.display_name?.trim() || detail.device_id}
                    />
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

                {detail.realtime ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">{t("devicesDetail.realtime")}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <Metric
                        label={t("devicesDetail.battery")}
                        value={
                          detail.realtime.battery_pct != null
                            ? `${detail.realtime.battery_pct}%`
                            : "-"
                        }
                      />
                      <Metric
                        label="Voltage"
                        value={
                          detail.realtime.battery_v != null
                            ? `${detail.realtime.battery_v.toFixed(2)} V`
                            : "-"
                        }
                      />
                      <Metric
                        label="Velocity"
                        value={
                          detail.realtime.velocity_ms != null
                            ? `${detail.realtime.velocity_ms.toFixed(2)} m/s`
                            : "-"
                        }
                      />
                      <Metric
                        label="Distance"
                        value={
                          detail.realtime.distance_m != null
                            ? `${detail.realtime.distance_m.toFixed(2)} m`
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
                        <MapPin className="h-4 w-4" />
                        Room Assignment
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Current room: {currentRoom ? roomLabel(currentRoom) : t("devicesDetail.noRoom")}
                      </p>

                      <form
                        className="space-y-2"
                        onSubmit={roomForm.handleSubmit((values) => assignRoomMutation.mutate(values))}
                      >
                        <Label>{t("devicesDetail.selectRoom")}</Label>
                        <Controller
                          control={roomForm.control}
                          name="roomId"
                          render={({ field }) => (
                            <Select
                              value={field.value || EMPTY_SELECT_VALUE}
                              onValueChange={field.onChange}
                              disabled={busy || roomsQuery.isLoading}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t("devicesDetail.selectRoom")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={EMPTY_SELECT_VALUE}>Select room</SelectItem>
                                {(roomsQuery.data ?? []).map((room) => (
                                  <SelectItem key={room.id} value={String(room.id)}>
                                    {roomLabel(room)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                        {roomForm.formState.errors.roomId ? (
                          <p className="text-xs text-destructive">{roomForm.formState.errors.roomId.message}</p>
                        ) : null}
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

                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => snapshotMutation.mutate()}
                      >
                        {snapshotMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                        Capture Snapshot
                      </Button>

                      {detail.latest_photo?.url ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">{t("devicesDetail.latestSnapshot")}</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={detail.latest_photo.url}
                            alt="Latest camera snapshot"
                            className="w-full rounded-xl border border-border object-contain"
                          />
                        </div>
                      ) : null}
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
  );
}
