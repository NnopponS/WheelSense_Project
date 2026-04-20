"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { useTranslation } from "@/lib/i18n";
import DemoPanel from "@/components/admin/demo-control/DemoPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Send, Shield, Users, AlertTriangle, Route, Trash2 } from "lucide-react";
import type { Patient, Room, User } from "@/lib/types";
import type {
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  ListAlertsResponse,
  CreateAlertRequest
} from "@/lib/api/task-scope-types";

type Tone = "success" | "error" | "info";
type ActorType = "patient" | "staff";
type ItemType = "task" | "schedule" | "directive";
type TargetMode = "role" | "user";

type SimulatorStatusResp = {
  env_mode: string;
  is_simulator: boolean;
  workspace_exists: boolean;
  workspace_id?: number | null;
};

type DemoAlertType = "manual_test" | "abnormal_hr" | "fall" | "low_battery" | "device_offline";

const SIM_PATIENT_ANY = "__any__";

const WORKFLOW_ITEM_OPTIONS: Array<{ value: ItemType; label: string }> = [
  { value: "task", label: "Tasks" },
  { value: "schedule", label: "Schedules" },
  { value: "directive", label: "Directives" },
];

function errText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function ts() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function logId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function displayName(user: User) {
  return user.username;
}

function roomLabel(room: Room) {
  return room.name || `Room #${room.id}`;
}

function valueFromItem(item: CareTaskOut | CareScheduleOut | CareDirectiveOut) {
  if ("title" in item) return item.title;
  return String((item as { id: number }).id);
}

export default function AdminDemoControlPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const patients = useQuery<Patient[]>({
    queryKey: ["demo-control", "patients", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/patients?limit=50", user?.workspace_id) as string)
  }).data ?? [];
  const users = useQuery<User[]>({
    queryKey: ["demo-control", "users", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/users/search?roles=admin,head_nurse,supervisor,observer&limit=100", user?.workspace_id) as string)
  }).data ?? [];
  const rooms = useQuery<Room[]>({
    queryKey: ["demo-control", "rooms", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/rooms?limit=100", user?.workspace_id) as string)
  }).data ?? [];
  const tasks = useQuery<CareTaskOut[]>({
    queryKey: ["demo-control", "tasks", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/workflow/tasks?limit=50", user?.workspace_id) as string)
  }).data ?? [];
  const schedules = useQuery<CareScheduleOut[]>({
    queryKey: ["demo-control", "schedules", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/workflow/schedules?limit=50", user?.workspace_id) as string)
  }).data ?? [];
  const directives = useQuery<CareDirectiveOut[]>({
    queryKey: ["demo-control", "directives", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/workflow/directives?limit=50", user?.workspace_id) as string)
  }).data ?? [];
  const alerts = useQuery<ListAlertsResponse>({
    queryKey: ["demo-control", "alerts", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/alerts?status=active&limit=20", user?.workspace_id) as string)
  }).data ?? [];

  const simStatus = useQuery<SimulatorStatusResp>({
    queryKey: ["demo-control", "simulator-status", user?.workspace_id],
    queryFn: () => api.get("/demo/simulator/status"),
    enabled: user?.role === "admin",
  });

  const [actorType, setActorType] = useState<ActorType>("patient");
  const [actorId, setActorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const note = "Move the selected actor for the walkthrough.";

  const [itemType, setItemType] = useState<ItemType>("task");
  const [itemId, setItemId] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("role");
  const [targetValue, setTargetValue] = useState("supervisor");
  const [workflowNote, setWorkflowNote] = useState("Advance the demo workflow item.");  
  const [snapshotRoomId, setSnapshotRoomId] = useState("");
  
  // Custom Event States
  const [alertPatientId, setAlertPatientId] = useState("");
  const [alertType, setAlertType] = useState<DemoAlertType>("manual_test");
  const [alertSeverity, setAlertSeverity] = useState("warning");
  const [alertTitle, setAlertTitle] = useState("Manual Test Alert");
  const [alertDescription, setAlertDescription] = useState("Triggered from Manual Testing Panel");
  const [alertHrBpm, setAlertHrBpm] = useState("120");

  const [simVitalInterval, setSimVitalInterval] = useState("30");
  const [simAlertProbability, setSimAlertProbability] = useState("0.05");
  const [simHrHigh, setSimHrHigh] = useState("110");
  const [simEnableAlerts, setSimEnableAlerts] = useState(true);
  const [simInjectPatientId, setSimInjectPatientId] = useState(SIM_PATIENT_ANY);

  const [logs, setLogs] = useState<Array<{ id: string; title: string; detail: string; tone: Tone; at: string }>>([
    { id: logId("seed"), title: "Ready", detail: "Manual Testing Control Panel loaded.", tone: "info", at: ts() },
  ]);

  const activePatients: Patient[] = patients.filter((item) => item.is_active);
  const staffUsers: User[] = users.filter((item) => item.role !== "patient");
  const activeTasks: CareTaskOut[] = tasks.filter((item) => item.status !== "completed");
  const activeSchedules: CareScheduleOut[] = schedules.filter((item) => item.status === "scheduled");
  const activeDirectives: CareDirectiveOut[] = directives.filter((item) => item.status === "active");
  const workflowOptions = itemType === "task" ? tasks : itemType === "schedule" ? schedules : directives;
  const itemPreview = workflowOptions.find((item) => String(item.id) === itemId);
  const targetUser = staffUsers.find((item) => String(item.id) === targetValue);
  const targetPreview =
    targetMode === "role"
      ? `Role: ${targetValue || "unset"}`
      : `Person: ${targetUser ? displayName(targetUser) : "unset"}`;

  const selectedAlertPatient = activePatients.find((p) => String(p.id) === alertPatientId);

  function pushLog(title: string, detail: string, tone: Tone) {
    setLogs((current) => [{ id: logId("log"), title, detail, tone, at: ts() }, ...current.slice(0, 11)]);
  }

  async function run(title: string, detail: string, command: () => Promise<unknown>) {
    try {
      await command();
      pushLog(title, detail, "success");
      // Force refresh data
      queryClient.invalidateQueries();
    } catch (error) {
      pushLog(title, errText(error), "error");
    }
  }

  const handleCreateAlert = () => {
    if (!alertPatientId) return;
    const care = selectedAlertPatient?.care_level ?? "normal";
    const bpm = Math.max(40, Math.min(220, Number(alertHrBpm) || 120));
    let title = alertTitle.trim() || "Alert";
    let description = alertDescription.trim() || "Triggered from Manual Testing Panel";
    let severity = alertSeverity as "low" | "warning" | "critical";
    if (alertType === "abnormal_hr") {
      title = alertTitle.trim() || `High Heart Rate: ${bpm} BPM`;
      description =
        alertDescription.trim() ||
        `Patient showing elevated heart rate (${bpm} BPM). Care level: ${care}.`;
      if (severity === "low") severity = "warning";
    }
    const payload: CreateAlertRequest = {
      patient_id: Number(alertPatientId),
      alert_type: alertType,
      severity,
      title,
      description,
      data:
        alertType === "abnormal_hr"
          ? { source: "demo_control", heart_rate_bpm: bpm, care_level: care }
          : { source: "demo_control" },
    };
    run(
      "Create Alert",
      `Created ${severity} ${alertType} for Patient #${alertPatientId}`,
      () => api.createAlert(payload),
    );
  };

  const isSimulatorUi = Boolean(simStatus.data?.is_simulator);

  function buildSimInjectBody(patientId: string) {
    if (!patientId || patientId === SIM_PATIENT_ANY) return {};
    const pid = Number(patientId);
    return Number.isFinite(pid) && pid > 0 ? { patient_id: pid } : {};
  }

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      <section className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Manual Testing Suite
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Comprehensive Admin Control Panel
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Trigger arbitrary system events, inject alerts, move actors, and advance workflow items 
                to comprehensively test all features of the WheelSense platform without predefined constraints.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Patients {activePatients.length}</Badge>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              Staff {staffUsers.length}
            </Badge>
            <Badge variant="secondary">Tasks {activeTasks.length}</Badge>
            <Badge variant="secondary">Rooms {rooms.length}</Badge>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="border-2 border-foreground"
            onClick={() =>
              void run("Reset Workspace", "Re-seeded the show-demo workspace baseline.", () =>
                api.post("/demo/reset", { profile: "show-demo" }),
              )
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clean Slate (Reset)
          </Button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          
          <DemoPanel
            badge={t("demoControl.alertPanelBadge")}
            title={t("demoControl.alertPanelTitle")}
            description={t("demoControl.alertPanelDesc")}
            action={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("demoControl.alertType")}</Label>
                <Select
                  value={alertType}
                  onValueChange={(v) => {
                    const next = v as DemoAlertType;
                    setAlertType(next);
                    if (next === "abnormal_hr") {
                      const bpm = Math.max(40, Math.min(220, Number(alertHrBpm) || 120));
                      const care = selectedAlertPatient?.care_level ?? "normal";
                      setAlertTitle(`High Heart Rate: ${bpm} BPM`);
                      setAlertDescription(
                        `Patient showing elevated heart rate (${bpm} BPM). Care level: ${care}.`,
                      );
                      setAlertSeverity("warning");
                    } else if (next === "manual_test") {
                      setAlertTitle("Manual Test Alert");
                      setAlertDescription("Triggered from Manual Testing Panel");
                    } else if (next === "fall") {
                      setAlertTitle("Fall detected");
                      setAlertDescription("Triggered from Manual Testing Panel");
                      setAlertSeverity("critical");
                    } else {
                      setAlertTitle(`${next.replace(/_/g, " ")} alert`);
                      setAlertDescription("Triggered from Manual Testing Panel");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual_test">{t("demoControl.alertTypeManualTest")}</SelectItem>
                    <SelectItem value="abnormal_hr">{t("demoControl.alertTypeAbnormalHr")}</SelectItem>
                    <SelectItem value="fall">{t("demoControl.alertTypeFall")}</SelectItem>
                    <SelectItem value="low_battery">{t("demoControl.alertTypeLowBattery")}</SelectItem>
                    <SelectItem value="device_offline">{t("demoControl.alertTypeDeviceOffline")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select
                  value={alertPatientId}
                  onValueChange={(v) => {
                    setAlertPatientId(v);
                    if (alertType === "abnormal_hr") {
                      const p = activePatients.find((x) => String(x.id) === v);
                      const care = p?.care_level ?? "normal";
                      const bpm = Math.max(40, Math.min(220, Number(alertHrBpm) || 120));
                      setAlertDescription(
                        `Patient showing elevated heart rate (${bpm} BPM). Care level: ${care}.`,
                      );
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select patient" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePatients.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.first_name} {item.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severity</Label>
                <Select value={alertSeverity} onValueChange={setAlertSeverity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {alertType === "abnormal_hr" ? (
                <div className="space-y-2">
                  <Label>{t("demoControl.alertHrBpm")}</Label>
                  <Input
                    inputMode="numeric"
                    value={alertHrBpm}
                    onChange={(e) => setAlertHrBpm(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                <Label>Title</Label>
                <Input value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                <Label>{t("demoControl.alertDescription")}</Label>
                <Textarea rows={3} value={alertDescription} onChange={(e) => setAlertDescription(e.target.value)} />
              </div>
            </div>
            <Button className="mt-2 w-full" disabled={!alertPatientId} onClick={handleCreateAlert}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              {t("demoControl.injectAlert")}
            </Button>
          </DemoPanel>

          {isSimulatorUi ? (
            <DemoPanel
              badge={t("demoControl.simPanelBadge")}
              title={t("demoControl.simPanelTitle")}
              description={t("demoControl.simPanelDesc")}
              action={<Route className="h-4 w-4 text-muted-foreground" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("demoControl.simVitalInterval")}</Label>
                  <Input
                    inputMode="numeric"
                    value={simVitalInterval}
                    onChange={(e) => setSimVitalInterval(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("demoControl.simAlertProbability")}</Label>
                  <Input
                    inputMode="decimal"
                    value={simAlertProbability}
                    onChange={(e) => setSimAlertProbability(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("demoControl.simHrHigh")}</Label>
                  <Input inputMode="numeric" value={simHrHigh} onChange={(e) => setSimHrHigh(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 pt-8">
                  <input
                    id="sim-enable-alerts"
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={simEnableAlerts}
                    onChange={(e) => setSimEnableAlerts(e.target.checked)}
                  />
                  <Label htmlFor="sim-enable-alerts" className="cursor-pointer font-normal">
                    {t("demoControl.simEnableAlerts")}
                  </Label>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void run(
                      t("demoControl.simPause"),
                      "MQTT pause",
                      () => api.post("/demo/simulator/command", { command: "pause" }),
                    )
                  }
                >
                  {t("demoControl.simPause")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void run(
                      t("demoControl.simResume"),
                      "MQTT resume",
                      () => api.post("/demo/simulator/command", { command: "resume" }),
                    )
                  }
                >
                  {t("demoControl.simResume")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const vi = Math.max(5, Math.min(600, Math.floor(Number(simVitalInterval) || 30)));
                    const ap = Math.max(0, Math.min(1, Number(simAlertProbability)));
                    const hh = Math.max(60, Math.min(200, Math.floor(Number(simHrHigh) || 110)));
                    void run(
                      t("demoControl.simApplyRuntime"),
                      `vital_interval=${vi}, alert_probability=${ap}, hr_high=${hh}, enable_alerts=${simEnableAlerts}`,
                      () =>
                        api.post("/demo/simulator/command", {
                          command: "set_config",
                          config: {
                            vital_update_interval: vi,
                            alert_probability: Number.isFinite(ap) ? ap : 0.05,
                            enable_alerts: simEnableAlerts,
                            heart_rate_high: hh,
                          },
                        }),
                    );
                  }}
                >
                  {t("demoControl.simApplyRuntime")}
                </Button>
              </div>
              <div className="mt-4 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("demoControl.simPatientOptional")}</Label>
                  <Select value={simInjectPatientId} onValueChange={setSimInjectPatientId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIM_PATIENT_ANY}>{t("demoControl.simPatientAny")}</SelectItem>
                      {activePatients.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.first_name} {item.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2 sm:justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      void run(
                        t("demoControl.simInjectHr"),
                        "MQTT inject_abnormal_hr",
                        () =>
                          api.post("/demo/simulator/command", {
                            command: "inject_abnormal_hr",
                            ...buildSimInjectBody(simInjectPatientId),
                          }),
                      )
                    }
                  >
                    {t("demoControl.simInjectHr")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      void run(
                        t("demoControl.simInjectFall"),
                        "MQTT inject_fall",
                        () =>
                          api.post("/demo/simulator/command", {
                            command: "inject_fall",
                            ...buildSimInjectBody(simInjectPatientId),
                          }),
                      )
                    }
                  >
                    {t("demoControl.simInjectFall")}
                  </Button>
                </div>
              </div>
            </DemoPanel>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <DemoPanel badge="Movement" title="Move an actor" description="Place a patient or staff member in a room." action={<Route className="h-4 w-4 text-muted-foreground" />}>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Actor type</Label>
                  <Select value={actorType} onValueChange={(value) => setActorType(value as ActorType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="patient">Patient</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Actor</Label>
                  <Select value={actorId} onValueChange={setActorId}>
                    <SelectTrigger><SelectValue placeholder="Select actor" /></SelectTrigger>
                    <SelectContent>
                      {actorType === "patient"
                        ? activePatients.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {item.first_name} {item.last_name}
                            </SelectItem>
                          ))
                        : staffUsers.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {displayName(item)} ({item.role})
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Room</Label>
                  <Select value={roomId} onValueChange={setRoomId}>
                    <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                    <SelectContent>
                      {rooms.map((room) => (
                        <SelectItem key={room.id} value={String(room.id)}>
                          {roomLabel(room)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={!actorId || !roomId}
                  onClick={() =>
                    void run(
                      `Move ${actorType} #${actorId}`,
                      "Actor movement command sent.",
                      () =>
                        api.post(`/demo/actors/${actorType}/${encodeURIComponent(actorId)}/move`, {
                          room_id: Number(roomId),
                          note: note.trim(),
                        }),
                    )
                  }
                >
                  <Send className="mr-2 h-4 w-4" />
                  Move actor
                </Button>
              </div>
            </DemoPanel>

            <DemoPanel badge="Hardware" title="Capture Snapshot" description="Trigger a room snapshot from connected hardware." action={<Camera className="h-4 w-4 text-muted-foreground" />}>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Room</Label>
                  <Select value={snapshotRoomId} onValueChange={setSnapshotRoomId}>
                    <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                    <SelectContent>
                      {rooms.map((room) => (
                        <SelectItem key={room.id} value={String(room.id)}>
                          {roomLabel(room)} {room.node_device_id ? `(${room.node_device_id})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={!snapshotRoomId}
                  onClick={() =>
                    void run(
                      `Capture room #${snapshotRoomId}`,
                      "Requested a fresh room snapshot.",
                      () => api.post(`/demo/rooms/${encodeURIComponent(snapshotRoomId)}/capture`),
                    )
                  }
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Trigger Capture
                </Button>
              </div>
            </DemoPanel>
          </div>

          <DemoPanel
            badge="Workflow"
            title="Advance Workflows"
            description="Force workflow progression to test role-based handoffs and task queues."
            action={
              <div className="flex flex-wrap gap-2">
                <Select value={itemType} onValueChange={(value) => setItemType(value as ItemType)}>
                  <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_ITEM_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={targetMode} onValueChange={(value) => setTargetMode(value as TargetMode)}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">Role</SelectItem>
                    <SelectItem value="user">Person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
          >
            <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Workflow item</Label>
                  <Select value={itemId} onValueChange={setItemId}>
                    <SelectTrigger><SelectValue placeholder={`Select ${itemType}`} /></SelectTrigger>
                    <SelectContent>
                      {workflowOptions.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          #{item.id} {valueFromItem(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Target {targetMode}</Label>
                  {targetMode === "role" ? (
                    <Select value={targetValue} onValueChange={setTargetValue}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="head_nurse">head_nurse</SelectItem>
                        <SelectItem value="supervisor">supervisor</SelectItem>
                        <SelectItem value="observer">observer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={targetValue} onValueChange={setTargetValue}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {staffUsers.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {displayName(item)} ({item.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea rows={4} value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["claim", "handoff", "advance"] as const).map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={!itemId}
                    onClick={() =>
                      void run(
                        `${action.toUpperCase()} ${itemType} #${itemId}`,
                        workflowNote.trim(),
                        () =>
                          api.post(`/demo/workflow/${itemType}/${encodeURIComponent(itemId)}/${action}`, {
                            target_mode: targetMode,
                            target_id: targetMode === "role" ? targetValue.trim() : Number(targetValue),
                            note: workflowNote.trim(),
                          }),
                      )
                    }
                    className="rounded-2xl border border-border/70 bg-surface-container-low/40 p-4 text-left transition-smooth hover:bg-primary/10 hover:border-primary/30 disabled:opacity-50"
                  >
                    <p className="font-medium text-foreground capitalize">{action}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {action === "claim" ? "Take ownership." : action === "handoff" ? "Transfer work." : "Push next status."}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Target preview: {targetPreview}</p>
            {itemPreview ? (
              <p className="text-sm text-muted-foreground">
                Selected item: #{itemPreview.id} {valueFromItem(itemPreview)}
              </p>
            ) : null}
          </DemoPanel>
        </div>

        <div className="space-y-4">
          <Card className="border-border/70 bg-card/90">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Current State</p>
                  <h2 className="text-lg font-semibold text-foreground">Workspace Resources</h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-sm text-muted-foreground">Patients</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{activePatients.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-sm text-muted-foreground">Staff</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{staffUsers.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-sm text-muted-foreground">Rooms</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{rooms.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-sm text-muted-foreground">Alerts</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{alerts.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">Command log</p>
                  <h3 className="text-base font-semibold text-foreground">Latest actions</h3>
                </div>
                <Badge variant="outline">{logs.length}</Badge>
              </div>
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-2xl border px-3 py-3 text-sm ${
                      entry.tone === "success"
                        ? "border-emerald-500/20 bg-emerald-500/8"
                        : entry.tone === "error"
                          ? "border-red-500/20 bg-red-500/8"
                          : "border-border/70 bg-surface-container-low/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{entry.title}</p>
                      <span className="text-sm text-muted-foreground">{entry.at}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{entry.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
