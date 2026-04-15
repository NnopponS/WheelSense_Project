"use client";

import { Suspense, useMemo } from "react";
import { Calendar, ClipboardList, Clock } from "lucide-react";
import { OperationsConsole } from "@/components/workflow/OperationsConsole";
import SupervisorCalendarPage from "@/app/supervisor/calendar/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { useTranslation } from "@/lib/i18n";

export default function SupervisorWorkflowPage() {
  const { t } = useTranslation();
  const tabs = useMemo<HubTab[]>(
    () => [
      { key: "workflow", label: t("supervisor.workflow.hubTabWorkflow"), icon: Clock },
      { key: "calendar", label: t("supervisor.workflow.hubTabCalendar"), icon: Calendar },
      { key: "directives", label: t("supervisor.workflow.hubTabDirectives"), icon: ClipboardList },
    ],
    [t],
  );
  const tab = useHubTab(tabs);
  return (
    <div>
      <Suspense>
        <HubTabBar tabs={tabs} />
      </Suspense>
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
