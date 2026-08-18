"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, ClipboardCheck, Eye, FileText, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AppPage } from "@/components/layout/AppPage";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { MetricCard } from "@/components/shared/MetricCard";
import { PriorityBanner } from "@/components/shared/PriorityBanner";
import { SupervisorQueue } from "@/components/supervisor/SupervisorQueue";
import type {
  CareDirectiveOut,
  CareTaskOut,
  ListAlertsResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

export default function SupervisorDashboardPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();

  const patientsQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 100 }),
    refetchInterval: 15_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 100 }),
  });

  const directivesQuery = useQuery({
    queryKey: ["supervisor", "dashboard", "directives"],
    queryFn: () => api.listWorkflowDirectives({ status: "active", limit: 50 }),
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const alerts = useMemo(() => (alertsQuery.data ?? []) as ListAlertsResponse, [alertsQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );
  const currentUserId = me?.id ?? null;
  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "active"),
    [alerts],
  );
  const criticalAlerts = useMemo(
    () => activeAlerts.filter((alert) => alert.severity === "critical"),
    [activeAlerts],
  );
  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending" || task.status === "in_progress"),
    [tasks],
  );
  const assignedToMeTasks = useMemo(
    () =>
      openTasks.filter(
        (task) =>
          task.status === "in_progress" &&
          currentUserId != null &&
          task.assigned_user_id === currentUserId,
      ),
    [currentUserId, openTasks],
  );

  const priority = criticalAlerts.length > 0
    ? {
        tone: "critical" as const,
        title: t("supervisor.page.criticalPriorityTitle"),
        description: t("supervisor.page.criticalPriorityDesc"),
        detail: `${criticalAlerts.length} ${t("supervisor.page.criticalAlerts")} · ${activeAlerts.length} ${t("supervisor.page.totalActiveAlerts")}`,
        href: "/supervisor/emergency",
        label: t("nav.supervisor.emergency"),
      }
    : assignedToMeTasks.length > 0
      ? {
          tone: "warning" as const,
          title: t("supervisor.page.assignedPriorityTitle"),
          description: t("supervisor.page.assignedPriorityDesc"),
          detail: `${assignedToMeTasks.length} ${t("supervisor.page.openTasks")}`,
          href: "/supervisor/tasks",
          label: t("nav.supervisor.tasks"),
        }
      : {
          tone: "success" as const,
          title: t("supervisor.page.clearPriorityTitle"),
          description: t("supervisor.page.clearPriorityDesc"),
          detail: `${openTasks.length} ${t("supervisor.page.openTasks")}`,
          href: "/supervisor/tasks",
          label: t("supervisor.page.viewAll"),
        };

  return (
    <AppPage
      eyebrow={t("supervisor.page.commandBadge")}
      title={t("nav.supervisor.queue")}
      description={t("supervisor.page.dashboardSubtitle")}
      className="animate-fade-in pb-6"
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/supervisor/personnel">{t("nav.personnel")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/supervisor/floorplans">
              <Eye className="h-5 w-5" aria-hidden="true" />
              {t("supervisor.page.zoneMap")}
            </Link>
          </Button>
        </>
      }
      priority={
        <PriorityBanner
          tone={priority.tone}
          title={priority.title}
          description={priority.description}
          detail={priority.detail}
          action={
            <Button asChild variant={priority.tone === "critical" ? "destructive" : "outline"}>
              <Link href={priority.href}>{priority.label}</Link>
            </Button>
          }
        />
      }
    >
      <section
        aria-label={t("supervisor.page.commandBadge")}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label={t("supervisor.page.criticalAlerts")}
          value={criticalAlerts.length}
          description={`${activeAlerts.length} ${t("supervisor.page.totalActiveAlerts")}`}
          icon={Bell}
          status={{
            label:
              criticalAlerts.length > 0
                ? t("supervisor.page.criticalPriorityTitle")
                : t("supervisor.page.allAcknowledged"),
            tone: criticalAlerts.length > 0 ? "critical" : "success",
          }}
          href="/supervisor/emergency"
          hrefLabel={t("supervisor.page.viewAll")}
        />
        <MetricCard
          label={t("supervisor.page.openTasks")}
          value={openTasks.length}
          description={`${assignedToMeTasks.length} ${t("supervisor.page.assignedToYou")}`}
          icon={ClipboardCheck}
          status={{
            label: t("supervisor.page.pendingCompletion"),
            tone: openTasks.length > 0 ? "warning" : "success",
          }}
          href="/supervisor/tasks"
          hrefLabel={t("supervisor.page.viewAll")}
        />
        <MetricCard
          label={t("supervisor.page.patientsInZone")}
          value={patients.length}
          description={t("supervisor.page.inYourZone")}
          icon={Users}
          href="/supervisor/personnel"
          hrefLabel={t("supervisor.page.viewAll")}
        />
        <MetricCard
          label={t("supervisor.page.directivesTitle")}
          value={directives.length}
          description={t("supervisor.page.awaitingAck")}
          icon={FileText}
          href="/supervisor/tasks"
          hrefLabel={t("supervisor.page.workflowLink")}
        />
      </section>

      <SupervisorQueue
        alerts={alerts}
        tasks={tasks}
        directives={directives}
        patients={patients}
        currentUserId={currentUserId}
      />

      <DashboardMapLauncher
        href="/supervisor/floorplans"
        title={t("supervisor.page.mapTitle")}
        description={t("supervisor.page.mapDesc")}
        primaryLabel={
          criticalAlerts.length
            ? t("supervisor.page.openEmergencyMap")
            : t("supervisor.page.zoneMap")
        }
        emergencyCount={criticalAlerts.length}
        peopleCount={patients.length}
        roomLabel={t("supervisor.page.findRoom")}
        compact
      />
    </AppPage>
  );
}
