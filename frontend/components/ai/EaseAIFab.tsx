"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import AIChatPopup from "./AIChatPopup";

export function EaseAIFab() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
          aria-label={t("aiChat.fab.label")}
          title={t("aiChat.fab.hint")}
        >
          <Sparkles className="h-5 w-5" />
          <span className="font-medium">{t("aiChat.fab.label")}</span>
        </button>
      )}

      {/* Chat Popup */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[90vw] max-w-md animate-fade-in">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full bg-muted p-2 hover:bg-muted/80 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <AIChatPopup onClose={() => setIsOpen(false)} />
        </div>
      )}
    </>
  );
}
