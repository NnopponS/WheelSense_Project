"use client";

import { useTranslation } from "@/lib/i18n";

/** Segment loading UI for `/admin/*` route transitions (iter-6 RSC-adjacent pattern). */
export default function AdminLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">{t("shell.loadingWorkspace")}</p>
    </div>
  );
}
