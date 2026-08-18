"use client";
"use no memo";

import { Suspense } from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import ObserverAlertsQueue from "./ObserverAlertsQueue";
import { ListTodo, Users } from "lucide-react";
import { AppPage } from "@/components/layout/AppPage";
import { LoadingState } from "@/components/layout/LoadingState";
import { Button } from "@/components/ui/button";

function AlertsQueueFallback() {
  const { t } = useTranslation();
  return <LoadingState message={t("observer.alerts.loadingQueue")} />;
}

export default function ObserverAlertsPage() {
  const { t } = useTranslation();

  return (
    <AppPage
      title={t("observer.alerts.title")}
      description={t("observer.alerts.subtitle")}
      className="animate-fade-in"
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/observer/tasks">
              <ListTodo className="h-5 w-5" aria-hidden="true" />
              {t("nav.tasks")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/observer/personnel">
              <Users className="h-5 w-5" aria-hidden="true" />
              {t("nav.observer.myPatients")}
            </Link>
          </Button>
        </>
      }
    >
      <Suspense fallback={<AlertsQueueFallback />}>
        <ObserverAlertsQueue />
      </Suspense>
    </AppPage>
  );
}
