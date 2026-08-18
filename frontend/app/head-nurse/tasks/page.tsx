"use client";

import { AppPage } from "@/components/layout/AppPage";
import { ExpandableOperationsConsole } from "@/components/workflow/ExpandableOperationsConsole";
import { WorkflowTasksHubContent } from "@/components/workflow/WorkflowTasksHubContent";
import { useTranslation } from "@/lib/i18n";

export default function HeadNurseTasksPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("tasks.taskManagement")}
      description={t("tasks.taskManagementDesc")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/head-nurse" },
        { label: t("nav.tasks") },
      ]}
    >
      <WorkflowTasksHubContent variant="head-nurse" />
      <ExpandableOperationsConsole
        role="head_nurse"
        title={t("admin.workflowQueue")}
        subtitle={t("workflowTasks.hubBoardSubtitle")}
      />
    </AppPage>
  );
}
