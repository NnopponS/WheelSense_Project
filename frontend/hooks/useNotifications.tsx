"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { playAlertChime } from "@/lib/alertSound";
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

const ALERT_POLL_MS = 10_000;
const DEFAULT_POLL_MS = 30_000;

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

export async function resolvePatientAlertContext(
  patientId: number,
  t: (key: TranslationKey) => string,
): Promise<{ nameLine: string; roomLine: string }> {
  const fallbackName = t("notifications.toastPatientNameFallback").replace("{id}", String(patientId));
  const unknownRoom = t("notifications.toastPatientLocationUnknown");
  const noRoom = t("notifications.toastPatientNoRoomOnRecord");

  try {
    const p = await api.getPatient(patientId);
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || fallbackName;

    if (p.room_id == null) {
      return { nameLine: name, roomLine: noRoom };
    }

    try {
      const room = await api.getRoom(p.room_id);
      const line = formatRoomLocationLine(room);
      return { nameLine: name, roomLine: line.trim() ? line : unknownRoom };
    } catch {
      return { nameLine: name, roomLine: unknownRoom };
    }
  } catch {
    return { nameLine: fallbackName, roomLine: unknownRoom };
  }
}

function transformAlert(alert: AlertOut, role: AppRole): Notification {
  return {
    id: `alert-${alert.id}`,
    type: "alert",
    title: alert.title || alert.alert_type,
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
        const n = transformAlert(a, role);
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
    if (!identity) return;
    if (arrivalTracker.current.identity !== identity) arrivalTracker.current = { identity, seen: new Map() };
    const ready = { alert: alertsData !== undefined, task: tasksData !== undefined, workflow_job: workflowJobsData !== undefined, message: messagesData !== undefined };
    const sources = (["alert", "task", "workflow_job", "message"] as const).map(type => ({ type, ready: ready[type], items: notifications.filter(item => item.type === type) }));
    const arrivals = collectNotificationArrivals(arrivalTracker.current.seen, sources);
    if (arrivals.length) playAlertChime();
    setPopupState(previous => {
      const previousItems = previous.identity === identity ? previous.items : [];
      const items = refreshNotificationQueue(previousItems, notifications, arrivals, sources.filter(source => source.ready).map(source => source.type));
      if (!items.length && !previousItems.length) return previous;
      return { identity, items };
    });
  }, [identity, notifications, alertsData, tasksData, workflowJobsData, messagesData]);

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
