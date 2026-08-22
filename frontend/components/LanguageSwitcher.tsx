"use client";

import { Globe } from "lucide-react";
import { useTranslation, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useTranslation();

  function select(next: Locale) {
    if (next !== locale) setLocale(next);
  }

  const options: Array<{ value: Locale; label: string }> = [
    { value: "en", label: "EN" },
    { value: "th", label: "TH" },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/35 p-1 text-xs font-semibold text-muted-foreground",
        compact && "gap-0.5",
      )}
      role="group"
      aria-label={t("shell.language")}
      title={t("shell.language")}
    >
      <Globe className={cn("ml-1 h-4 w-4 shrink-0", compact && "sr-only")} aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => select(option.value)}
          aria-pressed={locale === option.value}
          aria-label={option.value === "en" ? t("shell.languageEnglish") : t("shell.languageThai")}
          className={cn(
            "min-h-11 min-w-11 rounded-md px-2.5 text-xs leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            compact && "px-2",
            locale === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
