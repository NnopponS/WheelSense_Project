"use client";
"use no memo";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Activity, Bell, ClipboardList, HeartPulse, MessageSquare, NotebookPen } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import {
  WorkflowMessageDetailDialog,
  WorkflowMessagePreviewTrigger,
} from "@/components/messaging/WorkflowMessageDetailDialog";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
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
import { api, ApiError } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  CareTaskOut,
  CreateTimelineEventRequest,
  CreateWorkflowHandoverRequest,
  GetPatientResponse,
  ListAlertsResponse,
  ListTimelineEventsResponse,
  ListVitalReadingsResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
  RoleMessageAttachmentOut,
} from "@/lib/api/task-scope-types";

type VitalsRow = {
  id: number;
  timestamp: string;
  heartRate: number | null;
  spo2: number | null;
  rrInterval: number | null;
  battery: number | null;
  source: string;
};

type TaskRow = {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  dueAt: string | null;
};

type TimelineRow = {
  id: number;
  eventType: string;
  description: string;
  roomName: string;
  source: string;
  timestamp: string;
};

type MessageRow = {
  id: number;
  subject: string;
  body: string;
  senderUserId: number;
  recipientRole: string | null;
  recipientUserId: number | null;
  isRead: boolean;
  createdAt: string;
  attachments: RoleMessageAttachmentOut[];
};

type HandoverRow = {
  id: number;
  note: string;
  priority: string;
  targetRole: string | null;
  createdAt: string;
};

type HandoverTargetRoleChoice = "all" | "head_nurse" | "supervisor" | "admin" | "observer";

type AlertRow = {
  id: number;
  title: string;
  alertType: string;
  description: string;
  severity: string;
  status: string;
  timestamp: string;
};

function errorText(
  error: unknown,
  translate: (key: TranslationKey) => string,
  fallbackKey: TranslationKey,
): string {
  if (error instanceof ApiError && error.status === 403) {
    return translate("observer.patientDetail.forbidden");
  }
  if (error instanceof Error) return error.message;
  return translate(fallbackKey);
}

function taskPriorityLabel(translate: (key: TranslationKey) => string, priority: string): string {
  switch (priority) {
    case "low":
      return translate("priority.low");
    case "medium":
      return translate("priority.medium");
    case "high":
      return translate("priority.high");
    case "critical":
      return translate("support.priorityCritical");
    case "urgent":
      return translate("priority.urgent");
    case "normal":
      return translate("support.priorityNormal");
    default:
      return priority;
  }
}

/** Shared query prefix so observer route and admin patient tab share cache; matches WorkflowTasksHubContent invalidation. */
const QK = ["observer", "patient-detail"] as const;

export type PatientCareCoordinationPanelProps = {
  patientId: number;
  /** When false, hide patient name heading (e.g. embedded in patient detail tabs). */
  showHeader?: boolean;
  /** Link target for invalid patient id state. */
  invalidBackHref?: string;
};

export function PatientCareCoordinationPanel({
  patientId,
  showHeader = true,
  invalidBackHref = "/observer/personnel",
}: PatientCareCoordinationPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const hasValidPatientId = Number.isFinite(patientId) && patientId > 0;

  const [noteText, setNoteText] = useState("");
  const [handoverText, setHandoverText] = useState("");
  const [handoverTargetRole, setHandoverTargetRole] = useState<HandoverTargetRoleChoice>("head_nurse");
  const [actionError, setActionError] = useState<string | null>(null);
  const [messageDetail, setMessageDetail] = useState<MessageRow | null>(null);
  const [pendingAlertId, setPendingAlertId] = useState<number | null>(null);

  const patientQuery = useQuery({
    queryKey: [...QK, patientId, "patient"],
    enabled: hasValidPatientId,
    queryFn: () => api.getPatient(patientId),
  });

  const vitalsQuery = useQuery({
    queryKey: [...QK, patientId, "vitals"],
    enabled: hasValidPatientId,
    queryFn: () => api.listVitalReadings({ patient_id: patientId, limit: 120 }),
  });

  const alertsQuery = useQuery({
    queryKey: [...QK, patientId, "alerts"],
    enabled: hasValidPatientId,
    queryFn: () => api.listAlerts({ patient_id: patientId, limit: 120 }),
  });

  const timelineQuery = useQuery({
    queryKey: [...QK, patientId, "timeline"],
    enabled: hasValidPatientId,
    queryFn: () => api.listTimelineEvents({ patient_id: patientId, limit: 120 }),
  });

  const tasksQuery = useQuery({
    queryKey: [...QK, patientId, "tasks"],
    enabled: hasValidPatientId,
    queryFn: () => api.listWorkflowTasks({ limit: 300 }),
  });

  const messagesQuery = useQuery({
    queryKey: [...QK, patientId, "messages"],
    enabled: hasValidPatientId,
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 300 }),
  });

  const handoversQuery = useQuery({
    queryKey: [...QK, patientId, "handovers"],
    enabled: hasValidPatientId,
    queryFn: () => api.listWorkflowHandovers({ patient_id: patientId, limit: 120 }),
  });

  const createTimelineMutation = useMutation({
    mutationFn: async (description: string) => {
      const payload = {
        patient_id: patientId,
        event_type: "observation",
        description,
        room_name: "",
        source: "observer",
        data: { channel: "observer_note" },
      } satisfies CreateTimelineEventRequest;

      await api.createTimelineEvent(payload);
    },
    onSuccess: async () => {
      setNoteText("");
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: [...QK, patientId, "timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard"] });
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errSaveNote")),
  });

  const createHandoverMutation = useMutation({
    mutationFn: async (input: { note: string; targetRole: HandoverTargetRoleChoice }) => {
      const payload = {
        patient_id: patientId,
        target_role: input.targetRole === "all" ? null : input.targetRole,
        shift_label: "observer_update",
        priority: "routine",
        note: input.note,
      } satisfies CreateWorkflowHandoverRequest;

      await api.createWorkflowHandover(payload);
    },
    onSuccess: async () => {
      setHandoverText("");
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: [...QK, patientId, "handovers"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errHandover")),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { taskId: number; status: "pending" | "in_progress" | "completed" }) => {
      await api.updateWorkflowTask(variables.taskId, { status: variables.status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...QK, patientId, "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setActionError(null);
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errTaskStatus")),
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.markWorkflowMessageRead(messageId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...QK, patientId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
      setActionError(null);
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errMarkRead")),
  });

  const updateAlertMutation = useMutation({
    mutationFn: async (variables: { id: number; action: "acknowledge" | "resolve" }) => {
      if (variables.action === "acknowledge") {
        await api.acknowledgeAlert(variables.id, { caregiver_id: null });
        return;
      }
      await api.resolveAlert(variables.id, { resolution_note: "" });
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: [...QK, patientId, "alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errAlertAction")),
    onSettled: () => setPendingAlertId(null),
  });

  const patient = useMemo(
    () => (patientQuery.data ?? null) as GetPatientResponse | null,
    [patientQuery.data],
  );
  const vitals = useMemo(
    () => (vitalsQuery.data ?? []) as ListVitalReadingsResponse,
    [vitalsQuery.data],
  );
  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );
  const timeline = useMemo(
    () => (timelineQuery.data ?? []) as ListTimelineEventsResponse,
    [timelineQuery.data],
  );
  const tasks = useMemo(
    () => (tasksQuery.data ?? []) as CareTaskOut[],
    [tasksQuery.data],
  );
  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );
  const handovers = useMemo(
    () => (handoversQuery.data ?? []) as ListWorkflowHandoversResponse,
    [handoversQuery.data],
  );

  const patientTasks = useMemo(
    () => tasks.filter((task) => task.patient_id === patientId),
    [patientId, tasks],
  );

  const patientMessages = useMemo(
    () => messages.filter((message) => message.patient_id === patientId),
    [messages, patientId],
  );

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts],
  );

  const alertRows = useMemo<AlertRow[]>(() => {
    return [...alerts]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((item) => ({
        id: item.id,
        title: item.title ?? item.alert_type,
        alertType: item.alert_type,
        description: item.description ?? "",
        severity: item.severity,
        status: item.status,
        timestamp: item.timestamp,
      }));
  }, [alerts]);

  const vitalsRows = useMemo<VitalsRow[]>(() => {
    return [...vitals]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((item) => ({
        id: item.id,
        timestamp: item.timestamp,
        heartRate: item.heart_rate_bpm,
        spo2: item.spo2,
        rrInterval: item.rr_interval_ms,
        battery: item.sensor_battery,
        source: item.source,
      }));
  }, [vitals]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return patientTasks
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        dueAt: task.due_at,
      }))
      .sort((left, right) => {
        if (!left.dueAt) return 1;
        if (!right.dueAt) return -1;
        return left.dueAt.localeCompare(right.dueAt);
      });
  }, [patientTasks]);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    return [...timeline]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .map((item) => ({
        id: item.id,
        eventType: item.event_type,
        description: item.description,
        roomName: item.room_name,
        source: item.source,
        timestamp: item.timestamp,
      }));
  }, [timeline]);

  const messageRows = useMemo<MessageRow[]>(() => {
    return [...patientMessages]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((message) => ({
        id: message.id,
        subject: message.subject || t("observer.patientDetail.defaultCareSubject"),
        body: message.body,
        senderUserId: message.sender_user_id,
        recipientRole: message.recipient_role,
        recipientUserId: message.recipient_user_id,
        isRead: message.is_read,
        createdAt: message.created_at,
        attachments: message.attachments ?? [],
      }));
  }, [patientMessages, t]);

  const handoverRows = useMemo<HandoverRow[]>(() => {
    return [...handovers]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((item) => ({
        id: item.id,
        note: item.note,
        priority: item.priority,
        targetRole: item.target_role,
        createdAt: item.created_at,
      }));
  }, [handovers]);

  const vitalsCsvExport = useMemo(
    () => ({
      fileNameBase: `observer-patient-${patientId}-vitals`,
      headers: [
        t("observer.patientDetail.colTime"),
        t("observer.patientDetail.colHeartRate"),
        t("observer.patientDetail.colSpo2"),
        t("observer.patientDetail.colRrInterval"),
        t("observer.patientDetail.colBattery"),
        t("observer.patientDetail.colSource"),
      ],
      getRowValues: (row: VitalsRow) => [
        formatDateTime(row.timestamp),
        row.heartRate ?? "",
        row.spo2 ?? "",
        row.rrInterval != null ? `${row.rrInterval} ${t("observer.patientDetail.unitMs")}` : "",
        row.battery != null ? `${row.battery}%` : "",
        row.source,
      ],
    }),
    [patientId, t],
  );

  const alertsCsvExport = useMemo(
    () => ({
      fileNameBase: `observer-patient-${patientId}-alerts`,
      headers: [
        t("clinical.table.alert"),
        t("observer.patientDetail.colAlertType"),
        t("observer.patientDetail.colDescription"),
        t("clinical.table.severity"),
        t("clinical.table.status"),
        t("clinical.table.time"),
      ],
      getRowValues: (row: AlertRow) => [
        row.title,
        row.alertType,
        row.description,
        row.severity,
        row.status,
        formatDateTime(row.timestamp),
      ],
    }),
    [patientId, t],
  );

  const tasksCsvExport = useMemo(
    () => ({
      fileNameBase: `observer-patient-${patientId}-tasks`,
      headers: [
        t("observer.patientDetail.colTask"),
        t("observer.patientDetail.colDescription"),
        t("observer.patientDetail.colPriority"),
        t("observer.patientDetail.colStatus"),
        t("observer.patientDetail.colDue"),
      ],
      getRowValues: (row: TaskRow) => [
        row.title,
        row.description,
        taskPriorityLabel(t, row.priority),
        row.status,
        formatDateTime(row.dueAt),
      ],
    }),
    [patientId, t],
  );

  const timelineCsvExport = useMemo(
    () => ({
      fileNameBase: `observer-patient-${patientId}-timeline`,
      headers: [
        t("observer.patientDetail.colEvent"),
        t("observer.patientDetail.colDescription"),
        t("observer.patientDetail.colRoom"),
        t("observer.patientDetail.colSource"),
        t("observer.patientDetail.colTime"),
      ],
      getRowValues: (row: TimelineRow) => [
        row.eventType,
        row.description,
        row.roomName,
        row.source,
        formatDateTime(row.timestamp),
      ],
    }),
    [patientId, t],
  );

  const handoversCsvExport = useMemo(
    () => ({
      fileNameBase: `observer-patient-${patientId}-handovers`,
      headers: [
        t("observer.patientDetail.colHandoverNote"),
        t("observer.patientDetail.colPriority"),
        t("observer.patientDetail.colTargetRole"),
        t("observer.patientDetail.colCreated"),
      ],
      getRowValues: (row: HandoverRow) => [
        row.note,
        row.priority,
        row.targetRole ?? "",
        formatDateTime(row.createdAt),
      ],
    }),
    [patientId, t],
  );

  const alertColumns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("clinical.table.alert"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.alertType}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        accessorKey: "severity",
        header: t("clinical.table.severity"),
        cell: ({ row }) => {
          const alertSeverity = row.original.severity;
          const variant =
            alertSeverity === "critical"
              ? "destructive"
              : alertSeverity === "warning"
                ? "warning"
                : "secondary";
          return <Badge variant={variant}>{alertSeverity}</Badge>;
        },
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "destructive" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: t("clinical.table.time"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: t("observer.patientDetail.colActions"),
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-2">
            {row.original.status === "active" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={updateAlertMutation.isPending && pendingAlertId === row.original.id}
                onClick={() => {
                  setPendingAlertId(row.original.id);
                  setActionError(null);
                  updateAlertMutation.mutate({ id: row.original.id, action: "acknowledge" });
                }}
              >
                {t("observer.patientDetail.acknowledgeAlert")}
              </Button>
            ) : null}
            {row.original.status === "active" || row.original.status === "acknowledged" ? (
              <Button
                type="button"
                size="sm"
                disabled={updateAlertMutation.isPending && pendingAlertId === row.original.id}
                onClick={() => {
                  setPendingAlertId(row.original.id);
                  setActionError(null);
                  updateAlertMutation.mutate({ id: row.original.id, action: "resolve" });
                }}
              >
                {t("observer.patientDetail.resolveAlert")}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [pendingAlertId, t, updateAlertMutation],
  );

  const vitalsColumns = useMemo<ColumnDef<VitalsRow>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: t("observer.patientDetail.colTime"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      {
        accessorKey: "heartRate",
        header: t("observer.patientDetail.colHeartRate"),
        cell: ({ row }) => row.original.heartRate ?? "-",
      },
      {
        accessorKey: "spo2",
        header: t("observer.patientDetail.colSpo2"),
        cell: ({ row }) => row.original.spo2 ?? "-",
      },
      {
        accessorKey: "rrInterval",
        header: t("observer.patientDetail.colRrInterval"),
        cell: ({ row }) =>
          row.original.rrInterval != null
            ? `${row.original.rrInterval} ${t("observer.patientDetail.unitMs")}`
            : "-",
      },
      {
        accessorKey: "battery",
        header: t("observer.patientDetail.colBattery"),
        cell: ({ row }) => (row.original.battery != null ? `${row.original.battery}%` : "-"),
      },
      { accessorKey: "source", header: t("observer.patientDetail.colSource") },
    ],
    [t],
  );

  const taskColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("observer.patientDetail.colTask"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {row.original.description || t("observer.patientDetail.noDescription")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: t("observer.patientDetail.colPriority"),
        cell: ({ row }) => {
          const priority = row.original.priority;
          const variant =
            priority === "critical"
              ? "destructive"
              : priority === "high"
                ? "warning"
                : priority === "normal"
                  ? "secondary"
                  : "outline";
          return <Badge variant={variant}>{taskPriorityLabel(t, priority)}</Badge>;
        },
      },
      {
        accessorKey: "status",
        header: t("observer.patientDetail.colStatus"),
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "dueAt",
        header: t("observer.patientDetail.colDue"),
        cell: ({ row }) => formatDateTime(row.original.dueAt),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-2">
            {row.original.status !== "in_progress" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  updateTaskMutation.mutate({ taskId: row.original.id, status: "in_progress" })
                }
              >
                {t("observer.patientDetail.startTask")}
              </Button>
            ) : null}
            {row.original.status !== "completed" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => updateTaskMutation.mutate({ taskId: row.original.id, status: "completed" })}
              >
                {t("observer.patientDetail.completeTask")}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => updateTaskMutation.mutate({ taskId: row.original.id, status: "pending" })}
              >
                {t("observer.patientDetail.reopenTask")}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, updateTaskMutation],
  );

  const timelineColumns = useMemo<ColumnDef<TimelineRow>[]>(
    () => [
      {
        accessorKey: "eventType",
        header: t("observer.patientDetail.colEvent"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.eventType}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      { accessorKey: "roomName", header: t("observer.patientDetail.colRoom") },
      { accessorKey: "source", header: t("observer.patientDetail.colSource") },
      {
        accessorKey: "timestamp",
        header: t("observer.patientDetail.colTime"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
    ],
    [t],
  );

  const messagesColumns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      {
        accessorKey: "subject",
        header: t("observer.patientDetail.colMessage"),
        cell: ({ row }) => (
          <WorkflowMessagePreviewTrigger
            subject={row.original.subject}
            body={row.original.body}
            onOpen={() => setMessageDetail(row.original)}
          />
        ),
      },
      {
        accessorKey: "isRead",
        header: t("observer.patientDetail.colRead"),
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "success" : "warning"}>
            {row.original.isRead ? t("observer.patientDetail.readBadge") : t("observer.patientDetail.unreadBadge")}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: t("observer.patientDetail.colCreated"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.isRead ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => markReadMutation.mutate(row.original.id)}
            >
              {t("observer.patientDetail.markRead")}
            </Button>
          ),
      },
    ],
    [markReadMutation, t],
  );

  const observerMessageMeta =
    messageDetail != null ? (
      <div className="space-y-3">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            {t("headNurse.messages.fromUserPrefix")}
            {messageDetail.senderUserId}
          </p>
          <p>
            {messageDetail.recipientRole
              ? `${t("headNurse.messages.recipientRolePrefix")}${messageDetail.recipientRole}`
              : t("headNurse.messages.directMessage")}
          </p>
          {messageDetail.recipientUserId ? (
            <p>
              {t("headNurse.messages.toUserPrefix")}
              {messageDetail.recipientUserId}
            </p>
          ) : null}
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-foreground">{formatDateTime(messageDetail.createdAt)}</p>
          <p className="text-xs text-muted-foreground">{formatRelativeTime(messageDetail.createdAt)}</p>
        </div>
        <Badge variant={messageDetail.isRead ? "success" : "warning"}>
          {messageDetail.isRead ? t("observer.patientDetail.readBadge") : t("observer.patientDetail.unreadBadge")}
        </Badge>
      </div>
    ) : null;

  const handoversColumns = useMemo<ColumnDef<HandoverRow>[]>(
    () => [
      {
        accessorKey: "note",
        header: t("observer.patientDetail.colHandoverNote"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="line-clamp-3 text-sm text-foreground">{row.original.note}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.targetRole || t("observer.patientDetail.allRoles")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: t("observer.patientDetail.colPriority"),
      },
      {
        accessorKey: "createdAt",
        header: t("observer.patientDetail.colCreated"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [t],
  );

  if (!hasValidPatientId) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-xl font-semibold text-foreground">{t("observer.patientDetail.invalidId")}</h2>
          <p className="text-sm text-muted-foreground">{t("observer.patientDetail.invalidIdDesc")}</p>
          <Button asChild size="sm" variant="outline">
            <Link href={invalidBackHref}>{t("observer.patientDetail.back")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isLoadingAny =
    patientQuery.isLoading ||
    vitalsQuery.isLoading ||
    alertsQuery.isLoading ||
    timelineQuery.isLoading ||
    tasksQuery.isLoading ||
    messagesQuery.isLoading ||
    handoversQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {showHeader ? (
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            {patient ? `${patient.first_name} ${patient.last_name}` : t("observer.patientDetail.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("observer.patientDetail.subtitle")}</p>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard icon={Bell} label={t("observer.patientDetail.activeAlerts")} value={activeAlerts.length} tone={activeAlerts.length > 0 ? "warning" : "success"} />
        <SummaryStatCard icon={HeartPulse} label={t("observer.patientDetail.recentVitals")} value={vitalsRows.length} tone="info" />
        <SummaryStatCard icon={ClipboardList} label={t("observer.patientDetail.openTasks")} value={taskRows.filter((row) => row.status !== "completed").length} tone="warning" />
        <SummaryStatCard icon={MessageSquare} label={t("observer.patientDetail.unreadMessages")} value={messageRows.filter((row) => !row.isRead).length} tone="warning" />
      </section>

      {actionError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-sm font-semibold text-foreground">{t("observer.patientDetail.addObservation")}</h3>
            <Textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={4}
              placeholder={t("observer.patientDetail.observationPlaceholder")}
            />
            <Button
              type="button"
              disabled={createTimelineMutation.isPending || !noteText.trim()}
              onClick={() => createTimelineMutation.mutate(noteText.trim())}
            >
              {createTimelineMutation.isPending ? t("observer.patientDetail.saving") : t("observer.patientDetail.saveTimeline")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-sm font-semibold text-foreground">{t("observer.patientDetail.submitHandover")}</h3>
            <div className="space-y-2">
              <Label htmlFor="observer-handover-target-role">{t("observer.patientDetail.handoverTargetRole")}</Label>
              <Select
                value={handoverTargetRole}
                onValueChange={(value) => setHandoverTargetRole(value as HandoverTargetRoleChoice)}
              >
                <SelectTrigger id="observer-handover-target-role" className="w-full max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("observer.patientDetail.handoverTargetAll")}</SelectItem>
                  <SelectItem value="head_nurse">{t("shell.roleHeadNurse")}</SelectItem>
                  <SelectItem value="supervisor">{t("shell.roleSupervisor")}</SelectItem>
                  <SelectItem value="admin">{t("shell.roleAdmin")}</SelectItem>
                  <SelectItem value="observer">{t("shell.roleObserver")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={handoverText}
              onChange={(event) => setHandoverText(event.target.value)}
              rows={4}
              placeholder={t("observer.patientDetail.handoverPlaceholder")}
            />
            <Button
              type="button"
              disabled={createHandoverMutation.isPending || !handoverText.trim()}
              onClick={() =>
                createHandoverMutation.mutate({
                  note: handoverText.trim(),
                  targetRole: handoverTargetRole,
                })
              }
            >
              {createHandoverMutation.isPending ? t("observer.patientDetail.submitting") : t("observer.patientDetail.addHandover")}
            </Button>
          </CardContent>
        </Card>
      </section>

      <DataTableCard
        title={t("observer.patientDetail.recentVitalsTitle")}
        description={t("observer.patientDetail.recentVitalsDesc")}
        data={vitalsRows}
        columns={vitalsColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noVitals")}
        csvExport={vitalsCsvExport}
      />

      <DataTableCard
        title={t("observer.patientDetail.alertsTitle")}
        description={t("observer.patientDetail.alertsDesc")}
        data={alertRows}
        columns={alertColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noAlerts")}
        rightSlot={<Bell className="h-4 w-4 text-muted-foreground" />}
        csvExport={alertsCsvExport}
      />

      <DataTableCard
        title={t("observer.patientDetail.taskWorkflowTitle")}
        description={t("observer.patientDetail.taskWorkflowDesc")}
        data={taskRows}
        columns={taskColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noTasks")}
        rightSlot={<Activity className="h-4 w-4 text-muted-foreground" />}
        csvExport={tasksCsvExport}
      />

      <DataTableCard
        title={t("observer.patientDetail.timelineTitle")}
        description={t("observer.patientDetail.timelineDesc")}
        data={timelineRows}
        columns={timelineColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noTimeline")}
        csvExport={timelineCsvExport}
      />

      <DataTableCard
        title={t("observer.patientDetail.messagesTitle")}
        description={t("observer.patientDetail.messagesDesc")}
        data={messageRows}
        columns={messagesColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noMessages")}
      />

      <DataTableCard
        title={t("observer.patientDetail.handoverTitle")}
        description={t("observer.patientDetail.handoverDesc")}
        data={handoverRows}
        columns={handoversColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noHandovers")}
        rightSlot={<NotebookPen className="h-4 w-4 text-muted-foreground" />}
        csvExport={handoversCsvExport}
      />

      {messageDetail ? (
        <WorkflowMessageDetailDialog
          open
          onOpenChange={(next) => {
            if (!next) setMessageDetail(null);
          }}
          subject={messageDetail.subject}
          body={messageDetail.body}
          meta={observerMessageMeta}
          messageId={messageDetail.id}
          attachments={messageDetail.attachments}
        />
      ) : null}
    </div>
  );
}
