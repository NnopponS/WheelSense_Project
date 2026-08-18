"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { AppPage } from "@/components/layout/AppPage";
import { useTranslation } from "@/lib/i18n";

export default function SupervisorFloorplansPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("floorplan.viewTitle")}
      description={t("supervisor.floorplans.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/supervisor" },
        { label: t("nav.floorplans") },
      ]}
    >
      <FloorplanRoleViewer showPresence={true} />
    </AppPage>
  );
}
