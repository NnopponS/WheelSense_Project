"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Fan,
  Hospital,
  Lightbulb,
  Link2,
  Map,
  MonitorSmartphone,
  Play,
  Power,
  RotateCcw,
  Snowflake,
  Stethoscope,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { api, ApiError, type UserSearchResult } from "@/lib/api";
import type { CreateWorkflowTaskResponse, DemoActorOut } from "@/lib/api/task-scope-types";
import {
  demoTheaterAssets,
  patientAssetKeyForProfile,
  type DemoDirection,
} from "@/lib/demo-theater/assets";
import {
  buildDemoTheaterRooms,
  buildDemoTheaterStaff,
  rectCenter,
  roomOccupancyLabel,
  type DemoTheaterPosition,
  type DemoTheaterRoomRole,
  type DemoTheaterRoomView,
  type DemoTheaterStaffView,
} from "@/lib/demo-theater/layout";
import {
  demoStepLabel,
  deriveStageFromSystemState,
  patientVisualStateForStage,
  roomToneForStage,
  staffVisualStateForStage,
  type DemoPatientVisualState,
  type DemoStaffVisualState,
  type DemoTheaterStage,
} from "@/lib/demo-theater/scenario";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Patient, Room, SmartDevice } from "@/lib/types";

type DeviceKind = "light" | "fan" | "ac";
type EventTone = "info" | "success" | "warning" | "error";

type TheaterEvent = {
  id: string;
  label: string;
  detail: string;
  tone: EventTone;
  at: string;
};

type DeviceControl = {
  kind: DeviceKind;
  label: string;
  icon: LucideIcon;
};

const DEVICE_CONTROLS: DeviceControl[] = [
  { kind: "light", label: "Light", icon: Lightbulb },
  { kind: "fan", label: "Fan", icon: Fan },
  { kind: "ac", label: "AC", icon: Snowflake },
];

const initialDeviceStates: Record<DeviceKind, boolean> = {
  light: false,
  fan: false,
  ac: false,
};

const PATIENT_ROOM_OFFSETS: DemoTheaterPosition[] = [
  { x: 58, y: 59 },
  { x: 38, y: 61 },
  { x: 72, y: 55 },
];

const STAFF_ROOM_OFFSETS: Record<DemoTheaterRoomRole, DemoTheaterPosition[]> = {
  resident: [
    { x: 72, y: 62 },
    { x: 56, y: 58 },
    { x: 42, y: 60 },
  ],
  nurse_station: [
    { x: 51, y: 58 },
    { x: 67, y: 60 },
    { x: 34, y: 61 },
    { x: 79, y: 54 },
  ],
  shared_care: [
    { x: 38, y: 58 },
    { x: 61, y: 59 },
  ],
  therapy: [
    { x: 60, y: 61 },
    { x: 42, y: 57 },
  ],
  dining: [
    { x: 38, y: 61 },
    { x: 64, y: 58 },
  ],
};

function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function eventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function patientName(patient: Patient | null | undefined): string {
  if (!patient) return "No patient";
  return patient.nickname || `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`;
}

function roomName(room: Room | null | undefined): string {
  return room?.name || "Unassigned room";
}

function deviceSearchText(device: SmartDevice): string {
  return `${device.name} ${device.device_type} ${device.ha_entity_id}`.toLowerCase();
}

function matchesDeviceKind(device: SmartDevice, kind: DeviceKind): boolean {
  const haystack = deviceSearchText(device);
  if (kind === "light") return haystack.includes("light") || haystack.includes("lamp");
  if (kind === "fan") return haystack.includes("fan");
  return (
    haystack.includes("ac") ||
    haystack.includes("air") ||
    haystack.includes("climate") ||
    haystack.includes("thermostat")
  );
}

function statusBadgeVariant(stage: DemoTheaterStage): "default" | "secondary" | "success" | "warning" | "destructive" {
  if (stage === "alert_active") return "destructive";
  if (stage === "acknowledged" || stage === "staff_moving" || stage === "helping") return "warning";
  if (stage === "resolved") return "success";
  return "secondary";
}

function eventToneClass(tone: EventTone): string {
  if (tone === "success") return "border-success/30 bg-success-bg/70 text-success";
  if (tone === "warning") return "border-warning/30 bg-warning-bg/70 text-warning";
  if (tone === "error") return "border-critical/30 bg-critical-bg/70 text-critical";
  return "border-border/70 bg-muted/40 text-muted-foreground";
}

function rectStyle(room: DemoTheaterRoomView): CSSProperties {
  return {
    left: `${room.slot.rect.x}%`,
    top: `${room.slot.rect.y}%`,
    width: `${room.slot.rect.width}%`,
    height: `${room.slot.rect.height}%`,
  };
}

function localBoardPosition(room: DemoTheaterRoomView, offset: DemoTheaterPosition): DemoTheaterPosition {
  return {
    x: room.slot.rect.x + (offset.x / 100) * room.slot.rect.width,
    y: room.slot.rect.y + (offset.y / 100) * room.slot.rect.height,
  };
}

function actorStyle(position: DemoTheaterPosition): CSSProperties {
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
  };
}

function walkDirection(from: DemoTheaterPosition, to: DemoTheaterPosition): DemoDirection {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX >= 0 ? "east" : "west";
  return deltaY >= 0 ? "south" : "north";
}

function staffAssetForUser(staff: UserSearchResult) {
  return staff.id % 2 === 0 ? demoTheaterAssets.staff.maleNurse : demoTheaterAssets.staff.nurse;
}

function staffFramesForState(
  staff: UserSearchResult,
  state: DemoStaffVisualState,
  direction: DemoDirection,
): string[] {
  const assetSet = staffAssetForUser(staff);
  if (state === "phone") return assetSet.phone.south;
  if (state === "walking") return assetSet.walk[direction];
  return assetSet.idle.south;
}

function roomToneClass(room: DemoTheaterRoomView, roomTone: ReturnType<typeof roomToneForStage>): string {
  if (!room.isSelected) return "demo-room-normal";
  if (roomTone === "danger") return "demo-room-danger";
  if (roomTone === "accepted") return "demo-room-accepted";
  if (roomTone === "response") return "demo-room-response";
  if (roomTone === "resolved") return "demo-room-resolved";
  return "demo-room-selected";
}

function AnimatedSprite({
  frames,
  alt,
  className,
  intervalMs = 180,
}: {
  frames: string[];
  alt: string;
  className?: string;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const frameSrc = frames[index % frames.length] ?? frames[0];

  useEffect(() => {
    if (frames.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [frames, intervalMs]);

  if (!frameSrc) return null;

  return (
    <img
      alt={alt}
      className={cn("pointer-events-none select-none object-contain [image-rendering:pixelated]", className)}
      draggable={false}
      src={frameSrc}
    />
  );
}

function RoomRoleIcon({ role }: { role: DemoTheaterRoomRole }) {
  if (role === "nurse_station") return <Hospital className="h-3.5 w-3.5" />;
  if (role === "therapy") return <Activity className="h-3.5 w-3.5" />;
  if (role === "shared_care") return <Stethoscope className="h-3.5 w-3.5" />;
  if (role === "dining") return <UsersRound className="h-3.5 w-3.5" />;
  return <Map className="h-3.5 w-3.5" />;
}

function RoomFurniture({
  room,
  acFrames,
  deviceStates,
}: {
  room: DemoTheaterRoomView;
  acFrames: string[];
  deviceStates: Record<DeviceKind, boolean>;
}) {
  if (room.slot.role === "nurse_station") {
    return (
      <>
        <AnimatedSprite
          alt="Nurse station console"
          className="absolute bottom-[13%] left-[5%] h-[47%] w-[48%]"
          frames={[demoTheaterAssets.props.nurseStation]}
        />
        <AnimatedSprite
          alt="Operation light"
          className="absolute right-[10%] top-[15%] h-[28%] w-[28%]"
          frames={[demoTheaterAssets.props.ceilingLight]}
        />
        <AnimatedSprite
          alt="ECG screen"
          className="absolute bottom-[13%] right-[9%] h-[24%] w-[26%]"
          frames={[demoTheaterAssets.props.ecgScreen]}
        />
      </>
    );
  }

  if (room.slot.role === "therapy") {
    return (
      <>
        <AnimatedSprite
          alt="Therapy bed"
          className="absolute bottom-[12%] left-[8%] h-[34%] w-[42%]"
          frames={[demoTheaterAssets.props.bedH]}
        />
        <AnimatedSprite
          alt="IV stand"
          className="absolute right-[11%] top-[18%] h-[32%] w-[24%]"
          frames={[demoTheaterAssets.props.ivStand]}
        />
        <AnimatedSprite
          alt="ECG cart"
          className="absolute right-[7%] bottom-[10%] h-[31%] w-[32%]"
          frames={[demoTheaterAssets.props.ecgCart]}
        />
      </>
    );
  }

  if (room.slot.role === "shared_care" || room.slot.role === "dining") {
    return (
      <>
        <AnimatedSprite
          alt="Care chair"
          className="absolute bottom-[14%] left-[8%] h-[34%] w-[34%]"
          frames={[demoTheaterAssets.props.chair]}
        />
        <AnimatedSprite
          alt="Cabinet"
          className="absolute bottom-[14%] right-[9%] h-[34%] w-[30%]"
          frames={[demoTheaterAssets.props.cabinet]}
        />
        <AnimatedSprite
          alt="Flower"
          className="absolute right-[36%] top-[18%] h-[24%] w-[24%]"
          frames={[demoTheaterAssets.props.flower]}
        />
      </>
    );
  }

  return (
    <>
      <AnimatedSprite
        alt="Patient bed"
        className="absolute left-[5%] top-[30%] h-[34%] w-[39%]"
        frames={[demoTheaterAssets.props.bedH]}
      />
      <AnimatedSprite
        alt="Bedside table"
        className="absolute left-[41%] top-[34%] h-[19%] w-[18%]"
        frames={[demoTheaterAssets.props.table]}
      />
      <AnimatedSprite
        alt="Room light"
        className={cn(
          "absolute right-[9%] top-[10%] h-[19%] w-[20%]",
          room.isSelected && deviceStates.light
            ? "opacity-100 drop-shadow-[0_0_18px_rgba(250,204,21,0.9)]"
            : "opacity-45",
        )}
        frames={[demoTheaterAssets.props.light]}
      />
      <div
        className={cn(
          "absolute right-[12%] top-[36%] flex h-8 w-8 items-center justify-center rounded-[3px] border border-[var(--demo-line)] bg-black/45 text-cyan-100",
          room.isSelected && deviceStates.fan && "text-cyan-200",
        )}
      >
        <Fan className={cn("h-5 w-5", room.isSelected && deviceStates.fan && "demo-fan-on")} />
      </div>
      <AnimatedSprite
        alt="Air conditioner"
        className={cn(
          "absolute bottom-[12%] right-[7%] h-[20%] w-[25%]",
          room.isSelected && deviceStates.ac
            ? "opacity-100 drop-shadow-[0_0_14px_rgba(103,232,249,0.85)]"
            : "opacity-55",
        )}
        frames={room.isSelected ? acFrames : demoTheaterAssets.devices.airconIdle}
        intervalMs={130}
      />
    </>
  );
}

function PatientActor({
  patient,
  index,
  selectedPatientId,
  visualState,
}: {
  patient: Patient;
  index: number;
  selectedPatientId: number | null;
  visualState: DemoPatientVisualState;
}) {
  const isSelected = patient.id === selectedPatientId;
  const offset = isSelected ? PATIENT_ROOM_OFFSETS[0] : PATIENT_ROOM_OFFSETS[(index + 1) % PATIENT_ROOM_OFFSETS.length];
  const assetKey = patientAssetKeyForProfile(
    {
      id: patient.id,
      name: patientName(patient),
      gender: patient.gender,
      mobility_type: patient.mobility_type,
      care_level: patient.care_level,
    },
    index,
  );
  const frames = demoTheaterAssets.patients[assetKey][isSelected ? visualState : "idle"];

  return (
    <div
      className={cn(
        "absolute z-20 h-[44%] w-[31%] -translate-x-1/2 -translate-y-1/2",
        isSelected && visualState === "falling" && "scale-125",
        !isSelected && "opacity-90",
      )}
      style={actorStyle(offset)}
    >
      <AnimatedSprite
        alt={patientName(patient)}
        className="h-full w-full"
        frames={frames}
        intervalMs={isSelected && visualState === "falling" ? 145 : 220}
      />
      <div className="demo-nameplate absolute -bottom-2 left-1/2 max-w-[8.5rem] -translate-x-1/2 truncate px-2 py-1 text-[9px]">
        {patientName(patient)}
      </div>
    </div>
  );
}

function TheaterRoom({
  room,
  roomTone,
  patientVisual,
  selectedPatientId,
  acFrames,
  deviceStates,
}: {
  room: DemoTheaterRoomView;
  roomTone: ReturnType<typeof roomToneForStage>;
  patientVisual: DemoPatientVisualState;
  selectedPatientId: number | null;
  acFrames: string[];
  deviceStates: Record<DeviceKind, boolean>;
}) {
  const visiblePatients = room.patients.slice(0, 3);
  const extraPatientCount = Math.max(0, room.patients.length - visiblePatients.length);

  return (
    <div
      className={cn("demo-theater-room absolute", roomToneClass(room, roomTone))}
      data-role={room.slot.role}
      style={rectStyle(room)}
    >
      <div className={cn("demo-door", `demo-door-${room.slot.door}`)} />
      <div className="demo-room-label">
        <RoomRoleIcon role={room.slot.role} />
        <span className="min-w-0 truncate">{room.label}</span>
      </div>
      <div className="demo-room-meta">
        <span>{roomOccupancyLabel(room)}</span>
        {room.devices.length > 0 && <span>{room.devices.length} devices</span>}
      </div>
      <RoomFurniture acFrames={acFrames} deviceStates={deviceStates} room={room} />
      {visiblePatients.map((patient, index) => (
        <PatientActor
          index={index}
          key={patient.id}
          patient={patient}
          selectedPatientId={selectedPatientId}
          visualState={patientVisual}
        />
      ))}
      {extraPatientCount > 0 && (
        <div className="demo-room-overflow">+{extraPatientCount}</div>
      )}
    </div>
  );
}

function StaffActor({
  staffView,
  index,
  selectedStaffId,
  selectedRoom,
  stage,
  staffVisual,
}: {
  staffView: DemoTheaterStaffView;
  index: number;
  selectedStaffId: number | null;
  selectedRoom: DemoTheaterRoomView | null;
  stage: DemoTheaterStage;
  staffVisual: DemoStaffVisualState;
}) {
  const isResponder = selectedStaffId != null && staffView.user.id === selectedStaffId;
  const homeRoom = staffView.room;
  const stationPosition = localBoardPosition(homeRoom, STAFF_ROOM_OFFSETS[homeRoom.slot.role][index % STAFF_ROOM_OFFSETS[homeRoom.slot.role].length]);
  const targetRoom = selectedRoom ?? homeRoom;
  const targetPosition = localBoardPosition(targetRoom, STAFF_ROOM_OFFSETS.resident[0]);
  const shouldMove = isResponder && (stage === "staff_moving" || stage === "helping" || stage === "resolved");
  const position = shouldMove ? targetPosition : stationPosition;
  const direction = walkDirection(rectCenter(homeRoom.slot.rect), targetPosition);
  const frames = staffFramesForState(staffView.user, isResponder ? staffVisual : "idle", direction);

  return (
    <div
      className={cn(
        "absolute z-30 h-[12.5%] w-[6.5%] -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-[3400ms] ease-in-out",
        isResponder && "drop-shadow-[0_0_16px_rgba(103,232,249,0.42)]",
      )}
      style={actorStyle(position)}
    >
      <AnimatedSprite
        alt={staffView.user.display_name}
        className="h-full w-full"
        frames={frames}
        intervalMs={staffVisual === "walking" && isResponder ? 120 : 190}
      />
      <div className="demo-nameplate absolute -bottom-2 left-1/2 max-w-[8rem] -translate-x-1/2 truncate px-2 py-1 text-[9px]">
        {staffView.user.display_name}
      </div>
    </div>
  );
}

export default function DemoTheaterClient() {
  const queryClient = useQueryClient();
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [stage, setStage] = useState<DemoTheaterStage>("idle");
  const [currentAlertId, setCurrentAlertId] = useState<number | null>(null);
  const [currentTask, setCurrentTask] = useState<CreateWorkflowTaskResponse | null>(null);
  const [staffArrived, setStaffArrived] = useState(false);
  const [dispatchRunning, setDispatchRunning] = useState(false);
  const [deviceStates, setDeviceStates] = useState<Record<DeviceKind, boolean>>(initialDeviceStates);
  const dispatchStartedRef = useRef(false);
  const timeoutRefs = useRef<number[]>([]);
  const [events, setEvents] = useState<TheaterEvent[]>([
    {
      id: eventId("ready"),
      label: "Ready",
      detail: "Expanded pixel nursing-home board loaded.",
      tone: "info",
      at: nowLabel(),
    },
  ]);

  const patientsQuery = useQuery({
    queryKey: ["demo-theater", "patients"],
    queryFn: () => api.listPatients({ limit: 50, is_active: true }),
  });
  const roomsQuery = useQuery({
    queryKey: ["demo-theater", "rooms"],
    queryFn: () => api.listRooms(),
  });
  const staffQuery = useQuery({
    queryKey: ["demo-theater", "staff"],
    queryFn: () => api.searchUsers({ roles: "observer,supervisor,head_nurse,admin", limit: 50 }),
  });
  const devicesQuery = useQuery({
    queryKey: ["demo-theater", "smart-devices"],
    queryFn: () => api.listSmartDevices(),
  });
  const demoStateQuery = useQuery({
    queryKey: ["demo-theater", "state"],
    queryFn: () => api.getDemoControlState(),
    refetchInterval: 5000,
  });
  const alertQuery = useQuery({
    queryKey: ["demo-theater", "alert", currentAlertId],
    queryFn: () => api.getAlert(currentAlertId as number),
    enabled: currentAlertId != null,
    refetchInterval: currentAlertId == null || stage === "resolved" ? false : 2500,
  });

  const patients = useMemo(() => (patientsQuery.data ?? []) as Patient[], [patientsQuery.data]);
  const rooms = useMemo(() => (roomsQuery.data ?? []) as Room[], [roomsQuery.data]);
  const staffUsers = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);
  const smartDevices = useMemo(() => (devicesQuery.data ?? []) as SmartDevice[], [devicesQuery.data]);
  const demoActors = useMemo(() => (demoStateQuery.data?.actors ?? []) as DemoActorOut[], [demoStateQuery.data?.actors]);
  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  );
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedPatient?.room_id) ?? null,
    [rooms, selectedPatient?.room_id],
  );
  const selectedStaff = useMemo(
    () => staffUsers.find((staff) => staff.is_active && staff.role !== "admin") ?? staffUsers[0] ?? null,
    [staffUsers],
  );
  const theaterRooms = useMemo(
    () =>
      buildDemoTheaterRooms({
        rooms,
        patients,
        smartDevices,
        selectedPatientId,
      }),
    [patients, rooms, selectedPatientId, smartDevices],
  );
  const theaterStaff = useMemo(
    () =>
      buildDemoTheaterStaff({
        rooms: theaterRooms,
        staffUsers,
        demoActors,
      }),
    [demoActors, staffUsers, theaterRooms],
  );

  const selectedTheaterRoom = useMemo(
    () => theaterRooms.find((room) => room.isSelected) ?? null,
    [theaterRooms],
  );
  const patientVisual = patientVisualStateForStage(stage);
  const staffVisual = staffVisualStateForStage(stage);
  const roomTone = roomToneForStage(stage);
  const phoneHref = currentAlertId ? `/mobile-alert?alert=${currentAlertId}` : "/mobile-alert";
  const activeAlertStatus = alertQuery.data?.status ?? (currentAlertId ? "active" : "none");
  const activeTaskStatus = currentTask?.status ?? "none";
  const isBusy = dispatchRunning || patientsQuery.isLoading || roomsQuery.isLoading;
  const residentRoomCount = theaterRooms.filter((room) => room.slot.role === "resident").length;
  const occupiedRoomCount = theaterRooms.filter((room) => room.slot.role === "resident" && room.patients.length > 0).length;
  const acFrames = deviceStates.ac
    ? demoTheaterAssets.devices.airconActive
    : demoTheaterAssets.devices.airconIdle;

  const clearDispatchTimers = useCallback(() => {
    timeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutRefs.current = [];
  }, []);

  useEffect(() => clearDispatchTimers, [clearDispatchTimers]);

  const pushEvent = useCallback((label: string, detail: string, tone: EventTone = "info") => {
    setEvents((current) => [
      { id: eventId("event"), label, detail, tone, at: nowLabel() },
      ...current.slice(0, 9),
    ]);
  }, []);

  useEffect(() => {
    if (selectedPatientId != null || patients.length === 0) return;
    const preferred =
      patients.find((patient) => {
        const name = patientName(patient).toLowerCase();
        return name.includes("emika") || name.includes("krit");
      }) ?? patients[0];
    setSelectedPatientId(preferred.id);
  }, [patients, selectedPatientId]);

  useEffect(() => {
    if (currentAlertId == null) return;
    const nextStage = deriveStageFromSystemState({
      alertStatus: alertQuery.data?.status,
      taskStatus: currentTask?.status,
      staffArrived,
    });
    if (nextStage === "idle") return;
    setStage((current) => {
      if (current === "resolved") return current;
      if (current === "helping" && nextStage !== "resolved") return current;
      if (current === "staff_moving" && nextStage === "acknowledged") return current;
      return nextStage;
    });
  }, [alertQuery.data?.status, currentAlertId, currentTask?.status, staffArrived]);

  const createResponseTask = useCallback(
    async (patient: Patient, emergencyLabel: string) => {
      const task = await api.createWorkflowTask({
        patient_id: patient.id,
        title: `Emergency response: ${patientName(patient)}`,
        description: `${emergencyLabel} in ${roomName(selectedRoom)} from demo theater.`,
        priority: "critical",
        due_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        assigned_role: "observer",
      });
      setCurrentTask(task);
      return task;
    },
    [selectedRoom],
  );

  const resetLocalScenario = useCallback(() => {
    clearDispatchTimers();
    dispatchStartedRef.current = false;
    setCurrentAlertId(null);
    setCurrentTask(null);
    setDispatchRunning(false);
    setStaffArrived(false);
    setStage("idle");
  }, [clearDispatchTimers]);

  const invalidateTheaterQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["demo-theater"] }),
      queryClient.invalidateQueries({ queryKey: ["observer", "alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard", "alerts"] }),
    ]);
  }, [queryClient]);

  const beginStaffDispatch = useCallback(async () => {
    if (!selectedPatient || currentAlertId == null || dispatchStartedRef.current) return;

    dispatchStartedRef.current = true;
    setDispatchRunning(true);
    setStaffArrived(false);
    setStage("staff_moving");
    pushEvent("Staff dispatched", `${selectedStaff?.display_name ?? "Caregiver"} is moving to ${roomName(selectedRoom)}.`, "warning");

    if (currentTask?.id) {
      try {
        const advanced = await api.advanceDemoWorkflow("task", currentTask.id, {
          action: "start",
          note: "Demo theater caregiver accepted the alert.",
        });
        setCurrentTask((task) => (task ? { ...task, status: advanced.status } : task));
      } catch (error) {
        pushEvent("Task start failed", errorMessage(error), "error");
      }
    }

    const targetRoomId = selectedPatient.room_id ?? rooms[0]?.id;
    if (selectedStaff && targetRoomId) {
      try {
        await api.moveDemoActor("staff", selectedStaff.id, {
          room_id: targetRoomId,
          note: "Demo theater dispatch to emergency room",
        });
      } catch (error) {
        pushEvent("Actor move failed", errorMessage(error), "error");
      }
    }

    const arriveTimeout = window.setTimeout(() => {
      setStaffArrived(true);
      setStage("helping");
      pushEvent("Care in room", `${selectedStaff?.display_name ?? "Caregiver"} reached ${roomName(selectedRoom)}.`, "success");
    }, 3600);

    const completeTimeout = window.setTimeout(() => {
      void (async () => {
        try {
          if (currentTask?.id) {
            const completed = await api.advanceDemoWorkflow("task", currentTask.id, {
              action: "complete",
              note: "Demo theater response completed.",
            });
            setCurrentTask((task) => (task ? { ...task, status: completed.status } : task));
          }
          await api.resolveAlert(currentAlertId, {
            resolution_note: "Demo theater response completed.",
          });
          setStage("resolved");
          pushEvent("Resolved", `Alert #${currentAlertId} resolved and task completed.`, "success");
          await invalidateTheaterQueries();
        } catch (error) {
          pushEvent("Resolve failed", errorMessage(error), "error");
        } finally {
          setDispatchRunning(false);
        }
      })();
    }, 5400);

    timeoutRefs.current.push(arriveTimeout, completeTimeout);
  }, [
    currentAlertId,
    currentTask?.id,
    invalidateTheaterQueries,
    pushEvent,
    rooms,
    selectedPatient,
    selectedRoom,
    selectedStaff,
  ]);

  useEffect(() => {
    if (stage !== "acknowledged" || dispatchStartedRef.current) return;
    void beginStaffDispatch();
  }, [beginStaffDispatch, stage]);

  async function triggerFall() {
    if (!selectedPatient) return;
    resetLocalScenario();
    setStage("alert_active");
    pushEvent("Fall detected", `${patientName(selectedPatient)} fell in ${roomName(selectedRoom)}.`, "error");
    try {
      const alert = await api.triggerDemoPatientFall(selectedPatient.id, {
        action: "fall",
        note: "Demo theater fall detected",
      });
      setCurrentAlertId(alert.alert_id);
      await createResponseTask(selectedPatient, "Fall detected");
      await invalidateTheaterQueries();
    } catch (error) {
      setStage("idle");
      pushEvent("Fall trigger failed", errorMessage(error), "error");
    }
  }

  async function triggerSos() {
    if (!selectedPatient) return;
    resetLocalScenario();
    setStage("alert_active");
    pushEvent("SOS requested", `${patientName(selectedPatient)} requested emergency help.`, "error");
    try {
      const alert = await api.createAlert({
        patient_id: selectedPatient.id,
        alert_type: "emergency_sos",
        severity: "critical",
        title: "Demo Emergency SOS",
        description: `Patient requested emergency help from ${roomName(selectedRoom)}.`,
        data: {
          source: "demo_theater",
          room_id: selectedPatient.room_id,
          room_name: roomName(selectedRoom),
        },
      });
      setCurrentAlertId(alert.id);
      await createResponseTask(selectedPatient, "Emergency SOS");
      await invalidateTheaterQueries();
    } catch (error) {
      setStage("idle");
      pushEvent("SOS trigger failed", errorMessage(error), "error");
    }
  }

  async function acknowledgeFromProjector() {
    if (currentAlertId == null) return;
    try {
      await api.acknowledgeAlert(currentAlertId, { caregiver_id: null });
      setStage("acknowledged");
      pushEvent("Caregiver accepted", `Alert #${currentAlertId} acknowledged.`, "success");
      await invalidateTheaterQueries();
    } catch (error) {
      pushEvent("Acknowledge failed", errorMessage(error), "error");
    }
  }

  async function resetWorkspace() {
    resetLocalScenario();
    setDeviceStates(initialDeviceStates);
    try {
      await api.resetDemoWorkspace({ profile: "show-demo" });
      pushEvent("Workspace reset", "Show-demo data reset.", "success");
      await invalidateTheaterQueries();
    } catch (error) {
      pushEvent("Reset failed", errorMessage(error), "error");
    }
  }

  function findDevice(kind: DeviceKind): SmartDevice | null {
    const roomId = selectedPatient?.room_id ?? null;
    const activeDevices = smartDevices.filter((device) => device.is_active && matchesDeviceKind(device, kind));
    return activeDevices.find((device) => roomId != null && device.room_id === roomId) ?? activeDevices[0] ?? null;
  }

  async function toggleDevice(kind: DeviceKind) {
    const nextEnabled = !deviceStates[kind];
    setDeviceStates((current) => ({ ...current, [kind]: nextEnabled }));
    const device = findDevice(kind);
    if (!device) {
      pushEvent(`${kind.toUpperCase()} visual`, "No mapped HA device found, board visual changed only.", "warning");
      return;
    }
    try {
      await api.controlSmartDevice(device.id, {
        action: nextEnabled ? "turn_on" : "turn_off",
        parameters: { source: "demo_theater" },
      });
      pushEvent(
        `${device.name}`,
        `${nextEnabled ? "Turned on" : "Turned off"} through Home Assistant control API.`,
        "success",
      );
      await queryClient.invalidateQueries({ queryKey: ["demo-theater", "smart-devices"] });
    } catch (error) {
      pushEvent(`${device.name}`, errorMessage(error), "error");
    }
  }

  return (
    <div className="demo-theater-shell min-h-[calc(100vh-5rem)] bg-[var(--demo-bg)] text-slate-100">
      <style>{`
        @font-face {
          font-family: DemoPixel;
          src: url("${demoTheaterAssets.fontUrl}") format("truetype");
          font-display: swap;
        }
        .demo-theater-shell {
          --demo-bg: #0f1215;
          --demo-panel: #171c20;
          --demo-panel-2: #101317;
          --demo-line: rgba(203, 213, 225, 0.32);
          --demo-pixel-border: #9fb6c7;
          --demo-floor: #30362f;
          --demo-hall: #232a2d;
          --demo-cyan: #9beef6;
          --demo-amber: #f6cf73;
          --demo-danger: #f87171;
          --demo-success: #6ee7b7;
          font-family: DemoPixel, ui-monospace, SFMono-Regular, Menlo, monospace;
          letter-spacing: 0;
        }
        .demo-pixel {
          font-family: DemoPixel, ui-monospace, SFMono-Regular, Menlo, monospace;
          letter-spacing: 0;
        }
        .demo-theater-board {
          background:
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(0deg, rgba(255,255,255,0.025) 1px, transparent 1px),
            var(--demo-floor);
          background-size: 24px 24px;
        }
        .demo-theater-board::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.28;
          background-image: url(${demoTheaterAssets.props.ground});
          background-repeat: repeat;
          background-size: 64px 64px;
          image-rendering: pixelated;
        }
        .demo-hall {
          position: absolute;
          border: 3px dashed rgba(218, 228, 235, 0.72);
          background: rgba(20, 26, 29, 0.62);
          box-shadow: inset 0 0 0 4px rgba(10, 13, 15, 0.18);
        }
        .demo-hall-horizontal-top { left: 4%; right: 4%; top: 31.5%; height: 5.6%; }
        .demo-hall-horizontal-bottom { left: 4%; right: 4%; top: 62.4%; height: 5.6%; }
        .demo-hall-vertical { left: 48.4%; width: 3.2%; top: 7%; bottom: 8%; }
        .demo-hall-label {
          position: absolute;
          left: 50%;
          top: 48.5%;
          transform: translate(-50%, -50%);
          color: #dbeafe;
          font-size: 10px;
          text-shadow: 0 2px 0 #000;
          background: rgba(0,0,0,0.38);
          border: 1px solid rgba(255,255,255,0.14);
          padding: 4px 8px;
          border-radius: 3px;
        }
        .demo-theater-room {
          border: 3px solid var(--demo-pixel-border);
          border-radius: 4px;
          overflow: hidden;
          box-shadow: inset 0 0 0 4px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.06);
        }
        .demo-theater-room::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.34;
          pointer-events: none;
          background:
            linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px),
            linear-gradient(0deg, rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 18px 18px;
        }
        .demo-theater-room[data-role="resident"] { background: #6e604c; }
        .demo-theater-room[data-role="nurse_station"] { background: #3d5560; }
        .demo-theater-room[data-role="therapy"] { background: #5a5143; }
        .demo-theater-room[data-role="shared_care"] { background: #4d563d; }
        .demo-theater-room[data-role="dining"] { background: #5b4b3d; }
        .demo-room-label {
          position: absolute;
          z-index: 25;
          left: 8px;
          top: 8px;
          display: flex;
          max-width: calc(100% - 16px);
          align-items: center;
          gap: 5px;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 3px;
          background: rgba(0,0,0,0.58);
          color: white;
          font-size: 10px;
          line-height: 1;
          padding: 6px 7px;
          text-shadow: 0 2px 0 #000;
        }
        .demo-room-meta {
          position: absolute;
          z-index: 24;
          left: 8px;
          right: 8px;
          bottom: 7px;
          display: flex;
          justify-content: space-between;
          gap: 6px;
          color: rgba(226, 232, 240, 0.82);
          font-size: 8px;
          text-shadow: 0 2px 0 #000;
        }
        .demo-door {
          position: absolute;
          z-index: 26;
          background: var(--demo-hall);
          border: 2px solid rgba(218, 228, 235, 0.72);
        }
        .demo-door-bottom,
        .demo-door-top {
          left: 48%;
          width: 18%;
          height: 7px;
        }
        .demo-door-bottom { bottom: -4px; border-top: 0; }
        .demo-door-top { top: -4px; border-bottom: 0; }
        .demo-door-left,
        .demo-door-right {
          top: 48%;
          width: 7px;
          height: 20%;
        }
        .demo-door-left { left: -4px; border-right: 0; }
        .demo-door-right { right: -4px; border-left: 0; }
        .demo-room-normal { border-color: rgba(185, 205, 218, 0.72); }
        .demo-room-selected { border-color: var(--demo-cyan); box-shadow: inset 0 0 0 4px rgba(103,232,249,0.18), 0 0 18px rgba(103,232,249,0.24); }
        .demo-room-danger { animation: demo-room-pulse 0.85s steps(2, end) infinite; border-color: var(--demo-danger); }
        .demo-room-accepted { border-color: var(--demo-amber); box-shadow: inset 0 0 0 4px rgba(250,204,21,0.2), 0 0 22px rgba(250,204,21,0.24); }
        .demo-room-response { border-color: var(--demo-cyan); box-shadow: inset 0 0 0 4px rgba(103,232,249,0.22), 0 0 24px rgba(103,232,249,0.3); }
        .demo-room-resolved { border-color: var(--demo-success); box-shadow: inset 0 0 0 4px rgba(52,211,153,0.2), 0 0 20px rgba(52,211,153,0.28); }
        .demo-nameplate {
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 3px;
          background: rgba(0,0,0,0.66);
          color: white;
          line-height: 1;
          text-align: center;
          text-shadow: 0 2px 0 #000;
        }
        .demo-room-overflow {
          position: absolute;
          z-index: 28;
          right: 8px;
          bottom: 22px;
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: 3px;
          background: rgba(0,0,0,0.6);
          color: white;
          font-size: 9px;
          padding: 4px 5px;
        }
        .demo-panel {
          border: 3px solid rgba(159, 182, 199, 0.48);
          border-radius: 6px;
          background:
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(0deg, rgba(255,255,255,0.025) 1px, transparent 1px),
            var(--demo-panel);
          background-size: 18px 18px;
          box-shadow: inset 0 0 0 3px rgba(0,0,0,0.16);
        }
        .demo-control {
          border-radius: 4px !important;
          font-family: DemoPixel, ui-monospace, SFMono-Regular, Menlo, monospace;
          letter-spacing: 0;
        }
        .demo-fan-on { animation: demo-spin 0.65s linear infinite; }
        @keyframes demo-room-pulse {
          0%, 100% { box-shadow: inset 0 0 0 4px rgba(248, 113, 113, 0.32), 0 0 0 rgba(248, 113, 113, 0); }
          50% { box-shadow: inset 0 0 0 4px rgba(248, 113, 113, 0.32), 0 0 34px rgba(248, 113, 113, 0.62); }
        }
        @keyframes demo-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .demo-room-danger,
          .demo-fan-on {
            animation: none;
          }
        }
      `}</style>

      <section className="border-b-4 border-[var(--demo-line)] bg-[var(--demo-panel)] px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase text-[var(--demo-cyan)]">
              <img alt="" className="h-7 w-7 [image-rendering:pixelated]" src={demoTheaterAssets.brand} />
              WheelSense Demo Theater
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white md:text-3xl">
              Nursing Home Emergency Response
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={statusBadgeVariant(stage)}>{demoStepLabel(stage)}</Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">
              Alert {activeAlertStatus}
            </Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">
              Task {activeTaskStatus}
            </Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">
              Rooms {occupiedRoomCount}/{residentRoomCount}
            </Badge>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <div className="demo-theater-board relative h-[560px] overflow-hidden rounded-[6px] border-4 border-[var(--demo-pixel-border)] shadow-2xl md:h-[620px] 2xl:aspect-[16/9] 2xl:h-auto 2xl:min-h-[480px]">
            <div className="demo-hall demo-hall-horizontal-top" />
            <div className="demo-hall demo-hall-horizontal-bottom" />
            <div className="demo-hall demo-hall-vertical" />
            <div className="demo-hall-label">Main Hallway</div>

            {theaterRooms.map((room) => (
              <TheaterRoom
                acFrames={acFrames}
                deviceStates={deviceStates}
                key={room.slot.id}
                patientVisual={patientVisual}
                room={room}
                roomTone={roomTone}
                selectedPatientId={selectedPatientId}
              />
            ))}

            {theaterStaff.map((staffView, index) => (
              <StaffActor
                index={index}
                key={staffView.user.id}
                selectedRoom={selectedTheaterRoom}
                selectedStaffId={selectedStaff?.id ?? null}
                staffView={staffView}
                staffVisual={staffVisual}
                stage={stage}
              />
            ))}

            <div className="absolute bottom-3 left-3 right-3 z-40 hidden gap-2 md:grid md:grid-cols-5">
              <div className="rounded-[3px] border border-white/10 bg-black/62 px-3 py-2 text-[10px] text-slate-200">
                Patient: {patientName(selectedPatient)}
              </div>
              <div className="rounded-[3px] border border-white/10 bg-black/62 px-3 py-2 text-[10px] text-slate-200">
                Room: {roomName(selectedRoom)}
              </div>
              <div className="rounded-[3px] border border-white/10 bg-black/62 px-3 py-2 text-[10px] text-slate-200">
                Alert: {currentAlertId ? `#${currentAlertId}` : "None"}
              </div>
              <div className="rounded-[3px] border border-white/10 bg-black/62 px-3 py-2 text-[10px] text-slate-200">
                Patients: {patients.length}
              </div>
              <div className="rounded-[3px] border border-white/10 bg-black/62 px-3 py-2 text-[10px] text-slate-200">
                Staff: {theaterStaff.length}
              </div>
            </div>
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <section className="demo-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Scenario</h2>
                <p className="text-sm text-slate-400">3 to 5 minute judge view</p>
              </div>
              <MonitorSmartphone className="h-5 w-5 text-[var(--demo-cyan)]" />
            </div>

            <label className="mb-2 block text-xs font-semibold uppercase text-slate-400" htmlFor="demo-patient">
              Patient
            </label>
            <select
              className="demo-control mb-3 h-11 w-full border border-white/15 bg-[var(--demo-panel-2)] px-3 text-sm text-white outline-none focus:border-cyan-300"
              disabled={patients.length === 0}
              id="demo-patient"
              onChange={(event) => setSelectedPatientId(Number(event.target.value))}
              value={selectedPatientId ?? ""}
            >
              {patients.map((patient) => {
                const patientRoom = rooms.find((room) => room.id === patient.room_id) ?? null;
                return (
                  <option key={patient.id} value={patient.id}>
                    {patientName(patient)} - {roomName(patientRoom)}
                  </option>
                );
              })}
            </select>

            <div className="grid gap-2">
              <Button className="demo-control justify-start" disabled={!selectedPatient || isBusy} onClick={() => void triggerFall()}>
                <AlertTriangle className="h-4 w-4" />
                Trigger fall
              </Button>
              <Button
                className="demo-control justify-start"
                disabled={!selectedPatient || isBusy}
                onClick={() => void triggerSos()}
                variant="destructive"
              >
                <BellRing className="h-4 w-4" />
                Request emergency
              </Button>
              <Button
                className="demo-control justify-start"
                disabled={currentAlertId == null || stage === "resolved"}
                onClick={() => void acknowledgeFromProjector()}
                variant="secondary"
              >
                <UserCheck className="h-4 w-4" />
                Simulate accept
              </Button>
              <Button className="demo-control justify-start" onClick={() => void resetWorkspace()} variant="outline">
                <RotateCcw className="h-4 w-4" />
                Reset demo
              </Button>
            </div>

            <div className="mt-3 rounded-[4px] border border-white/10 bg-black/35 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-300">
                <span>Caregiver phone</span>
                <Link2 className="h-4 w-4 text-[var(--demo-cyan)]" />
              </div>
              <Button asChild className="demo-control w-full justify-start" variant="outline">
                <Link href={phoneHref} target="_blank">
                  <MonitorSmartphone className="h-4 w-4" />
                  Open mobile alert
                </Link>
              </Button>
            </div>
          </section>

          <section className="demo-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Live Cast</h2>
              <UsersRound className="h-5 w-5 text-[var(--demo-cyan)]" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-slate-300">
              <div className="rounded-[3px] border border-white/10 bg-black/30 px-2 py-2">
                <div className="text-base text-white">{patients.length}</div>
                Patients
              </div>
              <div className="rounded-[3px] border border-white/10 bg-black/30 px-2 py-2">
                <div className="text-base text-white">{theaterStaff.length}</div>
                Staff
              </div>
              <div className="rounded-[3px] border border-white/10 bg-black/30 px-2 py-2">
                <div className="text-base text-white">{theaterRooms.length}</div>
                Zones
              </div>
            </div>
          </section>

          <section className="demo-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Smart Devices</h2>
              <Power className="h-5 w-5 text-[var(--demo-cyan)]" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEVICE_CONTROLS.map((control) => {
                const Icon = control.icon;
                const enabled = deviceStates[control.kind];
                const device = findDevice(control.kind);
                return (
                  <button
                    className={cn(
                      "demo-control flex min-h-24 flex-col items-center justify-center gap-2 border text-sm font-semibold transition",
                      enabled
                        ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
                        : "border-white/10 bg-black/30 text-slate-300 hover:border-white/25",
                    )}
                    key={control.kind}
                    onClick={() => void toggleDevice(control.kind)}
                    title={device ? device.name : "Visual only"}
                    type="button"
                  >
                    <Icon className={cn("h-6 w-6", control.kind === "fan" && enabled && "demo-fan-on")} />
                    <span>{control.label}</span>
                    <span className="text-xs font-normal text-slate-400">{enabled ? "On" : "Off"}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="demo-panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Demo Timeline</h2>
              <Play className="h-5 w-5 text-[var(--demo-cyan)]" />
            </div>
            <div className="grid gap-2">
              {events.map((event) => (
                <div className={cn("rounded-[3px] border px-3 py-2", eventToneClass(event.tone))} key={event.id}>
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                    <span>{event.label}</span>
                    <span className="text-xs font-normal opacity-70">{event.at}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 opacity-90">{event.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="demo-panel p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Sequence
            </div>
            <ol className="grid gap-2 text-sm text-slate-300">
              <li>1. Projector shows full nursing-home map</li>
              <li>2. Fall or SOS creates real alert</li>
              <li>3. Phone opens caregiver alert</li>
              <li>4. Accept dispatches staff through hallway</li>
              <li>5. Room devices change through HA API</li>
            </ol>
          </section>
        </aside>
      </main>
    </div>
  );
}
