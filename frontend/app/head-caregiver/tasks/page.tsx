"use client";

import { OperationsConsole } from "@/components/workflow/OperationsConsole";
import { WorkflowTasksHubContent } from "@/components/workflow/WorkflowTasksHubContent";
import { useTranslation } from "@/lib/i18n";

export default function HeadCaregiverTasksPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          {t("supervisor.tasksTitle")}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("supervisor.tasksDescription")}
        </p>
      </div>

      <WorkflowTasksHubContent variant="head_caregiver" />
      <OperationsConsole
        role="head_caregiver"
        title={t("admin.workflowQueue")}
        subtitle={t("workflowTasks.hubBoardSubtitle")}
      />
    </div>
  );
}
