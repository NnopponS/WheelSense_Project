"use client";
"use no memo";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox, ShieldCheck } from "lucide-react";
import { HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import AdminSupportPage from "@/app/admin/support/page";
import { AdminWorkflowMailbox } from "@/components/messaging/AdminWorkflowMailbox";
import { useTranslation } from "@/lib/i18n";

function AdminMessagesHub() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "messages";

  const hubTabs = useMemo<HubTab[]>(
    () => [
      { key: "messages", label: t("nav.messages"), icon: Inbox },
      { key: "support", label: t("nav.support"), icon: ShieldCheck },
    ],
    [t],
  );

  return (
    <div className="space-y-0">
      <HubTabBar tabs={hubTabs} />
      {tab === "support" ? <AdminSupportPage /> : <AdminWorkflowMailbox />}
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense>
      <AdminMessagesHub />
    </Suspense>
  );
}
