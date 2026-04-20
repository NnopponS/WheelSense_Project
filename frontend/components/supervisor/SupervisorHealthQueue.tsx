"use client";

import { useMemo } from "react";
import { Stethoscope, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { CareTaskOut, ListPatientsResponse } from "@/lib/api/task-scope-types";

interface SupervisorHealthQueueProps {
  /** Current user id; used to filter tasks assigned to the viewing supervisor. */
  currentUserId: number | null;
  tasks: CareTaskOut[];
  patients: ListPatientsResponse;
  /** Accept (pending → in_progress). */
  onAccept: (taskId: number) => void;
  /** Mark done (→ completed). */
  onComplete: (taskId: number) => void;
  pendingTaskId: number | null;
  className?: string;
}

/**
 * Supervisor "Health queue for me".
 *
 * Shows the top 5 tasks assigned to the current supervisor that are still
 * pending or in progress, sorted by priority then due time. This keeps the
 * supervisor's "what should I do" view above the fold without removing the
 * fuller workflow pages at `/supervisor/tasks` and `/supervisor/workflow`.
 */
export function SupervisorHealthQueue({
  currentUserId,
  tasks,
  patients,
  onAccept,
  onComplete,
  pendingTaskId,
  className,
}: SupervisorHealthQueueProps) {
  const { t } = useTranslation();

  const patientById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const myQueue = useMemo(() => {
    if (currentUserId == null) return [] as CareTaskOut[];
    const priorityRank: Record<string, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };
    return tasks
      .filter((task) => task.assigned_user_id === currentUserId)
      .filter((task) => task.status === "pending" || task.status === "in_progress")
      .sort((a, b) => {
        const rankA = priorityRank[a.priority ?? "normal"] ?? 4;
        const rankB = priorityRank[b.priority ?? "normal"] ?? 4;
        if (rankA !== rankB) return rankA - rankB;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return a.due_at.localeCompare(b.due_at);
      })
      .slice(0, 5);
  }, [currentUserId, tasks]);

  return (
    <Card className={cn("border-primary/25 bg-primary/[0.04]", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Stethoscope className="h-5 w-5 text-primary" aria-hidden />
            {t("supervisor.healthQueue.title")}
          </CardTitle>
          <CardDescription>{t("supervisor.healthQueue.subtitle")}</CardDescription>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {myQueue.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {myQueue.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("supervisor.healthQueue.empty")}
          </p>
        ) : (
          myQueue.map((task) => {
            const patient = task.patient_id != null ? patientById.get(task.patient_id) : undefined;
            const patientName = patient
              ? [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim()
              : undefined;
            const severityClass =
              task.priority === "critical"
                ? "border-red-500/40 bg-red-500/5"
                : task.priority === "high"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-border/70 bg-card";
            const isPending = pendingTaskId === task.id;
            return (
              <div
                key={task.id}
                className={cn(
                  "rounded-2xl border p-4 transition-shadow hover:shadow-sm",
                  severityClass,
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">
                      {task.title || t("supervisor.healthQueue.untitled")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {patientName ? `${patientName}` : t("supervisor.healthQueue.noPatient")}
                      {task.due_at ? ` · ${formatRelativeTime(task.due_at)}` : ""}
                    </p>
                    {task.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {task.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        disabled={isPending}
                        onClick={() => onAccept(task.id)}
                      >
                        <PlayCircle className="mr-1.5 h-4 w-4" aria-hidden />
                        {t("supervisor.healthQueue.accept")}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant={task.status === "in_progress" ? "default" : "outline"}
                      disabled={isPending}
                      onClick={() => onComplete(task.id)}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                      {t("supervisor.healthQueue.done")}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default SupervisorHealthQueue;
