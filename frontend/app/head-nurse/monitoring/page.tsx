"use client";

import { Suspense } from "react";
import { Activity, Bell, FileBarChart, MapPin } from "lucide-react";
import { HubTabBar, useHubTab } from "@/components/shared/HubTabBar";
import StaffMonitoringPage from "@/components/floorplan/StaffMonitoringPage";
import HeadNurseFloorplansPage from "@/app/head-nurse/floorplans/page";
import HeadNurseAlertsPage from "@/app/head-nurse/alerts/page";
import { useTranslation } from "@/lib/i18n";

const TABS = [
  { key: "monitor", label: "Monitoring", icon: Activity },
  { key: "floorplan", label: "Floorplan", icon: MapPin },
  { key: "alerts", label: "Alerts", icon: Bell },
  { key: "reports", label: "Reports", icon: FileBarChart },
];

export default function HeadNurseMonitoringPage() {
  const { t } = useTranslation();
  const tab = useHubTab(TABS);

  return (
    <div>
      <Suspense>
        <HubTabBar tabs={TABS} />
      </Suspense>
      {tab === "monitor" && (
        <StaffMonitoringPage
          title={t("headNurse.monitoring.title")}
          subtitle={t("headNurse.monitoring.subtitle")}
        />
      )}
      {tab === "floorplan" && <HeadNurseFloorplansPage />}
      {tab === "alerts" && <HeadNurseAlertsPage />}
      {tab === "reports" && (
        <div className="rounded-xl border border-border p-8 text-center text-muted-foreground">
          <p className="text-sm">Reports are available in the Workflow console.</p>
        </div>
      )}
    </div>
  );
}
