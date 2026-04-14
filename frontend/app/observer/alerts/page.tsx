"use client";
"use no memo";

import { Suspense } from "react";
import { useTranslation } from "@/lib/i18n";
import ObserverAlertsQueue from "./ObserverAlertsQueue";

function AlertsQueueFallback() {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-56 items-center justify-center rounded-xl border border-border/60 bg-muted/25 px-6 py-10"
      aria-busy="true"
    >
      <p className="text-sm text-muted-foreground">{t("observer.alerts.loadingQueue")}</p>
    </div>
  );
}

export default function ObserverAlertsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("observer.alerts.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("observer.alerts.subtitle")}</p>
      </div>

      <Suspense fallback={<AlertsQueueFallback />}>
        <ObserverAlertsQueue />
      </Suspense>
    </div>
  );
}
