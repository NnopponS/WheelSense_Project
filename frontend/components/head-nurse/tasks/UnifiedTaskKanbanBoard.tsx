"use client";

import { useMemo, useState } from "react";
import type { TaskOut } from "@/types/tasks";
import type { TranslationKey } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  ListTodo,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SkipForward,
  User,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import styles from "@/components/tasks/task-workspace.module.css";

// ── Column layout (labels via i18n) ───────────────────────────────────────────

const COLUMN_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;
type ColumnStatus = (typeof COLUMN_STATUSES)[number];

const COLUMN_LABEL_KEYS: Record<ColumnStatus, TranslationKey> = {
  pending: "workflowTasks.kanban.columnPending",
  in_progress: "workflowTasks.kanban.columnInProgress",
  completed: "workflowTasks.kanban.columnCompleted",
  skipped: "workflowTasks.kanban.columnSkipped",
};

const COLUMN_META: Record<
  ColumnStatus,
  { icon: typeof Circle; headerColor: string; badgeColor: string }
> = {
  pending: {
    icon: Circle,
    headerColor: "bg-muted text-foreground border-border",
    badgeColor: "bg-card text-foreground",
  },
  in_progress: {
    icon: Clock,
    headerColor: "bg-info-bg text-info-foreground border-info/30",
    badgeColor: "bg-info-bg text-info-foreground",
  },
  completed: {
    icon: CheckCircle2,
    headerColor: "bg-success-bg text-success-foreground border-success/30",
    badgeColor: "bg-success-bg text-success-foreground",
  },
  skipped: {
    icon: SkipForward,
    headerColor: "bg-warning-bg text-warning-foreground border-warning/30",
    badgeColor: "bg-warning-bg text-warning-foreground",
  },
};

const STATUS_DROPDOWN_ORDER: ColumnStatus[] = ["pending", "in_progress", "completed", "skipped"];

const PRIORITY_BADGE_COLORS: Record<string, string> = {
  low: "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30",
  normal: "bg-info-bg text-info-foreground border-info/30",
  high: "bg-warning-bg text-warning-foreground border-warning/30",
  critical: "bg-critical-bg text-critical-foreground border-critical/30",
};

const PRIORITY_LABEL_KEYS: Record<string, TranslationKey> = {
  low: "priority.low",
  normal: "priority.normal",
  high: "priority.high",
  critical: "priority.critical",
};

// ── Sub-Components ────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: TaskOut;
  onTaskClick?: (task: TaskOut) => void;
  onStatusChange?: (taskId: number, newStatus: string) => void;
  isOverdue: boolean;
}

function TaskCard({ task, onTaskClick, onStatusChange, isOverdue }: TaskCardProps) {
  const { t, locale } = useTranslation();
  const completedSubtasks = task.subtasks?.filter((st) => st.status === "completed").length ?? 0;
  const totalSubtasks = task.subtasks?.length ?? 0;
  const priorityLabel = t(PRIORITY_LABEL_KEYS[task.priority] ?? "priority.normal");
  const priorityColor = PRIORITY_BADGE_COLORS[task.priority] ?? PRIORITY_BADGE_COLORS.normal;
  const hasSubtasks = totalSubtasks > 0;
  const progressPercent = hasSubtasks ? (completedSubtasks / totalSubtasks) * 100 : 0;
  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const canShowStatusMenu =
    Boolean(onStatusChange) && task.status !== "completed" && task.status !== "cancelled";

  const reportsLine =
    task.report_count > 1
      ? t("tasks.kanban.reportsCountPlural").replace("{n}", String(task.report_count))
      : t("tasks.kanban.reportsCount").replace("{n}", String(task.report_count));

  return (
    <div
      className={cn(
        "group relative p-3 rounded-lg border border-border/40 bg-card hover:border-border hover:bg-muted/30 transition-all cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {canShowStatusMenu && (
        <div className="absolute top-2 right-2 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 hover:bg-background"
                onClick={(e) => e.stopPropagation()}
                aria-label={t("tasks.kanban.changeStatus")}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuGroup>
              {STATUS_DROPDOWN_ORDER.map((st) => {
                const Icon = COLUMN_META[st].icon;
                return (
                  <DropdownMenuItem
                    key={st}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStatusChange?.(task.id, st);
                    }}
                    className={cn("gap-2", task.status === st && "bg-muted")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(COLUMN_LABEL_KEYS[st])}
                  </DropdownMenuItem>
                );
              })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <h4 className="mb-2 pr-10"><button type="button" className="min-h-11 text-left text-sm font-medium text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onTaskClick?.(task)}>{task.title}</button></h4>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Badge variant="outline" className={cn("text-xs px-1.5 py-0 h-4 border", priorityColor)}>
          {priorityLabel}
        </Badge>

        <Badge variant="outline" className="text-xs px-1.5 py-0 h-4 border-border/50">
          {task.task_type === "routine" ? (
            <RefreshCw className="h-2.5 w-2.5 mr-1" />
          ) : (
            <ListTodo className="h-2.5 w-2.5 mr-1" />
          )}
          {task.task_type === "routine" ? t("tasks.routine") : t("tasks.specific")}
        </Badge>
      </div>

      <div className="space-y-1.5">
        {task.patient_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.patient_name}</span>
          </div>
        )}

        {task.assigned_user_name && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.assigned_user_name}</span>
          </div>
        )}

        {task.due_at && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs",
              isOverdue ? "text-critical-foreground font-medium" : "text-muted-foreground",
            )}
          >
            <Calendar className="h-3 w-3 shrink-0" />
            <span>
              {isOverdue ? t("tasks.kanban.overduePrefix") : ""}
              {new Date(task.due_at).toLocaleDateString(dateLocale, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        )}

        {hasSubtasks && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {completedSubtasks}/{totalSubtasks}
              </span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {task.report_count > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0" />
            <span>{reportsLine}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function ColumnSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg border border-border/40 bg-card space-y-3">
          <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
          <div className="flex gap-1.5">
            <div className="h-4 w-14 bg-muted rounded animate-pulse" />
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
          <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

interface EmptyColumnStateProps {
  columnStatus: ColumnStatus;
  onCreateTask?: () => void;
  canManage?: boolean;
}

function EmptyColumnState({ columnStatus, onCreateTask, canManage }: EmptyColumnStateProps) {
  const { t } = useTranslation();
  const columnName = t(COLUMN_LABEL_KEYS[columnStatus]);
  const message = t("tasks.kanban.noTasksInColumn").replace("{column}", columnName);

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <Circle className="h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {canManage && onCreateTask && columnStatus === "pending" && (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onCreateTask}>
          <Plus className="h-3.5 w-3.5" />
          {t("tasks.kanban.createTask")}
        </Button>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface UnifiedTaskKanbanBoardProps {
  tasks: TaskOut[];
  isLoading: boolean;
  onCreateTask?: () => void;
  onTaskClick?: (task: TaskOut) => void;
  onStatusChange?: (taskId: number, newStatus: string) => void;
  canManage?: boolean;
  patients?: Array<{ id: number; name: string }>;
  users?: Array<{ id: number; name: string; role: string }>;
}

export const UnifiedTaskKanbanBoard = function UnifiedTaskKanbanBoard({
  tasks,
  isLoading,
  onCreateTask,
  onTaskClick,
  onStatusChange,
  canManage = false,
}: UnifiedTaskKanbanBoardProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          task.title.toLowerCase().includes(query) || (task.description ?? "").toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      if (taskTypeFilter !== "all" && task.task_type !== taskTypeFilter) {
        return false;
      }

      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false;
      }

      return true;
    });
  }, [tasks, searchQuery, taskTypeFilter, priorityFilter]);

  const groupedTasks = useMemo(() => {
    const grouped: Record<string, TaskOut[]> = {
      pending: [],
      in_progress: [],
      completed: [],
      skipped: [],
    };

    filteredTasks.forEach((task) => {
      const status = task.status.toLowerCase();
      if (grouped[status]) {
        grouped[status].push(task);
      } else {
        grouped.pending.push(task);
      }
    });

    return grouped;
  }, [filteredTasks]);

  const hasActiveFilters = searchQuery || taskTypeFilter !== "all" || priorityFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setTaskTypeFilter("all");
    setPriorityFilter("all");
  };

  const isTaskOverdue = (task: TaskOut): boolean => {
    if (!task.due_at) return false;
    if (task.status === "completed" || task.status === "skipped") return false;
    return new Date(task.due_at) < new Date();
  };

  if (isLoading) {
    return (
      <div className={styles.board}>
        <div className={styles.filters}>
          <div className="h-11 flex-1 min-w-[200px] bg-muted rounded animate-pulse" />
          <div className="h-11 w-32 bg-muted rounded animate-pulse" />
          <div className="h-11 w-32 bg-muted rounded animate-pulse" />
        </div>

        <div className={styles.columns}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.column}>
              <div className="h-10 bg-muted rounded animate-pulse" />
              <div className={styles.cards}><ColumnSkeleton /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasAnyTasks = tasks.length > 0;
  const hasFilteredTasks = filteredTasks.length > 0;

  return (
    <div className={styles.board}>
      <div className={styles.filters}>
        <div className={styles.search}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("tasks.kanban.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 pl-9"
            aria-label={t("tasks.kanban.ariaSearch")}
          />
        </div>

        <Select value={taskTypeFilter} onValueChange={setTaskTypeFilter}>
          <SelectTrigger className="h-11 w-32" aria-label={t("tasks.kanban.filterType")}>
            <SelectValue placeholder={t("tasks.kanban.typePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
            <SelectItem value="all">{t("tasks.kanban.allTypes")}</SelectItem>
            <SelectItem value="specific">{t("tasks.specific")}</SelectItem>
            <SelectItem value="routine">{t("tasks.routine")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-11 w-32" aria-label={t("tasks.kanban.filterPriority")}>
            <SelectValue placeholder={t("tasks.kanban.priorityPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
            <SelectItem value="all">{t("tasks.kanban.allPriorities")}</SelectItem>
            <SelectItem value="low">{t("priority.low")}</SelectItem>
            <SelectItem value="normal">{t("priority.normal")}</SelectItem>
            <SelectItem value="high">{t("priority.high")}</SelectItem>
            <SelectItem value="critical">{t("priority.critical")}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-11 gap-1.5 text-muted-foreground"
            onClick={clearFilters}
            aria-label={t("tasks.kanban.clearFiltersAria")}
          >
            <XCircle className="h-4 w-4" />
            {t("tasks.kanban.clear")}
          </Button>
        )}

        {hasAnyTasks && canManage && onCreateTask && (
          <Button size="sm" className="h-11 gap-1.5 ml-auto" onClick={onCreateTask}>
            <Plus className="h-4 w-4" />
            {t("tasks.kanban.createTask")}
          </Button>
        )}
      </div>

      {!hasAnyTasks ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <ListTodo className="h-12 w-12 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">{t("tasks.kanban.emptyTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("tasks.kanban.emptyHint")}</p>
          </div>
          {canManage && onCreateTask && (
            <Button className="gap-1.5 mt-2" onClick={onCreateTask}>
              <Plus className="h-4 w-4" />
              {t("tasks.kanban.createTask")}
            </Button>
          )}
        </div>
      ) : !hasFilteredTasks ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Search className="h-12 w-12 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-lg font-medium text-foreground">{t("tasks.kanban.noMatchesTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("tasks.kanban.noMatchesHint")}</p>
          </div>
          <Button variant="outline" className="gap-1.5 mt-2" onClick={clearFilters}>
            <XCircle className="h-4 w-4" />
            {t("tasks.kanban.clearFilters")}
          </Button>
        </div>
      ) : (
        <div className={styles.columns}>
          {COLUMN_STATUSES.map((columnStatus) => {
            const columnTasks = groupedTasks[columnStatus] ?? [];
            const Icon = COLUMN_META[columnStatus].icon;
            const columnLabel = t(COLUMN_LABEL_KEYS[columnStatus]);

            return (
              <div
                key={columnStatus}
                className={styles.column}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-3 border-b border-border/40",
                    styles.columnHeader,
                    COLUMN_META[columnStatus].headerColor,
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <h3 className="text-sm font-semibold">{columnLabel}</h3>
                  <Badge
                    variant="secondary"
                    className={cn("ml-auto text-xs px-2 py-0", COLUMN_META[columnStatus].badgeColor)}
                  >
                    {columnTasks.length}
                  </Badge>
                </div>

                <div
                  className={styles.cards}
                  tabIndex={0}
                  role="region"
                  aria-label={t("tasks.kanban.columnRegionAria").replace("{column}", columnLabel)}
                >
                  {columnTasks.length === 0 ? (
                    <EmptyColumnState
                      columnStatus={columnStatus}
                      onCreateTask={onCreateTask}
                      canManage={canManage}
                    />
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onTaskClick={onTaskClick}
                        onStatusChange={onStatusChange}
                        isOverdue={isTaskOverdue(task)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UnifiedTaskKanbanBoard;
