"use client";

import Link from "next/link";
import { MapPin, Tablet } from "lucide-react";
import StaffMonitoringPage from "@/components/floorplan/StaffMonitoringPage";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

export default function AdminMonitoringPage() {
  const { t } = useTranslation();

  return (
    <StaffMonitoringPage
      title={t("admin.monitoringTitle")}
      subtitle={t("admin.monitoringSubtitle")}
      actions={(
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/facility-management">
              <MapPin className="mr-1.5 h-4 w-4" />
              {t("nav.facilityManagement")}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/devices">
              <Tablet className="mr-1.5 h-4 w-4" />
              {t("nav.devices")}
            </Link>
          </Button>
        </>
      )}
    />
  );
}
