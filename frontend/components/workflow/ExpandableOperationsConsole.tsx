"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { LoadingState } from "@/components/layout/LoadingState";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

const OperationsConsole = dynamic(
  () => import("@/components/workflow/OperationsConsole").then((module) => module.OperationsConsole),
  {
    ssr: false,
    loading: () => <LoadingState message="Loading advanced operations…" />,
  },
);

interface ExpandableOperationsConsoleProps {
  role: "admin" | "head_caregiver" | "caregiver";
  title: string;
  subtitle: string;
}

export function ExpandableOperationsConsole({
  role,
  title,
  subtitle,
}: ExpandableOperationsConsoleProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const ToggleIcon = open ? ChevronUp : ChevronDown;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-info-bg text-info-foreground">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("workflowTasks.operationsConsole.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("workflowTasks.operationsConsole.description")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={regionId}
        >
          <ToggleIcon className="h-5 w-5" aria-hidden="true" />
          {open
            ? t("workflowTasks.operationsConsole.hide")
            : t("workflowTasks.operationsConsole.show")}
        </Button>
      </div>

      {open ? (
        <div id={regionId} className="mt-5 border-t border-border pt-5">
          <OperationsConsole role={role} title={title} subtitle={subtitle} />
        </div>
      ) : null}
    </section>
  );
}
