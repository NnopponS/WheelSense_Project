"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import DemoPanel from "@/components/admin/demo-control/DemoPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const [alertSeverity, setAlertSeverity] = useState("warning");
  const [alertTitle, setAlertTitle] = useState("Manual Test Alert");

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
    const payload: CreateAlertRequest = {
      patient_id: Number(alertPatientId),
      alert_type: "manual_test",
      severity: alertSeverity as "low" | "warning" | "critical",
      title: alertTitle,
      description: "Triggered from Manual Testing Panel",
      data: { source: "demo_control" }
    };
    run("Create Alert", `Created ${alertSeverity} alert for Patient #${alertPatientId}`, () => api.createAlert(payload));
  };

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      <section className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
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
            onClick={() => void run("Reset Workspace", "Cleared all dynamic data to starting state.", () => api.post("/demo/reset", { profile: "clean-slate" }))}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clean Slate (Reset)
          </Button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          
          <DemoPanel
            badge="Inject Events"
            title="Trigger System Alerts"
            description="Manually push alerts into the system to test responsive UI components for nurses and supervisors."
            action={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select value={alertPatientId} onValueChange={setAlertPatientId}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <input 
                  type="text" 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="w-full mt-2"
              disabled={!alertPatientId}
              onClick={handleCreateAlert}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Inject Alert
            </Button>
          </DemoPanel>

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
            <p className="text-xs text-muted-foreground mt-2">Target preview: {targetPreview}</p>
            {itemPreview ? (
              <p className="text-xs text-muted-foreground">
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
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Current State</p>
                  <h2 className="text-lg font-semibold text-foreground">Workspace Resources</h2>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-xs text-muted-foreground">Patients</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{activePatients.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-xs text-muted-foreground">Staff</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{staffUsers.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-xs text-muted-foreground">Rooms</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{rooms.length}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
                  <p className="text-xs text-muted-foreground">Alerts</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{alerts.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Command log</p>
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
                      <span className="text-xs text-muted-foreground">{entry.at}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.detail}</p>
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
