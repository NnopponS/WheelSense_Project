"use client";
"use no memo";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { CalendarClock, ClipboardList, Search, UserCog } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  CareTaskOut,
  CareScheduleOut,
  ListCaregiversResponse,
} from "@/lib/api/task-scope-types";

type CaregiverRow = {
  id: number;
  fullName: string;
  role: string;
  phone: string;
  email: string;
  isActive: boolean;
};

type ScheduleRow = {
  id: number;
  title: string;
  scheduleType: string;
  status: string;
  assignedRole: string | null;
  assignedUserId: number | null;
  startsAt: string;
};

type TaskRow = {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  dueAt: string | null;
  assignedRole: string | null;
  assignedUserId: number | null;
};

export default function HeadNurseStaffPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);

  const caregiversQuery = useQuery({
    queryKey: ["head-nurse", "staff", "caregivers"],
    queryFn: () => api.listCaregivers({ limit: 400 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["head-nurse", "staff", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 200 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["head-nurse", "staff", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 240 }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (variables: { id: number; status: "in_progress" | "completed" }) => {
      await api.updateWorkflowTask(variables.id, { status: variables.status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "staff", "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "dashboard", "tasks"] });
    },
    onSettled: () => {
      setPendingTaskId(null);
    },
  });

  const caregivers = useMemo(
    () => (caregiversQuery.data ?? []) as ListCaregiversResponse,
    [caregiversQuery.data],
  );
  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );
  const tasks = useMemo(
    () => (tasksQuery.data ?? []) as CareTaskOut[],
    [tasksQuery.data],
  );

  const caregiverRows = useMemo<CaregiverRow[]>(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return caregivers
      .filter((item) => {
        if (!normalizedSearch) return true;
        const corpus = `${item.first_name} ${item.last_name} ${item.role} ${item.email} ${item.phone}`.toLowerCase();
        return corpus.includes(normalizedSearch);
      })
      .map((item) => ({
        id: item.id,
        fullName: `${item.first_name} ${item.last_name}`.trim(),
        role: item.role,
        phone: item.phone,
        email: item.email,
        isActive: item.is_active,
      }));
  }, [caregivers, search]);

  const scheduleRows = useMemo<ScheduleRow[]>(() => {
    return [...schedules]
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      .map((item) => ({
        id: item.id,
        title: item.title,
        scheduleType: item.schedule_type,
        status: item.status,
        assignedRole: item.assigned_role,
        assignedUserId: item.assigned_user_id,
        startsAt: item.starts_at,
      }));
  }, [schedules]);

  const taskRows = useMemo<TaskRow[]>(() => {
    return tasks
      .filter((item) => item.status !== "completed" && item.status !== "cancelled")
      .sort((left, right) => {
        if (!left.due_at) return 1;
        if (!right.due_at) return -1;
        return left.due_at.localeCompare(right.due_at);
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        priority: item.priority,
        status: item.status,
        dueAt: item.due_at,
        assignedRole: item.assigned_role,
        assignedUserId: item.assigned_user_id,
      }));
  }, [tasks]);

  const caregiversColumns = useMemo<ColumnDef<CaregiverRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Caregiver",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">{row.original.role || "caregiver"}</p>
          </div>
        ),
      },
      { accessorKey: "phone", header: "Phone" },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "success" : "outline"}>
            {row.original.isActive ? "active" : "inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const schedulesColumns = useMemo<ColumnDef<ScheduleRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Schedule",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.scheduleType}</p>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        id: "assignment",
        header: "Assignment",
        cell: ({ row }) =>
          row.original.assignedRole
            ? `Role: ${row.original.assignedRole}`
            : row.original.assignedUserId
              ? `User #${row.original.assignedUserId}`
              : "Unassigned",
      },
      {
        accessorKey: "startsAt",
        header: "Starts",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.startsAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.startsAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const tasksColumns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
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
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "dueAt",
        header: "Due",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.dueAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.dueAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.status === "pending" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={updateTaskMutation.isPending && pendingTaskId === row.original.id}
                onClick={() => {
                  setPendingTaskId(row.original.id);
                  updateTaskMutation.mutate({ id: row.original.id, status: "in_progress" });
                }}
              >
                Start
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={updateTaskMutation.isPending && pendingTaskId === row.original.id}
              onClick={() => {
                setPendingTaskId(row.original.id);
                updateTaskMutation.mutate({ id: row.original.id, status: "completed" });
              }}
            >
              Complete
            </Button>
          </div>
        ),
      },
    ],
    [pendingTaskId, updateTaskMutation],
  );

  const openTaskCount = taskRows.length;
  const activeStaffCount = useMemo(
    () => caregiverRows.filter((item) => item.isActive).length,
    [caregiverRows],
  );
  const openScheduleCount = useMemo(
    () => scheduleRows.filter((item) => item.status !== "completed").length,
    [scheduleRows],
  );

  const isLoadingAny = caregiversQuery.isLoading || schedulesQuery.isLoading || tasksQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Staff & Shift Operations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Team availability, schedules, and execution-ready task board for the ward.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryStatCard icon={UserCog} label="Active staff" value={activeStaffCount} tone="info" />
        <SummaryStatCard icon={CalendarClock} label="Open schedules" value={openScheduleCount} tone="warning" />
        <SummaryStatCard icon={ClipboardList} label="Open tasks" value={openTaskCount} tone="warning" />
      </section>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search nurse, role, phone, email"
          className="pl-9"
        />
      </div>

      <DataTableCard
        title="Caregiver Roster"
        description="Current staff directory with active-state visibility."
        data={caregiverRows}
        columns={caregiversColumns}
        isLoading={isLoadingAny}
        emptyText="No caregivers match this search."
      />

      <DataTableCard
        title="Upcoming Schedules"
        description="Scheduled rounds ordered by start time."
        data={scheduleRows}
        columns={schedulesColumns}
        isLoading={isLoadingAny}
        emptyText="No workflow schedules found."
      />

      <DataTableCard
        title="Open Task Board"
        description="Pending and in-progress tasks with inline status actions."
        data={taskRows}
        columns={tasksColumns}
        isLoading={isLoadingAny}
        emptyText="No open tasks."
      />
    </div>
  );
}
