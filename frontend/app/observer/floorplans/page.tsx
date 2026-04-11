"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { MapPin } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function ObserverFloorplansPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MapPin className="h-7 w-7 text-primary" />
          {t("observer.floorplans.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("observer.floorplans.subtitle")}
        </p>
      </div>

      <FloorplanRoleViewer showPresence={true} compact />
    </div>
  );
}
