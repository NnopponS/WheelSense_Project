"use client";
"use no memo";

import { Suspense } from "react";
import { useTranslation } from "@/lib/i18n";
import ObserverAlertsQueue from "./ObserverAlertsQueue";
import FeatureDetailActions from "@/components/dashboard/FeatureDetailActions";
import { ConciergeBell, LayoutDashboard, ListTodo, Users } from "lucide-react";

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

      <FeatureDetailActions
        title="Related views"
        actions={[
          { label: t("nav.dashboard"), description: "Next action", href: "/observer", icon: LayoutDashboard, tone: "primary" },
          { label: t("nav.tasks"), description: "My work", href: "/observer/tasks", icon: ListTodo, tone: "warning" },
          { label: t("nav.observer.myPatients"), description: "Find patient", href: "/observer/personnel", icon: Users, tone: "neutral" },
          { label: t("nav.support"), description: "Help requests", href: "/observer/support", icon: ConciergeBell, tone: "neutral" },
        ]}
      />

      <Suspense fallback={<AlertsQueueFallback />}>
        <ObserverAlertsQueue />
      </Suspense>
    </div>
  );
}
