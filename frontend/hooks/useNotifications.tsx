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
  alertsInboxUrl,
  staffMessagesPath,
  workflowTasksPath,
  type AppRole,
} from "@/lib/notificationRoutes";
import { AlertToastCard } from "@/components/notifications/AlertToastCard";
import type { TranslationKey } from "@/lib/i18n";
import type { Room } from "@/lib/types";
import type {
  AlertOut,
  CareTaskOut,
  CareWorkflowJobOut,
  RoleMessageOut,
} from "@/lib/api/task-scope-types";

/** Matches server `ROLE_CLINICAL_STAFF` for `GET /api/workflow/tasks` (patients are forbidden). */
const WORKFLOW_TASKS_ROLES = new Set(["admin", "head_nurse", "supervisor", "observer"]);

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
}

function severityNotifyLevel(severity: string | undefined): "none" | "toast" | "toastSound" {
  const s = (severity ?? "").toLowerCase();
  if (s === "low" || s === "info" || s === "informational") return "none";
  if (s === "medium" || s === "moderate") return "toast";
  return "toastSound";
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

async function resolvePatientAlertContext(
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

function workflowJobSignature(job: CareWorkflowJobOut): string {
  return `${job.updated_at}|${pendingWorkflowJobSteps(job)}|${job.status}`;
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
    link: workflowTasksPath(role),
    priority: "medium",
    data: job,
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
  const canAcknowledgeAlerts = role === "admin" || role === "head_nurse";

  const alertToastBootstrap = useRef(false);
  const alertToastIds = useRef<Set<number>>(new Set());
  const workflowJobNotifyBootstrap = useRef(false);
  const workflowJobSignatures = useRef<Map<number, string>>(new Map());

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

  const { data: workflowJobsData } = useQuery({
    queryKey: ["notifications", "workflow-jobs"],
    queryFn: () => api.listWorkflowJobs({ limit: 50 }),
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

    if (!alertToastBootstrap.current) {
      active.forEach((a) => alertToastIds.current.add(a.id));
      alertToastBootstrap.current = true;
      return;
    }

    for (const a of active) {
      if (alertToastIds.current.has(a.id)) continue;
      const level = severityNotifyLevel(a.severity);
      if (level === "none") {
        alertToastIds.current.add(a.id);
        continue;
      }
      alertToastIds.current.add(a.id);

      const title = a.title || a.alert_type || t("notifications.toastNewAlert");
      const description = a.description?.trim() || undefined;

      if (level === "toastSound") {
        playAlertChime();
      }

      const inboxTarget = alertsInboxUrl(role, a.id);

      void (async () => {
        let patientContext: { nameLine: string; roomLine: string } | null = null;
        if (a.patient_id != null) {
          patientContext = await resolvePatientAlertContext(a.patient_id, t);
        }

        const visualEmphasis =
          role === "observer" && level === "toastSound" ? "interrupt" : "standard";

        toast.custom(
          (toastId) => (
            <AlertToastCard
              toastId={toastId}
              alertId={a.id}
              title={title}
              description={description}
              alertType={a.alert_type}
              patientContext={patientContext}
              visualEmphasis={visualEmphasis}
              canAcknowledge={canAcknowledgeAlerts}
              onNavigateInbox={() => router.push(inboxTarget)}
            />
          ),
          {
            id: `ws-alert-toast-${a.id}`,
            duration: level === "toastSound" ? 14_000 : 9000,
            className: level === "toastSound" ? "ws-toast-urgent" : undefined,
          },
        );
      })();
    }

    const activeIdSet = new Set(active.map((a) => a.id));
    for (const id of alertToastIds.current) {
      if (!activeIdSet.has(id)) {
        alertToastIds.current.delete(id);
      }
    }
  }, [alertsData, user, role, router, t, canAcknowledgeAlerts]);

  useEffect(() => {
    if (!workflowJobsData || !user || !canListWorkflowTasks) return;
    const map = workflowJobSignatures.current;
    if (!workflowJobNotifyBootstrap.current) {
      workflowJobsData.forEach((j) => map.set(j.id, workflowJobSignature(j)));
      workflowJobNotifyBootstrap.current = true;
      return;
    }
    const activeStatuses = new Set(["draft", "active"]);
    for (const job of workflowJobsData) {
      const sig = workflowJobSignature(job);
      const prev = map.get(job.id);
      if (prev === undefined) {
        map.set(job.id, sig);
        if (activeStatuses.has(job.status)) {
          const pending = pendingWorkflowJobSteps(job);
          toast.info(t("notifications.workflowJobNewTitle"), {
            description:
              job.title && pending > 0
                ? `${job.title} · ${t("notifications.workflowJobPendingSteps").replace("{n}", String(pending))}`
                : job.title || undefined,
            duration: 12_000,
            action: {
              label: t("notifications.workflowJobOpenTasks"),
              onClick: () => router.push(workflowTasksPath(role)),
            },
          });
        }
        continue;
      }
      if (prev !== sig && activeStatuses.has(job.status)) {
        map.set(job.id, sig);
        const pending = pendingWorkflowJobSteps(job);
        toast.info(t("notifications.workflowJobUpdatedTitle"), {
          description:
            job.title && pending > 0
              ? `${job.title} · ${t("notifications.workflowJobPendingSteps").replace("{n}", String(pending))}`
              : job.title || undefined,
          duration: 12_000,
          action: {
            label: t("notifications.workflowJobOpenTasks"),
            onClick: () => router.push(workflowTasksPath(role)),
          },
        });
      } else {
        map.set(job.id, sig);
      }
    }
    const seen = new Set(workflowJobsData.map((j) => j.id));
    for (const id of map.keys()) {
      if (!seen.has(id)) map.delete(id);
    }
  }, [workflowJobsData, user, canListWorkflowTasks, t, router, role]);

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
    return rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [alertsData, tasksData, workflowJobsData, messagesData, role, t]);

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
