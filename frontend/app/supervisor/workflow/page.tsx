"use client";

import { Suspense } from "react";
import { Calendar, ClipboardList, Clock } from "lucide-react";
import { OperationsConsole } from "@/components/workflow/OperationsConsole";
import SupervisorCalendarPage from "@/app/supervisor/calendar/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { useTranslation } from "@/lib/i18n";

const TABS: HubTab[] = [
  { key: "workflow", label: "Workflow", icon: Clock },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "directives", label: "Directives", icon: ClipboardList },
];

export default function SupervisorWorkflowPage() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <Suspense><HubTabBar tabs={TABS} /></Suspense>
      {tab === "workflow" && <WorkflowContent />}
      {tab === "calendar" && <SupervisorCalendarPage />}
      {tab === "directives" && <WorkflowContent />}
    </div>
  );
}

function WorkflowContent() {
  const { t } = useTranslation();
  return (
    <OperationsConsole
      role="supervisor"
      title={t("supervisor.workflow.title")}
      subtitle={t("supervisor.workflow.subtitle")}
    />
  );
}
