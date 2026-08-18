"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  CheckIcon,
  ClipboardList,
  HeartPulse,
  MapPin,
  MessageSquareMore,
  ShieldAlert,
  Stethoscope,
  Users,
  WifiOff,
} from "lucide-react";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { HeadNurseSituationBanner } from "@/components/head-nurse/HeadNurseSituationBanner";
import { AppPage } from "@/components/layout/AppPage";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvExportButton } from "@/components/shared/CsvExportButton";
import { MetricCard } from "@/components/shared/MetricCard";
import type {
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  GetWardSummaryResponse,
  ListAlertsResponse,
  ListCaregiversResponse,
  ListPatientsResponse,
  ListSmartDevicesResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
  PatientOut,
} from "@/lib/api/task-scope-types";

const ALERT_SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  low: 2,
};

const TASK_PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const HANDOVER_PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  routine: 2,
};

const SAFE_DEVICE_STATES = new Set(["online", "on", "active", "ok", "healthy", "connected"]);

type AttentionEntry = {
  patient: PatientOut;
  score: number;
  alerts: number;
  tasks: number;
  messages: number;
  handovers: number;
  roomMissing: boolean;
};

type WorkloadEntry = {
  key: string;
  label: string;
  roleLabel: string;
  total: number;
  tasks: number;
  schedules: number;
  directives: number;
};

type DeviceWarningEntry = {
  device: ListSmartDevicesResponse[number];
  roomLabel: string;
  reasons: string[];
  score: number;
};

type RoomLite = {
  id: number;
  name: string;
};

function caregiverRoleLabel(role: string, translate: (key: TranslationKey) => string): string {
  const map: Record<string, TranslationKey> = {
    admin: "personnel.role.admin",
    head_nurse: "personnel.role.headNurse",
    supervisor: "personnel.role.supervisor",
    observer: "personnel.role.observer",
    patient: "personnel.role.patient",
  };
  const key = map[role];
  return key ? translate(key) : role.replace(/_/g, " ");
}

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function patientName(patient: PatientOut): string {
  const name = `${patient.first_name} ${patient.last_name}`.trim();
  return name || `Patient ${patient.id}`;
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export default function HeadNurseDashboardPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);

  const wardSummaryQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "ward-summary"],
    queryFn: () => api.getWardSummary(),
  });

  const alertsQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 100 }),
    refetchInterval: 15_000,
  });

  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const caregiversQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "caregivers"],
    queryFn: () => api.listCaregivers({ limit: 100 }),
  });

  const roomsQuery = useQuery<RoomLite[]>({
    queryKey: ["head-nurse", "dashboard", "rooms"],
    queryFn: () => api.get<RoomLite[]>("/rooms"),
  });

  const tasksQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 100 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ status: "scheduled", limit: 50 }),
  });

  const directivesQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "directives"],
    queryFn: () => api.listWorkflowDirectives({ status: "active", limit: 50 }),
  });

  const messagesQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "messages"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: true, limit: 50 }),
    refetchInterval: 20_000,
  });

  const handoversQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "handovers"],
    queryFn: () => api.listWorkflowHandovers({ limit: 50 }),
    refetchInterval: 30_000,
  });

  const smartDevicesQuery = useQuery({
    queryKey: ["head-nurse", "dashboard", "smart-devices"],
    queryFn: () => api.listSmartDevices(),
    refetchInterval: 30_000,
  });

  const wardSummary = useMemo(
    () => (wardSummaryQuery.data ?? null) as GetWardSummaryResponse | null,
    [wardSummaryQuery.data],
  );
  const alerts = useMemo(() => (alertsQuery.data ?? []) as ListAlertsResponse, [alertsQuery.data]);
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const caregivers = useMemo(
    () => (caregiversQuery.data ?? []) as ListCaregiversResponse,
    [caregiversQuery.data],
  );
  const rooms = useMemo(() => (roomsQuery.data ?? []) as RoomLite[], [roomsQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );
  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );
  const handovers = useMemo(
    () => (handoversQuery.data ?? []) as ListWorkflowHandoversResponse,
    [handoversQuery.data],
  );
  const smartDevices = useMemo(
    () => (smartDevicesQuery.data ?? []) as ListSmartDevicesResponse,
    [smartDevicesQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );
  const roomMap = useMemo(() => new Map<number, RoomLite>(rooms.map((room) => [room.id, room])), [rooms]);

  const activeAlerts = useMemo(
    () => alerts.filter((item) => item.status === "active"),
    [alerts],
  );

  const criticalAlerts = useMemo(
    () => activeAlerts.filter((item) => normalizeLabel(item.severity) === "critical"),
    [activeAlerts],
  );

  const openTasks = useMemo(
    () => tasks.filter((item) => item.status === "pending" || item.status === "in_progress"),
    [tasks],
  );

  const activeDirectives = useMemo(
    () => directives.filter((item) => item.status === "active"),
    [directives],
  );

  const upcomingSchedules = useMemo(
    () =>
      [...schedules]
        .filter((item) => item.status === "scheduled")
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
        .slice(0, 5),
    [schedules],
  );

  const activeCaregivers = useMemo(
    () => caregivers.filter((c) => c.is_active),
    [caregivers],
  );

  const sortedAlerts = useMemo(
    () =>
      [...activeAlerts]
        .sort((left, right) => {
          const leftRank = ALERT_SEVERITY_ORDER[normalizeLabel(left.severity)] ?? 3;
          const rightRank = ALERT_SEVERITY_ORDER[normalizeLabel(right.severity)] ?? 3;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return right.timestamp.localeCompare(left.timestamp);
        })
        .slice(0, 5),
    [activeAlerts],
  );

  const sortedTasks = useMemo(
    () =>
      [...openTasks]
        .sort((left, right) => {
          const leftRank = TASK_PRIORITY_ORDER[normalizeLabel(left.priority)] ?? 4;
          const rightRank = TASK_PRIORITY_ORDER[normalizeLabel(right.priority)] ?? 4;
          if (leftRank !== rightRank) return leftRank - rightRank;
          if (!left.due_at) return 1;
          if (!right.due_at) return -1;
          return left.due_at.localeCompare(right.due_at);
        })
        .slice(0, 5),
    [openTasks],
  );

  const sortedRecentMessages = useMemo(
    () =>
      [...messages]
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, 4),
    [messages],
  );

  const unreadMessages = useMemo(
    () => sortedRecentMessages.filter((message) => !message.is_read),
    [sortedRecentMessages],
  );

  const recentHandovers = useMemo(
    () =>
      [...handovers]
        .sort((left, right) => {
          const leftRank = HANDOVER_PRIORITY_ORDER[normalizeLabel(left.priority)] ?? 3;
          const rightRank = HANDOVER_PRIORITY_ORDER[normalizeLabel(right.priority)] ?? 3;
          if (leftRank !== rightRank) return leftRank - rightRank;
          return right.created_at.localeCompare(left.created_at);
        })
        .slice(0, 4),
    [handovers],
  );

  const highPriorityHandovers = useMemo(
    () =>
      handovers.filter(
        (handover) => HANDOVER_PRIORITY_ORDER[normalizeLabel(handover.priority)] === 0,
      ),
    [handovers],
  );

  const patientAttentionRows = useMemo(() => {
    const buckets = new Map<number, AttentionEntry>();
    const ensure = (patient: PatientOut) => {
      const existing = buckets.get(patient.id);
      if (existing) return existing;
      const entry: AttentionEntry = {
        patient,
        score: 0,
        alerts: 0,
        tasks: 0,
        messages: 0,
        handovers: 0,
        roomMissing: !patient.room_id,
      };
      buckets.set(patient.id, entry);
      return entry;
    };

    for (const patient of patients) {
      if (normalizeLabel(patient.care_level) === "critical") {
        const entry = ensure(patient);
        entry.score += 4;
      }
      if (!patient.room_id) {
        const entry = ensure(patient);
        entry.score += 2;
      }
    }

    for (const alert of activeAlerts) {
      if (alert.patient_id == null) continue;
      const patient = patientMap.get(alert.patient_id);
      if (!patient) continue;
      const entry = ensure(patient);
      entry.alerts += 1;
      entry.score += ALERT_SEVERITY_ORDER[normalizeLabel(alert.severity)] === 0 ? 4 : 2;
    }

    for (const task of openTasks) {
      if (task.patient_id == null) continue;
      const patient = patientMap.get(task.patient_id);
      if (!patient) continue;
      const entry = ensure(patient);
      entry.tasks += 1;
      entry.score += 1;
    }

    for (const message of unreadMessages) {
      if (message.patient_id == null) continue;
      const patient = patientMap.get(message.patient_id);
      if (!patient) continue;
      const entry = ensure(patient);
      entry.messages += 1;
      entry.score += 1;
    }

    for (const handover of highPriorityHandovers) {
      if (handover.patient_id == null) continue;
      const patient = patientMap.get(handover.patient_id);
      if (!patient) continue;
      const entry = ensure(patient);
      entry.handovers += 1;
      entry.score += 2;
    }

    return [...buckets.values()]
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return patientName(left.patient).localeCompare(patientName(right.patient));
      })
      .slice(0, 6);
  }, [activeAlerts, highPriorityHandovers, openTasks, patientMap, patients, unreadMessages]);

  const staffWorkloadRows = useMemo(() => {
    const buckets = new Map<string, WorkloadEntry>();
    const ensure = (key: string, label: string, roleLabel: string) => {
      const existing = buckets.get(key);
      if (existing) return existing;
      const entry: WorkloadEntry = {
        key,
        label,
        roleLabel,
        total: 0,
        tasks: 0,
        schedules: 0,
        directives: 0,
      };
      buckets.set(key, entry);
      return entry;
    };
    const bucketKeyForItem = (
      person: NonNullable<CareTaskOut["assigned_person"]> | null | undefined,
      fallbackRole: string | null | undefined,
    ) => {
      if (person) return `person:${person.user_id}`;
      if (fallbackRole) return `role:${fallbackRole}`;
      return "unassigned";
    };
    const bucketLabelForItem = (
      person: NonNullable<CareTaskOut["assigned_person"]> | null | undefined,
      fallbackRole: string | null | undefined,
    ) => {
      if (person) return person.display_name;
      if (fallbackRole) return fallbackRole.replace(/_/g, " ");
      return t("headNurse.dashboard.unassignedQueue");
    };
    const bucketRoleForItem = (
      person: NonNullable<CareTaskOut["assigned_person"]> | null | undefined,
      fallbackRole: string | null | undefined,
    ) => {
      if (person) return caregiverRoleLabel(person.role, t);
      if (fallbackRole) return caregiverRoleLabel(fallbackRole, t);
      return t("headNurse.dashboard.unassigned");
    };

    for (const task of openTasks) {
      const key = bucketKeyForItem(task.assigned_person, task.assigned_role);
      const entry = ensure(
        key,
        bucketLabelForItem(task.assigned_person, task.assigned_role),
        bucketRoleForItem(task.assigned_person, task.assigned_role),
      );
      entry.tasks += 1;
      entry.total += 1;
    }

    for (const schedule of upcomingSchedules) {
      const key = bucketKeyForItem(schedule.assigned_person, schedule.assigned_role);
      const entry = ensure(
        key,
        bucketLabelForItem(schedule.assigned_person, schedule.assigned_role),
        bucketRoleForItem(schedule.assigned_person, schedule.assigned_role),
      );
      entry.schedules += 1;
      entry.total += 1;
    }

    for (const directive of activeDirectives) {
      const targetPerson = directive.target_person as NonNullable<CareTaskOut["assigned_person"]> | null | undefined;
      const key = bucketKeyForItem(targetPerson, directive.target_role);
      const entry = ensure(
        key,
        bucketLabelForItem(targetPerson, directive.target_role),
        bucketRoleForItem(targetPerson, directive.target_role),
      );
      entry.directives += 1;
      entry.total += 1;
    }

    return [...buckets.values()]
      .sort((left, right) => {
        if (right.total !== left.total) return right.total - left.total;
        return left.label.localeCompare(right.label);
      })
      .slice(0, 4);
  }, [activeDirectives, openTasks, upcomingSchedules, t]);

  const deviceWarningRows = useMemo(() => {
    const rows: DeviceWarningEntry[] = [];
    for (const device of smartDevices) {
      const reasons: string[] = [];
      const state = normalizeLabel(device.state);
      if (!device.is_active) reasons.push(t("headNurse.dashboard.reasonInactive"));
      if (!device.room_id) reasons.push(t("headNurse.dashboard.reasonNoRoom"));
      if (state && !SAFE_DEVICE_STATES.has(state)) reasons.push(state);
      if (!reasons.length) continue;

      const room = device.room_id ? roomMap.get(device.room_id) : null;
      rows.push({
        device,
        roomLabel: room?.name ?? (device.room_id ? `Room #${device.room_id}` : t("headNurse.dashboard.noRoomAssigned")),
        reasons,
        score: (!device.is_active ? 3 : 0) + (!device.room_id ? 2 : 0) + (state && !SAFE_DEVICE_STATES.has(state) ? 1 : 0),
      });
    }

    return rows
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.device.name.localeCompare(right.device.name);
      })
      .slice(0, 4);
  }, [roomMap, smartDevices, t]);

  const roomlessPatientRows = useMemo(
    () => patientAttentionRows.filter((entry) => !entry.patient.room_id),
    [patientAttentionRows],
  );

  const headNurseExportRows = useMemo(
    () => [
      ["summary", "patients", wardSummary?.total_patients ?? patients.length, "", ""],
      ["summary", "critical_alerts", criticalAlerts.length, `${activeAlerts.length} active`, ""],
      ["summary", "watchlist_patients", patientAttentionRows.length, `${roomlessPatientRows.length} roomless`, ""],
      ["summary", "open_tasks", openTasks.length, `${activeDirectives.length} active directives`, ""],
      ["summary", "unread_messages", unreadMessages.length, `${messages.length} inbox messages`, ""],
      ["summary", "high_priority_handovers", highPriorityHandovers.length, `${handovers.length} total handovers`, ""],
      ["summary", "device_warnings", deviceWarningRows.length + roomlessPatientRows.length, `${deviceWarningRows.length} devices`, ""],
      ...sortedAlerts.map((alert) => [
        "alert",
        alert.id,
        alert.severity,
        alert.title,
        alert.patient_id ?? "",
      ]),
      ...patientAttentionRows.map((entry) => [
        "patient",
        entry.patient.id,
        entry.roomMissing ? "location" : entry.patient.care_level,
        patientName(entry.patient),
        entry.patient.room_id ?? "",
      ]),
      ...sortedTasks.map((task) => [
        "task",
        task.id,
        task.priority,
        task.title ?? "",
        task.patient_id ?? "",
      ]),
      ...unreadMessages.map((message) => [
        "message",
        message.id,
        "unread",
        message.subject,
        message.patient_id ?? "",
      ]),
      ...recentHandovers.map((handover) => [
        "handover",
        handover.id,
        handover.priority,
        handover.shift_label,
        handover.patient_id ?? "",
      ]),
      ...deviceWarningRows.map((entry) => [
        "device",
        entry.device.id,
        entry.reasons.join(" / "),
        entry.device.name,
        entry.device.room_id ?? "",
      ]),
    ],
    [
      activeAlerts.length,
      activeDirectives.length,
      criticalAlerts.length,
      deviceWarningRows,
      handovers.length,
      highPriorityHandovers.length,
      messages.length,
      openTasks.length,
      patientAttentionRows,
      patients.length,
      recentHandovers,
      roomlessPatientRows.length,
      sortedAlerts,
      sortedTasks,
      unreadMessages,
      wardSummary?.total_patients,
    ],
  );

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await api.updateWorkflowTask(taskId, { status: "completed" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "tasks"] });
    },
    onSettled: () => setPendingTaskId(null),
  });

  const commandActions = [
    {
      label: t("headNurse.dashboard.criticalAlerts"),
      detail: criticalAlerts.length
        ? formatTemplate(t("headNurse.dashboard.countCritical"), { count: criticalAlerts.length })
        : formatTemplate(t("headNurse.dashboard.countActive"), { count: activeAlerts.length }),
      href: "/head-nurse/alerts",
      icon: ShieldAlert,
      tone: criticalAlerts.length ? "danger" : "primary",
    },
    {
      label: t("headNurse.dashboard.patients"),
      detail: formatTemplate(t("headNurse.dashboard.countOnWatch"), { count: patientAttentionRows.length }),
      href: "/head-nurse/personnel",
      icon: HeartPulse,
      tone: "neutral",
    },
    {
      label: t("headNurse.dashboard.staff"),
      detail: formatTemplate(t("headNurse.dashboard.countActive"), { count: activeCaregivers.length }),
      href: "/head-nurse/personnel?tab=staff",
      icon: Users,
      tone: "neutral",
    },
    {
      label: t("headNurse.dashboard.tasks"),
      detail: formatTemplate(t("headNurse.dashboard.countOpen"), { count: openTasks.length }),
      href: "/head-nurse/tasks",
      icon: ClipboardList,
      tone: "warning",
    },
    {
      label: t("headNurse.dashboard.messages"),
      detail: formatTemplate(t("headNurse.dashboard.countUnread"), { count: unreadMessages.length }),
      href: "/head-nurse/messages",
      icon: MessageSquareMore,
      tone: "neutral",
    },
    {
      label: t("headNurse.dashboard.floorPlans"),
      detail: formatTemplate(t("headNurse.dashboard.countLocationWarnings"), {
        count: deviceWarningRows.length + roomlessPatientRows.length,
      }),
      href: "/head-nurse/floorplans",
      icon: MapPin,
      tone: "neutral",
    },
  ] as const;

  const actionToneClass: Record<(typeof commandActions)[number]["tone"], string> = {
    primary: "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15",
    danger: "border-critical/35 bg-critical-bg text-critical-foreground hover:bg-critical-bg/75",
    warning: "border-warning/35 bg-warning-bg text-warning-foreground hover:bg-warning-bg/75",
    neutral: "border-border/70 bg-card text-foreground hover:bg-muted/45",
  };

  return (
    <AppPage
      eyebrow={t("headNurse.title")}
      title={t("headNurse.wardDashboardTitle")}
      description={t("headNurse.wardDashboardSubtitle")}
      className="animate-fade-in pb-6"
      actions={
        <>
          <CsvExportButton
            fileNameBase="wheelsense-head-nurse-command-center"
            headers={[
              t("headNurse.dashboard.csvType"),
              t("headNurse.dashboard.csvId"),
              t("headNurse.dashboard.csvState"),
              t("headNurse.dashboard.csvTitle"),
              t("headNurse.dashboard.csvPatientId"),
            ]}
            rows={headNurseExportRows}
          />
        </>
      }
    >

      <HeadNurseSituationBanner
        alerts={alerts}
        patients={patients}
        caregivers={caregivers}
        tasks={tasks}
      />

      <section className="grid auto-rows-fr gap-3 md:grid-cols-3">
        <MetricCard
          label={t("headNurse.situation.unreadMessages")}
          value={unreadMessages.length}
          description={formatTemplate(t("headNurse.situation.totalInboxMessages"), { count: messages.length })}
          icon={MessageSquareMore}
          href="/head-nurse/messages"
          hrefLabel={t("headNurse.dashboard.viewAll")}
          status={unreadMessages.length > 0 ? { label: t("headNurse.dashboard.unread"), tone: "warning" } : undefined}
        />

        <MetricCard
          label={t("headNurse.situation.handoverReview")}
          value={highPriorityHandovers.length}
          description={formatTemplate(t("headNurse.situation.notesAcrossShifts"), { count: handovers.length })}
          icon={Calendar}
          status={
            highPriorityHandovers.length > 0
              ? { label: t("headNurse.dashboard.highPriority"), tone: "info" }
              : undefined
          }
        />

        <MetricCard
          label={t("headNurse.situation.deviceLocationWarnings")}
          value={deviceWarningRows.length + roomlessPatientRows.length}
          description={formatTemplate(t("headNurse.situation.deviceRoomWarnings"), {
            devices: deviceWarningRows.length,
            rooms: roomlessPatientRows.length,
          })}
          icon={WifiOff}
          href="/head-nurse/floorplans"
          hrefLabel={t("headNurse.dashboard.openFloorPlans")}
          status={
            deviceWarningRows.length + roomlessPatientRows.length > 0
              ? { label: t("headNurse.dashboard.deviceIssues"), tone: "critical" }
              : undefined
          }
        />
      </section>

      <section aria-label={t("headNurse.dashboard.commandActionsLabel")} className="grid auto-rows-fr gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {commandActions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.label}
              asChild
              variant="outline"
              className={`h-full min-h-16 justify-start gap-3 px-3 py-3 text-left whitespace-normal ${actionToneClass[action.tone]}`}
            >
              <Link href={action.href}>
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">
                    {action.label}
                  </span>
                  <span className="block text-sm font-normal leading-tight opacity-80">
                    {action.detail}
                  </span>
                </span>
              </Link>
            </Button>
          );
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("headNurse.dashboard.clinicalWatchlist")}</CardTitle>
              <CardDescription>
                {t("headNurse.dashboard.clinicalWatchlistDesc")}
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/head-nurse/alerts">
                {t("headNurse.dashboard.openAlerts")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("headNurse.dashboard.priorityAlerts")}</p>
                <Badge variant="secondary" className="tabular-nums">
                  {sortedAlerts.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {sortedAlerts.length ? (
                  sortedAlerts.map((alert) => {
                    const patient = alert.patient_id ? patientMap.get(alert.patient_id) : null;
                    const alertTone =
                      normalizeLabel(alert.severity) === "critical"
                        ? "destructive"
                        : normalizeLabel(alert.severity) === "warning"
                          ? "warning"
                          : "secondary";
                    return (
                      <Link
                        key={alert.id}
                        href={alert.patient_id ? `/head-nurse/personnel/${alert.patient_id}` : "/head-nurse/alerts"}
                        className="group flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">{alert.title}</p>
                            <Badge
                              variant={alertTone as "destructive" | "warning" | "secondary"}
                              className="shrink-0"
                            >
                              {alert.severity}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {alert.description}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{patient ? patientName(patient) : t("headNurse.dashboard.wardWide")}</span>
                            {patient?.room_id ? (
                              <>
                                <span>-</span>
                                <span>{roomMap.get(patient.room_id)?.name ?? `Room #${patient.room_id}`}</span>
                              </>
                            ) : null}
                            <span>-</span>
                            <span>{formatRelativeTime(alert.timestamp)}</span>
                          </div>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/50" />
                    <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.noAlerts")}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("headNurse.dashboard.patientsNeedAttention")}</p>
                <Badge variant="secondary" className="tabular-nums">
                  {patientAttentionRows.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {patientAttentionRows.length ? (
                  patientAttentionRows.map((entry) => {
                    const patient = entry.patient;
                    const roomName = patient.room_id
                      ? roomMap.get(patient.room_id)?.name ?? `Room #${patient.room_id}`
                      : t("headNurse.dashboard.noRoomAssigned");
                    const badges = [
                      normalizeLabel(patient.care_level) === "critical" ? t("headNurse.dashboard.critical") : null,
                      entry.alerts ? formatTemplate(t("headNurse.dashboard.countAlerts"), { count: entry.alerts }) : null,
                      entry.tasks ? formatTemplate(t("headNurse.dashboard.countTasks"), { count: entry.tasks }) : null,
                      entry.messages ? formatTemplate(t("headNurse.dashboard.countMessages"), { count: entry.messages }) : null,
                      entry.handovers ? formatTemplate(t("headNurse.dashboard.countHandovers"), { count: entry.handovers }) : null,
                      entry.roomMissing ? t("headNurse.dashboard.locationCheck") : null,
                    ].filter(Boolean) as string[];

                    return (
                      <Link
                        key={patient.id}
                        href={`/head-nurse/personnel/${patient.id}`}
                        className="group flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">{patientName(patient)}</p>
                            {patient.room_id ? (
                              <Badge variant="outline" className="shrink-0">
                                {roomName}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="shrink-0">
                                {t("headNurse.dashboard.locationCheck")}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTemplate(t("headNurse.dashboard.careLevel"), { level: patient.care_level })}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {badges.slice(0, 3).map((badge) => (
                              <Badge
                                key={badge}
                                variant="secondary"
                                className="shrink-0 text-[11px] font-medium"
                              >
                                {badge}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                    <HeartPulse className="mx-auto h-8 w-8 text-emerald-500/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("headNurse.dashboard.noAttentionPatients")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">{t("headNurse.dashboard.staffWorkload")}</CardTitle>
                <CardDescription>{t("headNurse.dashboard.staffWorkloadDesc")}</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/head-nurse/staff">
                  {t("headNurse.dashboard.viewAll")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {staffWorkloadRows.length ? (
                staffWorkloadRows.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">{entry.label}</p>
                        <Badge variant="outline" className="shrink-0">
                          {entry.roleLabel}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatTemplate(t("headNurse.dashboard.workloadParts"), {
                          tasks: entry.tasks,
                          schedules: entry.schedules,
                          directives: entry.directives,
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={entry.total >= 6 ? "destructive" : entry.total >= 4 ? "warning" : "secondary"}
                      className="shrink-0 tabular-nums"
                    >
                      {entry.total}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                  <Stethoscope className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("headNurse.dashboard.noStaffWorkload")}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {formatTemplate(t("headNurse.dashboard.activeStaffOnDuty"), { count: activeCaregivers.length })}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <DashboardMapLauncher
        href="/head-nurse/floorplans"
        title={t("headNurse.dashboard.floorPlanOnDemand")}
        description={t("headNurse.dashboard.floorPlanDesc")}
        primaryLabel={criticalAlerts.length ? t("headNurse.dashboard.openEmergencyMap") : t("headNurse.dashboard.openFloorPlan")}
        emergencyCount={criticalAlerts.length}
        peopleCount={wardSummary?.total_patients ?? patients.length}
        roomLabel={t("headNurse.dashboard.find")}
        compact
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("headNurse.dashboard.openWorkQueue")}</CardTitle>
              <CardDescription>{t("headNurse.dashboard.openWorkQueueDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/head-nurse/tasks">
                {t("headNurse.dashboard.viewTasks")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("headNurse.dashboard.tasksDueNow")}</p>
                <Badge variant="secondary" className="tabular-nums">
                  {sortedTasks.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {sortedTasks.length ? (
                  sortedTasks.map((task) => {
                    const patient = task.patient_id ? patientMap.get(task.patient_id) : null;
                    return (
                      <div
                        key={task.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">{task.title}</p>
                            <Badge
                              variant={
                                normalizeLabel(task.priority) === "critical"
                                  ? "destructive"
                                  : normalizeLabel(task.priority) === "high"
                                    ? "warning"
                                    : "secondary"
                              }
                              className="shrink-0"
                            >
                              {task.priority}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{patient ? patientName(patient) : t("headNurse.dashboard.wardWide")}</span>
                            {task.due_at ? (
                              <>
                                <span>-</span>
                                <span>
                                  {formatTemplate(t("headNurse.dashboard.dueAt"), { time: formatDateTime(task.due_at) })}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={completeTaskMutation.isPending && pendingTaskId === task.id}
                          onClick={() => {
                            setPendingTaskId(task.id);
                            completeTaskMutation.mutate(task.id);
                          }}
                        >
                          <CheckIcon className="mr-1.5 h-4 w-4" />
                          {t("headNurse.dashboard.complete")}
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-5 text-center">
                    <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500/50" />
                    <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.dashboard.noOpenTasks")}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("headNurse.dashboard.unreadMessages")}</p>
                <Badge variant="secondary" className="tabular-nums">
                  {unreadMessages.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {unreadMessages.length ? (
                  unreadMessages.map((message) => {
                    const patient = message.patient_id ? patientMap.get(message.patient_id) : null;
                    const sender = message.sender_person?.display_name ?? t("headNurse.dashboard.staffFallback");
                    return (
                      <Link
                        key={message.id}
                        href="/head-nurse/messages"
                        className="group flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">{message.subject}</p>
                            <Badge variant="warning" className="shrink-0">
                              {t("headNurse.dashboard.unread")}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{message.body}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {sender}
                            {patient ? ` - ${patientName(patient)}` : ""}
                            {" - "}
                            {formatRelativeTime(message.created_at)}
                          </p>
                        </div>
                        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-5 text-center">
                    <MessageSquareMore className="mx-auto h-7 w-7 text-sky-500/50" />
                    <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.dashboard.noUnreadMessages")}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("headNurse.dashboard.recentHandovers")}</p>
                <Badge variant="secondary" className="tabular-nums">
                  {highPriorityHandovers.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {recentHandovers.length ? (
                  recentHandovers.map((handover) => {
                    const patient = handover.patient_id ? patientMap.get(handover.patient_id) : null;
                    return (
                      <div
                        key={handover.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">{handover.shift_label}</p>
                            <Badge
                              variant={
                                normalizeLabel(handover.priority) === "urgent"
                                  ? "destructive"
                                  : normalizeLabel(handover.priority) === "high"
                                    ? "warning"
                                    : "secondary"
                              }
                              className="shrink-0"
                            >
                              {handover.priority}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{handover.note}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {patient ? patientName(patient) : t("headNurse.dashboard.wardWide")} - {formatRelativeTime(handover.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-5 text-center">
                    <Calendar className="mx-auto h-7 w-7 text-sky-500/50" />
                    <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.dashboard.noRecentHandovers")}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">{t("headNurse.dashboard.deviceLocationWatch")}</CardTitle>
              <CardDescription>{t("headNurse.dashboard.deviceLocationWatchDesc")}</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/head-nurse/floorplans">
                {t("headNurse.dashboard.openFloorPlans")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("headNurse.dashboard.deviceIssues")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {deviceWarningRows.length}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("headNurse.dashboard.roomChecks")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {roomlessPatientRows.length}
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("headNurse.dashboard.floorMap")}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {criticalAlerts.length > 0 ? t("headNurse.dashboard.mapLive") : t("headNurse.dashboard.mapReady")}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {deviceWarningRows.length ? (
                deviceWarningRows.map((entry) => (
                  <div
                    key={entry.device.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">{entry.device.name}</p>
                        <Badge variant="secondary" className="shrink-0">
                          {entry.device.device_type}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.roomLabel}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.reasons.map((reason) => (
                          <Badge key={reason} variant="warning" className="shrink-0 text-[11px] font-medium">
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                  <WifiOff className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">{t("headNurse.dashboard.noDeviceWarnings")}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("headNurse.dashboard.roomlessPatients")}</p>
                <Badge variant="secondary" className="tabular-nums">
                  {roomlessPatientRows.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {roomlessPatientRows.length ? (
                  roomlessPatientRows.map((entry) => (
                    <Link
                      key={entry.patient.id}
                      href={`/head-nurse/personnel/${entry.patient.id}`}
                      className="group flex items-start justify-between gap-3 rounded-xl border border-border/70 px-3 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">{patientName(entry.patient)}</p>
                          <Badge variant="destructive" className="shrink-0">
                            {t("headNurse.dashboard.noRoom")}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatTemplate(t("headNurse.dashboard.patientTaskAlertSummary"), {
                            tasks: entry.tasks,
                            alerts: entry.alerts,
                          })}
                        </p>
                      </div>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center">
                    <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t("headNurse.dashboard.allPatientsHaveRooms")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}
