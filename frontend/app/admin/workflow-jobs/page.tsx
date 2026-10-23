"use client";

import { AppPage } from "@/components/layout/AppPage";
import { WorkflowJobsPanel } from "@/components/workflow/WorkflowJobsPanel";
import { useTranslation } from "@/lib/i18n";

export default function AdminWorkflowJobsPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("workflowJobs.panelTitle")}
      description={t("workflowJobs.panelSubtitle")}
      breadcrumbs={[{ label: t("nav.dashboard"), href: "/admin" }, { label: t("workflowJobs.panelTitle") }]}
    >
      <WorkflowJobsPanel variant="admin" />
    </AppPage>
  );
}
