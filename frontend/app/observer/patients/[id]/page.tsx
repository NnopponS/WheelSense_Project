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

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 403) {
    return "You do not have permission for this action.";
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function ObserverPatientDetailPage() {
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
    onError: (error) => setActionError(errorText(error, "Failed to save observation note.")),
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
    onError: (error) => setActionError(errorText(error, "Failed to send workflow message.")),
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
    onError: (error) => setActionError(errorText(error, "Failed to submit handover note.")),
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
    onError: (error) => setActionError(errorText(error, "Failed to update task status.")),
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
    onError: (error) => setActionError(errorText(error, "Failed to mark message as read.")),
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
        subject: message.subject || "Care coordination message",
        body: message.body,
        isRead: message.is_read,
        createdAt: message.created_at,
      }));
  }, [patientMessages]);

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
        header: "Time",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      { accessorKey: "heartRate", header: "HR", cell: ({ row }) => row.original.heartRate ?? "-" },
      { accessorKey: "spo2", header: "SpO2", cell: ({ row }) => row.original.spo2 ?? "-" },
      {
        accessorKey: "rrInterval",
        header: "RR interval",
        cell: ({ row }) => (row.original.rrInterval != null ? `${row.original.rrInterval} ms` : "-"),
      },
      {
        accessorKey: "battery",
        header: "Battery",
        cell: ({ row }) => (row.original.battery != null ? `${row.original.battery}%` : "-"),
      },
      { accessorKey: "source", header: "Source" },
    ],
    [],
  );

  const taskColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description || "No description"}</p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
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
          return <Badge variant={variant}>{priority}</Badge>;
        },
      },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge> },
      {
        accessorKey: "dueAt",
        header: "Due",
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
                Start
              </Button>
            ) : null}
            {row.original.status !== "completed" ? (
              <Button
                type="button"
                size="sm"
                onClick={() => updateTaskMutation.mutate({ taskId: row.original.id, status: "completed" })}
              >
                Complete
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => updateTaskMutation.mutate({ taskId: row.original.id, status: "pending" })}
              >
                Reopen
              </Button>
            )}
          </div>
        ),
      },
    ],
    [updateTaskMutation],
  );

  const timelineColumns = useMemo<ColumnDef<TimelineRow>[]>(
    () => [
      {
        accessorKey: "eventType",
        header: "Event",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.eventType}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      { accessorKey: "roomName", header: "Room" },
      { accessorKey: "source", header: "Source" },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const messagesColumns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Message",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.subject}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: "isRead",
        header: "Read",
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "success" : "warning"}>
            {row.original.isRead ? "read" : "unread"}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
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
              Mark read
            </Button>
          ),
      },
    ],
    [markReadMutation],
  );

  const handoversColumns = useMemo<ColumnDef<HandoverRow>[]>(
    () => [
      {
        accessorKey: "note",
        header: "Handover note",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="line-clamp-3 text-sm text-foreground">{row.original.note}</p>
            <p className="text-xs text-muted-foreground">{row.original.targetRole || "all roles"}</p>
          </div>
        ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  if (!hasValidPatientId) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-xl font-semibold text-foreground">Invalid patient ID</h2>
          <p className="text-sm text-muted-foreground">
            The route parameter is invalid. Return to the patient roster and select a patient.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/observer/patients">Back to patients</Link>
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
          {patient ? `${patient.first_name} ${patient.last_name}` : "Patient detail"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Observer care coordination workspace for notes, tasks, messages, and handovers.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard icon={Bell} label="Active alerts" value={activeAlerts.length} tone={activeAlerts.length > 0 ? "warning" : "success"} />
        <SummaryStatCard icon={HeartPulse} label="Recent vitals" value={vitalsRows.length} tone="info" />
        <SummaryStatCard icon={ClipboardList} label="Open tasks" value={taskRows.filter((row) => row.status !== "completed").length} tone="warning" />
        <SummaryStatCard icon={MessageSquare} label="Unread messages" value={messageRows.filter((row) => !row.isRead).length} tone="warning" />
      </section>

      {actionError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-sm font-semibold text-foreground">Add Observation Note</h3>
            <Textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={4}
              placeholder="Record what you observed during rounds"
            />
            <Button
              type="button"
              disabled={createTimelineMutation.isPending || !noteText.trim()}
              onClick={() => createTimelineMutation.mutate(noteText.trim())}
            >
              {createTimelineMutation.isPending ? "Saving..." : "Save to timeline"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-sm font-semibold text-foreground">Send Role Message</h3>
            <div className="space-y-2">
              <Label htmlFor="observer-message-subject">Subject</Label>
              <Input
                id="observer-message-subject"
                value={messageSubject}
                onChange={(event) => setMessageSubject(event.target.value)}
                placeholder="Patient update"
              />
            </div>
            <Textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              rows={4}
              placeholder="Send update to head nurse"
            />
            <Button
              type="button"
              disabled={sendMessageMutation.isPending || !messageText.trim()}
              onClick={() =>
                sendMessageMutation.mutate({
                  subject: messageSubject.trim() || "Patient update",
                  body: messageText.trim(),
                })
              }
            >
              {sendMessageMutation.isPending ? "Sending..." : "Send message"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="text-sm font-semibold text-foreground">Submit Handover</h3>
            <Textarea
              value={handoverText}
              onChange={(event) => setHandoverText(event.target.value)}
              rows={4}
              placeholder="Record concise handover for next shift"
            />
            <Button
              type="button"
              disabled={createHandoverMutation.isPending || !handoverText.trim()}
              onClick={() => createHandoverMutation.mutate(handoverText.trim())}
            >
              {createHandoverMutation.isPending ? "Submitting..." : "Add handover"}
            </Button>
          </CardContent>
        </Card>
      </section>

      <DataTableCard
        title="Recent Vitals"
        description="Latest patient vitals records."
        data={vitalsRows}
        columns={vitalsColumns}
        isLoading={isLoadingAny}
        emptyText="No vitals captured for this patient."
      />

      <DataTableCard
        title="Task Workflow"
        description="Patient-linked tasks with inline status actions."
        data={taskRows}
        columns={taskColumns}
        isLoading={isLoadingAny}
        emptyText="No tasks assigned to this patient."
        rightSlot={<Activity className="h-4 w-4 text-muted-foreground" />}
      />

      <DataTableCard
        title="Timeline"
        description="Recent timeline events and observer notes."
        data={timelineRows}
        columns={timelineColumns}
        isLoading={isLoadingAny}
        emptyText="No timeline events recorded yet."
      />

      <DataTableCard
        title="Workflow Messages"
        description="Messages linked to this patient case."
        data={messageRows}
        columns={messagesColumns}
        isLoading={isLoadingAny}
        emptyText="No messages for this patient yet."
      />

      <DataTableCard
        title="Handover Notes"
        description="Shift handover notes for this patient."
        data={handoverRows}
        columns={handoversColumns}
        isLoading={isLoadingAny}
        emptyText="No handover notes submitted yet."
        rightSlot={<NotebookPen className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
