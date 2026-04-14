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
      className={cn("flex gap-0.5 border-b border-border mb-6 overflow-x-auto no-scrollbar", className)}
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
              "flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors shrink-0",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {tab.label}
            {tab.badge && (
              <span className="ml-1 flex h-2 w-2 rounded-full bg-destructive" />
            )}
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
