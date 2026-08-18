"use client";

import { useId, type ReactNode } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export interface FilterSavedView {
  value: string;
  label: string;
}

interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  resultLabel?: string;
  resetLabel?: string;
  onReset?: () => void;
  hasActiveFilters?: boolean;
  ariaLabel?: string;
  savedViews?: FilterSavedView[];
  savedViewValue?: string;
  savedViewLabel?: string;
  onSavedViewChange?: (value: string) => void;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  resultLabel,
  resetLabel,
  onReset,
  hasActiveFilters = false,
  ariaLabel,
  savedViews,
  savedViewValue,
  savedViewLabel,
  onSavedViewChange,
  children,
  actions,
  className,
}: FilterBarProps) {
  const searchId = useId();
  const savedViewId = useId();
  const { t } = useTranslation();
  const resolvedSearchLabel = searchLabel ?? t("common.search");
  const resolvedResetLabel = resetLabel ?? t("common.reset");
  const resolvedSavedViewLabel = savedViewLabel ?? t("common.savedView");

  return (
    <section
      className={cn("rounded-xl border border-border bg-card p-4", className)}
      aria-label={ariaLabel ?? t("common.filtersAria")}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        {onSearchChange ? (
          <div className="min-w-0 flex-1 lg:max-w-md">
            <label htmlFor={searchId} className="mb-1 block text-sm font-medium text-foreground">
              {resolvedSearchLabel}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={searchId}
                type="search"
                value={searchValue ?? ""}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="pl-10"
              />
            </div>
          </div>
        ) : null}
        {savedViews?.length && onSavedViewChange ? (
          <div className="min-w-48">
            <label htmlFor={savedViewId} className="mb-1 block text-sm font-medium text-foreground">
              {resolvedSavedViewLabel}
            </label>
            <select
              id={savedViewId}
              className="input-field"
              value={savedViewValue ?? savedViews[0]?.value}
              onChange={(event) => onSavedViewChange(event.target.value)}
            >
              {savedViews.map((view) => (
                <option key={view.value} value={view.value}>{view.label}</option>
              ))}
            </select>
          </div>
        ) : null}
        {children ? <div className="flex flex-1 flex-wrap items-end gap-3">{children}</div> : null}
        <div className="flex flex-wrap items-center gap-2">
          {onReset ? (
            <Button type="button" variant="outline" onClick={onReset} disabled={!hasActiveFilters}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {resolvedResetLabel}
            </Button>
          ) : null}
          {actions}
        </div>
      </div>
      {resultLabel ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status" aria-live="polite">
          {resultLabel}
        </p>
      ) : null}
    </section>
  );
}
