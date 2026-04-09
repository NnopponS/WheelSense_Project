"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Camera,
  Clock3,
  MapPin,
  RefreshCcw,
  ShieldAlert,
  UserRound,
  Users,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import type { FloorplanPresenceOut } from "@/lib/api/task-scope-types";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import {
  bootstrapRoomsFromDbFloor,
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
} from "@/lib/floorplanLayout";
import { useTranslation } from "@/lib/i18n";
import { floorplanRoomIdToNumeric } from "@/lib/monitoringWorkspace";
import type { Facility, Floor, Room, SmartDevice } from "@/lib/types";
import FloorplanCanvas, {
  type FloorplanRoomChip,
  type FloorplanRoomMeta,
  type FloorplanRoomTone,
} from "./FloorplanCanvas";

type Props = {
  className?: string;
  compact?: boolean;
  showPresence?: boolean;
  initialFacilityId?: number | null;
  initialFloorId?: number | null;
  initialRoomName?: string | null;
  openHref?: string | null;
};

type PatientHint = NonNullable<FloorplanPresenceOut["rooms"][number]["patient_hint"]>;

type RoomOccupant = {
  actor_type: string;
  actor_id: number;
  display_name: string;
  subtitle?: string;
  role?: string | null;
  patient_id?: number | null;
  user_id?: number | null;
  caregiver_id?: number | null;
  room_id?: number | null;
  source: string;
  updated_at?: string | null;
};

type RoomSmartDeviceStateSummary = {
  id: number;
  name: string;
  device_type: string;
  ha_entity_id?: string;
  state?: string;
  is_active?: boolean;
};

type RoomCameraSummary = {
  device_id?: string | null;
  latest_photo_id?: number | null;
  latest_photo_url?: string | null;
  captured_at?: string | null;
  capture_available?: boolean;
};

type LegacyStaffHint = {
  caregiver_id: number;
  first_name: string;
  last_name: string;
  role?: string;
  source?: string;
};

type PresenceRoom = FloorplanPresenceOut["rooms"][number] & {
  patient_hints?: PatientHint[];
  staff_hints?: LegacyStaffHint[];
  occupants?: RoomOccupant[];
  alert_count?: number;
  smart_devices_summary?: RoomSmartDeviceStateSummary[];
  camera_summary?: RoomCameraSummary | null;
};

type PresenceResponse = Omit<FloorplanPresenceOut, "rooms"> & {
  rooms: PresenceRoom[];
};

function safeRoomName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function describePatientName(patient: PatientHint): string {
  const name = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
  return patient.nickname?.trim() || name || `Patient #${patient.patient_id}`;
}

function formatSourceLabel(source: string | undefined): string {
  return (source ?? "unknown").replace(/_/g, " ");
}

function getNodeTone(room: PresenceRoom | null): FloorplanRoomTone {
  if (!room) return "info";
  if ((room.alert_count ?? 0) > 0) return "critical";
  if (room.node_status === "offline" || room.node_status === "unmapped") return "critical";
  if (room.node_status === "stale" || (room.staleness_seconds ?? 0) >= 300) return "warning";
  if (room.patient_hint || (room.occupants?.length ?? 0) > 0) return "success";
  return "info";
}

function describeNodeStatus(room: PresenceRoom | null): string {
  if (!room) return "No node status";
  if (!room.node_device_id) return "No node mapped";
  if (room.node_status === "online") return "Node online";
  if (room.node_status === "stale") return "Node stale";
  if (room.node_status === "offline") return "Node offline";
  if (room.node_status === "unmapped") return "Node unmapped";
  return room.node_status.replace(/_/g, " ");
}

function getPredictionChip(room: PresenceRoom): FloorplanRoomChip | null {
  if (!room.prediction_hint) return null;
  const confidence = Math.round((room.prediction_hint.confidence ?? 0) * 100);
  return {
    label: `${confidence}% prediction`,
    tone: confidence >= 80 ? "success" : confidence >= 60 ? "warning" : "critical",
  };
}

function buildFallbackOccupants(room: PresenceRoom): RoomOccupant[] {
  const occupants: RoomOccupant[] = [];
  if (room.patient_hint) {
    occupants.push({
      actor_type: "patient",
      actor_id: room.patient_hint.patient_id,
      display_name: describePatientName(room.patient_hint),
      subtitle: room.patient_hint.source.replace(/_/g, " "),
      patient_id: room.patient_hint.patient_id,
      room_id: room.room_id,
      source: room.patient_hint.source,
    });
  }

  if (Array.isArray(room.patient_hints)) {
    for (const patient of room.patient_hints) {
      if (occupants.some((item) => item.actor_type === "patient" && item.actor_id === patient.patient_id)) {
        continue;
      }
      occupants.push({
        actor_type: "patient",
        actor_id: patient.patient_id,
        display_name: describePatientName(patient),
        subtitle: patient.source.replace(/_/g, " "),
        patient_id: patient.patient_id,
        room_id: room.room_id,
        source: patient.source,
      });
    }
  }

  if (Array.isArray(room.staff_hints)) {
    for (const staff of room.staff_hints) {
      occupants.push({
        actor_type: "staff",
        actor_id: staff.caregiver_id,
        display_name: `${staff.first_name} ${staff.last_name}`.trim() || `Staff #${staff.caregiver_id}`,
        subtitle: staff.role || "staff",
        caregiver_id: staff.caregiver_id,
        room_id: room.room_id,
        source: staff.source || "zone_assignment",
        role: staff.role || null,
      });
    }
  }

  return occupants;
}

function getRoomOccupants(room: PresenceRoom | null): RoomOccupant[] {
  if (!room) return [];
  if (Array.isArray(room.occupants) && room.occupants.length > 0) {
    return room.occupants;
  }
  return buildFallbackOccupants(room);
}

function buildPresenceMeta(room: PresenceRoom): FloorplanRoomMeta {
  const occupants = getRoomOccupants(room);
  const patientCount = occupants.filter((item) => item.actor_type === "patient").length;
  const staffCount = occupants.filter((item) => item.actor_type === "staff").length;
  const detailLines: string[] = [];
  const occupantNames = occupants.slice(0, 2).map((item) => item.display_name);

  if (occupantNames.length > 0) {
    detailLines.push(occupantNames.join(", "));
  } else if (room.prediction_hint?.predicted_room_name?.trim()) {
    detailLines.push(`Predicted from ${room.prediction_hint.device_id}`);
  } else {
    detailLines.push("No occupants in live feed");
  }

  if (room.node_device_id) {
    detailLines.push(`${describeNodeStatus(room)} | ${room.node_device_id}`);
  } else {
    detailLines.push(describeNodeStatus(room));
  }

  if (room.camera_summary?.captured_at) {
    detailLines.push(`Snapshot ${formatRelativeTime(room.camera_summary.captured_at)}`);
  }

  const chips: FloorplanRoomChip[] = [];
  if (patientCount > 0) {
    chips.push({ label: `${patientCount} patient${patientCount > 1 ? "s" : ""}`, tone: "success" });
  }
  if (staffCount > 0) {
    chips.push({ label: `${staffCount} staff`, tone: "info" });
  }
  if ((room.alert_count ?? 0) > 0) {
    chips.unshift({
      label: `${room.alert_count} alert${(room.alert_count ?? 0) > 1 ? "s" : ""}`,
      tone: "critical",
    });
  }
  const predictionChip = getPredictionChip(room);
  if (predictionChip) {
    chips.push(predictionChip);
  }
  if (chips.length === 0) {
    chips.push({
      label: describeNodeStatus(room),
      tone: getNodeTone(room),
    });
  }

  return {
    chips,
    detailLines,
    tone: getNodeTone(room),
  };
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  tone: FloorplanRoomTone;
}) {
  const iconTone =
    tone === "critical"
      ? "bg-red-500/12 text-red-700"
      : tone === "warning"
        ? "bg-amber-500/12 text-amber-700"
        : tone === "success"
          ? "bg-emerald-500/12 text-emerald-700"
          : "bg-sky-500/12 text-sky-700";

  return (
    <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/60 p-3">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${iconTone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-on-surface">{value}</p>
    </div>
  );
}

function OccupantList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: RoomOccupant[];
  emptyText: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
        <Users className="h-4 w-4 text-primary" />
        {title}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-3 text-sm text-on-surface-variant">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={`${item.actor_type}-${item.actor_id}`}
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-on-surface">{item.display_name}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {item.subtitle || item.role || formatSourceLabel(item.source)}
                  </p>
                </div>
                <Badge variant={item.actor_type === "patient" ? "success" : "secondary"}>
                  {item.actor_type}
                </Badge>
              </div>
              {item.updated_at ? (
                <p className="mt-2 text-[11px] text-on-surface-variant">
                  Updated {formatRelativeTime(item.updated_at)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Facility + floor pickers, GET saved layout, read-only canvas, and staff operations inspector.
 */
export default function FloorplanRoleViewer({
  className = "",
  compact = false,
  showPresence = true,
  initialFacilityId = null,
  initialFloorId = null,
  initialRoomName = null,
  openHref = null,
}: Props) {
  const { t } = useTranslation();
  const [facilityId, setFacilityId] = useState<number | "">(() => initialFacilityId ?? "");
  const [floorId, setFloorId] = useState<number | "">(() => initialFloorId ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);

  const { data: facilities, isLoading: loadingFac } = useQuery<Facility[]>("/facilities");

  const effectiveFacilityId = useMemo<number | "">(
    () => (facilityId === "" ? (facilities?.[0]?.id ?? "") : facilityId),
    [facilityId, facilities],
  );

  const floorsEndpoint =
    effectiveFacilityId === "" ? null : `/facilities/${effectiveFacilityId}/floors`;
  const { data: floors, isLoading: loadingFloors } = useQuery<Floor[]>(floorsEndpoint);

  const effectiveFloorId = useMemo<number | "">(
    () => (floorId === "" ? (floors?.[0]?.id ?? "") : floorId),
    [floorId, floors],
  );

  const layoutEndpoint = useMemo(() => {
    if (effectiveFacilityId === "" || effectiveFloorId === "") return null;
    return `/future/floorplans/layout?facility_id=${effectiveFacilityId}&floor_id=${effectiveFloorId}`;
  }, [effectiveFacilityId, effectiveFloorId]);

  const {
    data: layoutRes,
    isLoading: loadingLayout,
    error: layoutError,
  } = useQuery<FloorplanLayoutResponse>(layoutEndpoint);

  const floorRoomsEndpoint =
    effectiveFloorId === "" ? null : `/rooms?floor_id=${effectiveFloorId}`;
  const { data: floorRooms, isLoading: loadingFloorRooms } = useQuery<Room[]>(floorRoomsEndpoint);

  const rooms = useMemo(() => {
    const fromLayout = normalizeFloorplanRooms(layoutRes?.layout_json);
    if (fromLayout.length > 0) return fromLayout;
    if (!floorRooms?.length) return [];
    return bootstrapRoomsFromDbFloor(floorRooms);
  }, [layoutRes, floorRooms]);

  const initialSelectedId = useMemo(() => {
    if (!initialRoomName || rooms.length === 0) return null;
    const target = safeRoomName(initialRoomName);
    const match = rooms.find((room) => safeRoomName(room.label) === target);
    return match?.id ?? null;
  }, [initialRoomName, rooms]);

  const presenceEndpoint = useMemo(() => {
    if (!showPresence || effectiveFacilityId === "" || effectiveFloorId === "") return null;
    return `/future/floorplans/presence?facility_id=${effectiveFacilityId}&floor_id=${effectiveFloorId}`;
  }, [showPresence, effectiveFacilityId, effectiveFloorId]);

  const {
    data: presenceData,
    error: presenceError,
    isLoading: loadingPresence,
    refetch: refetchPresence,
  } = useQuery<PresenceResponse>(presenceEndpoint, {
    enabled: Boolean(presenceEndpoint),
    refetchInterval: compact ? false : 15_000,
    retry: false,
  });

  const { data: allSmartDevices } = useQuery<SmartDevice[]>(compact ? null : "/ha/devices", {
    enabled: !compact,
    retry: false,
  });

  useEffect(() => {
    if (compact || rooms.length === 0) return;
    if (selectedId && rooms.some((room) => room.id === selectedId)) return;
    setSelectedId(initialSelectedId ?? rooms[0]?.id ?? null);
  }, [compact, initialSelectedId, rooms, selectedId]);

  const roomEntries = useMemo(() => {
    const presenceRooms = presenceData?.rooms ?? [];
    const byNumericId = new Map<number, PresenceRoom>();
    const byLabel = new Map<string, PresenceRoom>();

    for (const room of presenceRooms) {
      byNumericId.set(room.room_id, room);
      byLabel.set(safeRoomName(room.room_name), room);
    }

    return rooms.map((room) => {
      const numericId = floorplanRoomIdToNumeric(room.id);
      const presenceRoom =
        (numericId !== null ? byNumericId.get(numericId) : null) ??
        byLabel.get(safeRoomName(room.label)) ??
        null;
      return { room, presenceRoom };
    });
  }, [presenceData?.rooms, rooms]);

  const roomMetaById = useMemo<Record<string, FloorplanRoomMeta>>(() => {
    const next: Record<string, FloorplanRoomMeta> = {};
    for (const entry of roomEntries) {
      if (entry.presenceRoom) {
        next[entry.room.id] = buildPresenceMeta(entry.presenceRoom);
      }
    }
    return next;
  }, [roomEntries]);

  const presenceRooms = useMemo(() => presenceData?.rooms ?? [], [presenceData?.rooms]);
  const occupiedRooms = useMemo(
    () =>
      presenceRooms.filter((room) => {
        const occupants = getRoomOccupants(room);
        return occupants.length > 0 || Boolean(room.patient_hint) || Boolean(room.prediction_hint);
      }).length,
    [presenceRooms],
  );
  const totalAlerts = useMemo(
    () => presenceRooms.reduce((sum, room) => sum + (room.alert_count ?? 0), 0),
    [presenceRooms],
  );
  const staleNodes = useMemo(
    () =>
      presenceRooms.filter(
        (room) => room.node_status === "stale" || (room.staleness_seconds ?? 0) >= 300,
      ).length,
    [presenceRooms],
  );
  const onlineNodes = useMemo(
    () => presenceRooms.filter((room) => room.node_status === "online").length,
    [presenceRooms],
  );

  const canvasLoading =
    loadingLayout ||
    (normalizeFloorplanRooms(layoutRes?.layout_json).length === 0 && loadingFloorRooms);

  const visibleSelectedId = useMemo(() => {
    if (selectedId && rooms.some((room) => room.id === selectedId)) return selectedId;
    if (!compact && rooms.length > 0) return initialSelectedId ?? rooms[0]?.id ?? null;
    return initialSelectedId;
  }, [compact, initialSelectedId, rooms, selectedId]);

  const selectedRoomEntry = useMemo(
    () => roomEntries.find((entry) => entry.room.id === visibleSelectedId) ?? null,
    [roomEntries, visibleSelectedId],
  );

  const selectedPresenceRoom = selectedRoomEntry?.presenceRoom ?? null;
  const selectedOccupants = useMemo(
    () => getRoomOccupants(selectedPresenceRoom),
    [selectedPresenceRoom],
  );
  const selectedPatients = useMemo(
    () => selectedOccupants.filter((item) => item.actor_type === "patient"),
    [selectedOccupants],
  );
  const selectedStaff = useMemo(
    () => selectedOccupants.filter((item) => item.actor_type === "staff"),
    [selectedOccupants],
  );

  const inspectorDevices = useMemo(() => {
    if (!selectedPresenceRoom) return [] as Array<RoomSmartDeviceStateSummary | SmartDevice>;
    const liveDevices = (allSmartDevices ?? []).filter(
      (device) => device.room_id === selectedPresenceRoom.room_id,
    );
    if ((selectedPresenceRoom.smart_devices_summary?.length ?? 0) === 0) {
      return liveDevices;
    }
    const liveById = new Map(liveDevices.map((device) => [device.id, device]));
    return selectedPresenceRoom.smart_devices_summary!.map((device) => {
      const live = liveById.get(device.id);
      return live
        ? {
            ...device,
            state: live.state,
            is_active: live.is_active,
          }
        : device;
    });
  }, [allSmartDevices, selectedPresenceRoom]);

  async function requestCapture() {
    if (!selectedPresenceRoom?.camera_summary?.capture_available) return;
    setCaptureBusy(true);
    setCaptureMessage(null);
    try {
      const response = await api.post<{ message?: string }>(
        `/future/rooms/${encodeURIComponent(String(selectedPresenceRoom.room_id))}/capture`,
      );
      setCaptureMessage(response?.message ?? "Capture requested.");
      await refetchPresence();
    } catch (error) {
      setCaptureMessage(error instanceof ApiError ? error.message : "Could not trigger capture.");
    } finally {
      setCaptureBusy(false);
    }
  }

  const headerClass = compact ? "space-y-2" : "space-y-4";
  const shellClass = compact ? "p-4" : "p-5";

  if (!loadingFac && (!facilities?.length || facilities.length === 0)) {
    return (
      <section className={`surface-card ${shellClass} ${className}`.trim()}>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-on-surface">
          <MapPin className="h-4 w-4 text-primary" />
          {t("floorplan.viewTitle")}
        </h3>
        <p className="text-sm text-on-surface-variant">{t("floorplan.noFacilities")}</p>
      </section>
    );
  }

  return (
    <section className={`surface-card ${shellClass} ${className}`.trim()}>
      <div className={headerClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-on-surface">
              <MapPin className="h-4 w-4 text-primary" />
              {compact ? "Ward monitoring summary" : "Live operations map"}
            </h3>
            <p className="mt-1 text-xs text-on-surface-variant">
              {compact
                ? "Room occupancy, alerts, and node freshness in one glance."
                : "Readable room cards, occupancy context, and room-level inspection for staff operations."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">{presenceRooms.length || rooms.length} rooms</Badge>
            <Badge variant="success">{occupiedRooms} occupied</Badge>
            <Badge variant={totalAlerts > 0 ? "destructive" : "outline"}>{totalAlerts} alerts</Badge>
            <Badge variant={staleNodes > 0 ? "warning" : "outline"}>{staleNodes} stale</Badge>
            {compact && openHref ? (
              <Link
                href={openHref}
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-smooth hover:bg-primary/15"
              >
                Open live map
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>

        {!compact ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryStat icon={Users} label="Occupied rooms" value={occupiedRooms} tone="success" />
            <SummaryStat
              icon={ShieldAlert}
              label="Active alerts"
              value={totalAlerts}
              tone={totalAlerts > 0 ? "critical" : "info"}
            />
            <SummaryStat
              icon={Wifi}
              label="Online nodes"
              value={onlineNodes}
              tone={onlineNodes > 0 ? "success" : "warning"}
            />
            <SummaryStat
              icon={Activity}
              label="Stale nodes"
              value={staleNodes}
              tone={staleNodes > 0 ? "warning" : "success"}
            />
          </div>
        ) : null}
      </div>

      <div className={`mb-4 grid gap-3 ${compact ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
        <div>
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">
            {t("floorplan.building")}
          </label>
          <select
            className="input-field w-full text-sm"
            value={effectiveFacilityId === "" ? "" : String(effectiveFacilityId)}
            onChange={(event) => {
              const value = event.target.value;
              setFacilityId(value === "" ? "" : Number(value));
              setFloorId("");
              setSelectedId(null);
              setCaptureMessage(null);
            }}
            disabled={loadingFac}
          >
            <option value="">{t("floorplan.selectBuilding")}</option>
            {(facilities ?? []).map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-on-surface-variant">
            {t("floorplan.floor")}
          </label>
          <select
            className="input-field w-full text-sm"
            value={effectiveFloorId === "" ? "" : String(effectiveFloorId)}
            onChange={(event) => {
              const value = event.target.value;
              setFloorId(value === "" ? "" : Number(value));
              setSelectedId(null);
              setCaptureMessage(null);
            }}
            disabled={effectiveFacilityId === "" || loadingFloors}
          >
            <option value="">{t("floorplan.selectFloor")}</option>
            {(floors ?? []).map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name || String(floor.floor_number)}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 px-3 py-2 text-xs text-on-surface-variant">
          {loadingPresence
            ? "Refreshing live occupancy..."
            : presenceError
              ? "Live presence is unavailable. Layout remains readable while the feed recovers."
              : compact
                ? "Tap a room card to preview its current occupancy."
                : "Live occupancy and device summaries auto-refresh every 15 seconds."}
        </div>
      </div>

      {effectiveFacilityId !== "" && effectiveFloorId !== "" && loadingFloors === false ? (
        floors?.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t("floorplan.noFloors")}</p>
        ) : canvasLoading ? (
          <div
            className={`flex items-center justify-center rounded-xl border border-outline-variant/30 bg-surface-container-low/80 ${
              compact ? "min-h-[280px]" : "min-h-[min(78vh,720px)]"
            }`}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : layoutError ? (
          <p className="text-sm text-error">{t("floorplan.layoutError")}</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{t("floorplan.emptyLayout")}</p>
        ) : compact ? (
          <>
            <FloorplanCanvas
              readOnly
              compact
              rooms={rooms}
              onRoomsChange={() => {}}
              selectedId={visibleSelectedId}
              onSelect={setSelectedId}
              roomMetaById={roomMetaById}
            />
            <p className="mt-2 text-xs text-on-surface-variant">
              {selectedRoomEntry?.presenceRoom
                ? `${selectedRoomEntry.room.label}: ${getRoomOccupants(selectedRoomEntry.presenceRoom)
                    .slice(0, 3)
                    .map((item) => item.display_name)
                    .join(", ") || "No visible occupants"}`
                : "Open the live map to inspect Home Assistant state and the latest room snapshot."}
            </p>
          </>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.06fr)_360px]">
            <div className="min-w-0 space-y-3">
              <FloorplanCanvas
                readOnly
                rooms={rooms}
                onRoomsChange={() => {}}
                selectedId={visibleSelectedId}
                onSelect={setSelectedId}
                roomMetaById={roomMetaById}
              />
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 px-3 py-2 text-xs text-on-surface-variant">
                {presenceError
                  ? "Presence feed degraded. Room geometry remains available while live overlays retry."
                  : "Select a room to inspect occupants, Home Assistant devices, node freshness, and the latest photo snapshot."}
              </div>
            </div>

            <aside className="surface-card h-fit space-y-4 border border-outline-variant/20 p-4">
              {selectedRoomEntry ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-lg font-semibold text-on-surface">
                          {selectedRoomEntry.room.label}
                        </h4>
                        <p className="mt-1 text-sm text-on-surface-variant">
                          {selectedPresenceRoom
                            ? `${describeNodeStatus(selectedPresenceRoom)}${selectedPresenceRoom.node_device_id ? ` | ${selectedPresenceRoom.node_device_id}` : ""}`
                            : "No live room telemetry yet"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          getNodeTone(selectedPresenceRoom) === "critical"
                            ? "destructive"
                            : getNodeTone(selectedPresenceRoom) === "warning"
                              ? "warning"
                              : "outline"
                        }
                      >
                        {selectedPresenceRoom ? describeNodeStatus(selectedPresenceRoom) : "Layout only"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="success">{selectedPatients.length} patients</Badge>
                      <Badge variant="secondary">{selectedStaff.length} staff</Badge>
                      <Badge
                        variant={(selectedPresenceRoom?.alert_count ?? 0) > 0 ? "destructive" : "outline"}
                      >
                        {selectedPresenceRoom?.alert_count ?? 0} alerts
                      </Badge>
                      {selectedPresenceRoom?.prediction_hint ? (
                        <Badge variant="outline">
                          {Math.round((selectedPresenceRoom.prediction_hint.confidence ?? 0) * 100)}% prediction
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <OccupantList
                    title="Patients in room"
                    items={selectedPatients}
                    emptyText="No patient is currently associated with this room."
                  />

                  <OccupantList
                    title="Staff in room"
                    items={selectedStaff}
                    emptyText="No staff presence has been set for this room."
                  />

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                      <Clock3 className="h-4 w-4 text-primary" />
                      Room telemetry
                    </div>
                    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-3">
                      <div className="flex items-center gap-2 text-sm text-on-surface">
                        <UserRound className="h-4 w-4 text-on-surface-variant" />
                        {selectedPresenceRoom?.prediction_hint?.predicted_room_name?.trim()
                          ? `Latest prediction from ${selectedPresenceRoom.prediction_hint.device_id} points here`
                          : "No prediction hint for this room."}
                      </div>
                      {selectedPresenceRoom?.prediction_hint ? (
                        <p className="mt-2 text-xs text-on-surface-variant">
                          Confidence {Math.round((selectedPresenceRoom.prediction_hint.confidence ?? 0) * 100)}% |
                          computed {formatRelativeTime(selectedPresenceRoom.prediction_hint.computed_at)}
                        </p>
                      ) : null}
                      {selectedPresenceRoom?.computed_at ? (
                        <p className="mt-2 text-xs text-on-surface-variant">
                          Presence updated {formatRelativeTime(selectedPresenceRoom.computed_at)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                      <Wifi className="h-4 w-4 text-primary" />
                      Home Assistant devices
                    </div>
                    {inspectorDevices.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-3 text-sm text-on-surface-variant">
                        No smart devices are linked to this room.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {inspectorDevices.map((device) => (
                          <div
                            key={`room-device-${device.id}`}
                            className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-on-surface">{device.name}</p>
                                <p className="mt-1 text-xs text-on-surface-variant">
                                  {device.device_type}
                                  {"ha_entity_id" in device && device.ha_entity_id
                                    ? ` | ${device.ha_entity_id}`
                                    : ""}
                                </p>
                              </div>
                              <Badge variant={device.is_active === false ? "outline" : "secondary"}>
                                {("state" in device && device.state) || "unknown"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                      <Camera className="h-4 w-4 text-primary" />
                      Latest room snapshot
                    </div>

                    {selectedPresenceRoom?.camera_summary?.latest_photo_url ? (
                      <div className="relative h-52 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low/50">
                        <Image
                          src={selectedPresenceRoom.camera_summary.latest_photo_url}
                          alt={`Latest snapshot for ${selectedRoomEntry.room.label}`}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/40 px-3 py-6 text-center text-sm text-on-surface-variant">
                        No snapshot is available for this room yet.
                      </div>
                    )}

                    {selectedPresenceRoom?.camera_summary?.captured_at ? (
                      <p className="text-xs text-on-surface-variant">
                        Captured {formatDateTime(selectedPresenceRoom.camera_summary.captured_at)} |{" "}
                        {formatRelativeTime(selectedPresenceRoom.camera_summary.captured_at)}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void requestCapture()}
                        disabled={!selectedPresenceRoom?.camera_summary?.capture_available || captureBusy}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-smooth hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {captureBusy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        Capture now
                      </button>
                      <button
                        type="button"
                        onClick={() => void refetchPresence()}
                        className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-2 text-sm font-medium text-on-surface transition-smooth hover:bg-surface-container-low"
                      >
                        <RefreshCcw className="h-4 w-4" />
                        Refresh
                      </button>
                    </div>

                    {captureMessage ? (
                      <p className="text-xs text-on-surface-variant">{captureMessage}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-outline-variant/30 px-4 py-8 text-center text-sm text-on-surface-variant">
                  Select a room on the map to inspect its live operations details.
                </div>
              )}
            </aside>
          </div>
        )
      ) : (
        <p className="text-sm text-on-surface-variant">{t("floorplan.emptyLayout")}</p>
      )}
    </section>
  );
}
