"use client";
"use no memo";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Activity, Bell, ClipboardList, HeartPulse, MessageSquare, NotebookPen } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  SendWorkflowMessageRequest,
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
  isRead: boolean;
  createdAt: string;
};

type HandoverRow = {
  id: number;
  note: string;
  priority: string;
  targetRole: string | null;
  createdAt: string;
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

export default function ObserverPatientDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const queryClient = useQueryClient();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const patientId = Number(rawId);
  const hasValidPatientId = Number.isFinite(patientId) && patientId > 0;

  const [noteText, setNoteText] = useState("");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageText, setMessageText] = useState("");
  const [handoverText, setHandoverText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const patientQuery = useQuery({
    queryKey: ["observer", "patient-detail", patientId, "patient"],
    enabled: hasValidPatientId,
    queryFn: () => api.getPatient(patientId),
  });

  const vitalsQuery = useQuery({
    queryKey: ["observer", "patient-detail", patientId, "vitals"],
    enabled: hasValidPatientId,
    queryFn: () => api.listVitalReadings({ patient_id: patientId, limit: 120 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["observer", "patient-detail", patientId, "alerts"],
    enabled: hasValidPatientId,
    queryFn: () => api.listAlerts({ patient_id: patientId, limit: 120 }),
  });

  const timelineQuery = useQuery({
    queryKey: ["observer", "patient-detail", patientId, "timeline"],
    enabled: hasValidPatientId,
    queryFn: () => api.listTimelineEvents({ patient_id: patientId, limit: 120 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["observer", "patient-detail", patientId, "tasks"],
    enabled: hasValidPatientId,
    queryFn: () => api.listWorkflowTasks({ limit: 300 }),
  });

  const messagesQuery = useQuery({
    queryKey: ["observer", "patient-detail", patientId, "messages"],
    enabled: hasValidPatientId,
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 300 }),
  });

  const handoversQuery = useQuery({
    queryKey: ["observer", "patient-detail", patientId, "handovers"],
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
      await queryClient.invalidateQueries({ queryKey: ["observer", "patient-detail", patientId, "timeline"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard"] });
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errSaveNote")),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (values: { subject: string; body: string }) => {
      const payload = {
        recipient_role: "head_nurse",
        patient_id: patientId,
        subject: values.subject,
        body: values.body,
      } satisfies SendWorkflowMessageRequest;

      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      setMessageSubject("");
      setMessageText("");
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["observer", "patient-detail", patientId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errSendMessage")),
  });

  const createHandoverMutation = useMutation({
    mutationFn: async (note: string) => {
      const payload = {
        patient_id: patientId,
        target_role: "head_nurse",
        shift_label: "observer_update",
        priority: "routine",
        note,
      } satisfies CreateWorkflowHandoverRequest;

      await api.createWorkflowHandover(payload);
    },
    onSuccess: async () => {
      setHandoverText("");
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["observer", "patient-detail", patientId, "handovers"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errHandover")),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { taskId: number; status: "pending" | "in_progress" | "completed" }) => {
      await api.updateWorkflowTask(variables.taskId, { status: variables.status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["observer", "patient-detail", patientId, "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
      setActionError(null);
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errTaskStatus")),
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.markWorkflowMessageRead(messageId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["observer", "patient-detail", patientId, "messages"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "patients"] });
      setActionError(null);
    },
    onError: (error) => setActionError(errorText(error, t, "observer.patientDetail.errMarkRead")),
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
        isRead: message.is_read,
        createdAt: message.created_at,
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
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.subject}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
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
            <Link href="/observer/patients">{t("observer.patientDetail.back")}</Link>
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
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {patient ? `${patient.first_name} ${patient.last_name}` : t("observer.patientDetail.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("observer.patientDetail.subtitle")}</p>
      </div>

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

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
            <h3 className="text-sm font-semibold text-foreground">{t("observer.patientDetail.sendRoleMessage")}</h3>
            <div className="space-y-2">
              <Label htmlFor="observer-message-subject">{t("observer.patientDetail.subject")}</Label>
              <Input
                id="observer-message-subject"
                value={messageSubject}
                onChange={(event) => setMessageSubject(event.target.value)}
                placeholder={t("observer.patientDetail.patientUpdate")}
              />
            </div>
            <Textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              rows={4}
              placeholder={t("observer.patientDetail.messagePlaceholder")}
            />
            <Button
              type="button"
              disabled={sendMessageMutation.isPending || !messageText.trim()}
              onClick={() =>
                sendMessageMutation.mutate({
                  subject: messageSubject.trim() || t("observer.patientDetail.patientUpdate"),
                  body: messageText.trim(),
                })
              }
            >
              {sendMessageMutation.isPending ? t("observer.patientDetail.sending") : t("observer.patientDetail.sendMessage")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-sm font-semibold text-foreground">{t("observer.patientDetail.submitHandover")}</h3>
            <Textarea
              value={handoverText}
              onChange={(event) => setHandoverText(event.target.value)}
              rows={4}
              placeholder={t("observer.patientDetail.handoverPlaceholder")}
            />
            <Button
              type="button"
              disabled={createHandoverMutation.isPending || !handoverText.trim()}
              onClick={() => createHandoverMutation.mutate(handoverText.trim())}
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
      />

      <DataTableCard
        title={t("observer.patientDetail.taskWorkflowTitle")}
        description={t("observer.patientDetail.taskWorkflowDesc")}
        data={taskRows}
        columns={taskColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noTasks")}
        rightSlot={<Activity className="h-4 w-4 text-muted-foreground" />}
      />

      <DataTableCard
        title={t("observer.patientDetail.timelineTitle")}
        description={t("observer.patientDetail.timelineDesc")}
        data={timelineRows}
        columns={timelineColumns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patientDetail.noTimeline")}
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
      />
    </div>
  );
}
