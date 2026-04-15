"use client";

import { Suspense, useMemo, useState } from "react";
import { ClipboardCheck, Clock, GitMerge, ListChecks } from "lucide-react";
import { OperationsConsole } from "@/components/workflow/OperationsConsole";
import { ShiftChecklistMePanel } from "@/components/shift-checklist/ShiftChecklistMePanel";
import { WardTimelineEmbed } from "@/components/timeline/WardTimelineEmbed";
import { HubTabBar, useHubTab, type HubTab } from "@/components/shared/HubTabBar";
import { useTranslation } from "@/lib/i18n";
import { WorkflowTasksHubContent } from "@/components/workflow/WorkflowTasksHubContent";
import { utcShiftDateString } from "@/lib/shiftChecklistDefaults";

function SupervisorWorkflowConsole() {
  const { t } = useTranslation();
  return (
    <OperationsConsole
      role="supervisor"
      title={t("supervisor.workflow.title")}
      subtitle={t("supervisor.workflow.subtitle")}
    />
  );
}

export default function SupervisorTasksPage() {
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
      {tab === "tasks" && <WorkflowTasksHubContent variant="supervisor" />}
      {tab === "workflow" && <SupervisorWorkflowConsole />}
      {tab === "checklist" && (
        <div className="max-w-3xl">
          <ShiftChecklistMePanel shiftDate={shiftDate} />
        </div>
      )}
      {tab === "timeline" && <WardTimelineEmbed cacheScope="supervisor" />}
    </div>
  );
}
