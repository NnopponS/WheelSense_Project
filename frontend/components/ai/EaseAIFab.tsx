"use client";

import { Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export function EaseAIFab() {
  const { t } = useTranslation();

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("wheelsense:open-ai"))}
      className="ws-ai-fab fixed right-4 z-50 flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 sm:right-6"
      aria-label={t("aiChat.fab.label")}
      title={t("aiChat.fab.hint")}
    >
      <Sparkles className="h-5 w-5" />
      <span>{t("aiChat.fab.label")}</span>
    </button>
  );
}
