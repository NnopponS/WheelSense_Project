"use client";

import { useMemo } from "react";
import type { TaskOut } from "@/types/tasks";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import styles from "@/components/tasks/task-workspace.module.css";

interface UnifiedTaskCommandBarProps {
  tasks: TaskOut[];
  isLoading?: boolean;
  onExport?: () => void;
}

export function UnifiedTaskCommandBar({ tasks, isLoading, onExport }: UnifiedTaskCommandBarProps) {
  const { t, locale } = useTranslation();

  // Calculate statistics
  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const skipped = tasks.filter((t) => t.status === "skipped").length;
    const cancelled = tasks.filter((t) => t.status === "cancelled").length;
    
    const specific = tasks.filter((t) => t.task_type === "specific").length;
    const routine = tasks.filter((t) => t.task_type === "routine").length;
    
    const critical = tasks.filter((t) => t.priority === "critical").length;
    const high = tasks.filter((t) => t.priority === "high").length;
    
    const withReports = tasks.filter((t) => t.report_count > 0).length;
    const overdue = tasks.filter((t) => {
      if (!t.due_at) return false;
      return new Date(t.due_at) < new Date() && t.status !== "completed" && t.status !== "cancelled";
    }).length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      pending,
      inProgress,
      completed,
      skipped,
      cancelled,
      specific,
      routine,
      critical,
      high,
      withReports,
      overdue,
      completionRate,
    };
  }, [tasks]);

  const todayFormatted = new Date().toLocaleDateString(locale === "th" ? "th-TH" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (isLoading) {
    return (
      <section className={styles.summary} role="status" aria-busy="true">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("common.loading")}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.summary} aria-label={t("tasks.stats")}>
      <div className={styles.summaryRow}>
        <dl className={styles.metrics}>
          <div><dt>{t("tasks.total")}</dt><dd>{stats.total}</dd></div>
          <div><dt>{t("tasks.completion")}</dt><dd>{stats.completionRate}%</dd></div>
          <div><dt>{t("tasks.completed")}</dt><dd>{stats.completed}</dd></div>
          <div><dt>{t("tasks.inProgress")}</dt><dd>{stats.inProgress}</dd></div>
          <div><dt>{t("tasks.pending")}</dt><dd>{stats.pending}</dd></div>
          <div data-urgent={stats.overdue > 0}><dt>{t("tasks.overdue")}</dt><dd>{stats.overdue}</dd></div>
        </dl>
      </div>
      <div className={styles.summaryFooter}>
        <details className={styles.summaryDetails}>
        <summary>{t("tasks.stats")} <span className={styles.summaryDate}>· {todayFormatted}</span></summary>
        <dl className={styles.metrics}>
          <div><dt>{t("tasks.specific")}</dt><dd>{stats.specific}</dd></div>
          <div><dt>{t("tasks.routine")}</dt><dd>{stats.routine}</dd></div>
          <div><dt>{t("tasks.critical")}</dt><dd>{stats.critical}</dd></div>
          <div><dt>{t("tasks.highPriority")}</dt><dd>{stats.high}</dd></div>
          <div><dt>{t("tasks.withReports")}</dt><dd>{stats.withReports}</dd></div>
          <div><dt>{t("workflowTasks.kanban.columnSkipped")}</dt><dd>{stats.skipped}</dd></div>
          <div><dt>{t("tasks.cancelled")}</dt><dd>{stats.cancelled}</dd></div>
        </dl>
        </details>
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download data-icon="inline-start" />
            {t("tasks.export")}
          </Button>
        )}
      </div>
    </section>
  );
}
