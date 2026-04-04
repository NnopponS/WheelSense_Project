"use client";

import { useMemo, useState, type ComponentType, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import type { Patient } from "@/lib/types";
import { Bell, ClipboardList, MessageSquare, NotebookPen } from "lucide-react";

type TimelineEvent = {
  id: number;
  event_type: string;
  description: string;
  room_name: string;
  timestamp: string;
};

type CareTask = {
  id: number;
  patient_id: number | null;
  title: string;
  description: string;
  priority: string;
  due_at: string | null;
  status: string;
};

type RoleMessage = {
  id: number;
  patient_id: number | null;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

type HandoverNote = {
  id: number;
  patient_id: number | null;
  target_role: string | null;
  priority: string;
  note: string;
  created_at: string;
};

type AlertLite = {
  id: number;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;
};

export default function ObserverPatientDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data: patient, isLoading } = useQuery<Patient>(
    Number.isFinite(id) ? `/patients/${id}` : null,
  );
  const { data: timeline, refetch: refetchTimeline } = useQuery<TimelineEvent[]>(
    Number.isFinite(id) ? `/timeline?patient_id=${id}&limit=25` : null,
  );
  const { data: tasks, refetch: refetchTasks } = useQuery<CareTask[]>(
    Number.isFinite(id) ? "/workflow/tasks?limit=100" : null,
  );
  const { data: messages, refetch: refetchMessages } = useQuery<RoleMessage[]>(
    Number.isFinite(id) ? "/workflow/messages?limit=100" : null,
  );
  const { data: handovers, refetch: refetchHandovers } = useQuery<HandoverNote[]>(
    Number.isFinite(id) ? `/workflow/handovers?patient_id=${id}&limit=25` : null,
  );
  const { data: alerts } = useQuery<AlertLite[]>(
    Number.isFinite(id) ? `/alerts?status=active&patient_id=${id}&limit=20` : null,
  );

  const [noteText, setNoteText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [handoverText, setHandoverText] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);
  const [actionError, setActionError] = useState("");
  const patientId = Number.isFinite(id) ? id : null;
  const patientTasks = useMemo(
    () =>
      patientId == null
        ? []
        : (tasks ?? []).filter((task) => task.patient_id === patientId),
    [patientId, tasks],
  );
  const patientMessages = useMemo(
    () =>
      patientId == null
        ? []
        : (messages ?? []).filter((message) => message.patient_id === patientId),
    [messages, patientId],
  );
  const activeAlerts = alerts ?? [];
  const patientTimeline = timeline ?? [];
  const patientHandovers = handovers ?? [];

  if (isLoading || !patient) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const submitTimelineNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!noteText.trim()) return;

    setActionError("");
    setIsSubmittingNote(true);
    try {
      await api.post<TimelineEvent>("/timeline", {
        patient_id: patient.id,
        event_type: "observation",
        description: noteText.trim(),
        source: "caregiver",
        data: { channel: "observer_note" },
      });
      setNoteText("");
      await refetchTimeline();
    } catch (error) {
      setActionError(getActionError(error, "Failed to save observation note"));
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!messageText.trim()) return;

    setActionError("");
    setIsSubmittingMessage(true);
    try {
      await api.post<RoleMessage>("/workflow/messages", {
        recipient_role: "head_nurse",
        patient_id: patient.id,
        subject: `Patient update: ${patient.first_name} ${patient.last_name}`,
        body: messageText.trim(),
      });
      setMessageText("");
      await refetchMessages();
    } catch (error) {
      setActionError(getActionError(error, "Failed to send workflow message"));
    } finally {
      setIsSubmittingMessage(false);
    }
  };

  const submitHandover = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!handoverText.trim()) return;

    setActionError("");
    setIsSubmittingHandover(true);
    try {
      await api.post<HandoverNote>("/workflow/handovers", {
        patient_id: patient.id,
        target_role: "head_nurse",
        priority: "routine",
        note: handoverText.trim(),
      });
      setHandoverText("");
      await refetchHandovers();
    } catch (error) {
      setActionError(getActionError(error, "Failed to submit handover note"));
    } finally {
      setIsSubmittingHandover(false);
    }
  };

  const updateTaskStatus = async (taskId: number, status: string) => {
    setActionError("");
    try {
      await api.patch<CareTask>(`/workflow/tasks/${taskId}`, { status });
      await refetchTasks();
    } catch (error) {
      setActionError(getActionError(error, "Failed to update task status"));
    }
  };

  const markMessageRead = async (messageId: number) => {
    setActionError("");
    try {
      await api.post<RoleMessage>(`/workflow/messages/${messageId}/read`, {});
      await refetchMessages();
    } catch (error) {
      setActionError(getActionError(error, "Failed to mark message as read"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="surface-card p-5">
        <h2 className="text-2xl font-bold text-on-surface">
          {patient.first_name} {patient.last_name}
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
          {patient.nickname || "No nickname"} · Care level {patient.care_level} ·
          Mode {patient.current_mode}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
          <QuickStat label="Active alerts" value={activeAlerts.length} icon={Bell} />
          <QuickStat
            label="Open tasks"
            value={patientTasks.filter((task) => task.status !== "completed").length}
            icon={ClipboardList}
          />
          <QuickStat
            label="Unread messages"
            value={patientMessages.filter((message) => !message.is_read).length}
            icon={MessageSquare}
          />
          <QuickStat label="Handovers" value={patientHandovers.length} icon={NotebookPen} />
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl bg-critical-bg text-critical px-4 py-3 text-sm">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="surface-card p-5">
          <h3 className="text-base font-semibold text-on-surface mb-3">
            Add observation note
          </h3>
          <form onSubmit={submitTimelineNote} className="space-y-3">
            <textarea
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              className="w-full min-h-28 rounded-xl bg-surface-container-low p-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Record what you observed during rounds"
            />
            <button
              type="submit"
              disabled={isSubmittingNote || !noteText.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-60"
            >
              {isSubmittingNote ? "Saving..." : "Save note to timeline"}
            </button>
          </form>
        </section>

        <section className="surface-card p-5">
          <h3 className="text-base font-semibold text-on-surface mb-3">
            Send role message
          </h3>
          <form onSubmit={submitMessage} className="space-y-3">
            <textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              className="w-full min-h-28 rounded-xl bg-surface-container-low p-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Send update to head nurse or supervisor"
            />
            <button
              type="submit"
              disabled={isSubmittingMessage || !messageText.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-60"
            >
              {isSubmittingMessage ? "Sending..." : "Send message"}
            </button>
          </form>
        </section>
      </div>

      <section className="surface-card p-5">
        <h3 className="text-base font-semibold text-on-surface mb-3">Task workflow</h3>
        {patientTasks.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No tasks assigned to this patient.</p>
        ) : (
          <div className="space-y-3">
            {patientTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl bg-surface-container-low px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">
                    {task.title}
                  </p>
                  <p className="text-xs text-on-surface-variant truncate mt-0.5">
                    {task.description || "No description"}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    {task.priority} priority · {task.status}
                    {task.due_at ? ` · due ${new Date(task.due_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {task.status !== "in_progress" && (
                    <button
                      type="button"
                      onClick={() => updateTaskStatus(task.id, "in_progress")}
                      className="px-2.5 py-1.5 rounded-md bg-surface text-on-surface text-xs"
                    >
                      Start
                    </button>
                  )}
                  {task.status !== "completed" && (
                    <button
                      type="button"
                      onClick={() => updateTaskStatus(task.id, "completed")}
                      className="px-2.5 py-1.5 rounded-md bg-success-bg text-success text-xs"
                    >
                      Complete
                    </button>
                  )}
                  {task.status === "completed" && (
                    <button
                      type="button"
                      onClick={() => updateTaskStatus(task.id, "pending")}
                      className="px-2.5 py-1.5 rounded-md bg-surface text-on-surface text-xs"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="surface-card p-5">
          <h3 className="text-base font-semibold text-on-surface mb-3">Timeline</h3>
          {patientTimeline.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No timeline events recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {patientTimeline.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg bg-surface-container-low px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-on-surface">{event.event_type}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {event.description}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    {new Date(event.timestamp).toLocaleString()}
                    {event.room_name ? ` · ${event.room_name}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="surface-card p-5">
          <h3 className="text-base font-semibold text-on-surface mb-3">
            Messages for this patient
          </h3>
          {patientMessages.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No workflow messages yet.</p>
          ) : (
            <div className="space-y-2">
              {patientMessages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-lg bg-surface-container-low px-3 py-2.5 text-sm"
                >
                  <p className="font-medium text-on-surface">
                    {message.subject || "Care coordination message"}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{message.body}</p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <p className="text-[11px] text-on-surface-variant">
                      {new Date(message.created_at).toLocaleString()}
                    </p>
                    {!message.is_read && (
                      <button
                        type="button"
                        onClick={() => markMessageRead(message.id)}
                        className="text-xs px-2 py-1 rounded-md bg-surface text-on-surface"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="surface-card p-5 space-y-4">
        <h3 className="text-base font-semibold text-on-surface">Handover notes</h3>
        <form onSubmit={submitHandover} className="space-y-3">
          <textarea
            value={handoverText}
            onChange={(event) => setHandoverText(event.target.value)}
            className="w-full min-h-24 rounded-xl bg-surface-container-low p-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Record concise handover for the next shift"
          />
          <button
            type="submit"
            disabled={isSubmittingHandover || !handoverText.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-60"
          >
            {isSubmittingHandover ? "Submitting..." : "Add handover note"}
          </button>
        </form>
        {patientHandovers.length > 0 && (
          <div className="space-y-2">
            {patientHandovers.map((handover) => (
              <div
                key={handover.id}
                className="rounded-lg bg-surface-container-low px-3 py-2.5 text-sm"
              >
                <p className="text-on-surface">{handover.note}</p>
                <p className="text-[11px] text-on-surface-variant mt-1">
                  {handover.priority}
                  {handover.target_role ? ` · for ${handover.target_role}` : ""}
                  {` · ${new Date(handover.created_at).toLocaleString()}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-2.5">
      <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </p>
      <p className="text-lg font-semibold text-on-surface mt-1">{value}</p>
    </div>
  );
}

function getActionError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "You do not have permission for this action.";
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
