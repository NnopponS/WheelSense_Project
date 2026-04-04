"use client";

import { useTranslation, type Locale } from "@/lib/i18n";
import { Globe } from "lucide-react";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  function toggle() {
    const next: Locale = locale === "en" ? "th" : "en";
    setLocale(next);
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-smooth cursor-pointer"
      aria-label="Switch language"
      title={locale === "en" ? "เปลี่ยนเป็นภาษาไทย" : "Switch to English"}
    >
      <Globe className="w-4 h-4" />
      <span className="uppercase tracking-wide text-xs font-semibold">
        {locale === "en" ? "EN" : "TH"}
      </span>
    </button>
  );
}
