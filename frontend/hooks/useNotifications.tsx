"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { startAlertAlarm, stopAlertAlarm } from "@/lib/alertSound";
import {
  alertsInboxUrl,
  staffMessagesPath,
  workflowJobPath,
  workflowTasksPath,
  type AppRole,
} from "@/lib/notificationRoutes";
import { collectNotificationArrivals, refreshNotificationQueue, type NotificationSeen } from "@/lib/notificationArrivals";
import type { TranslationKey } from "@/lib/i18n";
import type { Room } from "@/lib/types";
import type {
  AlertOut,
  CareTaskOut,
  CareWorkflowJobOut,
  RoleMessageOut,
} from "@/lib/api/task-scope-types";

/** Matches server `ROLE_CLINICAL_STAFF` for `GET /api/workflow/tasks` (patients are forbidden). */
const WORKFLOW_TASKS_ROLES = new Set(["admin", "head_caregiver", "caregiver"]);

const ALERT_POLL_MS = 2_500;
const DEFAULT_POLL_MS = 8_000;

export type NotificationType = "alert" | "message" | "task" | "workflow_job";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  data?: AlertOut | CareTaskOut | RoleMessageOut | CareWorkflowJobOut;
}

interface UseNotificationsReturn {
  unreadCount: number;
  notifications: Notification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  hasNewNotifications: boolean;
  popupQueue: Notification[];
  dismissPopup: (id: string) => void;
}

function formatRoomLocationLine(room: Room): string {
  const facility = room.facility_name?.trim();
  const floor =
    room.floor_name?.trim() ||
    (typeof room.floor_number === "number" && Number.isFinite(room.floor_number)
      ? `Floor ${room.floor_number}`
      : null);
  const name = room.name?.trim() || `Room #${room.id}`;
  return [facility, floor, name].filter(Boolean).join(" · ");
}

export interface PatientAlertContext {
  nameLine: string;
  roomLine: string;
  photoUrl: string | null;
  initials: string;
  ageYears: number | null;
  gender: string;
  bloodType: string;
  mobilityType: string;
  careLevel: string;
}

export async function resolvePatientAlertContext(
  patientId: number,
  t: (key: TranslationKey) => string,
): Promise<PatientAlertContext> {
  const fallbackName = t("notifications.toastPatientNameFallback").replace("{id}", String(patientId));
  const unknownRoom = t("notifications.toastPatientLocationUnknown");
  const noRoom = t("notifications.toastPatientNoRoomOnRecord");

  const base: Omit<PatientAlertContext, "nameLine" | "roomLine"> = {
    photoUrl: null,
    initials: "?",
    ageYears: null,
    gender: "",
    bloodType: "",
    mobilityType: "",
    careLevel: "",
  };

  try {
    const p = await api.getPatient(patientId);
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || fallbackName;
    const initials =
      `${p.first_name?.trim().charAt(0) ?? ""}${p.last_name?.trim().charAt(0) ?? ""}`.toUpperCase() || name.charAt(0).toUpperCase() || "?";
    const dobMs = p.date_of_birth ? Date.parse(p.date_of_birth + "T12:00:00") : NaN;
    const details: Omit<PatientAlertContext, "nameLine" | "roomLine"> = {
      photoUrl: p.photo_url?.trim() || null,
      initials,
      ageYears: Number.isFinite(dobMs)
        ? Math.max(0, Math.floor((Date.now() - dobMs) / (365.25 * 24 * 3600 * 1000)))
        : null,
      gender: p.gender ?? "",
      bloodType: p.blood_type ?? "",
      mobilityType: p.mobility_type ?? "",
      careLevel: p.care_level ?? "",
    };

    if (p.room_id == null) {
      return { nameLine: name, roomLine: noRoom, ...details };
    }

    try {
      const room = await api.getRoom(p.room_id);
      const line = formatRoomLocationLine(room);
      return { nameLine: name, roomLine: line.trim() ? line : unknownRoom, ...details };
    } catch {
      return { nameLine: name, roomLine: unknownRoom, ...details };
    }
  } catch {
    return { nameLine: fallbackName, roomLine: unknownRoom, ...base };
  }
}

function transformAlert(alert: AlertOut, role: AppRole, t: (key: TranslationKey) => string): Notification {
  const title = alert.title?.trim()
    ? alert.title
    : alert.alert_type === "fall"
      ? t("demoControl.fallDetectedTitle")
      : alert.alert_type;
  return {
    id: `alert-${alert.id}`,
    type: "alert",
    title,
    message: alert.description || "",
    timestamp: alert.timestamp || alert.acknowledged_at || "",
    read: alert.status !== "active",
    link: alertsInboxUrl(role, alert.id),
    priority: (alert.severity as Notification["priority"]) || "medium",
    data: alert,
  };
}

function transformTask(task: CareTaskOut, role: AppRole): Notification {
  return {
    id: `task-${task.id}`,
    type: "task",
    title: task.title ?? "",
    message: task.description || "",
    timestamp: task.due_at || task.created_at,
    read: task.status === "completed",
    link: workflowTasksPath(role),
    priority: (task.priority as Notification["priority"]) || "medium",
    data: task,
  };
}

function pendingWorkflowJobSteps(job: CareWorkflowJobOut): number {
  return (job.steps ?? []).filter((s) => s.status !== "done" && s.status !== "skipped").length;
}

function transformWorkflowJob(
  job: CareWorkflowJobOut,
  role: AppRole,
  t: (key: TranslationKey) => string,
): Notification {
  const pending = pendingWorkflowJobSteps(job);
  const desc = job.description?.trim() ?? "";
  let message: string;
  if (pending > 0) {
    message = t("notifications.workflowJobPendingSteps").replace("{n}", String(pending));
    if (desc) message = `${message} · ${desc}`;
  } else if (desc) {
    message = desc;
  } else {
    message = t("notifications.workflowJobNoPendingSteps");
  }
  const terminal = job.status === "completed" || job.status === "cancelled";
  return {
    id: `workflow-job-${job.id}`,
    type: "workflow_job",
    title: job.title ?? "",
    message,
    timestamp: job.updated_at || job.created_at,
    read: terminal,
    link: workflowJobPath(role, job.id),
    priority: "medium",
    data: job,
  };
}

function transformMessage(message: RoleMessageOut, role: AppRole): Notification {
  const link =
    role === "patient"
      ? "/patient/messages"
      : staffMessagesPath(role);
  return {
    id: `message-${message.id}`,
    type: "message",
    title: message.subject ?? "",
    message: message.body ?? "",
    timestamp: message.created_at,
    read: message.is_read,
    link,
    priority: "medium",
    data: message,
  };
}

export function useNotifications(): UseNotificationsReturn {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const identity = user ? `${user.workspace_id}:${user.id}:${user.role}` : "";
  const [readState, setReadState] = useState<{ identity: string; ids: Set<string> }>({ identity: "", ids: new Set() });
  const readIds = useMemo(() => readState.identity === identity ? readState.ids : new Set<string>(), [identity, readState]);

  const authReady = Boolean(user);
  const role = (user?.role ?? "caregiver") as AppRole;
  const canListWorkflowTasks = Boolean(user?.role && WORKFLOW_TASKS_ROLES.has(user.role));
  const arrivalTracker = useRef<{ identity: string; seen: NotificationSeen }>({ identity: "", seen: new Map() });
  const [popupState, setPopupState] = useState<{ identity: string; items: Notification[] }>({ identity: "", items: [] });
  /** Critical alerts that arrived this session and are still active — the alarm loops while non-empty. */
  const ringingAlertIds = useRef<Set<string>>(new Set());

  const { data: alertsData } = useQuery({
    queryKey: ["notifications", "alerts", identity],
    queryFn: () => api.listAlerts({ status: "active", limit: 50 }),
    enabled: authReady,
    refetchInterval: ALERT_POLL_MS,
  });

  const { data: tasksData } = useQuery({
    queryKey: ["notifications", "tasks", identity],
    queryFn: () => api.listWorkflowTasks({ status: "pending", limit: 50 }),
    enabled: authReady && canListWorkflowTasks,
    refetchInterval: DEFAULT_POLL_MS,
  });

  const { data: workflowJobsData } = useQuery({
    queryKey: ["notifications", "workflow-jobs", identity],
    queryFn: () => api.listWorkflowJobs({ limit: 50 }),
    enabled: authReady && canListWorkflowTasks,
    refetchInterval: DEFAULT_POLL_MS,
  });

  const { data: messagesData } = useQuery({
    queryKey: ["notifications", "messages", identity],
    queryFn: () => api.listWorkflowMessages({ inbox_only: true, limit: 50 }),
    enabled: authReady,
    refetchInterval: DEFAULT_POLL_MS,
  });

  const notifications: Notification[] = useMemo(() => {
    const rows: Notification[] = [
      ...(alertsData?.map((a) => {
        const n = transformAlert(a, role, t);
        return {
          ...n,
          message: n.message.trim() ? n.message : t("notifications.detailsMissing"),
        };
      }) ?? []),
      ...(tasksData?.map((task) => {
        const n = transformTask(task, role);
        return {
          ...n,
          message: n.message.trim() ? n.message : t("notifications.taskMissingDescription"),
        };
      }) ?? []),
      ...(workflowJobsData?.map((job) => transformWorkflowJob(job, role, t)) ?? []),
      ...(messagesData?.map((m) => transformMessage(m, role)) ?? []),
    ];
    const byId = new Map<string, Notification>();
    for (const n of rows) {
      if (!byId.has(n.id)) byId.set(n.id, n);
    }
    return [...byId.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [alertsData, tasksData, workflowJobsData, messagesData, role, t]);

  useEffect(() => {
    if (!identity) {
      ringingAlertIds.current.clear();
      stopAlertAlarm();
      return;
    }
    if (arrivalTracker.current.identity !== identity) arrivalTracker.current = { identity, seen: new Map() };
    const ready = { alert: alertsData !== undefined, task: tasksData !== undefined, workflow_job: workflowJobsData !== undefined, message: messagesData !== undefined };
    const sources = (["alert", "task", "workflow_job", "message"] as const).map(type => ({ type, ready: ready[type], items: notifications.filter(item => item.type === type) }));
    const arrivals = collectNotificationArrivals(arrivalTracker.current.seen, sources).filter(
      item => item.type === "alert" && (item.data as AlertOut | undefined)?.severity === "critical",
    );
    for (const item of arrivals) ringingAlertIds.current.add(item.id);
    const live = new Set(notifications.filter(n => n.type === "alert" && !n.read).map(n => n.id));
    for (const id of ringingAlertIds.current) {
      if (!live.has(id)) ringingAlertIds.current.delete(id);
    }
    if (ringingAlertIds.current.size) {
      startAlertAlarm();
    } else {
      stopAlertAlarm();
    }
    setPopupState(previous => {
      const previousItems = previous.identity === identity ? previous.items : [];
      const items = refreshNotificationQueue(previousItems, notifications, arrivals, sources.filter(source => source.ready).map(source => source.type));
      if (!items.length && !previousItems.length) return previous;
      return { identity, items };
    });
  }, [identity, notifications, alertsData, tasksData, workflowJobsData, messagesData]);

  useEffect(() => () => stopAlertAlarm(), []);

  const dismissPopup = useCallback((id: string) => {
    setPopupState(previous => ({ ...previous, items: previous.items.filter(item => item.id !== id) }));
  }, []);

  const processedNotifications = notifications.map((n) => ({
    ...n,
    read: n.read || readIds.has(n.id),
  }));

  const unreadCount = processedNotifications.filter((n) => !n.read).length;

  const hasNewNotifications = useMemo(
    () => notifications.some((n) => !n.read && !readIds.has(n.id)),
    [notifications, readIds],
  );

  const markAsRead = useCallback((id: string) => {
    setReadState(previous => ({ identity, ids: new Set([...(previous.identity === identity ? previous.ids : []), id]) }));

    if (id.startsWith("message-")) {
      const messageId = Number(id.replace("message-", ""));
      if (!isNaN(messageId)) {
        api.markWorkflowMessageRead(messageId).catch(console.error);
      }
    }
  }, [identity]);

  const markAllAsRead = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    setReadState(previous => ({ identity, ids: new Set([...(previous.identity === identity ? previous.ids : []), ...allIds]) }));

    messagesData?.forEach((msg) => {
      if (!msg.is_read) {
        api.markWorkflowMessageRead(msg.id).catch(console.error);
      }
    });
  }, [identity, notifications, messagesData]);

  const clearAll = useCallback(() => {
    setReadState({ identity, ids: new Set(notifications.map((n) => n.id)) });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [identity, notifications, queryClient]);

  return {
    unreadCount,
    notifications: processedNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    hasNewNotifications,
    popupQueue: popupState.identity === identity ? popupState.items : [],
    dismissPopup,
  };
}
