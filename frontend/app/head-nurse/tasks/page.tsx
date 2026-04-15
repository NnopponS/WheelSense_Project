"use client";

import { Suspense, useMemo } from "react";
import { ClipboardCheck, Clock, GitMerge, ListChecks } from "lucide-react";
import { HubTabBar, useHubTab } from "@/components/shared/HubTabBar";
import HeadNurseWorkflowPage from "@/app/head-nurse/workflow/page";
import HeadNurseShiftChecklistsPage from "@/app/head-nurse/shift-checklists/page";
import { WardTimelineEmbed } from "@/components/timeline/WardTimelineEmbed";
import { useTranslation } from "@/lib/i18n";
import { WorkflowTasksHubContent } from "@/components/workflow/WorkflowTasksHubContent";

export default function HeadNurseTasksPage() {
  const { t } = useTranslation();
  const tabs = useMemo(
    () => [
      { key: "tasks", label: t("headNurse.tasksHub.tabTasks"), icon: ClipboardCheck },
      { key: "workflow", label: t("headNurse.tasksHub.tabWorkflow"), icon: GitMerge },
      { key: "checklist", label: t("headNurse.tasksHub.tabChecklist"), icon: ListChecks },
      { key: "timeline", label: t("headNurse.tasksHub.tabTimeline"), icon: Clock },
    ],
    [t],
  );
  const tab = useHubTab(tabs);

  return (
    <div>
      <Suspense>
        <HubTabBar tabs={tabs} />
      </Suspense>
      {tab === "tasks" && <WorkflowTasksHubContent variant="head-nurse" />}
      {tab === "workflow" && <HeadNurseWorkflowPage />}
      {tab === "checklist" && <HeadNurseShiftChecklistsPage />}
      {tab === "timeline" && <WardTimelineEmbed cacheScope="head-nurse" />}
    </div>
  );
}
