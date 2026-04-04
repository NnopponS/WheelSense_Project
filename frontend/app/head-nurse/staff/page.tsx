"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import {
  CalendarClock,
  ClipboardList,
  RefreshCcw,
  Search,
  UserCog,
} from "lucide-react";
import type { Caregiver } from "@/lib/types";

interface CareSchedule {
  id: number;
  title: string;
  starts_at: string;
  assigned_role: string | null;
  assigned_user_id: number | null;
  status: string;
}

interface CareTask {
  id: number;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_at: string | null;
  assigned_role: string | null;
  assigned_user_id: number | null;
}

export default function HeadNurseStaffPage() {
  const { data: caregivers, isLoading: caregiversLoading } =
    useQuery<Caregiver[]>("/caregivers");
  const { data: schedules, isLoading: schedulesLoading } =
    useQuery<CareSchedule[]>("/workflow/schedules?limit=40");
  const { data: tasks, isLoading: tasksLoading, refetch: refetchTasks } =
    useQuery<CareTask[]>("/workflow/tasks?limit=60");

  const [search, setSearch] = useState("");
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);

  const filteredCaregivers = useMemo(() => {
    const source = caregivers ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((item) =>
      `${item.first_name} ${item.last_name} ${item.role} ${item.email} ${item.phone}`
        .toLowerCase()
        .includes(q),
    );
  }, [caregivers, search]);

  async function updateTaskStatus(taskId: number, status: CareTask["status"]) {
    try {
      setUpdatingTaskId(taskId);
      await api.patch<CareTask>(`/workflow/tasks/${taskId}`, { status });
      await refetchTasks();
    } finally {
      setUpdatingTaskId(null);
    }
  }

  const openTasks = (tasks ?? []).filter((item) => item.status !== "completed");
  const dueSoon = openTasks
    .filter((item) => item.due_at)
    .sort((a, b) => new Date(a.due_at ?? "").getTime() - new Date(b.due_at ?? "").getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Staff & shift operations</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Team roster, active schedules, and executable workflow tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refetchTasks();
          }}
          className="px-3 py-2 rounded-lg bg-surface-container-low text-on-surface text-sm font-medium inline-flex items-center gap-2 hover:bg-surface-container transition-smooth"
        >
          <RefreshCcw className="w-4 h-4" />
          Refresh tasks
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">Active staff</p>
          <p className="text-2xl font-bold text-on-surface mt-2">
            {(caregivers ?? []).filter((item) => item.is_active).length}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">
            Open schedules
          </p>
          <p className="text-2xl font-bold text-on-surface mt-2">
            {(schedules ?? []).filter((item) => item.status !== "completed").length}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs uppercase tracking-wide text-on-surface-variant">Open tasks</p>
          <p className="text-2xl font-bold text-on-surface mt-2">{openTasks.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <UserCog className="w-4 h-4 text-primary" />
              Staff directory
            </h3>
          </div>
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nurse, role, phone, email"
              className="input-field input-field--leading-icon py-2.5 text-sm"
            />
          </div>
          {caregiversLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredCaregivers.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-surface-container-low px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-on-surface">
                      {item.first_name} {item.last_name}
                    </p>
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full uppercase font-semibold ${
                        item.is_active ? "care-normal" : "bg-surface-container text-outline"
                      }`}
                    >
                      {item.is_active ? "active" : "inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">{item.role || "caregiver"}</p>
                  <p className="text-xs text-outline mt-1">
                    {item.phone || "No phone"} · {item.email || "No email"}
                  </p>
                </div>
              ))}
              {filteredCaregivers.length === 0 && (
                <p className="text-sm text-on-surface-variant py-2">No staff match this search.</p>
              )}
            </div>
          )}
        </section>

        <section className="surface-card p-5">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-info" />
            Upcoming rounds & schedules
          </h3>
          {schedulesLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {(schedules ?? [])
                .sort(
                  (a, b) =>
                    new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
                )
                .slice(0, 16)
                .map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-surface-container-low px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-on-surface">{item.title}</p>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-surface text-on-surface-variant uppercase font-semibold">
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {new Date(item.starts_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-outline mt-1">
                      {item.assigned_role
                        ? `Assigned role: ${item.assigned_role}`
                        : item.assigned_user_id
                          ? `Assigned user #${item.assigned_user_id}`
                          : "Unassigned"}
                    </p>
                  </div>
                ))}
              {(schedules ?? []).length === 0 && (
                <p className="text-sm text-on-surface-variant py-2">
                  No workflow schedules found.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-warning" />
          Task board
        </h3>
        {tasksLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Due soon</p>
              {dueSoon.map((item) => (
                <TaskItem
                  key={item.id}
                  task={item}
                  busy={updatingTaskId === item.id}
                  onStart={() => void updateTaskStatus(item.id, "in_progress")}
                  onComplete={() => void updateTaskStatus(item.id, "completed")}
                />
              ))}
              {dueSoon.length === 0 && (
                <p className="text-sm text-on-surface-variant py-2">No time-bound open tasks.</p>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">All open</p>
              {openTasks.slice(0, 10).map((item) => (
                <TaskItem
                  key={item.id}
                  task={item}
                  busy={updatingTaskId === item.id}
                  onStart={() => void updateTaskStatus(item.id, "in_progress")}
                  onComplete={() => void updateTaskStatus(item.id, "completed")}
                />
              ))}
              {openTasks.length === 0 && (
                <p className="text-sm text-on-surface-variant py-2">No open tasks.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function TaskItem({
  task,
  onStart,
  onComplete,
  busy,
}: {
  task: CareTask;
  onStart: () => void;
  onComplete: () => void;
  busy: boolean;
}) {
  const priorityTone =
    task.priority === "critical"
      ? "care-critical"
      : task.priority === "high"
        ? "severity-warning"
        : "care-normal";

  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-on-surface">{task.title}</p>
        <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-semibold ${priorityTone}`}>
          {task.priority}
        </span>
      </div>
      {task.description && <p className="text-xs text-on-surface-variant mt-1">{task.description}</p>}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-outline">
          {task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due time"}
        </p>
        <div className="flex items-center gap-2">
          {task.status === "pending" && (
            <button
              type="button"
              disabled={busy}
              onClick={onStart}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-info-bg text-info hover:opacity-80 disabled:opacity-50 transition-smooth"
            >
              Start
            </button>
          )}
          {task.status !== "completed" && task.status !== "cancelled" && (
            <button
              type="button"
              disabled={busy}
              onClick={onComplete}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-success-bg text-success hover:opacity-80 disabled:opacity-50 transition-smooth"
            >
              Complete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
