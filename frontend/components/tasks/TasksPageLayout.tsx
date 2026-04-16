"use client";

import { useState } from "react";
import type { TaskOut } from "@/types/tasks";
import { UnifiedTaskKanbanBoard } from "@/components/head-nurse/tasks/UnifiedTaskKanbanBoard";
import { UnifiedTaskCalendar } from "@/components/head-nurse/tasks/UnifiedTaskCalendar";
import { UnifiedTaskStats } from "@/components/head-nurse/tasks/UnifiedTaskStats";
import { TaskDetailModal } from "@/components/head-nurse/tasks/TaskDetailModal";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { RoutineDayOverviewSheet } from "./RoutineDayOverviewSheet";
import { UnifiedTaskCommandBar } from "@/components/head-nurse/tasks/UnifiedTaskCommandBar";
import { useTasks, useUpdateTask, useDeleteTask, useSubmitTaskReport, useTaskReports } from "@/hooks/useTasks";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Calendar, ListChecks, ListTodo, Plus, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface TasksPageLayoutProps {
  /** Page title */
  title: string;
  /** Page subtitle/description */
  description: string;
  /** Role identifier for permissions */
  role: "admin" | "head-nurse" | "supervisor" | "observer" | "patient";
  /** Whether user can create tasks */
  canCreate?: boolean;
  /** Whether user can manage (edit/delete/reassign) tasks */
  canManage?: boolean;
  /** Whether user can execute (update status/submit reports) tasks */
  canExecute?: boolean;
  /** Whether to show daily routine / shift checklist overview (head nurse & admin). */
  showDailyRoutineOverview?: boolean;
  /** Filter function for tasks */
  filterTasks?: (tasks: TaskOut[]) => TaskOut[];
  /** Additional query params for fetching tasks */
  taskParams?: Record<string, any>;
  /** Current user ID for filtering */
  currentUserId?: number;
}

/**
 * Standardized Tasks Page Layout
 * 
 * A reusable layout component for task management pages across all roles.
 * Provides consistent UI with role-based permission controls.
 */
export function TasksPageLayout({
  title,
  description,
  role,
  canCreate = false,
  canManage = false,
  canExecute = false,
  showDailyRoutineOverview = false,
  filterTasks,
  taskParams = {},
  currentUserId,
}: TasksPageLayoutProps) {
  const { t } = useTranslation();
  const [selectedTask, setSelectedTask] = useState<TaskOut | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "calendar" | "stats">("kanban");
  const [showArchived, setShowArchived] = useState(false);
  const [routineSheetOpen, setRoutineSheetOpen] = useState(false);

  const effectiveTaskParams = { ...taskParams, is_active: showArchived ? false : true };
  const { data: tasks, isLoading } = useTasks(effectiveTaskParams);
  const { mutate: updateTask } = useUpdateTask();
  const { mutate: deleteTask } = useDeleteTask();

  // Load reports and report submission hook when a task is selected
  const selectedTaskId = selectedTask?.id ?? 0;
  const { data: taskReports = [], isLoading: isLoadingReports } = useTaskReports(selectedTaskId);
  const { mutate: submitReport } = useSubmitTaskReport(selectedTaskId);

  // Apply custom filter if provided
  const visibleTasks = filterTasks ? filterTasks(tasks || []) : (tasks || []);

  const handleStatusChange = (taskId: number, newStatus: string) => {
    updateTask(
      { taskId, data: { status: newStatus as TaskOut["status"] } },
      {
        onSuccess: (updatedTask) => {
          setSelectedTask(updatedTask);
          toast.success(`${t("tasks.statusUpdated")}: ${newStatus.replace("_", " ")}`);
        },
        onError: () => {
          toast.error(t("tasks.createError"));
        },
      }
    );
  };

  const handleExport = () => {
    if (!visibleTasks.length) {
      toast.error("No tasks to export");
      return;
    }

    try {
      // Simple CSV data generation
      const headers = ["ID", "Title", "Type", "Status", "Priority", "Patient", "Assignee", "Due Date"];
      const rows = visibleTasks.map(task => [
        task.id,
        `"${task.title}"`,
        task.task_type,
        task.status,
        task.priority,
        `"${task.patient_name || ''}"`,
        `"${task.assigned_user_name || ''}"`,
        task.due_at || ""
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `tasks-export-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(t("tasks.export") + ": " + t("tasks.createSuccess").replace("Task", "Export"));
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(t("tasks.createError"));
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Toggle */}
            <Tabs 
              value={viewMode} 
              onValueChange={(v) => setViewMode(v as any)}
              className="hidden sm:block"
            >
              <TabsList className="grid w-[300px] grid-cols-3">
                <TabsTrigger value="kanban" className="gap-2">
                  <ListTodo className="h-4 w-4" />
                  {t("tasks.kanban")}
                </TabsTrigger>
                <TabsTrigger value="calendar" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  {t("tasks.calendar")}
                </TabsTrigger>
                <TabsTrigger value="stats" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {t("tasks.stats")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Mobile View Toggle */}
            <div className="flex sm:hidden rounded-lg border p-1">
              <Button
                variant={viewMode === "kanban" ? "default" : "ghost"}
                size="sm"
                className="px-2"
                onClick={() => setViewMode("kanban")}
              >
                <ListTodo className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "calendar" ? "default" : "ghost"}
                size="sm"
                className="px-2"
                onClick={() => setViewMode("calendar")}
              >
                <Calendar className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "stats" ? "default" : "ghost"}
                size="sm"
                className="px-2"
                onClick={() => setViewMode("stats")}
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
            </div>

            {/* Actions */}
            {showDailyRoutineOverview && (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setRoutineSheetOpen(true)}
              >
                <ListChecks className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t("tasks.dailyRoutineButton")}</span>
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t("tasks.create")}</span>
              </Button>
            )}
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowArchived((prev) => !prev);
                  setSelectedTask(null);
                }}
              >
                {showArchived ? t("tasks.showActive") : t("tasks.showArchived")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b bg-background px-4 py-4 sm:px-6">
        <UnifiedTaskCommandBar 
          tasks={visibleTasks} 
          isLoading={isLoading} 
          onExport={handleExport}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {viewMode === "kanban" && (
          <UnifiedTaskKanbanBoard
            tasks={visibleTasks}
            isLoading={isLoading}
            onTaskClick={setSelectedTask}
            onStatusChange={canExecute && !showArchived ? handleStatusChange : undefined}
            canManage={canManage}
          />
        )}

        {viewMode === "calendar" && (
          <UnifiedTaskCalendar
            tasks={visibleTasks}
            isLoading={isLoading}
            onTaskClick={setSelectedTask}
          />
        )}

        {viewMode === "stats" && (
          <UnifiedTaskStats
            tasks={visibleTasks}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          role={role}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          canManage={canManage}
          canExecute={canExecute}
          reports={taskReports}
          isLoadingReports={isLoadingReports}
          onUpdateTask={
            canManage
              ? (taskId, data) => {
                  updateTask(
                    { taskId, data },
                    {
                      onSuccess: (updatedTask) => {
                        setSelectedTask(updatedTask);
                        toast.success(t("tasks.createSuccess"));
                      },
                      onError: () => {
                        toast.error(t("tasks.createError"));
                      },
                    }
                  );
                }
              : undefined
          }
          onDeleteTask={
            canManage
              ? (taskId) => {
                  deleteTask(taskId, {
                    onSuccess: () => {
                      setSelectedTask(null);
                    },
                    onError: () => {
                      toast.error("Failed to delete task");
                    },
                  });
                }
              : undefined
          }
          onSubmitReport={
            canExecute
              ? (taskId, data) => {
                  submitReport(data, {
                    onSuccess: () => {
                      // reports query is invalidated by the hook automatically
                    },
                    onError: () => {
                      toast.error("Failed to submit report");
                    },
                  });
                }
              : undefined
          }
          onArchiveTask={
            canManage
              ? (taskId) => {
                  updateTask(
                    { taskId, data: { is_active: false } },
                    {
                      onSuccess: () => {
                        toast.success(t("tasks.statusUpdated"));
                        setSelectedTask(null);
                      },
                      onError: () => {
                        toast.error(t("tasks.createError"));
                      },
                    }
                  );
                }
              : undefined
          }
          onRestoreTask={
            canManage
              ? (taskId) => {
                  updateTask(
                    { taskId, data: { is_active: true } },
                    {
                      onSuccess: () => {
                        toast.success(t("tasks.statusUpdated"));
                        setSelectedTask(null);
                      },
                      onError: () => {
                        toast.error(t("tasks.createError"));
                      },
                    }
                  );
                }
              : undefined
          }
        />
      )}

      {/* Create Task Dialog */}
      {canCreate && (
        <CreateTaskDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />
      )}

      {showDailyRoutineOverview && (
        <RoutineDayOverviewSheet open={routineSheetOpen} onOpenChange={setRoutineSheetOpen} />
      )}
    </div>
  );
}
