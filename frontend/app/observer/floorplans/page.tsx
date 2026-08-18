"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";
import { AppPage } from "@/components/layout/AppPage";
import { useTranslation } from "@/lib/i18n";

export default function ObserverFloorplansPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("observer.floorplans.title")}
      description={t("observer.floorplans.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/observer" },
        { label: t("nav.floorplans") },
      ]}
    >
      <FloorplanRoleViewer showPresence={true} />
    </AppPage>
  );
}
