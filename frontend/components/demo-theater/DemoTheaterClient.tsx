"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Fan,
  Lightbulb,
  Link2,
  MonitorSmartphone,
  Play,
  Power,
  RotateCcw,
  Snowflake,
  UserCheck,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { CreateWorkflowTaskResponse } from "@/lib/api/task-scope-types";
import { demoTheaterAssets, patientAssetKeyForName } from "@/lib/demo-theater/assets";
import {
  demoStepLabel,
  deriveStageFromSystemState,
  patientVisualStateForStage,
  roomToneForStage,
  staffVisualStateForStage,
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
      detail: "Projector board loaded.",
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

  const patientAssetKey = patientAssetKeyForName(patientName(selectedPatient));
  const patientAssets = demoTheaterAssets.patients[patientAssetKey];
  const patientVisual = patientVisualStateForStage(stage);
  const staffVisual = staffVisualStateForStage(stage);
  const roomTone = roomToneForStage(stage);
  const phoneHref = currentAlertId ? `/mobile-alert?alert=${currentAlertId}` : "/mobile-alert";
  const activeAlertStatus = alertQuery.data?.status ?? (currentAlertId ? "active" : "unknown");
  const activeTaskStatus = currentTask?.status ?? "none";
  const isBusy = dispatchRunning || patientsQuery.isLoading || roomsQuery.isLoading;

  const patientFrames = patientAssets[patientVisual];
  const staffFrames =
    staffVisual === "phone"
      ? demoTheaterAssets.staff.nurse.phone.south
      : staffVisual === "walking"
        ? demoTheaterAssets.staff.nurse.walk.west
        : demoTheaterAssets.staff.nurse.idle.south;
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
    <div className="min-h-[calc(100vh-5rem)] bg-[#101317] text-slate-100">
      <style>{`
        @font-face {
          font-family: DemoPixel;
          src: url("${demoTheaterAssets.fontUrl}") format("truetype");
          font-display: swap;
        }
        .demo-pixel {
          font-family: DemoPixel, ui-monospace, SFMono-Regular, Menlo, monospace;
          letter-spacing: 0;
        }
        .demo-room-danger {
          animation: demo-room-pulse 0.85s steps(2, end) infinite;
        }
        .demo-fan-on {
          animation: demo-spin 0.65s linear infinite;
        }
        @keyframes demo-room-pulse {
          0%, 100% { box-shadow: inset 0 0 0 3px rgba(248, 113, 113, 0.95), 0 0 0 rgba(248, 113, 113, 0); }
          50% { box-shadow: inset 0 0 0 3px rgba(248, 113, 113, 0.95), 0 0 34px rgba(248, 113, 113, 0.58); }
        }
        @keyframes demo-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <section className="border-b border-white/10 bg-[#181d21] px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="demo-pixel flex items-center gap-2 text-xs uppercase text-cyan-200">
              <img alt="" className="h-6 w-6 [image-rendering:pixelated]" src={demoTheaterAssets.brand} />
              WheelSense Demo Theater
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white md:text-3xl">
              Nursing Home Emergency Response
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusBadgeVariant(stage)}>{demoStepLabel(stage)}</Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">
              Alert {activeAlertStatus}
            </Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">
              Task {activeTaskStatus}
            </Badge>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <div className="relative aspect-[16/9] min-h-[520px] overflow-hidden rounded-lg border border-white/10 bg-[#28302d] shadow-2xl">
            <div
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage: `url(${demoTheaterAssets.props.ground})`,
                backgroundRepeat: "repeat",
                backgroundSize: "64px 64px",
                imageRendering: "pixelated",
              }}
            />
            <div className="absolute inset-4 rounded-md border-4 border-[#5c4f3d] bg-[#3b3f37]/90" />

            <div
              className={cn(
                "absolute left-[5%] top-[11%] h-[68%] w-[40%] rounded-md border-4 bg-[#74614b]/95",
                roomTone === "danger" && "demo-room-danger",
                roomTone === "accepted" && "border-yellow-300",
                roomTone === "response" && "border-cyan-300",
                roomTone === "resolved" && "border-emerald-300",
                roomTone === "normal" && "border-[#8b7355]",
              )}
            >
              <div className="demo-pixel absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-xs text-white">
                {roomName(selectedRoom)}
              </div>
              <AnimatedSprite
                alt="Patient bed"
                className="absolute left-[7%] top-[25%] h-[33%] w-[38%]"
                frames={[demoTheaterAssets.props.bedH]}
              />
              <AnimatedSprite
                alt="Bedside table"
                className="absolute left-[40%] top-[28%] h-[16%] w-[16%]"
                frames={[demoTheaterAssets.props.table]}
              />
              <AnimatedSprite
                alt="IV stand"
                className="absolute left-[58%] top-[22%] h-[24%] w-[18%]"
                frames={[demoTheaterAssets.props.ivStand]}
              />
              <AnimatedSprite
                alt="ECG cart"
                className="absolute bottom-[9%] left-[8%] h-[24%] w-[22%]"
                frames={[demoTheaterAssets.props.ecgCart]}
              />
              <AnimatedSprite
                alt="Room light"
                className={cn(
                  "absolute right-[10%] top-[12%] h-[16%] w-[16%]",
                  deviceStates.light ? "opacity-100 drop-shadow-[0_0_22px_rgba(250,204,21,0.9)]" : "opacity-35",
                )}
                frames={[demoTheaterAssets.props.light]}
              />
              <div
                className={cn(
                  "absolute right-[10%] top-[34%] flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-slate-900/60 text-cyan-100",
                  deviceStates.fan && "text-cyan-200",
                )}
              >
                <Fan className={cn("h-6 w-6", deviceStates.fan && "demo-fan-on")} />
              </div>
              <AnimatedSprite
                alt="Air conditioner"
                className={cn(
                  "absolute right-[6%] top-[51%] h-[18%] w-[20%]",
                  deviceStates.ac ? "opacity-100 drop-shadow-[0_0_18px_rgba(103,232,249,0.85)]" : "opacity-55",
                )}
                frames={acFrames}
                intervalMs={130}
              />
              <AnimatedSprite
                alt={patientName(selectedPatient)}
                className={cn(
                  "absolute left-[28%] top-[49%] z-20 h-[24%] w-[20%]",
                  patientVisual === "falling" && "scale-125",
                )}
                frames={patientFrames}
                intervalMs={patientVisual === "falling" ? 145 : 210}
              />
            </div>

            <div className="absolute left-[45%] top-[39%] h-[16%] w-[23%] border-y-4 border-dashed border-[#c2b28f]/75 bg-[#2e3430]/80" />
            <div className="demo-pixel absolute left-[51%] top-[43%] text-xs text-slate-300">Hallway</div>

            <div className="absolute right-[5%] top-[11%] h-[32%] w-[31%] rounded-md border-4 border-[#6f8393] bg-[#3d5461]/95">
              <div className="demo-pixel absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-xs text-white">
                Nurse Station
              </div>
              <AnimatedSprite
                alt="Nurse station console"
                className="absolute bottom-[12%] left-[10%] h-[45%] w-[45%]"
                frames={[demoTheaterAssets.props.nurseStation]}
              />
              <AnimatedSprite
                alt="Operation light"
                className="absolute right-[12%] top-[23%] h-[26%] w-[24%]"
                frames={[demoTheaterAssets.props.ceilingLight]}
              />
            </div>

            <div className="absolute bottom-[10%] right-[5%] h-[35%] w-[31%] rounded-md border-4 border-[#7c6b50] bg-[#514936]/95">
              <div className="demo-pixel absolute left-3 top-3 rounded bg-black/50 px-2 py-1 text-xs text-white">
                Shared Care Area
              </div>
              <AnimatedSprite
                alt="Chair"
                className="absolute bottom-[16%] left-[12%] h-[30%] w-[28%]"
                frames={[demoTheaterAssets.props.chair]}
              />
              <AnimatedSprite
                alt="Cabinet"
                className="absolute bottom-[16%] right-[14%] h-[30%] w-[26%]"
                frames={[demoTheaterAssets.props.cabinet]}
              />
            </div>

            <div
              className={cn(
                "absolute z-30 h-[17%] w-[10%] transition-[left,top] duration-[3400ms] ease-in-out",
                stage === "staff_moving" || stage === "helping" || stage === "resolved"
                  ? "left-[30%] top-[47%]"
                  : "left-[74%] top-[25%]",
              )}
            >
              <AnimatedSprite
                alt={selectedStaff?.display_name ?? "Nurse"}
                className="h-full w-full"
                frames={staffFrames}
                intervalMs={staffVisual === "walking" ? 120 : 190}
              />
              <div className="demo-pixel absolute -bottom-3 left-1/2 min-w-24 -translate-x-1/2 rounded bg-black/60 px-2 py-1 text-center text-[10px] text-white">
                {selectedStaff?.display_name ?? "Caregiver"}
              </div>
            </div>

            <div className="absolute bottom-4 left-4 right-4 grid gap-2 md:grid-cols-4">
              <div className="demo-pixel rounded border border-white/10 bg-black/55 px-3 py-2 text-xs text-slate-200">
                Patient: {patientName(selectedPatient)}
              </div>
              <div className="demo-pixel rounded border border-white/10 bg-black/55 px-3 py-2 text-xs text-slate-200">
                Room: {roomName(selectedRoom)}
              </div>
              <div className="demo-pixel rounded border border-white/10 bg-black/55 px-3 py-2 text-xs text-slate-200">
                Alert: {currentAlertId ? `#${currentAlertId}` : "None"}
              </div>
              <div className="demo-pixel rounded border border-white/10 bg-black/55 px-3 py-2 text-xs text-slate-200">
                Actors: {demoStateQuery.data?.actors?.length ?? 0}
              </div>
            </div>
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <section className="rounded-lg border border-white/10 bg-[#181d21] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Scenario</h2>
                <p className="text-sm text-slate-400">3 to 5 minute judge view</p>
              </div>
              <MonitorSmartphone className="h-5 w-5 text-cyan-200" />
            </div>

            <label className="mb-2 block text-xs font-semibold uppercase text-slate-400" htmlFor="demo-patient">
              Patient
            </label>
            <select
              className="mb-3 h-11 w-full rounded-md border border-white/15 bg-[#101317] px-3 text-sm text-white outline-none focus:border-cyan-300"
              disabled={patients.length === 0}
              id="demo-patient"
              onChange={(event) => setSelectedPatientId(Number(event.target.value))}
              value={selectedPatientId ?? ""}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patientName(patient)}
                </option>
              ))}
            </select>

            <div className="grid gap-2">
              <Button className="justify-start" disabled={!selectedPatient || isBusy} onClick={() => void triggerFall()}>
                <AlertTriangle className="h-4 w-4" />
                Trigger fall
              </Button>
              <Button
                className="justify-start"
                disabled={!selectedPatient || isBusy}
                onClick={() => void triggerSos()}
                variant="destructive"
              >
                <BellRing className="h-4 w-4" />
                Request emergency
              </Button>
              <Button
                className="justify-start"
                disabled={currentAlertId == null || stage === "resolved"}
                onClick={() => void acknowledgeFromProjector()}
                variant="secondary"
              >
                <UserCheck className="h-4 w-4" />
                Simulate accept
              </Button>
              <Button className="justify-start" onClick={() => void resetWorkspace()} variant="outline">
                <RotateCcw className="h-4 w-4" />
                Reset demo
              </Button>
            </div>

            <div className="mt-3 rounded-md border border-white/10 bg-black/35 p-3">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm text-slate-300">
                <span>Caregiver phone</span>
                <Link2 className="h-4 w-4 text-cyan-200" />
              </div>
              <Button asChild className="w-full justify-start" variant="outline">
                <Link href={phoneHref} target="_blank">
                  <MonitorSmartphone className="h-4 w-4" />
                  Open mobile alert
                </Link>
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-[#181d21] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Smart Devices</h2>
              <Power className="h-5 w-5 text-cyan-200" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEVICE_CONTROLS.map((control) => {
                const Icon = control.icon;
                const enabled = deviceStates[control.kind];
                const device = findDevice(control.kind);
                return (
                  <button
                    className={cn(
                      "flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border text-sm font-semibold transition",
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

          <section className="rounded-lg border border-white/10 bg-[#181d21] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Demo Timeline</h2>
              <Play className="h-5 w-5 text-cyan-200" />
            </div>
            <div className="grid gap-2">
              {events.map((event) => (
                <div className={cn("rounded-md border px-3 py-2", eventToneClass(event.tone))} key={event.id}>
                  <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                    <span>{event.label}</span>
                    <span className="text-xs font-normal opacity-70">{event.at}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 opacity-90">{event.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-[#181d21] p-4 shadow-xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              Sequence
            </div>
            <ol className="grid gap-2 text-sm text-slate-300">
              <li>1. Projector board ready</li>
              <li>2. Fall or SOS creates real alert</li>
              <li>3. Phone opens caregiver alert</li>
              <li>4. Accept dispatches staff</li>
              <li>5. Room devices change through HA API</li>
            </ol>
          </section>
        </aside>
      </main>
    </div>
  );
}
