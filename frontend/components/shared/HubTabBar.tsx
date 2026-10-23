"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export interface HubTab {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: boolean;
  badgeLabel?: string;
}

interface HubTabBarProps {
  tabs: HubTab[];
  /** Currently active tab key; falls back to first tab if not provided */
  currentTab?: string;
  className?: string;
  /** Overrides default translated `aria-label` for the tab nav */
  ariaLabel?: string;
}

/**
 * Underline-style tab bar for hub pages that consolidate multiple functions.
 * Uses ?tab= query param so sidebar item stays active across all tabs.
 */
export function HubTabBar({ tabs, currentTab, className, ariaLabel }: HubTabBarProps) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const activeTab = currentTab ?? searchParams.get("tab") ?? tabs[0]?.key ?? "";

  return (
    <nav
      aria-label={ariaLabel ?? t("common.pageSectionsAria")}
      className={cn("mb-6 flex gap-1 overflow-x-auto border-b border-border no-scrollbar", className)}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.icon;

        const params = new URLSearchParams(searchParams.toString());
        if (tab.key === tabs[0]?.key) {
          params.delete("tab");
        } else {
          params.set("tab", tab.key);
        }
        const href = params.size > 0 ? `?${params.toString()}` : "?";

        return (
          <Link
            key={tab.key}
            href={href}
            scroll={false}
            className={cn(
              "-mb-px flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {tab.label}
            {tab.badge && (
              <span className="ml-1 flex h-2.5 w-2.5 rounded-full bg-destructive" aria-hidden="true" />
            )}
            {tab.badgeLabel ? <span className="sr-only">{tab.badgeLabel}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Helper — reads `?tab=` from current URL, returning the first tab key as default */
export function useHubTab(tabs: HubTab[], searchParamKey = "tab"): string {
  const searchParams = useSearchParams();
  const raw = searchParams.get(searchParamKey) ?? "";
  return tabs.some((t) => t.key === raw) ? raw : (tabs[0]?.key ?? "");
}
