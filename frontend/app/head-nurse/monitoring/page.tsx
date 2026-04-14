"use client";

import Link from "next/link";
import { Bell, FileBarChart, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import StaffMonitoringPage from "@/components/floorplan/StaffMonitoringPage";
import { useTranslation } from "@/lib/i18n";

export default function HeadNurseMonitoringPage() {
  const { t } = useTranslation();

  return (
    <StaffMonitoringPage
      title={t("headNurse.monitoring.title")}
      subtitle={t("headNurse.monitoring.subtitle")}
      actions={(
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/head-nurse/alerts">
              <Bell className="mr-1.5 h-4 w-4" />
              {t("nav.alerts")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/head-nurse/floorplans">
              <MapPin className="mr-1.5 h-4 w-4" />
              {t("nav.floorplans")}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/head-nurse/workflow?tab=reports">
              <FileBarChart className="mr-1.5 h-4 w-4" />
              {t("nav.reports")}
            </Link>
          </Button>
        </>
      )}
    />
  );
}
