"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { hasCapability, type AppRole } from "@/lib/permissions";
import { getNavConfig, filterNavItemsByCapability, type RoleNavConfig, type NavItem } from "@/lib/sidebarConfig";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogOut, Activity } from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";
import Logo from "@/components/shared/Logo";
import { cn } from "@/lib/utils";

interface RoleSidebarProps {
  /** Control mobile sheet open state */
  mobileOpen?: boolean;
  /** Callback when mobile sheet open state changes */
  onMobileOpenChange?: (open: boolean) => void;
}

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  admin: "shell.roleAdmin",
  head_nurse: "shell.roleHeadNurse",
  supervisor: "shell.roleSupervisor",
  observer: "shell.roleObserver",
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
export default function RoleSidebar({ mobileOpen = false, onMobileOpenChange }: RoleSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const navConfig: RoleNavConfig = user ? getNavConfig(user.role) : [];

  // Filter items based on capabilities
  const filteredConfig = user
    ? filterNavItemsByCapability(navConfig, (cap) => hasCapability(user.role as AppRole, cap))
    : [];

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(item: NavItem): boolean {
    if (item.activeForPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
    const base = item.href.split("?")[0];

    if (item.activeWhenQueryMatch) {
      const { param, value } = item.activeWhenQueryMatch;
      if (!(pathname === base || pathname.startsWith(`${base}/`))) return false;
      return searchParams.get(param) === value;
    }

    const rolePath = user?.role ? user.role.replaceAll("_", "-") : "";
    const isRoleRoot =
      base === `/${rolePath}` ||
      (user?.role === "admin" && base === "/admin");
    if (isRoleRoot) {
      if (item.inactiveWhenQueryMatch && pathname === base) {
        const { param, value } = item.inactiveWhenQueryMatch;
        if (searchParams.get(param) === value) return false;
      }
      return pathname === base;
    }
    return pathname === base || pathname.startsWith(`${base}/`);
  }

  function closeMobileNav() {
    onMobileOpenChange?.(false);
  }

  function renderNavItem(item: NavItem) {
    const active = isActive(item);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMobileNav}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors group",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className={cn("h-5 w-5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
        <span className="flex-1">{t(item.key)}</span>
        {item.badge && <span className="ml-auto flex h-2 w-2 rounded-full bg-destructive" />}
        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </Link>
    );
  }

  function renderContent() {
    return (
      <>
        {/* Header - Logo and Platform Name */}
        <div className="flex h-[var(--topbar-height)] items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/5">
            <Logo size={28} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight text-foreground">WheelSense</h1>
            <p className="text-[11px] text-muted-foreground">{t("shell.platformSubtitle")}</p>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {!user ? (
            <NavSkeleton />
          ) : (
            filteredConfig.map((group, groupIndex) => (
              <div key={groupIndex}>
                {group.categoryKey && (
                  <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t(group.categoryKey)}
                  </p>
                )}
                <div className="space-y-0.5">{group.items.map((item) => renderNavItem(item))}</div>
              </div>
            ))
          )}
        </nav>

        {/* Logout Button */}
        <div className="space-y-1 px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              handleLogout();
              closeMobileNav();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left">{t("auth.logout")}</span>
          </button>
        </div>

        {/* User Profile Section */}
        {user && (
          <div className="border-t bg-muted/50 px-4 py-3">
            <Link
              href="/account"
              className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted"
            >
              <UserAvatar username={user.username} profileImageUrl={user.profile_image_url} sizePx={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{user.username}</p>
                <p className="text-[11px] text-muted-foreground">{t(ROLE_LABEL_KEYS[user.role] ?? "shell.roleAdmin")}</p>
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-card lg:flex">
        {renderContent()}
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
          <div className="flex h-full flex-col">{renderContent()}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
