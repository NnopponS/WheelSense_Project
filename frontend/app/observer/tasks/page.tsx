"use client";

import { Suspense, useMemo, useState } from "react";
import { ClipboardCheck, Clock, GitMerge, ListChecks } from "lucide-react";
import ObserverWorkflowPage from "@/app/observer/workflow/page";
import { ShiftChecklistMePanel } from "@/components/shift-checklist/ShiftChecklistMePanel";
import { WardTimelineEmbed } from "@/components/timeline/WardTimelineEmbed";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { useTranslation } from "@/lib/i18n";
import { WorkflowTasksHubContent } from "@/components/workflow/WorkflowTasksHubContent";
import { utcShiftDateString } from "@/lib/shiftChecklistDefaults";

export default function ObserverTasksPage() {
  const { t } = useTranslation();
  const [shiftDate] = useState(() => utcShiftDateString());
  const tabs = useMemo<HubTab[]>(
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
      {tab === "tasks" && <WorkflowTasksHubContent variant="observer" />}
      {tab === "workflow" && <ObserverWorkflowPage />}
      {tab === "checklist" && (
        <div className="max-w-3xl">
          <ShiftChecklistMePanel shiftDate={shiftDate} />
        </div>
      )}
      {tab === "timeline" && <WardTimelineEmbed cacheScope="observer" />}
    </div>
  );
}
