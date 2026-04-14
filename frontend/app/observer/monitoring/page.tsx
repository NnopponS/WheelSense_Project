"use client";

import Link from "next/link";
import { MapPin, Tablet } from "lucide-react";
import StaffMonitoringPage from "@/components/floorplan/StaffMonitoringPage";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export default function ObserverMonitoringPage() {
  const { t } = useTranslation();
  return (
    <StaffMonitoringPage
      title={t("observer.monitoring.title")}
      subtitle={t("observer.monitoring.subtitle")}
      actions={(
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/observer/devices">
              <Tablet className="mr-1.5 h-4 w-4" />
              {t("nav.devices")}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/observer/floorplans">
              <MapPin className="mr-1.5 h-4 w-4" />
              {t("nav.floorplans")}
            </Link>
          </Button>
        </>
      )}
    />
  );
}
