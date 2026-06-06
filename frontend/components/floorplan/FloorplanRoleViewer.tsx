"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bath,
  BedDouble,
  Camera,
  Clock3,
  Fan,
  Gamepad2,
  House,
  Lightbulb,
  MapPin,
  RefreshCcw,
  ShieldAlert,
  Snowflake,
  Siren,
  Tv,
  Utensils,
  UserRound,
  Users,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { demoTheaterAssets, patientAssetKeyForName } from "@/lib/demo-theater/assets";
import {
  DEMO_THEATER_SLOTS,
  type DemoTheaterRoomRole,
} from "@/lib/demo-theater/layout";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import type { FloorplanPresenceOut } from "@/lib/api/task-scope-types";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import {
  bootstrapRoomsFromDbFloor,
  normalizeFloorplanRooms,
  type FloorplanLayoutResponse,
  type FloorplanRoomShape,
} from "@/lib/floorplanLayout";
import { useTranslation } from "@/lib/i18n";
import { matchFloorRoomFromLayoutLabel } from "@/lib/floorplanRoomResolve";
import { floorplanRoomIdToNumeric } from "@/lib/monitoringWorkspace";
import {
  getPhysicalModelMappingForRoomName,
  PHYSICAL_MODEL_ROOM_MAPPINGS,
  type PhysicalModelRoomAlias,
} from "@/lib/physical-model-demo";
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

type ViewMode = "list" | "floorplan" | "pixel";

type FloorplanRoomEntry = {
  room: FloorplanRoomShape;
  presenceRoom: PresenceRoom | null;
};

type DemoControlActorState = {
  actor_type: string;
  actor_id: number;
  display_name: string;
  role?: string | null;
  room_id?: number | null;
  room_name?: string | null;
  source?: string | null;
  updated_at?: string | null;
};

type DemoControlStateResponse = {
  actors?: DemoControlActorState[];
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
  if ((room.prediction_hint as { model_type?: string }).model_type === "max_rssi") return null;
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

function buildPresenceMeta(room: PresenceRoom, roleBase: string | null): FloorplanRoomMeta {
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

function physicalRoomIcon(alias: PhysicalModelRoomAlias) {
  if (alias === "Bedroom") return BedDouble;
  if (alias === "Living Room") return House;
  if (alias === "Bathroom") return Bath;
  return Utensils;
}

function isDeviceLikelyOn(device: RoomSmartDeviceStateSummary): boolean {
  const state = (device.state ?? "").trim().toLowerCase();
  return ["on", "heat", "cool", "fan_only", "dry", "auto"].includes(state);
}

function roomRoleIcon(role: DemoTheaterRoomRole) {
  if (role === "nurse_station") return ShieldAlert;
  if (role === "therapy") return Activity;
  if (role === "shared_care") return Users;
  if (role === "dining") return Utensils;
  return BedDouble;
}

function deviceIcon(device: RoomSmartDeviceStateSummary) {
  const label = `${device.device_type} ${device.name} ${device.ha_entity_id ?? ""}`.toLowerCase();
  if (label.includes("fan")) return Fan;
  if (label.includes("climate") || label.includes("air") || label.includes("ac")) return Snowflake;
  if (label.includes("tv") || label.includes("television")) return Tv;
  if (label.includes("alarm") || label.includes("siren")) return Siren;
  return Lightbulb;
}

function deviceKindLabel(device: RoomSmartDeviceStateSummary): string {
  const label = `${device.device_type} ${device.name} ${device.ha_entity_id ?? ""}`.toLowerCase();
  if (label.includes("fan")) return "fan";
  if (label.includes("climate") || label.includes("air") || label.includes("ac")) return "ac";
  if (label.includes("tv") || label.includes("television")) return "tv";
  if (label.includes("alarm") || label.includes("siren")) return "alarm";
  return "light";
}

function actorSpriteSource(occupant: RoomOccupant, index: number, hasAlert: boolean, tick: number): string {
  const isStaff = occupant.actor_type === "staff" || occupant.actor_type === "user";
  if (isStaff) {
    const staffAsset = index % 2 === 0 ? demoTheaterAssets.staff.nurse : demoTheaterAssets.staff.maleNurse;
    const frames = staffAsset.walk.south.length > 0 ? staffAsset.walk.south : staffAsset.idle.south;
    return frames[tick % frames.length];
  }

  const patientKey = patientAssetKeyForName(occupant.display_name, occupant.actor_id ?? index);
  const patientAsset = demoTheaterAssets.patients[patientKey];
  const frames = hasAlert ? patientAsset.falling : patientAsset.idle;
  return frames[tick % frames.length];
}

function mergeRoomDevices(
  presenceRoom: PresenceRoom | null,
  devicesByRoomId: Record<number, RoomSmartDeviceStateSummary[]>,
  roomId: number | null,
): RoomSmartDeviceStateSummary[] {
  const devices = presenceRoom?.smart_devices_summary ?? [];
  const liveDevices = roomId != null ? devicesByRoomId[roomId] ?? [] : [];
  const merged = new Map<number, RoomSmartDeviceStateSummary>();
  for (const device of devices) merged.set(device.id, device);
  for (const device of liveDevices) merged.set(device.id, device);
  return Array.from(merged.values());
}

function numericRoomIdFromEntry(entry: FloorplanRoomEntry | null): number | null {
  if (!entry) return null;
  if (entry.presenceRoom?.room_id != null) return entry.presenceRoom.room_id;
  const parsed = floorplanRoomIdToNumeric(entry.room.id);
  if (parsed != null) return parsed;
  return /^\d+$/.test(entry.room.id.trim()) ? Number(entry.room.id.trim()) : null;
}

function mergeOccupants(primary: RoomOccupant[], fallback: RoomOccupant[]): RoomOccupant[] {
  const merged = new Map<string, RoomOccupant>();
  for (const occupant of primary) merged.set(`${occupant.actor_type}-${occupant.actor_id}`, occupant);
  for (const occupant of fallback) {
    const type = occupant.actor_type === "user" ? "staff" : occupant.actor_type;
    merged.set(`${type}-${occupant.actor_id}`, { ...occupant, actor_type: type });
  }
  return Array.from(merged.values());
}

function PhysicalModelPixelOverlay({
  roomEntries,
  roomMetaById,
  devicesByRoomId,
  demoOccupantsByRoomId,
  selectedId,
  deviceBusyId,
  actionMessage,
  onSelect,
  onControlDevice,
}: {
  roomEntries: FloorplanRoomEntry[];
  roomMetaById: Record<string, FloorplanRoomMeta>;
  devicesByRoomId: Record<number, RoomSmartDeviceStateSummary[]>;
  demoOccupantsByRoomId: Record<number, RoomOccupant[]>;
  selectedId: string | null;
  deviceBusyId: number | null;
  actionMessage: string | null;
  onSelect: (id: string | null) => void;
  onControlDevice: (
    device: RoomSmartDeviceStateSummary,
    nextEnabled: boolean,
    roomName: string | null,
    roomId: number | null,
  ) => void;
}) {
  const [animationTick, setAnimationTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setAnimationTick((value) => (value + 1) % 10_000), 220);
    return () => window.clearInterval(id);
  }, []);

  const mappedRooms = new Set(PHYSICAL_MODEL_ROOM_MAPPINGS.map((mapping) => mapping.alias));
  const boardEntries = DEMO_THEATER_SLOTS.map((slot, index) => ({
    slot,
    entry: roomEntries[index] ?? null,
  }));

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl border-4 border-slate-600 bg-slate-950 p-3 text-slate-100 shadow-inner"
        style={{ imageRendering: "pixelated" }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4 text-cyan-200" />
              <span className="font-mono text-sm font-semibold uppercase tracking-wide">
                Realtime Pixel Facility Map
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-300">
              12-room WheelSense presence, actor action, alerts, and real device controls in one view.
            </p>
          </div>
          <Badge variant="outline" className="border-cyan-200/50 bg-cyan-950/50 font-mono text-cyan-100">
            12 rooms / 4 physical
          </Badge>
        </div>

        {actionMessage ? (
          <div className="mb-3 border border-cyan-200/40 bg-cyan-950/50 px-3 py-2 font-mono text-[11px] text-cyan-100">
            {actionMessage}
          </div>
        ) : null}

        <div className="relative h-[620px] overflow-hidden rounded-[6px] border-4 border-slate-500 bg-[#2f3937] shadow-[inset_0_0_0_6px_rgba(255,255,255,0.12)]">
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:34px_34px]" />
          <div className="absolute left-[5%] right-[5%] top-[32%] h-[6%] border-4 border-dashed border-slate-300/70 bg-slate-950/45" />
          <div className="absolute left-[5%] right-[5%] top-[63%] h-[6%] border-4 border-dashed border-slate-300/70 bg-slate-950/45" />
          <div className="absolute left-[48.5%] top-[7%] h-[85%] w-[3.5%] border-4 border-dashed border-slate-300/70 bg-slate-950/45" />
          <div className="absolute left-[44%] top-[47%] border border-slate-300/50 bg-black/70 px-2 py-1 font-mono text-[11px] text-slate-100">
            Main Hallway
          </div>

          {boardEntries.map(({ slot, entry }) => {
            const presenceRoom = entry?.presenceRoom ?? null;
            const roomLabel = presenceRoom?.room_name ?? entry?.room.label ?? slot.fallbackName;
            const roomId = numericRoomIdFromEntry(entry);
            const physicalMapping = getPhysicalModelMappingForRoomName(roomLabel);
            const alias = physicalMapping?.alias ?? null;
            const isPhysical = alias != null && mappedRooms.has(alias);
            const Icon = alias ? physicalRoomIcon(alias) : roomRoleIcon(slot.role);
            const meta = entry ? roomMetaById[entry.room.id] : null;
            const occupants = mergeOccupants(
              getRoomOccupants(presenceRoom),
              roomId != null ? demoOccupantsByRoomId[roomId] ?? [] : [],
            ).slice(0, 5);
            const hasAlert = (presenceRoom?.alert_count ?? 0) > 0;
            const devices = mergeRoomDevices(presenceRoom, devicesByRoomId, roomId).slice(0, 4);
            const activeDevices = devices.filter(isDeviceLikelyOn).length;
            const isSelected = Boolean(entry && entry.room.id === selectedId);
            const toneClass =
              hasAlert || meta?.tone === "critical"
                ? "border-red-400 bg-[#5b332e]"
                : isSelected
                  ? "border-cyan-200 bg-[#6c614a]"
                  : slot.role === "nurse_station"
                    ? "border-slate-300 bg-[#3d5560]"
                    : slot.role === "shared_care"
                      ? "border-slate-300 bg-[#4d563d]"
                      : slot.role === "dining"
                        ? "border-slate-300 bg-[#5b4b3d]"
                        : "border-slate-300 bg-[#6e604c]";

            return (
              <div
                key={slot.id}
                role="button"
                tabIndex={0}
                className={`absolute overflow-hidden rounded-[4px] border-4 p-2 text-left font-mono text-white shadow-[inset_0_0_0_2px_rgba(0,0,0,0.28)] transition-colors ${toneClass}`}
                style={{
                  left: `${slot.rect.x}%`,
                  top: `${slot.rect.y}%`,
                  width: `${slot.rect.width}%`,
                  height: `${slot.rect.height}%`,
                }}
                onClick={() => onSelect(entry?.room.id ?? null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(entry?.room.id ?? null);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <div className="inline-flex max-w-full items-center gap-1 border border-black/50 bg-black/65 px-1.5 py-1 text-[10px] font-bold">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{alias ?? roomLabel}</span>
                    </div>
                    {alias ? (
                      <p className="mt-1 truncate text-[9px] text-cyan-100">{roomLabel}</p>
                    ) : null}
                  </div>
                  {isPhysical ? (
                    <span className="border border-cyan-100/70 bg-black/65 px-1 py-0.5 text-[9px] text-cyan-100">
                      YOLO
                    </span>
                  ) : null}
                </div>

                <div className="absolute left-2 top-[38%] flex max-w-[48%] items-end gap-1 opacity-85">
                  {(slot.role === "resident" || alias === "Bedroom" || alias === "Living Room") ? (
                    <Image src={demoTheaterAssets.props.bedH} alt="" width={44} height={28} unoptimized className="h-7 w-auto" />
                  ) : null}
                  {slot.role === "nurse_station" ? (
                    <Image src={demoTheaterAssets.props.nurseStation} alt="" width={54} height={42} unoptimized className="h-10 w-auto" />
                  ) : null}
                  {slot.role === "therapy" ? (
                    <Image src={demoTheaterAssets.props.ivStand} alt="" width={30} height={44} unoptimized className="h-11 w-auto" />
                  ) : null}
                  {(slot.role === "shared_care" || slot.role === "dining") ? (
                    <Image src={demoTheaterAssets.props.chair} alt="" width={30} height={34} unoptimized className="h-8 w-auto" />
                  ) : null}
                </div>

                <div className="absolute bottom-10 left-2 right-2 flex min-h-[56px] items-end justify-center gap-1">
                  {occupants.length > 0 ? (
                    occupants.map((occupant, index) => (
                      <div
                        key={`${occupant.actor_type}-${occupant.actor_id}`}
                        className="flex max-w-[4.2rem] flex-col items-center"
                      >
                        <Image
                          src={actorSpriteSource(occupant, index, hasAlert, animationTick)}
                          alt=""
                          width={44}
                          height={54}
                          unoptimized
                          className={`h-11 w-auto object-contain drop-shadow-[0_2px_0_rgba(0,0,0,0.55)] ${
                            hasAlert && occupant.actor_type === "patient" ? "animate-pulse" : ""
                          }`}
                        />
                        <span className="max-w-full truncate border border-black/50 bg-black/70 px-1 py-0.5 text-[9px] leading-none text-white">
                          {occupant.display_name}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="border border-white/20 bg-black/40 px-1.5 py-0.5 text-[9px] text-slate-300">
                      Available
                    </span>
                  )}
                </div>

                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 text-[9px]">
                  <span className="truncate text-slate-100">
                    {occupants.length} people
                  </span>
                  <span className="truncate text-slate-100">
                    {activeDevices}/{devices.length} devices on
                  </span>
                </div>

                <div className="absolute bottom-[1.65rem] left-2 right-2 flex flex-wrap justify-end gap-1">
                  {devices.length > 0 ? (
                    devices.map((device) => {
                      const DeviceIcon = deviceIcon(device);
                      const isOn = isDeviceLikelyOn(device);
                      return (
                        <button
                          key={device.id}
                          type="button"
                          className={`inline-flex max-w-[6.7rem] items-center gap-1 border px-1.5 py-0.5 text-[9px] leading-none ${
                            isOn
                              ? "border-amber-100 bg-amber-500/35 text-amber-50"
                              : "border-slate-300/70 bg-black/45 text-slate-100"
                          } disabled:opacity-50`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onControlDevice(
                              device,
                              !isOn,
                              roomLabel,
                              roomId,
                            );
                          }}
                          disabled={deviceBusyId === device.id}
                          title={`Turn ${isOn ? "off" : "on"} ${device.name}`}
                        >
                          <DeviceIcon className="h-3 w-3 shrink-0" />
                          <span className="truncate">{deviceKindLabel(device)}: {isOn ? "on" : "off"}</span>
                        </button>
                      );
                    })
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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
          {items.map((item) => (
            <div
              key={`${item.actor_type}-${item.actor_id}`}
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
                  {item.actor_type}
                </Badge>
              </div>
              {item.updated_at ? (
                <p className="mt-2 text-[11px] text-foreground-variant">
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

type RoomEntry = FloorplanRoomEntry;

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
}) {
  return (
    <div className="space-y-4 border border-outline-variant/20 p-4 surface-card">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="truncate text-lg font-semibold text-foreground">
              {selectedRoomEntry.room.label}
            </h4>
            <p className="mt-1 text-sm text-foreground-variant">
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
          <Badge variant={(selectedPresenceRoom?.alert_count ?? 0) > 0 ? "destructive" : "outline"}>
            {selectedPresenceRoom?.alert_count ?? 0} alerts
          </Badge>
          {selectedPresenceRoom?.prediction_hint ? (
            (selectedPresenceRoom.prediction_hint as { model_type?: string }).model_type === "max_rssi" ? (
              <Badge variant="outline">Strongest RSSI</Badge>
            ) : (
              <Badge variant="outline">
                {Math.round((selectedPresenceRoom.prediction_hint.confidence ?? 0) * 100)}% prediction
              </Badge>
            )
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
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock3 className="h-4 w-4 text-primary" />
          Room telemetry
        </div>
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low/50 px-3 py-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <UserRound className="h-4 w-4 text-foreground-variant" />
            {selectedPresenceRoom?.prediction_hint?.predicted_room_name?.trim()
              ? `Latest prediction from ${selectedPresenceRoom.prediction_hint.device_id} points here`
              : "No prediction hint for this room."}
          </div>
          {selectedPresenceRoom?.prediction_hint ? (
            <p className="mt-2 text-xs text-foreground-variant">
              {(selectedPresenceRoom.prediction_hint as { model_type?: string }).model_type === "max_rssi"
                ? "Source strongest RSSI"
                : `Confidence ${Math.round((selectedPresenceRoom.prediction_hint.confidence ?? 0) * 100)}%`}{" "}
              | computed {formatRelativeTime(selectedPresenceRoom.prediction_hint.computed_at)}
            </p>
          ) : null}
          {selectedPresenceRoom?.computed_at ? (
            <p className="mt-2 text-xs text-foreground-variant">
              Presence updated {formatRelativeTime(selectedPresenceRoom.computed_at)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wifi className="h-4 w-4 text-primary" />
          Home Assistant devices
        </div>
        {inspectorDevices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/30 px-3 py-3 text-sm text-foreground-variant">
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
                    <p className="truncate font-medium text-foreground">{device.name}</p>
                    <p className="mt-1 text-xs text-foreground-variant">
                      {device.device_type}
                      {"ha_entity_id" in device && device.ha_entity_id ? ` | ${device.ha_entity_id}` : ""}
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
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
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
          <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-low/40 px-3 py-6 text-center text-sm text-foreground-variant">
            No snapshot is available for this room yet.
          </div>
        )}

        {selectedPresenceRoom?.camera_summary?.captured_at ? (
          <p className="text-xs text-foreground-variant">
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
            {captureBusy ? <RefreshCcw className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            Capture now
          </button>
          <button
            type="button"
            onClick={() => void refetchPresence()}
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-4 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-surface-container-low"
          >
            <RefreshCcw className="h-5 w-5" />
            Refresh
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
  showPresence = true,
  initialFacilityId = null,
  initialFloorId = null,
  initialRoomName = null,
}: Props) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const roleBase = useMemo(() => {
    const seg = pathname.split("/").filter(Boolean)[0];
    if (
      seg === "admin" ||
      seg === "head-nurse" ||
      seg === "supervisor" ||
      seg === "observer"
    ) {
      return `/${seg}`;
    }
    return null;
  }, [pathname]);
  const [facilityId, setFacilityId] = useState<number | "">(() => initialFacilityId ?? "");
  const [floorId, setFloorId] = useState<number | "">(() => initialFloorId ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("floorplan");
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [deviceControlBusyId, setDeviceControlBusyId] = useState<number | null>(null);
  const [deviceControlMessage, setDeviceControlMessage] = useState<string | null>(null);

  const { data: facilities, isLoading: loadingFac } = useQuery({
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
  const { data: floors, isLoading: loadingFloors } = useQuery({
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
  const { data: floorRooms, isLoading: loadingFloorRooms } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "floor-rooms", floorRoomsEndpoint],
    queryFn: () => api.get<Room[]>(floorRoomsEndpoint!),
    enabled: Boolean(floorRoomsEndpoint),
    staleTime: floorRoomsEndpoint ? getQueryStaleTimeMs(floorRoomsEndpoint) : 0,
    refetchInterval: floorRoomsEndpoint ? getQueryPollingMs(floorRoomsEndpoint) : false,
    retry: 3,
  });

  const allRoomsEndpoint = effectiveFacilityId === "" ? null : "/rooms?limit=100";
  const { data: allFacilityRooms } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "all-rooms", allRoomsEndpoint, compact],
    queryFn: () => api.get<Room[]>(allRoomsEndpoint!),
    enabled: !compact && Boolean(allRoomsEndpoint),
    staleTime: allRoomsEndpoint ? getQueryStaleTimeMs("/rooms") : 0,
    refetchInterval: allRoomsEndpoint ? getQueryPollingMs("/rooms") : false,
    retry: 3,
  });

  const { data: demoControlState } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "demo-state", roleBase, compact],
    queryFn: () => api.get<DemoControlStateResponse>("/demo/state"),
    enabled: !compact && roleBase === "/admin",
    staleTime: getQueryStaleTimeMs("/demo/state"),
    refetchInterval: 5_000,
    retry: false,
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
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: presenceEndpoint ? getQueryStaleTimeMs(presenceEndpoint) : 0,
    retry: false,
  });
  const refetchPresence = useCallback(() => refetchOrThrow(refetchPresenceBase), [refetchPresenceBase]);

  const { data: allSmartDevices } = useQuery({
    queryKey: ["shared", "floorplan-role-viewer", "ha-devices", compact],
    queryFn: () => api.get<SmartDevice[]>("/ha/devices"),
    enabled: !compact,
    staleTime: getQueryStaleTimeMs("/ha/devices"),
    refetchInterval: getQueryPollingMs("/ha/devices"),
    retry: false,
  });

  const devicesByRoomId = useMemo<Record<number, RoomSmartDeviceStateSummary[]>>(() => {
    const grouped: Record<number, RoomSmartDeviceStateSummary[]> = {};
    for (const device of allSmartDevices ?? []) {
      if (device.room_id == null) continue;
      if (!grouped[device.room_id]) grouped[device.room_id] = [];
      grouped[device.room_id].push({
        id: device.id,
        name: device.name,
        device_type: device.device_type,
        ha_entity_id: device.ha_entity_id,
        state: device.state,
        is_active: device.is_active,
      });
    }
    return grouped;
  }, [allSmartDevices]);

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

  const pixelRoomEntries = useMemo(() => {
    if (!allFacilityRooms || allFacilityRooms.length === 0) return roomEntries;
    const presenceRooms = presenceData?.rooms ?? [];
    const byNumericId = new Map<number, PresenceRoom>();
    const byLabel = new Map<string, PresenceRoom>();
    for (const room of presenceRooms) {
      byNumericId.set(room.room_id, room);
      byLabel.set(safeRoomName(room.room_name), room);
    }
    return bootstrapRoomsFromDbFloor(allFacilityRooms).map((room) => {
      const numericId = floorplanRoomIdToNumeric(room.id);
      const presenceRoom =
        (numericId != null ? byNumericId.get(numericId) : null) ??
        byLabel.get(safeRoomName(room.label)) ??
        null;
      return { room, presenceRoom };
    });
  }, [allFacilityRooms, presenceData?.rooms, roomEntries]);

  const demoOccupantsByRoomId = useMemo<Record<number, RoomOccupant[]>>(() => {
    const grouped: Record<number, RoomOccupant[]> = {};
    for (const actor of demoControlState?.actors ?? []) {
      if (actor.room_id == null) continue;
      if (!grouped[actor.room_id]) grouped[actor.room_id] = [];
      const actorType = actor.actor_type === "user" ? "staff" : actor.actor_type;
      grouped[actor.room_id].push({
        actor_type: actorType,
        actor_id: actor.actor_id,
        display_name: actor.display_name || `${actorType} #${actor.actor_id}`,
        subtitle: actor.source?.replace(/_/g, " ") ?? "demo state",
        role: actor.role ?? null,
        patient_id: actorType === "patient" ? actor.actor_id : null,
        caregiver_id: actorType === "staff" ? actor.actor_id : null,
        room_id: actor.room_id,
        source: actor.source ?? "demo_state",
        updated_at: actor.updated_at ?? null,
        photo_url: null,
      });
    }
    return grouped;
  }, [demoControlState?.actors]);

  const roomMetaById = useMemo<Record<string, FloorplanRoomMeta>>(() => {
    const next: Record<string, FloorplanRoomMeta> = {};
    for (const entry of roomEntries) {
      if (entry.presenceRoom) {
        next[entry.room.id] = buildPresenceMeta(entry.presenceRoom, roleBase);
      }
    }
    return next;
  }, [roomEntries, roleBase]);

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
      setCaptureMessage(response?.message ?? "Capture requested.");
      await refetchPresence();
    } catch (error) {
      setCaptureMessage(error instanceof ApiError ? error.message : "Could not trigger capture.");
    } finally {
      setCaptureBusy(false);
    }
  }

  const controlFloorplanDevice = useCallback(
    async (
      device: RoomSmartDeviceStateSummary,
      nextEnabled: boolean,
      roomName: string | null,
      roomId: number | null,
    ) => {
      const action = nextEnabled ? "turn_on" : "turn_off";
      const mapping = getPhysicalModelMappingForRoomName(roomName);
      const tasks: Array<{ label: string; run: Promise<unknown> }> = [
        {
          label: "Home Assistant",
          run: api.controlSmartDevice(device.id, { action, parameters: {} }),
        },
      ];
      if (mapping && roleBase === "/admin") {
        tasks.push({
          label: "physical model board",
          run: api.post("/demo/physical-model/device-control", {
            device_id: device.id,
            room_alias: mapping.alias,
            mapped_room_id: roomId ?? undefined,
            action,
          }),
        });
      }

      setDeviceControlBusyId(device.id);
      setDeviceControlMessage(`Sending ${action.replace("_", " ")} to ${device.name}...`);
      try {
        const results = await Promise.allSettled(tasks.map((task) => task.run));
        const failed = results
          .map((result, index) => ({ result, label: tasks[index].label }))
          .filter((item) => item.result.status === "rejected");
        const succeeded = results.length - failed.length;
        await Promise.allSettled([
          refetchPresence(),
          queryClient.invalidateQueries({ queryKey: ["shared", "floorplan-role-viewer", "ha-devices"] }),
        ]);
        if (succeeded === 0) {
          const first = failed[0]?.result;
          const reason =
            first?.status === "rejected" && first.reason instanceof ApiError
              ? first.reason.message
              : "Device control failed.";
          setDeviceControlMessage(reason);
          return;
        }
        if (failed.length > 0) {
          setDeviceControlMessage(
            `${device.name} command partly completed; ${failed.map((item) => item.label).join(", ")} failed.`,
          );
          return;
        }
        setDeviceControlMessage(`${device.name} is ${nextEnabled ? "on" : "off"}.`);
      } catch (error) {
        setDeviceControlMessage(error instanceof ApiError ? error.message : "Device control failed.");
      } finally {
        setDeviceControlBusyId(null);
      }
    },
    [queryClient, refetchPresence, roleBase],
  );

  const inspectorOpen =
    !compact &&
    Boolean(selectedId && rooms.some((room) => room.id === selectedId) && selectedRoomEntry);

  const headerClass = compact ? "space-y-2" : "space-y-4";
  const shellClass = compact ? "p-3 sm:p-4" : "p-4 sm:p-5";

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
              {compact ? "Ward monitoring summary" : "Live operations map"}
            </h3>
            <p className="mt-1 text-xs text-foreground-variant">
              {compact
                ? "Room occupancy, alerts, and node freshness in one glance."
                : "Readable room cards, occupancy context, and room-level inspection for staff operations."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              <Button
                type="button"
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => setViewMode("list")}
              >
                List
              </Button>
              <Button
                type="button"
                variant={viewMode === "floorplan" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => setViewMode("floorplan")}
              >
                Floorplan
              </Button>
              <Button
                type="button"
                variant={viewMode === "pixel" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => setViewMode("pixel")}
              >
                Pixel/Game
              </Button>
            </div>
            <Badge variant="outline">{presenceRooms.length || rooms.length} rooms</Badge>
            <Badge variant="success">{occupiedRooms} occupied</Badge>
            <Badge variant={totalAlerts > 0 ? "destructive" : "outline"}>{totalAlerts} alerts</Badge>
            <Badge variant={staleNodes > 0 ? "warning" : "outline"}>{staleNodes} stale</Badge>
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

      <div className="mb-4 grid gap-2 sm:grid-cols-2 sm:gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-variant">
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
            {safeFacilities.map((facility) => (
              <option key={facility.id} value={facility.id}>
                {facility.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-foreground-variant">
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
            {safeFloors.map((floor) => (
              <option key={floor.id} value={floor.id}>
                {floor.name || String(floor.floor_number)}
              </option>
            ))}
          </select>
        </div>
      </div>

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
            <p className="mt-2 text-xs text-foreground-variant">
              {selectedRoomEntry?.presenceRoom
                ? `${selectedRoomEntry.room.label}: ${getRoomOccupants(selectedRoomEntry.presenceRoom)
                    .slice(0, 3)
                    .map((item) => item.display_name)
                    .join(", ") || "No visible occupants"}`
                : "Open the live map to inspect Home Assistant state and the latest room snapshot."}
            </p>
          </>
        ) : (
          <>
            <div className="min-w-0 space-y-3 overflow-hidden rounded-lg border border-border/60 bg-surface-container-low/40 p-2 sm:p-3">
              {viewMode === "list" ? (
                <div className="grid max-h-[720px] auto-rows-fr grid-cols-1 gap-2 overflow-y-auto pr-2 sm:grid-cols-2">
                  {roomEntries.map((entry) => {
                    const meta = roomMetaById[entry.room.id];
                    const toneClass = meta?.tone === "critical" ? "border-red-500/50 bg-red-500/10" :
                                      meta?.tone === "warning" ? "border-amber-500/50 bg-amber-500/10" :
                                      meta?.tone === "success" ? "border-emerald-500/50 bg-emerald-500/10" :
                                      "border-border bg-surface-container-low";
                    return (
                      <button
                        key={entry.room.id}
                        type="button"
                        className={`flex h-full w-full flex-col rounded-lg border p-4 text-left transition-colors ${entry.room.id === visibleSelectedId ? "ring-2 ring-primary" : ""} ${toneClass}`}
                        onClick={() => setSelectedId(entry.room.id)}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="font-semibold text-sm truncate">{entry.room.label}</div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {meta?.chips?.map((c, i) => (
                            <Badge key={i} variant={c.tone === "critical" ? "destructive" : c.tone === "success" ? "success" : c.tone === "warning" ? "warning" : "outline"} className="text-[10px]">
                              {c.label}
                            </Badge>
                          ))}
                        </div>
                        {meta?.detailLines && meta.detailLines.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-2 flex flex-col gap-0.5">
                            {meta.detailLines.map((line, idx) => (
                              <span key={idx} className="truncate">{line}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : viewMode === "pixel" ? (
                <PhysicalModelPixelOverlay
                  roomEntries={pixelRoomEntries}
                  roomMetaById={roomMetaById}
                  devicesByRoomId={devicesByRoomId}
                  demoOccupantsByRoomId={demoOccupantsByRoomId}
                  selectedId={visibleSelectedId}
                  deviceBusyId={deviceControlBusyId}
                  actionMessage={deviceControlMessage}
                  onSelect={setSelectedId}
                  onControlDevice={(device, nextEnabled, roomName, roomId) => {
                    void controlFloorplanDevice(device, nextEnabled, roomName, roomId);
                  }}
                />
              ) : (
                <FloorplanCanvas
                  readOnly
                  rooms={rooms}
                  onRoomsChange={() => {}}
                  selectedId={visibleSelectedId}
                  onSelect={setSelectedId}
                  roomMetaById={roomMetaById}
                />
              )}
              <div className="rounded-lg border border-outline-variant/20 bg-card px-3 py-2 text-xs text-foreground-variant">
                {presenceError
                  ? "Presence feed degraded. Room geometry remains available while live overlays retry."
                  : "Select a room on the map or list to open live details in the side panel."}
              </div>
            </div>

            <Sheet
              open={inspectorOpen}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectedId(null);
                  setCaptureMessage(null);
                }
              }}
            >
              <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-md">
                <SheetTitle className="sr-only">
                  {selectedRoomEntry ? `Room ${selectedRoomEntry.room.label}` : "Room details"}
                </SheetTitle>
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
                  />
                ) : null}
              </SheetContent>
            </Sheet>
          </>
        )
      ) : (
        <p className="text-sm text-foreground-variant">{t("floorplan.emptyLayout")}</p>
      )}
    </section>
  );
}
