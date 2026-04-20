"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, Users, HeartPulse, ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type {
  CareTaskOut,
  ListAlertsResponse,
  ListCaregiversResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

interface HeadNurseSituationBannerProps {
  alerts: ListAlertsResponse;
  patients: ListPatientsResponse;
  caregivers: ListCaregiversResponse;
  tasks: CareTaskOut[];
  className?: string;
}

/**
 * Head-nurse situation banner.
 *
 * One glanceable strip that answers: how bad is the floor right now?
 *  - active alerts (critical count highlighted)
 *  - on-duty staff (workspace caregivers flagged `is_active`)
 *  - patients at risk (care_level critical OR with active alert)
 *  - unassigned tasks (tasks with no assignee yet)
 *
 * Uses only existing REST queries the dashboard already loads; no new APIs.
 */
export function HeadNurseSituationBanner({
  alerts,
  patients,
  caregivers,
  tasks,
  className,
}: HeadNurseSituationBannerProps) {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const activeAlerts = alerts.filter((a) => a.status === "active");
    const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");
    const onDutyStaff = caregivers.filter((c) => c.is_active !== false);
    const atRiskPatientIds = new Set<number>();
    for (const a of activeAlerts) {
      if (a.patient_id != null) atRiskPatientIds.add(a.patient_id);
    }
    for (const p of patients) {
      if (p.care_level === "critical" && p.is_active !== false) {
        atRiskPatientIds.add(p.id);
      }
    }
    const unassignedTasks = tasks.filter(
      (task) =>
        (task.status === "pending" || task.status === "in_progress") &&
        task.assigned_user_id == null &&
        !task.assigned_role,
    );

    return {
      activeAlertCount: activeAlerts.length,
      criticalAlertCount: criticalAlerts.length,
      onDutyStaffCount: onDutyStaff.length,
      atRiskPatientCount: atRiskPatientIds.size,
      unassignedTaskCount: unassignedTasks.length,
    };
  }, [alerts, caregivers, patients, tasks]);

  const tiles: Array<{
    labelKey: Parameters<typeof t>[0];
    value: number;
    accent: string;
    iconBg: string;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    hint?: string;
  }> = [
    {
      labelKey: "headNurse.situation.activeAlerts",
      value: stats.activeAlertCount,
      accent: "text-red-600",
      iconBg: "bg-red-500/15 text-red-600",
      icon: AlertTriangle,
      href: "/head-nurse/alerts",
      hint:
        stats.criticalAlertCount > 0
          ? `${stats.criticalAlertCount} ${t("headNurse.situation.criticalSuffix")}`
          : undefined,
    },
    {
      labelKey: "headNurse.situation.onDutyStaff",
      value: stats.onDutyStaffCount,
      accent: "text-emerald-600",
      iconBg: "bg-emerald-500/15 text-emerald-600",
      icon: Users,
      href: "/head-nurse/personnel?tab=staff",
    },
    {
      labelKey: "headNurse.situation.atRiskPatients",
      value: stats.atRiskPatientCount,
      accent: "text-amber-700",
      iconBg: "bg-amber-500/15 text-amber-700",
      icon: HeartPulse,
      href: "/head-nurse/personnel",
    },
    {
      labelKey: "headNurse.situation.unassignedTasks",
      value: stats.unassignedTaskCount,
      accent: "text-sky-700",
      iconBg: "bg-sky-500/15 text-sky-700",
      icon: ClipboardList,
      href: "/head-nurse/tasks",
    },
  ];

  return (
    <section
      aria-label={t("headNurse.situation.bannerLabel")}
      className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <Link key={tile.labelKey} href={tile.href} className="block">
            <Card className="h-full border-border/70 transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                    tile.iconBg,
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t(tile.labelKey)}
                  </p>
                  <p className={cn("mt-1 text-3xl font-semibold tabular-nums", tile.accent)}>
                    {tile.value}
                  </p>
                  {tile.hint ? (
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">{tile.hint}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </section>
  );
}

export default HeadNurseSituationBanner;
