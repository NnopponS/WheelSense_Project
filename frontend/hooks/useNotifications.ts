"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { playAlertChime } from "@/lib/alertSound";
import {
  alertsInboxPath,
  staffMessagesPath,
  workflowTasksPath,
  type AppRole,
} from "@/lib/notificationRoutes";
import type { AlertOut, CareTaskOut, RoleMessageOut } from "@/lib/api/task-scope-types";

/** Matches server `ROLE_CLINICAL_STAFF` for `GET /api/workflow/tasks` (patients are forbidden). */
const WORKFLOW_TASKS_ROLES = new Set(["admin", "head_nurse", "supervisor", "observer"]);

const ALERT_POLL_MS = 10_000;
const DEFAULT_POLL_MS = 30_000;

export type NotificationType = "alert" | "message" | "task";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  data?: AlertOut | CareTaskOut | RoleMessageOut;
}

interface UseNotificationsReturn {
  unreadCount: number;
  notifications: Notification[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  hasNewNotifications: boolean;
}

function severityNotifyLevel(severity: string | undefined): "none" | "toast" | "toastSound" {
  const s = (severity ?? "").toLowerCase();
  if (s === "low" || s === "info" || s === "informational") return "none";
  if (s === "medium" || s === "moderate") return "toast";
  return "toastSound";
}

function transformAlert(alert: AlertOut, role: AppRole): Notification {
  return {
    id: `alert-${alert.id}`,
    type: "alert",
    title: alert.title || alert.alert_type,
    message: alert.description || "",
    timestamp: alert.timestamp || alert.acknowledged_at || "",
    read: alert.status !== "active",
    link: alertsInboxPath(role),
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

function transformMessage(message: RoleMessageOut, role: AppRole): Notification {
  const link =
    message.patient_id != null && message.patient_id !== undefined
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
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const authReady = Boolean(user);
  const role = (user?.role ?? "observer") as AppRole;
  const canListWorkflowTasks = Boolean(user?.role && WORKFLOW_TASKS_ROLES.has(user.role));

  const alertToastBootstrap = useRef(false);
  const alertToastIds = useRef<Set<number>>(new Set());

  const { data: alertsData } = useQuery({
    queryKey: ["notifications", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 50 }),
    enabled: authReady,
    refetchInterval: ALERT_POLL_MS,
  });

  const { data: tasksData } = useQuery({
    queryKey: ["notifications", "tasks"],
    queryFn: () => api.listWorkflowTasks({ status: "pending", limit: 50 }),
    enabled: authReady && canListWorkflowTasks,
    refetchInterval: DEFAULT_POLL_MS,
  });

  const { data: messagesData } = useQuery({
    queryKey: ["notifications", "messages"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: true, limit: 50 }),
    enabled: authReady,
    refetchInterval: DEFAULT_POLL_MS,
  });

  useEffect(() => {
    if (!alertsData || !user) return;
    const active = alertsData.filter((a) => a.status === "active");
    const inbox = alertsInboxPath(role);

    if (!alertToastBootstrap.current) {
      active.forEach((a) => alertToastIds.current.add(a.id));
      alertToastBootstrap.current = true;
      return;
    }

    for (const a of active) {
      if (alertToastIds.current.has(a.id)) continue;
      alertToastIds.current.add(a.id);
      const level = severityNotifyLevel(a.severity);
      if (level === "none") continue;

      const title = a.title || a.alert_type || t("notifications.toastNewAlert");
      const description = a.description?.trim() || undefined;

      if (level === "toastSound") {
        playAlertChime();
      }

      toast(title, {
        id: `ws-alert-toast-${a.id}`,
        description,
        duration: level === "toastSound" ? 12_000 : 8000,
        className: level === "toastSound" ? "ws-toast-urgent" : undefined,
        action: {
          label: t("notifications.toastView"),
          onClick: () => router.push(inbox),
        },
      });
    }

    const activeIdSet = new Set(active.map((a) => a.id));
    for (const id of alertToastIds.current) {
      if (!activeIdSet.has(id)) {
        alertToastIds.current.delete(id);
      }
    }
  }, [alertsData, user, role, router, t]);

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
      ...(messagesData?.map((m) => transformMessage(m, role)) ?? []),
    ];
    return rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [alertsData, tasksData, messagesData, role, t]);

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
    setReadIds((prev) => new Set([...prev, id]));

    if (id.startsWith("message-")) {
      const messageId = Number(id.replace("message-", ""));
      if (!isNaN(messageId)) {
        api.markWorkflowMessageRead(messageId).catch(console.error);
      }
    }
  }, []);

  const markAllAsRead = useCallback(() => {
    const allIds = notifications.map((n) => n.id);
    setReadIds((prev) => new Set([...prev, ...allIds]));

    messagesData?.forEach((msg) => {
      if (!msg.is_read) {
        api.markWorkflowMessageRead(msg.id).catch(console.error);
      }
    });
  }, [notifications, messagesData]);

  const clearAll = useCallback(() => {
    setReadIds(new Set(notifications.map((n) => n.id)));
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [notifications, queryClient]);

  return {
    unreadCount,
    notifications: processedNotifications,
    markAsRead,
    markAllAsRead,
    clearAll,
    hasNewNotifications,
  };
}
