"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import overviewStyles from "./overview-floorplan.module.css";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DetailSheet } from "@/components/shared/DetailSheet";
import { EntityHeader } from "@/components/shared/EntityHeader";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import type { FloorplanPresenceOut, ListAlertsResponse } from "@/lib/api/task-scope-types";
import { overviewRoomTone } from "@/lib/overviewStatus";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import {
  bootstrapRoomsFromDbFloor,
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
  type FloorplanRoomShape,
} from "@/lib/floorplanLayout";
import { useTranslation } from "@/lib/i18n";
import { getCaregiverDetailPath, getPatientDetailPath } from "@/lib/routes";
import { matchFloorRoomFromLayoutLabel } from "@/lib/floorplanRoomResolve";
import { floorplanRoomIdToNumeric } from "@/lib/monitoringWorkspace";
import { readFloorplanBackground } from "@/lib/floorplanEditor";
import type { Device, Facility, Floor, Room, SmartDevice } from "@/lib/types";
import FloorplanCanvas, {
  type FloorplanRoomChip,
  type FloorplanRoomMeta,
  type FloorplanRoomTone,
} from "./FloorplanCanvas";

type Props = {
  className?: string;
  compact?: boolean;
  /** Compact saved-layout preview used only by the admin Overview. */
  overview?: boolean;
  overviewAlerts?: ListAlertsResponse;
  showPresence?: boolean;
  initialFacilityId?: number | null;
  initialFloorId?: number | null;
  initialRoomName?: string | null;
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
  photo_url?: string | null;
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

function safeNodeDeviceId(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function describePatientName(patient: PatientHint): string {
  const name = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
  return name || `Patient #${patient.patient_id}`;
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

type TranslateFn = (key: string) => string;

function describeNodeStatus(room: PresenceRoom | null, t: TranslateFn): string {
  if (!room) return t("floorplan.nodeStatus.none");
  if (!room.node_device_id) return t("overview.node.unmapped");
  if (room.node_status === "online") return t("overview.node.online");
  if (room.node_status === "stale") return t("overview.node.stale");
  if (room.node_status === "offline") return t("overview.node.offline");
  if (room.node_status === "unmapped") return t("overview.node.unmapped");
  return room.node_status.replace(/_/g, " ");
}

/** Simulator/model prefixes that should never be shown raw to staff. */
const DEVICE_ID_PREFIXES = /^(?:MODEL|SIM|TSIM|DEMO|TEST)[_-]/i;

/**
 * Display label for a raw device/topic id (MODEL_NODE_01, SIM_WHEEL_02, …).
 * Prefers the registry `display_name` from GET /api/devices; falls back to
 * stripping known sim prefixes so users never see raw ids.
 */
function deviceDisplayLabel(
  deviceId: string | null | undefined,
  displayNameById: ReadonlyMap<string, string>,
): string {
  const raw = (deviceId ?? "").trim();
  if (!raw) return "";
  const known = displayNameById.get(raw.toLowerCase());
  if (known && known.trim()) return known.trim();
  return raw.replace(DEVICE_ID_PREFIXES, "").replace(/_/g, " ").trim() || raw;
}

/** "{count} X" labels with a separate singular form, matching overview.residentOne/Count style. */
function countChipLabel(count: number, oneKey: string, manyKey: string, t: TranslateFn): string {
  return count === 1 ? t(oneKey) : t(manyKey).replace("{count}", String(count));
}

/** Matches server semantics: any state outside off/unknown/unavailable counts as ON (e.g. climate "cool"). */
function isSmartDeviceStateOn(state: unknown): boolean {
  const normalized = String(state ?? "off").trim().toLowerCase();
  return normalized !== "" && normalized !== "off" && normalized !== "unknown" && normalized !== "unavailable";
}

function getPredictionChip(room: PresenceRoom, t: TranslateFn): FloorplanRoomChip | null {
  if (!room.prediction_hint) return null;
  if ((room.prediction_hint as { model_type?: string }).model_type === "max_rssi") return null;
  const rawConfidence = room.prediction_hint.confidence;
  if (rawConfidence == null || !Number.isFinite(rawConfidence)) return { label: t("floorplan.prediction.unknown"), tone: "info" };
  const confidence = Math.round(rawConfidence * 100);
  return {
    label: t("floorplan.prediction.confidence").replace("{confidence}", String(confidence)),
    tone: "info",
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
      photo_url: room.patient_hint.photo_url ?? null,
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
        photo_url: patient.photo_url ?? null,
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
        photo_url: null,
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

function presenceHrefForOccupant(o: RoomOccupant, roleBase: string | null): string | null {
  if (!roleBase) return null;
  if (o.actor_type === "patient" && o.patient_id != null) {
    return `${roleBase}/patients/${o.patient_id}`;
  }
  if (o.actor_type === "staff" && o.caregiver_id != null && roleBase === "/admin") {
    return `/admin/caregivers/${o.caregiver_id}`;
  }
  return null;
}

function buildPresenceMeta(
  room: PresenceRoom,
  roleBase: string | null,
  t: TranslateFn,
  deviceLabel: (deviceId: string | null | undefined) => string,
): FloorplanRoomMeta {
  const occupants = getRoomOccupants(room);
  const patientCount = occupants.filter((item) => item.actor_type === "patient").length;
  const staffCount = occupants.filter((item) => item.actor_type === "staff").length;
  const detailLines: string[] = [];
  const occupantNames = occupants.slice(0, 2).map((item) => item.display_name);

  if (occupantNames.length > 0) {
    detailLines.push(occupantNames.join(", "));
  } else if (room.prediction_hint?.predicted_room_name?.trim()) {
    detailLines.push(
      t("floorplan.predictedFrom").replace("{device}", deviceLabel(room.prediction_hint.device_id)),
    );
  } else {
    detailLines.push(t("overview.noOccupants"));
  }

  const nodeStatus = describeNodeStatus(room, t);
  if (room.node_device_id) {
    detailLines.push(`${nodeStatus} | ${deviceLabel(room.node_device_id)}`);
  } else {
    detailLines.push(nodeStatus);
  }

  if (room.camera_summary?.captured_at) {
    detailLines.push(
      t("floorplan.snapshotAgo").replace("{time}", formatRelativeTime(room.camera_summary.captured_at)),
    );
  }

  const chips: FloorplanRoomChip[] = [];
  if (patientCount > 0) {
    chips.push({ label: countChipLabel(patientCount, "floorplan.chip.patientOne", "floorplan.chip.patients", t), tone: "success" });
  }
  if (staffCount > 0) {
    chips.push({ label: t("floorplan.chip.staff").replace("{count}", String(staffCount)), tone: "info" });
  }
  if ((room.alert_count ?? 0) > 0) {
    chips.unshift({
      label: countChipLabel(room.alert_count ?? 0, "floorplan.chip.alertOne", "floorplan.chip.alerts", t),
      tone: "critical",
    });
  }
  const predictionChip = getPredictionChip(room, t);
  if (predictionChip) {
    chips.push(predictionChip);
  }
  if (chips.length === 0) {
    chips.push({
      label: nodeStatus,
      tone: getNodeTone(room),
    });
  }

  const head = occupants.slice(0, 3);
  return {
    chips,
    detailLines,
    presenceDots: head.map((item) => item.display_name),
    presenceHrefs: head.map((item) => presenceHrefForOccupant(item, roleBase)),
    presenceAvatarUrls: head.map((item) => item.photo_url?.trim() || null),
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
      ? "bg-red-500/12 text-red-700 dark:text-red-300"
      : tone === "warning"
        ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
        : tone === "success"
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : "bg-sky-500/12 text-sky-700 dark:text-sky-300";

  return (
    <div className="h-full rounded-lg border border-outline-variant/20 bg-surface-container-low/60 p-3">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs uppercase tracking-wide text-foreground-variant">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function getOccupantHref(item: RoomOccupant, userRole: string): string | null {
  if (item.actor_type === "patient" && item.patient_id != null) {
    return getPatientDetailPath(userRole, item.patient_id);
  }
  if (item.actor_type === "staff" && item.caregiver_id != null) {
    return getCaregiverDetailPath(userRole, item.caregiver_id);
  }
  return null;
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
  const { user } = useAuth();
  const { t } = useTranslation();
  const userRole = user?.role ?? "admin";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-primary" />
        {title}
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-3 text-sm text-foreground-variant">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const href = getOccupantHref(item, userRole);
            const content = (
              <div
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{item.display_name}</p>
                    <p className="mt-1 text-xs text-foreground-variant">
                      {item.subtitle || item.role || formatSourceLabel(item.source)}
                    </p>
                  </div>
                  <Badge variant={item.actor_type === "patient" ? "success" : "secondary"}>
                    {t(item.actor_type === "patient" ? "floorplan.actor.patient" : "floorplan.actor.staff")}
                  </Badge>
                </div>
                {item.updated_at ? (
                  <p className="mt-2 text-[11px] text-foreground-variant">
                    {t("patient.roomControls.lastUpdated")} {formatRelativeTime(item.updated_at)}
                  </p>
                ) : null}
              </div>
            );
            if (href) {
              return (
                <Link
                  key={`${item.actor_type}-${item.actor_id}`}
                  href={href}
                  className="block transition-colors hover:opacity-90"
                >
                  {content}
                </Link>
              );
            }
            return <div key={`${item.actor_type}-${item.actor_id}`}>{content}</div>;
          })}
        </div>
      )}
    </div>
  );
}

type RoomEntry = {
  room: FloorplanRoomShape;
  presenceRoom: PresenceRoom | null;
};

function RoomInspectorContent({
  selectedRoomEntry,
  selectedPresenceRoom,
  selectedPatients,
  selectedStaff,
  inspectorDevices,
  captureBusy,
  captureMessage,
  requestCapture,
  refetchPresence,
  deviceLabel,
}: {
  selectedRoomEntry: RoomEntry;
  selectedPresenceRoom: PresenceRoom | null;
  selectedPatients: RoomOccupant[];
  selectedStaff: RoomOccupant[];
  inspectorDevices: Array<RoomSmartDeviceStateSummary | SmartDevice>;
  captureBusy: boolean;
  captureMessage: string | null;
  requestCapture: () => void;
  refetchPresence: () => void;
  deviceLabel: (deviceId: string | null | undefined) => string;
}) {
  const { t } = useTranslation();
  const predictionHint = selectedPresenceRoom?.prediction_hint;
  const isRssiPrediction =
    (predictionHint as { model_type?: string } | undefined)?.model_type === "max_rssi";
  const predictionConfidence = Math.round((predictionHint?.confidence ?? 0) * 100);
  const predictionLabel = isRssiPrediction
    ? t("floorplan.prediction.strongestRssi")
    : t("floorplan.prediction.confidence").replace("{confidence}", String(predictionConfidence));
  return (
    <div className="space-y-4 border border-outline-variant/20 p-4 surface-card">
      <EntityHeader
        headingLevel={3}
        name={selectedRoomEntry.room.label}
        description={
          selectedPresenceRoom
            ? `${describeNodeStatus(selectedPresenceRoom, t)}${selectedPresenceRoom.node_device_id ? ` | ${deviceLabel(selectedPresenceRoom.node_device_id)}` : ""}`
            : t("floorplan.inspector.noTelemetry")
        }
        status={
          <StatusBadge
            tone={getNodeTone(selectedPresenceRoom)}
            label={selectedPresenceRoom ? describeNodeStatus(selectedPresenceRoom, t) : t("floorplan.inspector.layoutOnly")}
          />
        }
        metadata={
          <>
            <StatusBadge
              tone="success"
              label={countChipLabel(selectedPatients.length, "floorplan.chip.patientOne", "floorplan.chip.patients", t)}
            />
            <StatusBadge
              tone="neutral"
              label={t("floorplan.chip.staff").replace("{count}", String(selectedStaff.length))}
            />
            <StatusBadge
              tone={(selectedPresenceRoom?.alert_count ?? 0) > 0 ? "critical" : "neutral"}
              label={countChipLabel(selectedPresenceRoom?.alert_count ?? 0, "floorplan.chip.alertOne", "floorplan.chip.alerts", t)}
            />
            {predictionHint ? (
              <StatusBadge
                tone="info"
                label={predictionLabel}
              />
            ) : null}
          </>
        }
      />

      <OccupantList
        title={t("floorplan.summaryPatients")}
        items={selectedPatients}
        emptyText={t("floorplan.roomPatientsEmpty")}
      />

      <OccupantList
        title={t("floorplan.roomStaffTitle")}
        items={selectedStaff}
        emptyText={t("floorplan.roomStaffEmpty")}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock3 className="h-4 w-4 text-primary" />
          {t("floorplan.inspector.telemetry")}
        </div>
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <UserRound className="h-4 w-4 text-foreground-variant" />
            {predictionHint?.predicted_room_name?.trim()
              ? t("floorplan.inspector.predictionHere").replace("{device}", deviceLabel(predictionHint.device_id))
              : t("floorplan.inspector.noPrediction")}
          </div>
          {predictionHint ? (
            <p className="mt-2 text-xs text-foreground-variant">
              {predictionLabel}{" "}
              | {t("floorplan.inspector.computedAt").replace("{time}", formatRelativeTime(predictionHint.computed_at))}
            </p>
          ) : null}
          {selectedPresenceRoom?.computed_at ? (
            <p className="mt-2 text-xs text-foreground-variant">
              {t("floorplan.inspector.presenceUpdated").replace("{time}", formatRelativeTime(selectedPresenceRoom.computed_at))}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wifi className="h-4 w-4 text-primary" />
          {t("floorplan.summarySmart")}
        </div>
        {inspectorDevices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-3 text-sm text-foreground-variant">
            {t("overview.noRoomDevices")}
          </div>
        ) : (
          <div className="space-y-2">
            {inspectorDevices.map((device) => {
              const isOn = "state" in device && isSmartDeviceStateOn(device.state);
              return (
                <div
                  key={`room-device-${device.id}`}
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{device.name}</p>
                      <p className="mt-1 text-xs text-foreground-variant">
                        {device.device_type}
                        {"ha_entity_id" in device && device.ha_entity_id ? ` | ${device.ha_entity_id}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={isOn ? "success" : "secondary"}>
                        {("state" in device && device.state) || t("patient.roomControls.unknownState")}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant={isOn ? "default" : "outline"}
                        onClick={async () => {
                          try {
                            await api.controlSmartDevice(device.id, { action: "toggle" });
                            refetchPresence();
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        {isOn ? t("patient.roomControls.turnOff") : t("patient.roomControls.turnOn")}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Camera className="h-4 w-4 text-primary" />
          {t("floorplan.inspector.snapshot")}
        </div>

        {selectedPresenceRoom?.camera_summary?.latest_photo_url ? (
          <div className="relative h-52 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low/50">
            <Image
              src={selectedPresenceRoom.camera_summary.latest_photo_url}
              alt={t("floorplan.inspector.snapshotAlt").replace("{room}", selectedRoomEntry.room.label)}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/40 px-3 py-6 text-center text-sm text-foreground-variant">
            {t("floorplan.inspector.noSnapshot")}
          </div>
        )}

        {selectedPresenceRoom?.camera_summary?.captured_at ? (
          <p className="text-xs text-foreground-variant">
            {t("floorplan.inspector.capturedAt").replace("{time}", formatDateTime(selectedPresenceRoom.camera_summary.captured_at))} |{" "}
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
            {captureBusy ? <RefreshCcw className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {t("floorplan.inspector.captureNow")}
          </button>
          <button
            type="button"
            onClick={() => void refetchPresence()}
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-surface-container-low"
          >
            <RefreshCcw className="h-5 w-5" />
            {t("common.refresh")}
          </button>
        </div>

        {captureMessage ? <p className="text-xs text-foreground-variant">{captureMessage}</p> : null}
      </div>
    </div>
  );
}

/**
 * Facility + floor pickers, GET saved layout, read-only canvas, and staff operations inspector.
 */
export default function FloorplanRoleViewer({
  className = "",
  compact = false,
  overview = false,
  overviewAlerts,
  showPresence = true,
  initialFacilityId = null,
  initialFloorId = null,
  initialRoomName = null,
}: Props) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const roleBase = useMemo(() => {
    const seg = pathname.split("/").filter(Boolean)[0];
    if (
      seg === "admin" ||
      seg === "head-caregiver" ||
      seg === "caregiver"
    ) {
      return `/${seg}`;
    }
    return null;
  }, [pathname]);
  const [facilityId, setFacilityId] = useState<number | "">(() => initialFacilityId ?? "");
  const [floorId, setFloorId] = useState<number | "">(() => initialFloorId ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "floorplan">("floorplan");
  const [roomSearch, setRoomSearch] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);

  const { data: facilities, isLoading: loadingFac, error: facilitiesError } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "facilities"],
    queryFn: () => api.get<Facility[]>("/facilities"),
    staleTime: getQueryStaleTimeMs("/facilities"),
    refetchInterval: getQueryPollingMs("/facilities"),
    retry: 3,
  });

  const safeFacilities = useMemo(() => facilities ?? [], [facilities]);
  const effectiveFacilityId = useMemo<number | "">(
    () => {
      if (safeFacilities.length === 0) return "";
      if (facilityId !== "" && safeFacilities.some((facility) => facility.id === facilityId)) {
        return facilityId;
      }
      return safeFacilities[0]?.id ?? "";
    },
    [facilityId, safeFacilities],
  );

  const floorsEndpoint =
    effectiveFacilityId === "" ? null : `/facilities/${effectiveFacilityId}/floors`;
  const { data: floors, isLoading: loadingFloors, error: floorsError } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "floors", floorsEndpoint],
    queryFn: () => api.get<Floor[]>(floorsEndpoint!),
    enabled: Boolean(floorsEndpoint),
    staleTime: floorsEndpoint ? getQueryStaleTimeMs(floorsEndpoint) : 0,
    refetchInterval: floorsEndpoint ? getQueryPollingMs(floorsEndpoint) : false,
    retry: 3,
  });

  const safeFloors = useMemo(() => floors ?? [], [floors]);
  const effectiveFloorId = useMemo<number | "">(
    () => {
      if (safeFloors.length === 0) return "";
      if (floorId !== "" && safeFloors.some((floor) => floor.id === floorId)) {
        return floorId;
      }
      return safeFloors[0]?.id ?? "";
    },
    [floorId, safeFloors],
  );
  const background = useMemo(
    () => readFloorplanBackground(safeFloors.find(floor => floor.id === effectiveFloorId)?.map_data?.wheelsense_background),
    [safeFloors, effectiveFloorId],
  );

  const layoutEndpoint = useMemo(() => {
    if (effectiveFacilityId === "" || effectiveFloorId === "") return null;
    return `/floorplans/layout?facility_id=${effectiveFacilityId}&floor_id=${effectiveFloorId}`;
  }, [effectiveFacilityId, effectiveFloorId]);

  const {
    data: layoutRes,
    isLoading: loadingLayout,
    error: layoutError,
  } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "layout", layoutEndpoint],
    queryFn: () => api.get<FloorplanLayoutResponse>(layoutEndpoint!),
    enabled: Boolean(layoutEndpoint),
    staleTime: layoutEndpoint ? getQueryStaleTimeMs(layoutEndpoint) : 0,
    refetchInterval: layoutEndpoint ? getQueryPollingMs(layoutEndpoint) : false,
    retry: 3,
  });

  const floorRoomsEndpoint =
    effectiveFloorId === "" ? null : `/rooms?floor_id=${effectiveFloorId}`;
  const { data: floorRooms, isLoading: loadingFloorRooms, error: floorRoomsError } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "floor-rooms", floorRoomsEndpoint],
    queryFn: () => api.get<Room[]>(floorRoomsEndpoint!),
    enabled: Boolean(floorRoomsEndpoint),
    staleTime: floorRoomsEndpoint ? getQueryStaleTimeMs(floorRoomsEndpoint) : 0,
    refetchInterval: floorRoomsEndpoint ? getQueryPollingMs(floorRoomsEndpoint) : false,
    retry: 3,
  });

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
    return `/floorplans/presence?facility_id=${effectiveFacilityId}&floor_id=${effectiveFloorId}`;
  }, [showPresence, effectiveFacilityId, effectiveFloorId]);

  const {
    data: presenceData,
    error: presenceError,
    refetch: refetchPresenceBase,
  } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "presence", presenceEndpoint, compact],
    queryFn: () => api.get<PresenceResponse>(presenceEndpoint!),
    enabled: Boolean(presenceEndpoint),
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: presenceEndpoint ? getQueryStaleTimeMs(presenceEndpoint) : 0,
    retry: false,
  });
  const { data: allSmartDevices, refetch: refetchSmartDevices } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "ha-devices", compact],
    queryFn: () => api.get<SmartDevice[]>("/ha/devices"),
    enabled: !compact,
    staleTime: getQueryStaleTimeMs("/ha/devices"),
    refetchInterval: getQueryPollingMs("/ha/devices"),
    retry: false,
  });
  const { data: registryDevices } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "devices", compact],
    queryFn: () => api.get<Device[]>("/devices"),
    staleTime: getQueryStaleTimeMs("/devices"),
    refetchInterval: getQueryPollingMs("/devices"),
    retry: false,
  });
  const deviceDisplayNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const device of registryDevices ?? []) {
      const deviceId = device.device_id?.trim();
      const displayName = device.display_name?.trim();
      if (deviceId && displayName) {
        map.set(deviceId.toLowerCase(), displayName);
      }
    }
    return map;
  }, [registryDevices]);
  const deviceLabel = useCallback(
    (deviceId: string | null | undefined) => deviceDisplayLabel(deviceId, deviceDisplayNameById),
    [deviceDisplayNameById],
  );
  const refetchPresence = useCallback(async () => {
    await refetchOrThrow(refetchPresenceBase);
    if (!compact) {
      await refetchSmartDevices();
    }
  }, [compact, refetchPresenceBase, refetchSmartDevices]);

  useEffect(() => {
    if (compact || rooms.length === 0) return;
    if (!initialSelectedId) return;
    setSelectedId((prev) => {
      if (prev && rooms.some((room) => room.id === prev)) return prev;
      return initialSelectedId;
    });
  }, [compact, initialSelectedId, rooms]);

  const roomEntries = useMemo(() => {
    const presenceRooms = presenceData?.rooms ?? [];
    const byNumericId = new Map<number, PresenceRoom>();
    const byNodeDeviceId = new Map<string, PresenceRoom>();
    const byLabel = new Map<string, PresenceRoom>();
    const dbRoomByNodeDeviceId = new Map<string, Room>();
    const dbRoomByLabel = new Map<string, Room>();

    for (const room of presenceRooms) {
      byNumericId.set(room.room_id, room);
      const nodeKey = safeNodeDeviceId(room.node_device_id);
      if (nodeKey) {
        byNodeDeviceId.set(nodeKey, room);
      }
      byLabel.set(safeRoomName(room.room_name), room);
    }

    for (const floorRoom of floorRooms ?? []) {
      const nodeKey = safeNodeDeviceId(floorRoom.node_device_id);
      if (nodeKey) {
        dbRoomByNodeDeviceId.set(nodeKey, floorRoom);
      }
      const labelKey = safeRoomName(floorRoom.name);
      if (labelKey) {
        dbRoomByLabel.set(labelKey, floorRoom);
      }
    }

    return rooms.map((room) => {
      const parsedNumeric = floorplanRoomIdToNumeric(room.id);
      const directNumeric =
        parsedNumeric ?? (/^\d+$/.test(room.id.trim()) ? Number(room.id.trim()) : null);
      const nodeKey = safeNodeDeviceId(room.node_device_id);
      const roomFromNode = nodeKey ? dbRoomByNodeDeviceId.get(nodeKey) : null;
      const roomFromLabelExact = dbRoomByLabel.get(safeRoomName(room.label));
      const roomFromLabelFuzzy =
        roomFromLabelExact ??
        (floorRooms?.length
          ? matchFloorRoomFromLayoutLabel(room.label, floorRooms)
          : null);
      const resolvedNumericId = directNumeric ?? roomFromNode?.id ?? roomFromLabelFuzzy?.id ?? null;
      const presenceRoom =
        (resolvedNumericId !== null ? byNumericId.get(resolvedNumericId) : null) ??
        (nodeKey ? byNodeDeviceId.get(nodeKey) : null) ??
        byLabel.get(safeRoomName(room.label)) ??
        null;
      return { room, presenceRoom };
    });
  }, [floorRooms, presenceData?.rooms, rooms]);

  const roomMetaById = useMemo<Record<string, FloorplanRoomMeta>>(() => {
    const next: Record<string, FloorplanRoomMeta> = {};
    for (const entry of roomEntries) {
      if (entry.presenceRoom) {
        next[entry.room.id] = buildPresenceMeta(entry.presenceRoom, roleBase, t, deviceLabel);
      }
    }
    return next;
  }, [roomEntries, roleBase, t, deviceLabel]);

  const hasSavedGeometry = normalizeFloorplanRooms(layoutRes?.layout_json).length > 0;
  const filteredRoomEntries = roomEntries.filter(entry => {
    const query = roomSearch.trim().toLocaleLowerCase();
    const searchable = [entry.room.label, ...getRoomOccupants(entry.presenceRoom).map(person => person.display_name)].join(" ").toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (!alertsOnly || (entry.presenceRoom?.alert_count ?? 0) > 0);
  });

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
    if (!compact) {
      if (initialSelectedId && rooms.some((room) => room.id === initialSelectedId)) return initialSelectedId;
      return null;
    }
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
        `/floorplans/rooms/${encodeURIComponent(String(selectedPresenceRoom.room_id))}/capture`,
      );
      setCaptureMessage(response?.message ?? t("floorplan.inspector.captureRequested"));
      await refetchPresence();
    } catch (error) {
      setCaptureMessage(error instanceof ApiError ? error.message : t("floorplan.captureFailed"));
    } finally {
      setCaptureBusy(false);
    }
  }

  const inspectorOpen =
    !compact &&
    Boolean(selectedId && rooms.some((room) => room.id === selectedId) && selectedRoomEntry);

  const headerClass = compact ? "space-y-2" : "space-y-4";
  const shellClass = compact ? "p-3 sm:p-4" : "p-4 sm:p-5";
  const roomDirectory = (
    <div className="grid max-h-[720px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
      {filteredRoomEntries.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("redesign.noRooms")}</p> : filteredRoomEntries.map(entry => {
        const meta = roomMetaById[entry.room.id];
        return <button key={entry.room.id} type="button"
          className={`flex min-h-24 flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted ${entry.room.id === visibleSelectedId ? "border-primary ring-1 ring-primary" : "border-border"}`}
          onClick={() => setSelectedId(entry.room.id)} aria-pressed={entry.room.id === visibleSelectedId}>
          <span className="text-base font-semibold">{entry.room.label}</span>
          <span className="flex flex-wrap gap-1">{meta?.chips?.map((chip, index) => <StatusBadge key={index} tone={chip.tone} label={chip.label} />)}</span>
          <span className="text-sm text-muted-foreground">{meta?.detailLines?.join(" · ") || describeNodeStatus(entry.presenceRoom, t)}</span>
        </button>;
      })}
    </div>
  );

  const scopePickers = (
      <div className="mb-4 grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div>
          <label
            htmlFor="floorplan-building"
            className="mb-1 block text-sm font-medium text-foreground-variant"
          >
            {t("floorplan.building")}
          </label>
          <select
            id="floorplan-building"
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
            {safeFacilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="floorplan-floor"
            className="mb-1 block text-sm font-medium text-foreground-variant"
          >
            {t("floorplan.floor")}
          </label>
          <select
            id="floorplan-floor"
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
            {safeFloors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name || String(floor.floor_number)}
              </option>
            ))}
          </select>
        </div>
      </div>
  );

  if (overview) {
    const presenceAvailable = Boolean(presenceData) && !presenceError;
    const residentChip = (room: PresenceRoom | null): FloorplanRoomChip => {
      if (!room || !presenceAvailable) return {kind:"residents",label:t("overview.residentUnknown"),compactLabel:"—"};
      const count = new Set(getRoomOccupants(room).filter(person => person.actor_type === "patient").map(person => person.patient_id ?? person.actor_id)).size;
      const label = count === 1 ? t("overview.residentOne") : t("overview.residentCount").replace("{count}",String(count));
      const stale = room.node_status === "stale" || room.node_status === "offline" || (room.staleness_seconds ?? 0) >= 300;
      return {kind:"residents",compactLabel:`${count}${stale ? "*" : ""}`,label:stale ? t("overview.residentLastKnown").replace("{count}",label) : label};
    };
    const overviewMeta = Object.fromEntries(roomEntries.map(entry => {
      const live = presenceAvailable ? entry.presenceRoom : null;
      const roomId = live?.room_id ?? floorplanRoomIdToNumeric(entry.room.id);
      const tone = overviewRoomTone({roomId,nodeId:live?.node_device_id ?? entry.room.node_device_id,patientIds:getRoomOccupants(live).filter(person=>person.actor_type==="patient").map(person=>person.patient_id??person.actor_id),nodeStatus:live?.node_status,alertCount:live?.alert_count??0},overviewAlerts);
      return [entry.room.id,{tone,chips:[residentChip(live),{label:live ? `${live.alert_count??0} ${t("overview.roomAlerts")}` : t("redesign.unavailable"),tone}],detailLines:live ? [t(`overview.node.${live.node_status??"unmapped"}`),getRoomOccupants(live).map(person=>person.display_name).join(", ")] : []}];
    }));
    const recordedOccupancy = presenceRooms.filter(room => getRoomOccupants(room).length > 0).length;
    const offlineNodes = presenceRooms.filter(room => room.node_status === "offline").length;
    const staleOnly = presenceRooms.filter(room => room.node_status !== "offline" && (room.node_status === "stale" || (room.staleness_seconds ?? 0) >= 300)).length;
    const unknownNodes = roomEntries.filter(entry => !entry.presenceRoom || entry.presenceRoom.node_status === "unmapped").length;
    const scopeError = facilitiesError || floorsError || floorRoomsError;
    const count = (value: number) => presenceAvailable ? value : "—";
    return <section className={`${overviewStyles.panel} ${className}`} aria-labelledby="ward-title">
      <div className={overviewStyles.header}>
        <h2 id="ward-title">{t("overview.ward")}</h2>
        <Link href="/admin/monitoring">{t("workspace.mapPreview")}<MapPin aria-hidden className="size-4" /></Link>
      </div>
      <dl className={overviewStyles.metrics}>
        {[
          [t("overview.rooms"), scopeError || loadingFac || loadingFloors || canvasLoading ? "—" : floorRooms?.length ?? rooms.length],
          [t("overview.occupied"), count(recordedOccupancy)],
          [t("overview.roomAlerts"), count(totalAlerts)],
          [t("overview.stale"), count(staleOnly)],
          [t("overview.offline"), count(offlineNodes)],
          [t("overview.unmapped"), count(unknownNodes)],
        ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className={overviewStyles.scope}>{scopePickers}</div>
      {scopeError ? <p role="status" className="text-sm text-muted-foreground">{t("redesign.unavailable")}</p>
        : loadingFac || loadingFloors || canvasLoading ? <p role="status" className="py-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        : !safeFacilities.length ? <p className="text-sm text-muted-foreground">{t("floorplan.noFacilities")}</p>
        : !safeFloors.length ? <p className="text-sm text-muted-foreground">{t("floorplan.noFloors")}</p>
        : layoutError ? <p role="status" className="text-sm text-muted-foreground">{t("floorplan.layoutError")}</p>
        : !rooms.length ? <p className="text-sm text-muted-foreground">{t("floorplan.emptyLayout")}</p>
        : <>
          {hasSavedGeometry ? <div className={overviewStyles.canvas}>
            <FloorplanCanvas key={`${effectiveFacilityId}-${effectiveFloorId}`} readOnly compact fillViewport fitContentOnMount enableZoom workspaceTools
              background={background}
              rooms={rooms} onRoomsChange={() => {}} selectedId={visibleSelectedId} onSelect={setSelectedId}
              roomMetaById={overviewMeta} />
            <div className={overviewStyles.legend}><span data-tone="critical">! {t("overview.visual.criticalShort")}</span><span data-tone="warning">△ {t("overview.visual.warningShort")}</span><span data-tone="online">{t("devices.online")}</span><span>{t("patient.roomControls.unknownState")}</span><span>{t("overview.residentLegend")}</span></div>
          </div> : <p className="text-xs text-muted-foreground">{t("redesign.noGeometry")}</p>}
          <div className={hasSavedGeometry ? overviewStyles.mobileRooms : overviewStyles.directory}>
            {roomEntries.map(entry => <Button key={entry.room.id} type="button" variant={visibleSelectedId === entry.room.id ? "secondary" : "outline"}
              aria-pressed={visibleSelectedId === entry.room.id} onClick={() => setSelectedId(entry.room.id)} className="h-auto min-h-11 justify-between whitespace-normal text-left">
              <span>{entry.room.label}</span><span className="flex flex-col items-end text-xs text-muted-foreground"><span>{residentChip(entry.presenceRoom).label}</span><span>{presenceAvailable && entry.presenceRoom ? `${entry.presenceRoom.alert_count ?? 0} ${t("overview.roomAlerts")}` : t("redesign.unavailable")}</span></span>
            </Button>)}
          </div>
          <label className={overviewStyles.roomPicker}>
            <span>{t("overview.inspectRoom")}</span>
            <select className="input-field min-w-0 flex-1 text-sm" value={visibleSelectedId ?? ""} onChange={event => setSelectedId(event.target.value || null)}>
              <option value="">{t("overview.selectRoom")}</option>
              {roomEntries.map(entry => <option key={entry.room.id} value={entry.room.id}>{entry.room.label}</option>)}
            </select>
          </label>
          <DetailSheet
            open={Boolean(selectedRoomEntry)}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedId(null);
                setCaptureMessage(null);
              }
            }}
            title={selectedRoomEntry ? t("floorplan.roomTitle").replace("{room}", selectedRoomEntry.room.label) : t("floorplan.roomProps")}
            description={t("floorplan.liveDescription")}
          >
            {selectedRoomEntry ? (
              <RoomInspectorContent
                selectedRoomEntry={selectedRoomEntry}
                selectedPresenceRoom={selectedPresenceRoom}
                selectedPatients={selectedPatients}
                selectedStaff={selectedStaff}
                inspectorDevices={inspectorDevices}
                captureBusy={captureBusy}
                captureMessage={captureMessage}
                requestCapture={() => void requestCapture()}
                refetchPresence={() => void refetchPresence()}
                deviceLabel={deviceLabel}
              />
            ) : null}
          </DetailSheet>
        </>}
      <p role={presenceError ? "status" : undefined} className="mt-2 text-xs text-muted-foreground">
        {presenceError ? t("overview.presenceUnavailable") : presenceData ? `${t("patient.roomControls.lastUpdated")}: ${formatDateTime(presenceData.computed_at)}` : t("overview.presencePending")}
      </p>
    </section>;
  }

  if (!loadingFac && safeFacilities.length === 0) {
    return (
      <section className={`surface-card overflow-hidden ${shellClass} ${className}`.trim()}>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
          <MapPin className="h-4 w-4 text-primary" />
          {t("floorplan.viewTitle")}
        </h3>
        <p className="text-sm text-foreground-variant">{t("floorplan.noFacilities")}</p>
      </section>
    );
  }

  return (
    <section className={`surface-card overflow-hidden ${shellClass} ${className}`.trim()}>
      <div className={headerClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              {compact ? t("overview.ward") : t("floorplan.liveOpsTitle")}
            </h3>
            <p className="mt-1 text-sm text-foreground-variant">
              {compact ? t("floorplan.wardSubtitle") : t("floorplan.liveOpsSubtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            {!compact ? (
            <div
              className="hidden rounded-lg border border-border p-1 md:inline-flex"
              role="group"
          aria-label={t("floorplan.displayMode")}
            >
              <Button
                type="button"
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="px-3 text-sm"
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
              >
                {t("floorplan.viewList")}
              </Button>
              <Button
                type="button"
                variant={viewMode === "floorplan" ? "default" : "ghost"}
                size="sm"
                className="px-3 text-sm"
                onClick={() => { setViewMode("floorplan"); setRoomSearch(""); setAlertsOnly(false); }}
                disabled={!hasSavedGeometry}
                aria-pressed={viewMode === "floorplan"}
              >
                {t("floorplan.viewFloorplan")}
              </Button>
            </div>
            ) : null}
            <Badge variant="outline">{t("floorplan.badge.rooms").replace("{count}", String(presenceRooms.length || rooms.length))}</Badge>
            <Badge variant="outline">{t("floorplan.badge.occupied").replace("{count}", String(presenceData ? occupiedRooms : "—"))}</Badge>
            <Badge variant={totalAlerts > 0 ? "destructive" : "outline"}>{t("floorplan.badge.alerts").replace("{count}", String(presenceData ? totalAlerts : "—"))}</Badge>
            <Badge variant={staleNodes > 0 ? "warning" : "outline"}>{t("floorplan.badge.stale").replace("{count}", String(presenceData ? staleNodes : "—"))}</Badge>
          </div>
        </div>

        {!compact ? (
          <div className="ws-stat-strip grid grid-cols-2 xl:grid-cols-4">
            <SummaryStat icon={Users} label={t("floorplan.stat.occupiedRooms")} value={occupiedRooms} tone="success" />
            <SummaryStat
              icon={ShieldAlert}
              label={t("floorplan.stat.activeAlerts")}
              value={totalAlerts}
              tone={totalAlerts > 0 ? "critical" : "info"}
            />
            <SummaryStat
              icon={Wifi}
              label={t("floorplan.stat.onlineNodes")}
              value={onlineNodes}
              tone={onlineNodes > 0 ? "success" : "warning"}
            />
            <SummaryStat
              icon={Activity}
              label={t("floorplan.stat.staleNodes")}
              value={staleNodes}
              tone={staleNodes > 0 ? "warning" : "success"}
            />
          </div>
        ) : null}
      </div>

      {scopePickers}

      {effectiveFacilityId !== "" && effectiveFloorId !== "" && loadingFloors === false ? (
        safeFloors.length === 0 ? (
          <p className="text-sm text-foreground-variant">{t("floorplan.noFloors")}</p>
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
          <p className="text-sm text-foreground-variant">{t("floorplan.emptyLayout")}</p>
        ) : compact && hasSavedGeometry ? (
          <>
            <FloorplanCanvas
              readOnly
              compact
              background={background}
              fitContentOnMount={Boolean(background)}
              fitKey={`${effectiveFacilityId}-${effectiveFloorId}`}
              rooms={rooms}
              onRoomsChange={() => {}}
              selectedId={visibleSelectedId}
              onSelect={setSelectedId}
              roomMetaById={roomMetaById}
            />
            <p className="mt-2 text-sm text-foreground-variant">
              {selectedRoomEntry?.presenceRoom
                ? `${selectedRoomEntry.room.label}: ${getRoomOccupants(selectedRoomEntry.presenceRoom)
                    .slice(0, 3)
                    .map((item) => item.display_name)
                    .join(", ") || t("overview.noOccupants")}`
                : t("floorplan.compactOpenMapHint")}
            </p>
          </>
        ) : (
          <>
            <div className="min-w-0 space-y-3 overflow-hidden rounded-lg border border-border/60 bg-surface-container-low/40 p-2 sm:p-3">
              {!hasSavedGeometry ? <p className="px-2 py-3 text-sm text-muted-foreground">{t("redesign.noGeometry")}</p> : null}
              <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row">
                <Input aria-label={t("redesign.roomSearch")} placeholder={t("redesign.roomSearch")} value={roomSearch} onChange={event => setRoomSearch(event.target.value)} />
                <Button type="button" variant={alertsOnly ? "secondary" : "outline"} aria-pressed={alertsOnly} onClick={() => setAlertsOnly(value => !value)}>{t("redesign.alertRooms")}</Button>
              </div>
              {viewMode === "list" || !hasSavedGeometry || roomSearch || alertsOnly ? roomDirectory : <>
                <div className="ws-floorplan-list">{roomDirectory}</div>
                <div className="ws-floorplan-map"><FloorplanCanvas readOnly background={background} fitContentOnMount={Boolean(background)} fitKey={`${effectiveFacilityId}-${effectiveFloorId}`} rooms={rooms} onRoomsChange={() => {}} selectedId={visibleSelectedId} onSelect={setSelectedId} roomMetaById={roomMetaById} /></div>
              </>}
              <div
                className="rounded-lg border border-outline-variant/20 bg-card px-3 py-3 text-sm text-foreground-variant"
                role={presenceError ? "status" : undefined}
              >
                {presenceError
                  ? t("floorplan.presenceDegraded")
                  : t("floorplan.selectRoomHint")}
              </div>
            </div>

            <DetailSheet
              open={inspectorOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectedId(null);
                  setCaptureMessage(null);
                }
              }}
              title={selectedRoomEntry ? t("floorplan.roomTitle").replace("{room}", selectedRoomEntry.room.label) : t("floorplan.roomProps")}
          description={t("floorplan.liveDescription")}
            >
              {selectedRoomEntry ? (
                <RoomInspectorContent
                  selectedRoomEntry={selectedRoomEntry}
                  selectedPresenceRoom={selectedPresenceRoom}
                  selectedPatients={selectedPatients}
                  selectedStaff={selectedStaff}
                  inspectorDevices={inspectorDevices}
                  captureBusy={captureBusy}
                  captureMessage={captureMessage}
                  requestCapture={() => void requestCapture()}
                  refetchPresence={() => void refetchPresence()}
                  deviceLabel={deviceLabel}
                />
              ) : null}
            </DetailSheet>
          </>
        )
      ) : (
        <p className="text-sm text-foreground-variant">{t("floorplan.emptyLayout")}</p>
      )}
    </section>
  );
}
