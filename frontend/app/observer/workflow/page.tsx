"use client";

import { OperationsConsole } from "@/components/workflow/OperationsConsole";
import { useTranslation } from "@/lib/i18n";

export default function ObserverWorkflowPage() {
  const { t } = useTranslation();
  return (
    <OperationsConsole
      role="observer"
      title={t("observer.workflow.title")}
      subtitle={t("observer.workflow.subtitle")}
    />
  );
}
