"use client";

import { AppPage } from "@/components/layout/AppPage";
import { ExpandableOperationsConsole } from "@/components/workflow/ExpandableOperationsConsole";
import { WorkflowTasksHubContent } from "@/components/workflow/WorkflowTasksHubContent";
import { useTranslation } from "@/lib/i18n";

export default function ObserverTasksPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("observer.page.statMyTasks")}
      description={t("observer.page.tasksDescription")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/caregiver" },
        { label: t("nav.tasks") },
      ]}
    >
      <WorkflowTasksHubContent variant="observer" />
      <ExpandableOperationsConsole
        role="caregiver"
        title={t("observer.tasks.operationsQueue")}
        subtitle={t("workflowTasks.hubBoardSubtitle")}
      />
    </AppPage>
  );
}
