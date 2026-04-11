"use client";

import { OperationsConsole } from "@/components/workflow/OperationsConsole";
import { useTranslation } from "@/lib/i18n";

export default function HeadNurseWorkflowPage() {
  const { t } = useTranslation();
  return (
    <OperationsConsole
      role="head_nurse"
      title={t("headNurse.workflow.title")}
      subtitle={t("headNurse.workflow.subtitle")}
    />
  );
}
