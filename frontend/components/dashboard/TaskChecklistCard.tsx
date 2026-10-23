"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import type { CareTaskOut } from "@/lib/api/task-scope-types";

interface TaskChecklistCardProps {
  tasks: CareTaskOut[];
  onTaskComplete?: (taskId: number) => void;
  onTaskUpdate?: (taskId: number, updates: Partial<CareTaskOut>) => void;
  className?: string;
  showHeader?: boolean;
  maxDisplay?: number;
}

const priorityConfig = {
  low: { color: "bg-muted text-muted-foreground" },
  medium: { color: "bg-primary/10 text-primary" },
  high: { color: "bg-warning/15 text-warning-foreground" },
  urgent: { color: "bg-destructive/10 text-destructive" },
};

function formatDueTime(dueAt: string | null | undefined, t: (key: string) => string): string {
  if (!dueAt) return t("tasks.checklist.noDueDate");
  
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMs < 0) return t("tasks.overdue");
  if (diffMins < 60) return `${diffMins} ${t("tasks.checklist.minutesRemaining")}`;
  if (diffHours < 24) return `${diffHours} ${t("tasks.checklist.hoursRemaining")}`;
  return `${diffDays} ${t("tasks.checklist.daysRemaining")}`;
}

function getDueStatusColor(dueAt?: string | null): string {
  if (!dueAt) return "text-muted-foreground";
  
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMs < 0) return "text-destructive font-medium";
  if (diffHours < 2) return "text-amber-600";
  return "text-muted-foreground";
}

export function TaskChecklistCard({
  tasks,
  onTaskComplete,
  onTaskUpdate,
  className,
  showHeader = true,
  maxDisplay = 5,
}: TaskChecklistCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [localTasks, setLocalTasks] = useState<CareTaskOut[]>(tasks);

  // Sync with props
  if (tasks !== localTasks && tasks.length !== localTasks.length) {
    setLocalTasks(tasks);
  }

  const completedCount = localTasks.filter((t) => t.status === "completed").length;
  const progress = localTasks.length > 0 ? (completedCount / localTasks.length) * 100 : 0;

  const displayedTasks = expanded ? localTasks : localTasks.slice(0, maxDisplay);
  const hasMore = localTasks.length > maxDisplay;

  const handleTaskToggle = (task: CareTaskOut) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    
    setLocalTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: newStatus } : t
      )
    );

    if (newStatus === "completed") {
      onTaskComplete?.(task.id);
    }
    
    onTaskUpdate?.(task.id, { status: newStatus });
  };

  const handleTaskClick = (task: CareTaskOut) => {
    router.push(`/head-caregiver/tasks?task=${task.id}`);
  };

  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm">{t("tasks.taskManagement")}</h4>
              <Badge variant="secondary" className="text-xs">
                {completedCount}/{localTasks.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => router.push("/head-caregiver/tasks")}
            >
              {t("tasks.checklist.viewAll")}
            </Button>
          </div>
          <Progress value={progress} className="h-1.5" />
        </CardHeader>
      )}
      
      <CardContent className="pt-0">
        {localTasks.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t("tasks.checklist.empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayedTasks.map((task) => {
              const priority = (task.priority || "medium") as keyof typeof priorityConfig;
              const priorityInfo = priorityConfig[priority] || priorityConfig.medium;
              const isCompleted = task.status === "completed";

              return (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-lg border transition-all",
                    isCompleted
                      ? "bg-muted/30 border-transparent"
                      : "bg-card border-border hover:border-primary/30"
                  )}
                >
                  <Checkbox
                    checked={isCompleted}
                    onCheckedChange={() => handleTaskToggle(task)}
                    className="mt-0.5"
                  />
                  
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => handleTaskClick(task)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "text-sm font-medium truncate",
                          isCompleted && "line-through text-muted-foreground"
                        )}
                      >
                        {task.title}
                      </p>
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", priorityInfo.color)}
                      >
                        {t(`tasks.checklist.priority.${priority}`)}
                      </Badge>
                    </div>

                    {task.description && (
                      <p
                        className={cn(
                          "text-xs mt-0.5 line-clamp-2",
                          isCompleted ? "text-muted-foreground/60" : "text-muted-foreground"
                        )}
                      >
                        {task.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      <div className={cn("flex items-center gap-1 text-xs", getDueStatusColor(task.due_at))}>
                        <Clock className="h-3 w-3" />
                        {formatDueTime(task.due_at, t)}
                      </div>
                      
                      {task.patient_id && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {t("tasks.patient")} #{task.patient_id}
                        </div>
                      )}

                      {task.schedule_id && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {t("workflow.console.status.scheduled")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-11 text-sm"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="mr-1 h-3.5 w-3.5" />
                    {t("tasks.checklist.showLess")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-5 w-5" />
                    {t("tasks.checklist.showMore")} {localTasks.length - maxDisplay}
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
