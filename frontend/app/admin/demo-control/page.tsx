"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@/hooks/useQuery";
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
import { Camera, Pause, Play, RefreshCcw, Route, Send, Shield, Users } from "lucide-react";
import type { Patient, Room, User } from "@/lib/types";
import type {
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  ListAlertsResponse,
  ListDeviceActivityResponse,
  ListWorkflowAuditResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
} from "@/lib/api/task-scope-types";

type Tone = "success" | "error" | "info";
type ActorType = "patient" | "staff";
type ItemType = "task" | "schedule" | "directive";
type TargetMode = "role" | "user";
type ScenarioId = "show-demo" | "morning-rounds" | "handoff-pressure" | "photo-sweep" | "emergency-drill";

const WORKFLOW_ITEM_OPTIONS: Array<{ value: ItemType; label: string }> = [
  { value: "task", label: "Tasks" },
  { value: "schedule", label: "Schedules" },
  { value: "directive", label: "Directives" },
];

const SCENARIOS: Array<{ id: ScenarioId; title: string; description: string }> = [
  { id: "show-demo", title: "Show Demo", description: "Reset and stage the default walkthrough." },
  { id: "morning-rounds", title: "Morning Rounds", description: "Drive routine tasks and room checks." },
  { id: "handoff-pressure", title: "Handoff Pressure", description: "Push handover and transfer activity." },
  { id: "photo-sweep", title: "Photo Sweep", description: "Refresh camera snapshots and visibility." },
  { id: "emergency-drill", title: "Emergency Drill", description: "Trigger alert and escalation flow." },
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

  const patients = useQuery<Patient[]>(
    withWorkspaceScope("/patients?limit=50", user?.workspace_id),
  ).data ?? [];
  const users = useQuery<User[]>(
    withWorkspaceScope("/users/search?roles=admin,head_nurse,supervisor,observer&limit=100", user?.workspace_id),
  ).data ?? [];
  const rooms = useQuery<Room[]>(withWorkspaceScope("/rooms?limit=100", user?.workspace_id)).data ?? [];
  const tasks = useQuery<CareTaskOut[]>(withWorkspaceScope("/workflow/tasks?limit=50", user?.workspace_id)).data ?? [];
  const schedules = useQuery<CareScheduleOut[]>(withWorkspaceScope("/workflow/schedules?limit=50", user?.workspace_id)).data ?? [];
  const directives = useQuery<CareDirectiveOut[]>(withWorkspaceScope("/workflow/directives?limit=50", user?.workspace_id)).data ?? [];
  const handovers = useQuery<ListWorkflowHandoversResponse>(withWorkspaceScope("/workflow/handovers?limit=50", user?.workspace_id)).data ?? [];
  const messages = useQuery<ListWorkflowMessagesResponse>(withWorkspaceScope("/workflow/messages?inbox_only=false&limit=50", user?.workspace_id)).data ?? [];
  const audit = useQuery<ListWorkflowAuditResponse>(withWorkspaceScope("/workflow/audit?limit=30", user?.workspace_id)).data ?? [];
  const alerts = useQuery<ListAlertsResponse>(withWorkspaceScope("/alerts?status=active&limit=20", user?.workspace_id)).data ?? [];
  const activity = useQuery<ListDeviceActivityResponse>(withWorkspaceScope("/devices/activity?limit=10", user?.workspace_id)).data ?? [];

  const [scenario, setScenario] = useState<ScenarioId>("show-demo");
  const [actorType, setActorType] = useState<ActorType>("patient");
  const [actorId, setActorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [note, setNote] = useState("Move the selected actor for the walkthrough.");
  const [itemType, setItemType] = useState<ItemType>("task");
  const [itemId, setItemId] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("role");
  const [targetValue, setTargetValue] = useState("supervisor");
  const [workflowNote, setWorkflowNote] = useState("Advance the demo workflow item.");
  const [snapshotRoomId, setSnapshotRoomId] = useState("");
  const [logs, setLogs] = useState<Array<{ id: string; title: string; detail: string; tone: Tone; at: string }>>([
    { id: logId("seed"), title: "Ready", detail: "Demo control panel loaded.", tone: "info", at: ts() },
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
    } catch (error) {
      pushLog(title, errText(error), "error");
    }
  }

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      <section className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Show Demo Control
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                Seed, move, advance, and replay the demo workspace.
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                This panel assumes `POST /api/demo/*` endpoints exist and gives a deterministic way to reset
                the workspace, move actors, trigger workflow progress, and capture room media.
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
            <Badge variant="outline" className="gap-1">
              <Route className="h-3.5 w-3.5" />
              Demo route
            </Badge>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void run("Reset show-demo", "Requested a deterministic demo workspace reset.", () => api.post("/demo/reset", { profile: "show-demo" }))}
          >
            <RefreshCcw className="h-4 w-4" />
            Reset show-demo
          </Button>
          <Button
            variant="outline"
            onClick={() => void run(`Start scenario ${scenario}`, "Scenario playback started.", () => api.post(`/demo/scenarios/${encodeURIComponent(scenario)}/start`))}
          >
            <Play className="h-4 w-4" />
            Start scenario
          </Button>
          <Button
            variant="outline"
            onClick={() => void run(`Stop scenario ${scenario}`, "Scenario playback stopped.", () => api.post(`/demo/scenarios/${encodeURIComponent(scenario)}/stop`))}
          >
            <Pause className="h-4 w-4" />
            Stop scenario
          </Button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <DemoPanel
            badge="Scenario playback"
            title="Reset and run scripted walkthroughs"
            description="Reset the show-demo workspace, then start or stop deterministic playback presets."
            action={
              <Select value={scenario} onValueChange={(value) => setScenario(value as ScenarioId)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            footer={SCENARIOS.find((item) => item.id === scenario)?.description}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {SCENARIOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScenario(item.id)}
                  className={`rounded-2xl border p-4 text-left transition-smooth ${
                    scenario === item.id
                      ? "border-primary bg-primary/6 shadow-sm"
                      : "border-border/70 bg-surface-container-low/40 hover:bg-surface-container-low/80"
                  }`}
                >
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </button>
              ))}
            </div>
          </DemoPanel>

          <div className="grid gap-4 lg:grid-cols-2">
            <DemoPanel badge="Movement" title="Move an actor" description="Place a patient or staff member in a room for the walkthrough." action={<Badge variant="outline">Manual</Badge>}>
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
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
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
                  <Send className="h-4 w-4" />
                  Move actor
                </Button>
              </div>
            </DemoPanel>

            <DemoPanel badge="Camera" title="Capture the current room" description="Request a fresh room photo snapshot for the chosen room." action={<Camera className="h-4 w-4 text-muted-foreground" />}>
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
                  <Camera className="h-4 w-4" />
                  Capture now
                </Button>
              </div>
            </DemoPanel>
          </div>

          <DemoPanel
            badge="Workflow"
            title="Advance tasks, schedules, and directives"
            description="Drive claim, handoff, or advance behavior against the seeded workflow rows."
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
                    className="rounded-2xl border border-border/70 bg-surface-container-low/40 p-4 text-left transition-smooth hover:bg-surface-container-low/80 disabled:opacity-50"
                  >
                    <p className="font-medium text-foreground">{action}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {action === "claim" ? "Take ownership." : action === "handoff" ? "Transfer work." : "Push next status."}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Target preview: {targetPreview}</p>
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
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Current roster</p>
                  <h2 className="text-lg font-semibold text-foreground">Show-demo seed shape</h2>
                </div>
                <Badge variant="outline">5 + 2 + 1 + 1 + 1</Badge>
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
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Seed preview</p>
                  <h3 className="text-base font-semibold text-foreground">Roster and workflow summary</h3>
                </div>
                <Badge variant="secondary">{messages.length} messages</Badge>
              </div>
              <div className="space-y-3 text-sm">
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patients</p>
                  {activePatients.slice(0, 5).map((patient) => (
                    <div key={patient.id} className="rounded-xl border border-border/70 px-3 py-2">
                      <p className="font-medium text-foreground">{patient.first_name} {patient.last_name}</p>
                      <p className="text-xs text-muted-foreground">Room {patient.room_id ?? "unassigned"} - Care {patient.care_level}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff</p>
                  {staffUsers.slice(0, 5).map((member) => (
                    <div key={member.id} className="rounded-xl border border-border/70 px-3 py-2">
                      <p className="font-medium text-foreground">{displayName(member)}</p>
                      <p className="text-xs text-muted-foreground">{member.role} - #{member.id}</p>
                    </div>
                  ))}
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

          <Card className="border-border/70 bg-card/90">
            <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Live counts</p>
                  <h3 className="text-base font-semibold text-foreground">Current workspace state</h3>
                </div>
                <Badge variant="secondary">Polling only</Badge>
              </div>
              <p>Open tasks: {activeTasks.length}</p>
              <p>Scheduled rounds: {activeSchedules.length}</p>
              <p>Active directives: {activeDirectives.length}</p>
              <p>Handover notes: {handovers.length}</p>
              <p>Audit events: {audit.length}</p>
              <p>Device activity entries: {activity.length}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
