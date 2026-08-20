"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Route, Send, Shield, Trash2, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
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
import type { Patient, Room, User } from "@/lib/types";
import type { CreateAlertRequest, ListAlertsResponse } from "@/lib/api/task-scope-types";

type Tone = "success" | "error" | "info";
type ActorType = "patient" | "staff";
type DemoAlertType = "manual_test" | "abnormal_hr" | "fall" | "low_battery" | "device_offline";

type SimulatorStatusResp = {
  env_mode: string;
  is_simulator: boolean;
  workspace_exists: boolean;
  workspace_id?: number | null;
};

function errText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function ts() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template,
  );
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

export default function AdminDemoControlPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const patients = useQuery<Patient[]>({
    queryKey: ["demo-control", "patients", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/patients?limit=50", user?.workspace_id) as string),
  }).data ?? [];
  const users = useQuery<User[]>({
    queryKey: ["demo-control", "users", user?.workspace_id],
    queryFn: () =>
      api.get(withWorkspaceScope("/users/search?roles=admin,head_caregiver,caregiver&limit=100", user?.workspace_id) as string),
  }).data ?? [];
  const rooms = useQuery<Room[]>({
    queryKey: ["demo-control", "rooms", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/rooms?limit=100", user?.workspace_id) as string),
  }).data ?? [];
  const alerts = useQuery<ListAlertsResponse>({
    queryKey: ["demo-control", "alerts", user?.workspace_id],
    queryFn: () => api.get(withWorkspaceScope("/alerts?status=active&limit=20", user?.workspace_id) as string),
  }).data ?? [];
  const simStatus = useQuery<SimulatorStatusResp>({
    queryKey: ["demo-control", "simulator-status", user?.workspace_id],
    queryFn: () => api.get("/demo/simulator/status"),
    enabled: user?.role === "admin",
  });

  const [actorType, setActorType] = useState<ActorType>("patient");
  const [actorId, setActorId] = useState("");
  const [roomId, setRoomId] = useState("");

  const [alertPatientId, setAlertPatientId] = useState("");
  const [alertType, setAlertType] = useState<DemoAlertType>("manual_test");
  const [alertSeverity, setAlertSeverity] = useState("warning");
  const [alertTitle, setAlertTitle] = useState("Manual Test Alert");
  const [alertDescription, setAlertDescription] = useState("Triggered from Manual Testing Panel");
  const [alertHrBpm, setAlertHrBpm] = useState("120");

  const [logs, setLogs] = useState<Array<{ id: string; title: string; detail: string; tone: Tone; at: string }>>([
    { id: logId("seed"), title: "Ready", detail: "Manual Testing Control Panel loaded.", tone: "info", at: ts() },
  ]);

  const activePatients = patients.filter((item) => item.is_active);
  const staffUsers = users.filter((item) => item.role !== "patient");
  const selectedAlertPatient = activePatients.find((p) => String(p.id) === alertPatientId);
  const isSimulatorUi = Boolean(simStatus.data?.is_simulator);

  const metricLabel = (
    key: "demoControl.countPatients" | "demoControl.countStaff" | "demoControl.countRooms",
    count: number,
  ) => formatTemplate(t(key), { count });

  function pushLog(title: string, detail: string, tone: Tone) {
    setLogs((current) => [{ id: logId("log"), title, detail, tone, at: ts() }, ...current.slice(0, 11)]);
  }

  async function run(title: string, detail: string, command: () => Promise<unknown>) {
    try {
      await command();
      pushLog(title, detail, "success");
      queryClient.invalidateQueries();
    } catch (error) {
      pushLog(title, errText(error), "error");
    }
  }

  async function resetWorkspaceQuietly() {
    await api.post("/demo/reset", { profile: "show-demo" });
    if (isSimulatorUi) {
      await api.post("/demo/simulator/command", {
        command: "set_config",
        config: {
          alert_probability: 0,
          enable_alerts: false,
        },
      });
    }
  }

  function handleCreateAlert() {
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

    void run(
      "Inject event",
      `Created ${severity} ${alertType} for Patient #${alertPatientId}`,
      () => api.createAlert(payload),
    );
  }

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      <section className="rounded-3xl border border-border/70 bg-card/90 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              {t("demoControl.heroBadge")}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {t("demoControl.heroTitle")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("demoControl.heroDesc")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{metricLabel("demoControl.countPatients", activePatients.length)}</Badge>
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3.5 w-3.5" />
              {metricLabel("demoControl.countStaff", staffUsers.length)}
            </Badge>
            <Badge variant="secondary">{metricLabel("demoControl.countRooms", rooms.length)}</Badge>
            <Badge variant="secondary">Alerts {alerts.length}</Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <DemoPanel
          badge="Clean State"
          title="Clean State"
          description="Reset demo data and keep automatic simulator alerts quiet."
          action={<Trash2 className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
              <p className="text-sm text-muted-foreground">Patients</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{activePatients.length}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-surface-container-low/50 p-3">
              <p className="text-sm text-muted-foreground">Rooms</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{rooms.length}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full border-2 border-foreground"
            onClick={() =>
              void run(t("demoControl.resetQuietTitle"), t("demoControl.resetQuietDetail"), resetWorkspaceQuietly)
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("demoControl.resetQuietButton")}
          </Button>
        </DemoPanel>

        <DemoPanel
          badge="Inject Events"
          title={t("demoControl.alertPanelTitle")}
          description={t("demoControl.alertPanelDesc")}
          action={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="space-y-3">
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
                    setAlertDescription(`Patient showing elevated heart rate (${bpm} BPM). Care level: ${care}.`);
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
              <Label>{t("demoControl.patient")}</Label>
              <Select
                value={alertPatientId}
                onValueChange={(v) => {
                  setAlertPatientId(v);
                  if (alertType === "abnormal_hr") {
                    const p = activePatients.find((x) => String(x.id) === v);
                    const care = p?.care_level ?? "normal";
                    const bpm = Math.max(40, Math.min(220, Number(alertHrBpm) || 120));
                    setAlertDescription(`Patient showing elevated heart rate (${bpm} BPM). Care level: ${care}.`);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("demoControl.selectPatient")} />
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("demoControl.severity")}</Label>
                <Select value={alertSeverity} onValueChange={setAlertSeverity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("demoControl.severityLow")}</SelectItem>
                    <SelectItem value="warning">{t("demoControl.severityWarning")}</SelectItem>
                    <SelectItem value="critical">{t("demoControl.severityCritical")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {alertType === "abnormal_hr" ? (
                <div className="space-y-2">
                  <Label>{t("demoControl.alertHrBpm")}</Label>
                  <Input inputMode="numeric" value={alertHrBpm} onChange={(e) => setAlertHrBpm(e.target.value)} />
                </div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>{t("demoControl.alertTitle")}</Label>
              <Input value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("demoControl.alertDescription")}</Label>
              <Textarea rows={3} value={alertDescription} onChange={(e) => setAlertDescription(e.target.value)} />
            </div>
            <Button className="w-full" disabled={!alertPatientId} onClick={handleCreateAlert}>
              <AlertTriangle className="mr-2 h-4 w-4" />
              {t("demoControl.injectAlert")}
            </Button>
          </div>
        </DemoPanel>

        <DemoPanel
          badge="Movement"
          title="Movement"
          description="Place a patient or staff member in a room."
          action={<Route className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Actor type</Label>
              <Select value={actorType} onValueChange={(value) => setActorType(value as ActorType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">Patient</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Actor</Label>
              <Select value={actorId} onValueChange={setActorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select actor" />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
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
                      note: "Move the selected actor for the walkthrough.",
                    }),
                )
              }
            >
              <Send className="mr-2 h-4 w-4" />
              Move actor
            </Button>
          </div>
        </DemoPanel>
      </div>

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
  );
}
