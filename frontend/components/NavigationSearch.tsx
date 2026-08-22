"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { filterNavItemsByCapability, getNavConfig } from "@/lib/sidebarConfig";
import { hasCapability, type AppRole } from "@/lib/permissions";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function NavigationSearch() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const items = useMemo(() => {
    if (!user) return [];
    const config = filterNavItemsByCapability(getNavConfig(user.role), (capability) =>
      hasCapability(user.role as AppRole, capability),
    );
    const seen = new Set<string>();
    return config
      .flatMap((group) => group.items)
      .filter((item) => {
        if (seen.has(item.href)) return false;
        seen.add(item.href);
        return true;
      });
  }, [user]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-input bg-input px-4 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:border-ring/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => setOpen(true)}
        aria-label={t("shell.searchNavigation")}
      >
        <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{t("shell.searchNavigation")}</span>
        <kbd className="hidden rounded border border-border bg-card px-2 py-1 text-sm font-medium text-muted-foreground lg:inline-flex">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t("shell.searchNavigation")}
        description={t("shell.searchNavigationDescription")}
      >
        <CommandInput placeholder={t("shell.searchNavigationPlaceholder")} />
        <CommandList>
          <CommandEmpty>{t("shell.searchNavigationEmpty")}</CommandEmpty>
          <CommandGroup heading={t("shell.searchNavigationGroup")}>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${t(item.key)} ${item.href}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{t(item.key)}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
