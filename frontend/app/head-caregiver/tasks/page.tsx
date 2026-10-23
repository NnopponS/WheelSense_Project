"use client";

import { AppPage } from "@/components/layout/AppPage";
import { ExpandableOperationsConsole } from "@/components/workflow/ExpandableOperationsConsole";
import { WorkflowTasksHubContent } from "@/components/workflow/WorkflowTasksHubContent";
import { useTranslation } from "@/lib/i18n";

export default function SupervisorTasksPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("supervisor.tasksTitle")}
      description={t("supervisor.tasksDescription")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/head-caregiver" },
        { label: t("nav.tasks") },
      ]}
    >
      <WorkflowTasksHubContent variant="supervisor" />
      <ExpandableOperationsConsole
        role="head_caregiver"
        title={t("admin.workflowQueue")}
        subtitle={t("workflowTasks.hubBoardSubtitle")}
      />
    </AppPage>
  );
}
