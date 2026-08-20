"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import DashboardMapLauncher from "@/components/dashboard/DashboardMapLauncher";
import { SupervisorQueue } from "@/components/supervisor/SupervisorQueue";
import type {
  CareDirectiveOut,
  CareTaskOut,
  ListAlertsResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

export default function HeadCaregiverDashboardPage() {
  const { t } = useTranslation();
  const { user: me } = useAuth();

  // Data queries
  const patientsQuery = useQuery({
    queryKey: ["head_caregiver", "dashboard", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const alertsQuery = useQuery({
    queryKey: ["head_caregiver", "dashboard", "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 100 }),
    refetchInterval: 15_000,
  });

  const tasksQuery = useQuery({
    queryKey: ["head_caregiver", "dashboard", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 100 }),
  });

  const directivesQuery = useQuery({
    queryKey: ["head_caregiver", "dashboard", "directives"],
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
  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
          {t("nav.supervisor.queue")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("supervisor.page.dashboardSubtitle")}
        </p>
      </div>

      <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,2fr)_minmax(30rem,1fr)] 2xl:items-start">
        <SupervisorQueue
          alerts={alerts}
          tasks={tasks}
          directives={directives}
          patients={patients}
          currentUserId={currentUserId}
        />
        <DashboardMapLauncher
          href="/head-caregiver/floorplans"
          title={t("supervisor.page.mapTitle")}
          description={t("supervisor.page.mapDesc")}
          primaryLabel={criticalAlerts.length ? t("supervisor.page.openEmergencyMap") : t("supervisor.page.zoneMap")}
          emergencyCount={criticalAlerts.length}
          peopleCount={patients.length}
          roomLabel={t("supervisor.page.findRoom")}
          compact
        />
      </div>
    </div>
  );
}
