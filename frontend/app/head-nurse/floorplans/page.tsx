"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { MapPin } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function HeadNurseFloorplansPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MapPin className="w-7 h-7 text-primary" />
          {t("floorplan.viewTitle")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("headNurse.floorplans.subtitle")}
        </p>
      </div>

      <FloorplanRoleViewer showPresence={true} />
    </div>
  );
}
