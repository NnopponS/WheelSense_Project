"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { alertsInboxUrl } from "@/lib/notificationRoutes";

function MobileAlertRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  useEffect(() => {
    const alertParam = searchParams.get("alert");
    const next = alertParam ? `/mobile-alert?alert=${encodeURIComponent(alertParam)}` : "/mobile-alert";

    if (loading) {
      return;
    }

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    const alertId = alertParam != null && alertParam.trim() ? Number(alertParam) : null;
    router.replace(alertsInboxUrl(user.role, alertId != null && Number.isFinite(alertId) ? alertId : null));
  }, [loading, router, searchParams, user]);

  return null;
}

export default function MobileAlertRedirectPage() {
  return (
    <Suspense fallback={null}>
      <MobileAlertRedirectInner />
    </Suspense>
  );
}
