"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, ExternalLink, MapPin, Search, ShieldAlert, Users } from "lucide-react";
import DashboardFloorplanPanel from "@/components/dashboard/DashboardFloorplanPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DashboardMapLauncherProps = {
  href: string;
  title: string;
  description: string;
  primaryLabel?: string;
  emergencyCount?: number;
  peopleCount?: number;
  deviceCount?: string | number;
  roomLabel?: string;
  compact?: boolean;
  className?: string;
  /** "row" (default) is the wide banner layout; "card" is a small grid-cell summary card. */
  variant?: "row" | "card";
};

function MapLauncherMetric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "danger" | "primary" | "neutral";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border px-3 py-3",
        tone === "danger"
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          : tone === "primary"
            ? "border-primary/25 bg-primary/10 text-primary"
            : "border-border/70 bg-background/75 text-foreground",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="line-clamp-1">{label}</span>
      </div>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums text-current">{value}</p>
    </div>
  );
}

export function DashboardMapLauncher({
  href,
  title,
  description,
  primaryLabel,
  emergencyCount = 0,
  peopleCount,
  deviceCount,
  roomLabel,
  compact = false,
  className,
  variant = "row",
}: DashboardMapLauncherProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const resolvedPrimaryLabel = primaryLabel ?? t("dashboard.map.openMap");
  const resolvedRoomLabel = roomLabel ?? t("dashboard.map.needLocation");

  if (variant === "card") {
    return (
      <>
        <Card className={cn("h-full", emergencyCount > 0 && "border-red-500/35 bg-red-500/5", className)}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <MapLauncherMetric icon={Users} label={t("dashboard.map.metricPeople")} value={peopleCount ?? "-"} tone="primary" />
              <MapLauncherMetric
                icon={ShieldAlert}
                label={t("dashboard.map.metricEmergency")}
                value={emergencyCount}
                tone={emergencyCount > 0 ? "danger" : "neutral"}
              />
              <MapLauncherMetric icon={MapPin} label={t("admin.system.activeDevices")} value={deviceCount ?? "-"} />
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              {t("admin.system.openLiveMap")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="w-[calc(100vw-0.75rem)] max-w-[76rem] max-h-[94vh] rounded-lg sm:w-[calc(100vw-2rem)]">
            <DialogHeader className="px-4 py-4 pr-14 sm:px-5">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                {emergencyCount > 0 ? <ShieldAlert className="h-5 w-5 text-red-600" /> : <MapPin className="h-5 w-5 text-primary" />}
                {title}
              </DialogTitle>
              <DialogDescription className="line-clamp-2 pr-2">{description}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[calc(94vh-7.5rem)] overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
              <DashboardFloorplanPanel compact={false} showPresence className="border-0 shadow-none" />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
              <Button asChild variant="outline" size="sm">
                <Link href={href}>
                  {t("dashboard.map.fullPage")}
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <section
        className={cn(
          "overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_12px_28px_-24px_rgb(15_23_42/0.45)]",
          emergencyCount > 0 && "border-red-500/35 bg-red-500/5",
          className,
        )}
        aria-label={title}
      >
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1fr)_14rem]">
          <div className={cn("min-w-0", compact ? "p-3 sm:p-4" : "p-3.5 sm:p-5")}>
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11",
                  emergencyCount > 0 ? "bg-red-500/12 text-red-600" : "bg-primary/12 text-primary",
                )}
              >
                {emergencyCount > 0 ? <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6" /> : <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-tight text-foreground">{title}</p>
                <p className={cn("mt-1 text-sm text-muted-foreground", compact ? "line-clamp-1" : "line-clamp-2")}>{description}</p>
              </div>
            </div>

            <div className={cn("grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3", compact ? "mt-3" : "mt-4")}>
              <MapLauncherMetric
                icon={ShieldAlert}
                label={t("dashboard.map.metricEmergency")}
                value={emergencyCount}
                tone={emergencyCount > 0 ? "danger" : "neutral"}
              />
              <MapLauncherMetric
                icon={Users}
                label={t("dashboard.map.metricPeople")}
                value={peopleCount ?? "-"}
                tone="primary"
              />
              <MapLauncherMetric icon={Search} label={t("dashboard.map.metricMode")} value={resolvedRoomLabel} />
            </div>
          </div>

          <div className={cn("flex items-center border-t border-border/70 bg-muted/25 p-3 xl:border-l xl:border-t-0", !compact && "xl:p-4")}>
            <Button type="button" className="h-11 w-full" onClick={() => setOpen(true)}>
              {resolvedPrimaryLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-0.75rem)] max-w-[76rem] max-h-[94vh] rounded-lg sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="px-4 py-4 pr-14 sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              {emergencyCount > 0 ? <ShieldAlert className="h-5 w-5 text-red-600" /> : <MapPin className="h-5 w-5 text-primary" />}
              {title}
            </DialogTitle>
            <DialogDescription className="line-clamp-2 pr-2">
              {description}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(94vh-7.5rem)] overflow-y-auto px-3 pb-3 sm:px-4 sm:pb-4">
            <DashboardFloorplanPanel compact={false} showPresence className="border-0 shadow-none" />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
            <Button asChild variant="outline" size="sm">
              <Link href={href}>
                {t("dashboard.map.fullPage")}
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DashboardMapLauncher;
