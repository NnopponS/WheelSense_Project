"use client";

import { Suspense } from "react";
import { Activity, AlertTriangle, MapPin } from "lucide-react";
import StaffMonitoringPage from "@/components/floorplan/StaffMonitoringPage";
import SupervisorEmergencyPage from "@/app/supervisor/emergency/page";
import SupervisorFloorplansPage from "@/app/supervisor/floorplans/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { useTranslation } from "@/lib/i18n";

const TABS: HubTab[] = [
  { key: "monitor", label: "Monitor", icon: Activity },
  { key: "emergency", label: "Emergency", icon: AlertTriangle },
  { key: "floorplans", label: "Floorplans", icon: MapPin },
];

export default function SupervisorMonitoringPage() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <Suspense><HubTabBar tabs={TABS} /></Suspense>
      {tab === "monitor" && <MonitorContent />}
      {tab === "emergency" && <SupervisorEmergencyPage />}
      {tab === "floorplans" && <SupervisorFloorplansPage />}
    </div>
  );
}

function MonitorContent() {
  const { t } = useTranslation();
  return (
    <StaffMonitoringPage
      title={t("supervisor.monitoring.title")}
      subtitle={t("supervisor.monitoring.subtitle")}
    />
  );
}
