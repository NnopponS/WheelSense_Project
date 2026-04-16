"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  mergeServerShiftChecklist,
  rowsToApiPayload,
} from "@/lib/shiftChecklistDefaults";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateTask, taskKeys } from "@/hooks/useTasks";
import * as tasksApi from "@/lib/api/tasks";
import type { TaskOut } from "@/types/tasks";
import { Badge } from "@/components/ui/badge";

export function ShiftChecklistMePanel({ shiftDate }: { shiftDate: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const shiftChecklistQuery = useQuery({
    queryKey: ["shift-checklist", "me", shiftDate],
    queryFn: () => api.getShiftChecklistMe({ shift_date: shiftDate }),
  });

  const shiftChecklistMutation = useMutation({
    mutationFn: (items: ReturnType<typeof mergeServerShiftChecklist>) =>
      api.putShiftChecklistMe({ shift_date: shiftDate, items: rowsToApiPayload(items) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shift-checklist", "me", shiftDate] });
    },
  });

  const checklist = useMemo(
    () => mergeServerShiftChecklist(shiftChecklistQuery.data?.items),
    [shiftChecklistQuery.data],
  );

  const tasksQuery = useQuery({
    queryKey: taskKeys.list({
      assignee_user_id: user?.id ?? 0,
      shift_date: shiftDate,
      limit: 120,
    }),
    queryFn: () =>
      tasksApi.fetchTasks({
        assignee_user_id: user!.id,
        shift_date: shiftDate,
        limit: 120,
      }),
    enabled: Boolean(user?.id),
  });

  const updateTask = useUpdateTask();

  const assignedTasks = (tasksQuery.data ?? []) as TaskOut[];

  const shiftStats = useMemo(() => {
    const total = checklist.length;
    const completed = checklist.filter((item) => item.checked).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [checklist]);

  const toggleChecklistItem = (id: string) => {
    const next = checklist.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item,
    );
    shiftChecklistMutation.mutate(next);
  };

  const toggleUnifiedTask = (task: TaskOut) => {
    const done = task.status === "completed";
    const next = done ? "pending" : "completed";
    updateTask.mutate(
      { taskId: task.id, data: { status: next } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
      },
    );
  };

  const renderTaskRow = (task: TaskOut) => (
    <div
      key={task.id}
      className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
    >
      <Checkbox
        checked={task.status === "completed"}
        disabled={updateTask.isPending}
        onCheckedChange={() => toggleUnifiedTask(task)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-sm ${
            task.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {task.title}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="text-[10px]">
            {task.task_type}
          </Badge>
          {task.patient_name ? (
            <span className="truncate text-xs text-muted-foreground">{task.patient_name}</span>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("observer.page.shiftChecklistTitle")}</CardTitle>
            <CardDescription>{t("observer.page.shiftChecklistDesc")}</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground">{shiftStats.percent}%</p>
            <p className="text-xs text-muted-foreground">{t("observer.page.completeLabel")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observer.page.shiftTasksFromHeadNurse")}
          </h4>
          {!user?.id ? (
            <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
          ) : tasksQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
          ) : assignedTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("observer.page.noAssignedShiftTasks")}</p>
          ) : (
            <div className="space-y-2">{assignedTasks.map(renderTaskRow)}</div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observer.page.shiftStart")}
          </h4>
          <div className="space-y-2">
            {checklist
              .filter((item) => item.category === "shift")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <Checkbox
                    checked={item.checked}
                    disabled={shiftChecklistMutation.isPending}
                    onCheckedChange={() => toggleChecklistItem(item.id)}
                  />
                  <span
                    className={`text-sm ${
                      item.checked ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {item.labelKey}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observer.page.roomRounds")}
          </h4>
          <div className="space-y-2">
            {checklist
              .filter((item) => item.category === "room")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <Checkbox
                    checked={item.checked}
                    disabled={shiftChecklistMutation.isPending}
                    onCheckedChange={() => toggleChecklistItem(item.id)}
                  />
                  <span
                    className={`text-sm ${
                      item.checked ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {item.labelKey}
                  </span>
                </div>
              ))}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("observer.page.documentation")}
          </h4>
          <div className="space-y-2">
            {checklist
              .filter((item) => item.category === "patient")
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <Checkbox
                    checked={item.checked}
                    disabled={shiftChecklistMutation.isPending}
                    onCheckedChange={() => toggleChecklistItem(item.id)}
                  />
                  <span
                    className={`text-sm ${
                      item.checked ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {item.labelKey}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
