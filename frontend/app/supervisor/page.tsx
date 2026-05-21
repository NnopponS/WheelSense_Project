"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ClipboardList, Eye, MapPin, MessageSquare, ShieldAlert, Siren, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { RoleQuickActions } from "@/components/dashboard/RoleQuickActions";
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

  // Data queries
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

  // Data processing
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
  const quickActions = useMemo(
    () => [
      {
        label: t("nav.supervisor.emergency"),
        description: `${criticalAlerts.length}/${activeAlerts.length}`,
        href: "/supervisor/emergency",
        icon: Siren,
        tone: criticalAlerts.length > 0 ? ("danger" as const) : ("neutral" as const),
      },
      {
        label: t("nav.supervisor.tasks"),
        description: `${assignedToMeTasks.length}/${openTasks.length}`,
        href: "/supervisor/tasks",
        icon: ClipboardList,
        tone: "warning" as const,
      },
      {
        label: t("nav.supervisor.patients"),
        description: `${patients.length}`,
        href: "/supervisor/personnel",
        icon: Users,
        tone: "primary" as const,
      },
      {
        label: t("nav.supervisor.messages"),
        description: t("supervisor.page.handoverSupport"),
        href: "/supervisor/messages",
        icon: MessageSquare,
        tone: "neutral" as const,
      },
      {
        label: t("supervisor.page.zoneMap"),
        description: t("dashboard.map.metricMode"),
        href: "/supervisor/floorplans",
        icon: MapPin,
        tone: "success" as const,
      },
      {
        label: t("supervisor.page.askAi"),
        description: t("supervisor.page.askAiDesc"),
        icon: Bot,
        tone: "neutral" as const,
        aiPrompt: t("supervisor.page.askAiPrompt"),
      },
    ],
    [activeAlerts.length, assignedToMeTasks.length, criticalAlerts.length, openTasks.length, patients.length, t],
  );

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("supervisor.page.commandBadge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("nav.supervisor.queue")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("supervisor.page.dashboardSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/supervisor/personnel">{t("nav.personnel")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/supervisor/tasks">{t("supervisor.page.workflowLink")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/supervisor/floorplans">
              <Eye className="mr-1.5 h-4 w-4" />
              {t("supervisor.page.zoneMap")}
            </Link>
          </Button>
        </div>
      </div>

      {/* Unified Queue — alerts, tasks, and directives in priority order */}
      <RoleQuickActions title={t("supervisor.page.roleDuties")} actions={quickActions} />

      <DashboardMapLauncher
        href="/supervisor/floorplans"
        title={t("supervisor.page.mapTitle")}
        description={t("supervisor.page.mapDesc")}
        primaryLabel={criticalAlerts.length ? t("supervisor.page.openEmergencyMap") : t("supervisor.page.zoneMap")}
        emergencyCount={criticalAlerts.length}
        peopleCount={patients.length}
        roomLabel={t("supervisor.page.findRoom")}
        compact
      />

      <SupervisorQueue
        alerts={alerts}
        tasks={tasks}
        directives={directives}
        patients={patients}
        currentUserId={currentUserId}
      />
    </div>
  );
}
