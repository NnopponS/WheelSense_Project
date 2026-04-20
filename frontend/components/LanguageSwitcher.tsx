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
      className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-foreground-variant hover:bg-surface-container-high transition-smooth cursor-pointer"
      aria-label="Switch language"
      title={locale === "en" ? "เปลี่ยนเป็นภาษาไทย" : "Switch to English"}
    >
      <Globe className="w-5 h-5" />
      <span className="uppercase tracking-wide font-semibold" style={{ fontSize: '14px' }}>
        {locale === "en" ? "EN" : "TH"}
      </span>
    </button>
  );
}
