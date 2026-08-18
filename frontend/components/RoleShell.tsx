"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useFontScale } from "@/hooks/useFontScale";
import { canAccessAppRole } from "@/lib/permissions";
import { getRoleHome } from "@/lib/routes";
import { filterNavItemsByCapability, getNavConfig, isNavItemActive } from "@/lib/sidebarConfig";
import { hasCapability, type AppRole } from "@/lib/permissions";
import RoleSidebar from "./RoleSidebar";
import TopBar from "./TopBar";
import AIChatPopup from "./ai/AIChatPopup";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { MoreHorizontal } from "lucide-react";

interface RoleShellProps {
  children: React.ReactNode;
  /** App root path for role guard (e.g., "/admin", "/head-nurse") */
  appRoot: "/admin" | "/head-nurse" | "/supervisor" | "/observer" | "/patient";
  /** Optional additional classes for main content area */
  mainClassName?: string;
}

function MobileRoleTaskBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  if (!user) return null;

  const allItems = filterNavItemsByCapability(getNavConfig(user.role), (cap) =>
    hasCapability(user.role as AppRole, cap),
  ).flatMap((group) => group.items);

  const mobilePriorityItems = allItems
    .filter((item) => item.mobilePriority != null)
    .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99));
  const fallbackPrimaryItems = allItems.filter((item) => item.group !== "more");
  const displayItems = (mobilePriorityItems.length > 0 ? mobilePriorityItems : fallbackPrimaryItems).slice(0, 5);
  const displayHrefs = new Set(displayItems.map((item) => item.href));
  const overflowItems = allItems.filter((item) => !displayHrefs.has(item.href));
  const needsMoreButton = displayItems.length < 5 && overflowItems.length > 0;
  const gridColsClass = `grid-cols-${displayItems.length + (needsMoreButton ? 1 : 0)}`;

  return (
    <nav
      className="ws-role-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/98 px-2 pt-2 shadow-[0_-14px_35px_-28px_rgb(15_23_42/0.5)] lg:hidden"
      aria-label={t("shell.mobileNavigation")}
    >
      <div className={cn("mx-auto grid max-w-md gap-1", gridColsClass === "grid-cols-5" ? "grid-cols-5" : gridColsClass === "grid-cols-4" ? "grid-cols-4" : gridColsClass === "grid-cols-3" ? "grid-cols-3" : "grid-cols-2")}>
        {displayItems.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item, pathname, searchParams, user.role);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-sm font-medium leading-tight transition-colors",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="line-clamp-2 max-w-full text-center">{t(item.key)}</span>
            </Link>
          );
        })}
        {needsMoreButton && (
          <button
            type="button"
            className="relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-sm font-medium leading-tight text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            onClick={onMoreClick}
            aria-label={t("nav.more")}
          >
            <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden />
            <span className="line-clamp-2 max-w-full text-center">{t("nav.more")}</span>
          </button>
        )}
      </div>
    </nav>
  );
}

/**
 * Unified Role Shell Component
 * Provides:
 * - Auth guard (redirects to /login if not authenticated)
 * - Role guard (redirects to role home if user cannot access appRoot)
 * - RoleSidebar + TopBar + AIChatPopup layout
 */
export default function RoleShell({ children, appRoot, mainClassName }: RoleShellProps) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { elderClass } = useFontScale();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const roleCheckDone = useRef(false);

  // Auth guard - redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Role guard - redirect to role home if user doesn't have access to this app root
  // Only run once to prevent redirect loops
  useEffect(() => {
    if (!loading && user && !roleCheckDone.current) {
      roleCheckDone.current = true;
      if (!canAccessAppRole(user.role, appRoot)) {
        // Exception: allow staff to edit their own profile
        if (appRoot === "/admin" && pathname.startsWith("/admin/caregivers/") && user.caregiver_id) {
          const pathParts = pathname.split("/");
          const requestedId = pathParts[pathParts.length - 1];
          if (requestedId === String(user.caregiver_id)) {
            return;
          }
        }
        
        // Add small delay to prevent rapid redirects
        const timeout = setTimeout(() => {
          router.replace(getRoleHome(user.role));
        }, 100);
        return () => clearTimeout(timeout);
      }
    }
  }, [user, loading, router, pathname, appRoot]);

  // Show loading spinner while auth is loading or during hydration
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{t("shell.loadingWorkspace")}</p>
        </div>
      </div>
    );
  }

  // Return null if no user (will redirect)
  if (!user) return null;

  return (
    <div className={cn("flex min-h-screen bg-background", user.role === "patient" && "ws-density-patient", elderClass)}>
      <a
        href="#main-content"
        className="sr-only fixed left-3 top-3 z-[100] rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-on-primary shadow-lg focus:not-sr-only"
      >
        {t("nav.skipToContent")}
      </a>
      {/* Sidebar - Desktop fixed, Mobile Sheet */}
      <RoleSidebar mobileOpen={mobileNavOpen} onMobileOpenChange={setMobileNavOpen} />

      {/* Main Content Area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-[var(--sidebar-width)]">
        {/* Top Navigation Bar */}
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />

        {/* Main Content */}
        <main id="main-content" tabIndex={-1} className={cn("ws-mobile-safe-bottom min-w-0 flex-1 overflow-y-auto px-[var(--ws-page-padding)] py-5 sm:py-6", mainClassName)}>
          {children}
        </main>
      </div>

      {/* AI Chat Popup */}
      <AIChatPopup />
      <MobileRoleTaskBar onMoreClick={() => setMobileNavOpen(true)} />
    </div>
  );
}
