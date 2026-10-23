"use client";

import { useMemo } from "react";
import { CalendarClock, ClipboardList, History, ListChecks } from "lucide-react";
import type { CareScheduleOut, CareTaskOut } from "@/lib/api/task-scope-types";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TimelineItem = {
  id: string;
  kind: "task" | "schedule";
  title: string;
  description: string;
  status: string;
  priority?: string;
  timestamp: string | null;
};

export type StaffTimelinePanelProps = {
  tasks: CareTaskOut[];
  schedules: CareScheduleOut[];
  title?: string;
  description?: string;
  className?: string;
  maxItems?: number;
};

function timestampMs(value: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function taskBadgeVariant(priority: string | undefined) {
  if (priority === "critical") return "destructive" as const;
  if (priority === "high") return "warning" as const;
  if (priority === "normal") return "secondary" as const;
  return "outline" as const;
}

export function StaffTimelinePanel({
  tasks,
  schedules,
  title,
  description,
  className,
  maxItems = 10,
}: StaffTimelinePanelProps) {
  const { t } = useTranslation();
  const items = useMemo<TimelineItem[]>(() => {
    const taskItems = tasks.map((task) => ({
      id: `task-${task.id}`,
      kind: "task" as const,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      timestamp: task.due_at ?? null,
    }));
    const scheduleItems = schedules.map((schedule) => ({
      id: `schedule-${schedule.id}`,
      kind: "schedule" as const,
      title: schedule.title,
      description: schedule.schedule_type,
      status: schedule.status,
      timestamp: schedule.starts_at,
    }));
    return [...taskItems, ...scheduleItems]
      .sort((left, right) => timestampMs(left.timestamp) - timestampMs(right.timestamp))
      .slice(0, maxItems);
  }, [maxItems, schedules, tasks]);

  const openTaskCount = tasks.filter((task) => task.status !== "completed" && task.status !== "cancelled").length;
  const upcomingScheduleCount = schedules.filter((schedule) => schedule.status !== "completed").length;

  return (
    <Card className={cn("border-border/70 shadow-none", className)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{title ?? t("staffTimeline.title")}</CardTitle>
            </div>
            <CardDescription>{description ?? t("staffTimeline.description")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              {t("staffTimeline.tasksCount").replace("{count}", String(openTaskCount))}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {t("staffTimeline.schedulesCount").replace("{count}", String(upcomingScheduleCount))}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
            {t("staffTimeline.empty")}
          </p>
        ) : (
          <ol className="relative space-y-3 before:absolute before:left-4 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border/70">
            {items.map((item) => {
              const Icon = item.kind === "task" ? ListChecks : CalendarClock;
              return (
                <li key={item.id} className="relative flex gap-3 pl-1">
                  <span className="z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 text-sm shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium leading-snug text-foreground">{item.title}</p>
                        {item.description ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {item.status}
                        </Badge>
                        {item.priority ? (
                          <Badge variant={taskBadgeVariant(item.priority)} className="text-[10px] capitalize">
                            {item.priority}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    {item.timestamp ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatDateTime(item.timestamp)} - {formatRelativeTime(item.timestamp)}
                      </p>
                    ) : (
                      <p className="mt-2 text-[11px] text-muted-foreground">{t("staffTimeline.noDate")}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
