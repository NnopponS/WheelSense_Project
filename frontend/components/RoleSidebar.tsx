"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { hasCapability, type AppRole } from "@/lib/permissions";
import {
  getNavConfig,
  filterNavItemsByCapability,
  partitionNavByGroup,
  isNavItemActive,
  type RoleNavConfig,
  type NavItem,
} from "@/lib/sidebarConfig";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogOut, ChevronDown, MoreHorizontal, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/shared/UserAvatar";
import Logo from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

interface RoleSidebarProps {
  /** Control mobile sheet open state */
  mobileOpen?: boolean;
  /** Callback when mobile sheet open state changes */
  onMobileOpenChange?: (open: boolean) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  admin: "shell.roleAdmin",
  head_caregiver: "shell.roleHeadCaregiver",
  head_nurse: "shell.roleHeadCaregiver",
  supervisor: "shell.roleHeadCaregiver",
  caregiver: "shell.roleCaregiver",
  observer: "shell.roleCaregiver",
  patient: "shell.rolePatient",
};

/**
 * Skeleton loader for sidebar navigation during hydration
 */
function NavSkeleton() {
  return (
    <div className="space-y-6 px-3 py-4">
      {[1, 2].map((group) => (
        <div key={group} className="space-y-2">
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          {[1, 2, 3].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <div className="h-5 w-5 rounded bg-muted animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Unified Role Sidebar Component
 * Renders navigation based on user role from sidebarConfig.ts
 */
export default function RoleSidebar({ mobileOpen = false, onMobileOpenChange, collapsed = false, onCollapsedChange }: RoleSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [moreExpanded, setMoreExpanded] = useState(false);

  const navConfig: RoleNavConfig = user ? getNavConfig(user.role) : [];

  // Filter items based on capabilities
  const filteredConfig = user
    ? filterNavItemsByCapability(navConfig, (cap) => hasCapability(user.role as AppRole, cap))
    : [];

  const { primary: primaryConfig, more: moreItems } = partitionNavByGroup(filteredConfig);
  const moreHasActiveItem = moreItems.some((item) =>
    isNavItemActive(item, pathname, searchParams, user?.role),
  );
  const moreOpen = moreHasActiveItem || moreExpanded;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(item: NavItem): boolean {
    return isNavItemActive(item, pathname, searchParams, user?.role);
  }

  function closeMobileNav() {
    onMobileOpenChange?.(false);
  }

  function renderNavItem(item: NavItem, compact = false) {
    const active = isActive(item);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMobileNav}
        className={cn(
          "group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          compact && "justify-center px-0",
          active
            ? "bg-[var(--ws-selected-surface)] text-[var(--ws-selected-foreground)]"
            : "bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        )}
        aria-current={active ? "page" : undefined}
        title={compact ? t(item.key) : undefined}
      >
        <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
        <span className={cn("flex-1 truncate", compact && "sr-only")}>{t(item.key)}</span>
      </Link>
    );
  }

  function renderContent(compact = false, showCollapseButton = true) {
    return (
      <>
        {/* Header - Logo and Platform Name */}
        <div className={cn("flex h-[var(--topbar-height)] shrink-0 items-center", compact ? "justify-center px-1" : "justify-between px-5")}>
          {!compact ? <Logo size={32} /> : null}
          {onCollapsedChange && showCollapseButton ? <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t(compact ? "shell.expandSidebar" : "shell.collapseSidebar")} title={t(compact ? "shell.expandSidebar" : "shell.collapseSidebar")} onClick={() => onCollapsedChange(!compact)}>{compact ? <PanelLeftOpen className="size-5" aria-hidden="true" /> : <PanelLeftClose className="size-5" aria-hidden="true" />}</Button> : null}
        </div>

        {/* Navigation Groups */}
        <nav aria-label={t("shell.navigation")} className={cn("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-4", compact ? "px-2" : "px-3")}>
          {!user ? (
            <NavSkeleton />
          ) : (
            <>
              {primaryConfig.map((group, groupIndex) => (
                <div key={groupIndex}>
                  {!compact && group.categoryKey && (
                    <p className="mb-1.5 px-3 text-xs font-medium text-muted-foreground">
                      {t(group.categoryKey)}
                    </p>
                  )}
                  <div className="space-y-0.5">{group.items.map((item) => renderNavItem(item, compact))}</div>
                </div>
              ))}

              {moreItems.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setMoreExpanded((value) => !value)}
                    aria-expanded={moreOpen}
                    aria-controls="role-sidebar-more-list"
                    aria-label={compact ? t("nav.more") : undefined}
                    title={compact ? t("nav.more") : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      compact && "justify-center px-0",
                      "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <MoreHorizontal className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className={cn("flex-1 text-left", compact && "sr-only")}>{t("nav.more")}</span>
                    {!compact ? <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        moreOpen ? "rotate-180" : "rotate-0",
                      )}
                      aria-hidden="true"
                    /> : null}
                  </button>
                  {moreOpen && (
                    <div id="role-sidebar-more-list" className="mt-1 space-y-0.5 pl-2">
                      {moreItems.map((item) => renderNavItem(item, compact))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </nav>

        {/* Logout Button */}
        <div className={cn("space-y-1 pb-3", compact ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={() => {
              handleLogout();
              closeMobileNav();
            }}
            aria-label={compact ? t("auth.logout") : undefined}
            title={compact ? t("auth.logout") : undefined}
            className={cn("flex w-full items-center gap-3 rounded-lg py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive", compact ? "justify-center px-0" : "px-4")}
          >
            <LogOut className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className={cn("flex-1 text-left", compact && "sr-only")}>{t("auth.logout")}</span>
          </button>
        </div>

        {/* User Profile Section */}
        {user && (
          <div className={cn("border-t border-border py-4", compact ? "px-2" : "px-4")}>
            <Link
              href="/account"
              aria-label={compact ? `${user.username} · ${t(ROLE_LABEL_KEYS[user.role] ?? "shell.roleAdmin")}` : undefined}
              title={compact ? user.username : undefined}
              className={cn("flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted", compact && "justify-center")}
            >
              <UserAvatar username={user.username} profileImageUrl={user.profile_image_url} sizePx={32} />
              <div className={cn("min-w-0", compact && "sr-only")}>
                <p className="truncate text-sm font-medium text-foreground">{user.username}</p>
                <p className="text-sm text-muted-foreground">{t(ROLE_LABEL_KEYS[user.role] ?? "shell.roleAdmin")}</p>
              </div>
            </Link>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Desktop Sidebar - Fixed at left */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border bg-card lg:flex">
        {renderContent(collapsed)}
      </aside>

      {/* Mobile Sidebar - Sheet component */}
      <Sheet 
        open={mobileOpen} 
        onOpenChange={onMobileOpenChange}
      >
        <SheetContent 
          side="left" 
          className="w-[min(18rem,85vw)] p-0 sm:max-w-none"
          onEscapeKeyDown={(event) => {
            // Prevent default escape behavior - just close the sheet, don't logout
            event.preventDefault();
            onMobileOpenChange?.(false);
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t("shell.navigation")}</SheetTitle>
            <SheetDescription>{t("shell.navigationSheetDescription")}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full flex-col">{renderContent(false, false)}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
