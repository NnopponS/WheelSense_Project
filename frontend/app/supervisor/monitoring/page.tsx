"use client";

import Link from "next/link";
import { AlertTriangle, MapPin } from "lucide-react";
import StaffMonitoringPage from "@/components/floorplan/StaffMonitoringPage";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export default function SupervisorMonitoringPage() {
  const { t } = useTranslation();
  return (
    <StaffMonitoringPage
      title={t("supervisor.monitoring.title")}
      subtitle={t("supervisor.monitoring.subtitle")}
      actions={(
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/supervisor/emergency">
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              {t("nav.alerts")}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/supervisor/floorplans">
              <MapPin className="mr-1.5 h-4 w-4" />
              {t("nav.floorplans")}
            </Link>
          </Button>
        </>
      )}
    />
  );
}
