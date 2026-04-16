"use client";

import { useMemo } from "react";
import type { TaskOut } from "@/types/tasks";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  ListTodo,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Props ─────────────────────────────────────────────────────────────────────

interface UnifiedTaskCommandBarProps {
  tasks: TaskOut[];
  isLoading?: boolean;
  onExport?: () => void;
}

// ── Stat Badge Component ──────────────────────────────────────────────────────

interface StatBadgeProps {
  icon: React.ElementType;
  value: number | string;
  label: string;
  className?: string;
  suffix?: string;
}

function StatBadge({ icon: Icon, value, label, className, suffix }: StatBadgeProps) {
  return (
    <div className={cn("flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-card border border-border/50", className)}>
      <div className={cn("p-2 rounded-lg", className?.includes("bg-") ? "bg-white/10" : "bg-muted")}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-xl font-bold leading-none">
          {value}
          {suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

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
    
    const withReports = tasks.filter((t) => (t as any).report_count > 0).length;
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
      <div className="flex flex-col gap-4 p-5 rounded-2xl bg-card border border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-card border border-border/50 shadow-sm">
      {/* Header: Date + Actions - Responsive layout */}
      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-3">
        {/* Date Display - Left aligned on mobile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold">{todayFormatted}</span>
            <Badge variant="outline" className="text-[10px] sm:text-xs border-primary/30 bg-primary/10 text-primary px-1.5 sm:px-2.5 py-0.5">
              {t("tasks.today")}
            </Badge>
          </div>
        </div>

        {/* Action Buttons - Right aligned */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
          {/* Export Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onExport || (() => toast.info("Export feature coming soon"))}
          >
            <Download className="h-3.5 w-3.5" />
            {t("tasks.export")}
          </Button>
        </div>
      </div>

      {/* Statistics Grid - Responsive: 2 cols mobile, 3 cols tablet, 6 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
        {/* Completion Rate - Always visible */}
        <StatBadge
          icon={TrendingUp}
          value={stats.completionRate}
          label={t("tasks.completion")}
          suffix="%"
          className="bg-primary/5 text-primary border-primary/20"
        />

        {/* Completed */}
        <StatBadge
          icon={CheckCircle2}
          value={stats.completed}
          label={t("tasks.completed")}
          className="bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
        />

        {/* In Progress */}
        <StatBadge
          icon={Clock}
          value={stats.inProgress}
          label={t("tasks.inProgress")}
          className="bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-500/20"
        />

        {/* Pending */}
        <StatBadge
          icon={ListTodo}
          value={stats.pending}
          label={t("tasks.pending")}
          className="bg-amber-500/5 text-amber-600 dark:text-amber-400 border-amber-500/20"
        />

        {/* Overdue - Only show if > 0, or hidden on mobile */}
        {stats.overdue > 0 ? (
          <StatBadge
            icon={AlertCircle}
            value={stats.overdue}
            label={t("tasks.overdue")}
            className="bg-red-500/5 text-red-600 dark:text-red-400 border-red-500/20"
          />
        ) : (
          <div className="hidden sm:block" />
        )}

        {/* With Reports - Hidden on mobile, shown on sm+ */}
        <div className="hidden sm:block">
          <StatBadge
            icon={FileText}
            value={stats.withReports}
            label={t("tasks.withReports")}
            className="bg-purple-500/5 text-purple-600 dark:text-purple-400 border-purple-500/20"
          />
        </div>
      </div>

      {/* Task Type Breakdown - Responsive: stacked on mobile */}
      <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center sm:justify-between gap-2 sm:gap-4 pt-2 border-t border-border/50">
        {/* Task Type Badges */}
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Badge variant="secondary" className="text-[10px] sm:text-xs">
            {stats.specific} {t("tasks.specific")}
          </Badge>
          <Badge variant="secondary" className="text-[10px] sm:text-xs">
            {stats.routine} {t("tasks.routine")}
          </Badge>
        </div>

        {/* Priority Alerts - Centered on mobile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {stats.critical > 0 && (
            <div className="flex items-center gap-1 text-xs sm:text-sm text-destructive">
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="font-medium">{stats.critical} {t("tasks.critical")}</span>
            </div>
          )}

          {stats.high > 0 && (
            <div className="flex items-center gap-1 text-xs sm:text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="font-medium">{stats.high} {t("tasks.highPriority")}</span>
            </div>
          )}
        </div>

        {/* Total Count */}
        <div className="text-[10px] sm:text-xs text-muted-foreground">
          {t("tasks.total")}: <span className="font-semibold text-foreground">{stats.total}</span> {t("nav.tasks")}
        </div>
      </div>

      {/* Progress Bar - Full width on mobile */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex-1 h-2 sm:h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              stats.completionRate >= 100
                ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                : stats.completionRate >= 60
                ? "bg-gradient-to-r from-blue-500 to-blue-400"
                : stats.completionRate >= 30
                ? "bg-gradient-to-r from-amber-500 to-amber-400"
                : "bg-gradient-to-r from-red-500 to-red-400",
            )}
            style={{ width: `${stats.completionRate}%` }}
          />
        </div>
        <span className="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[60px] sm:min-w-[80px] text-right">
          {stats.completed}/{stats.total}
        </span>
      </div>
    </div>
  );
}
