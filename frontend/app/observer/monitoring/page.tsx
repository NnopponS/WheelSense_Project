"use client";

import { Suspense } from "react";
import { Activity, MapPin, Tablet } from "lucide-react";
import StaffMonitoringPage from "@/components/floorplan/StaffMonitoringPage";
import ObserverDevicesPage from "@/app/observer/devices/page";
import ObserverFloorplansPage from "@/app/observer/floorplans/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { useTranslation } from "@/lib/i18n";

const TABS: HubTab[] = [
  { key: "monitor", label: "Monitor", icon: Activity },
  { key: "devices", label: "Devices", icon: Tablet },
  { key: "floorplans", label: "Floorplans", icon: MapPin },
];

export default function ObserverMonitoringPage() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <Suspense><HubTabBar tabs={TABS} /></Suspense>
      {tab === "monitor" && <MonitorContent />}
      {tab === "devices" && <ObserverDevicesPage />}
      {tab === "floorplans" && <ObserverFloorplansPage />}
    </div>
  );
}

function MonitorContent() {
  const { t } = useTranslation();
  return (
    <StaffMonitoringPage
      title={t("observer.monitoring.title")}
      subtitle={t("observer.monitoring.subtitle")}
    />
  );
}
