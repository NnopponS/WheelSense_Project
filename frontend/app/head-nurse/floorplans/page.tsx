"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { AppPage } from "@/components/layout/AppPage";
import { useTranslation } from "@/lib/i18n";

export default function HeadNurseFloorplansPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("floorplan.viewTitle")}
      description={t("headNurse.floorplans.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/head-nurse" },
        { label: t("nav.floorplans") },
      ]}
    >
      <FloorplanRoleViewer showPresence={true} />
    </AppPage>
  );
}
