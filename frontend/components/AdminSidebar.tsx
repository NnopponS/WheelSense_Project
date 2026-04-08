"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  Tablet,
  MapPin,
  Bell,
  Clock,
  UserCog,
  LogOut,
  Activity,
  ScrollText,
  Settings,
  UserCircle2,
} from "lucide-react";
import type { ComponentType } from "react";
import UserAvatar from "@/components/shared/UserAvatar";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
}

interface NavGroup {
  categoryKey: TranslationKey;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    categoryKey: "nav.category.care",
    items: [
      { href: "/admin", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/admin/patients", labelKey: "nav.patients", icon: Users },
      { href: "/admin/alerts", labelKey: "nav.alerts", icon: Bell },
    ],
  },
  {
    categoryKey: "nav.category.operations",
    items: [
      { href: "/admin/monitoring", labelKey: "nav.roomsMap", icon: MapPin },
      { href: "/admin/devices", labelKey: "nav.devices", icon: Tablet },
      { href: "/admin/caregivers", labelKey: "nav.staff", icon: UserCog },
      { href: "/admin/workflow", labelKey: "nav.tasksDirectives", icon: Clock },
      { href: "/admin/account-management", labelKey: "nav.myAccount", icon: UserCircle2 },
    ],
  },
  {
    categoryKey: "nav.category.admin",
    items: [
      { href: "/admin/settings", labelKey: "nav.settings", icon: Settings },
      { href: "/admin/audit", labelKey: "nav.auditLog", icon: ScrollText },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  admin: "shell.roleAdmin",
  head_nurse: "shell.roleHeadNurse",
  supervisor: "shell.roleSupervisor",
  observer: "shell.roleObserver",
  patient: "shell.rolePatient",
};

export default function AdminSidebar({ mobileOpen = false, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    const base = href.split("?")[0];
    if (base === "/admin") return pathname === "/admin";
    return pathname === base || pathname.startsWith(`${base}/`);
  }

  function closeMobileNav() {
    onMobileOpenChange?.(false);
  }

  function renderContent(isMobile = false) {
    return (
      <>
        <div className="flex h-[var(--topbar-height)] items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight text-on-surface">
              WheelSense
            </h1>
            <p className="text-[11px] text-on-surface-variant">{t("shell.platformSubtitle")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.categoryKey}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-outline">
                {t(group.categoryKey)}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={isMobile ? closeMobileNav : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-smooth group ${
                        active
                          ? "bg-primary-fixed text-primary"
                          : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                      }`}
                    >
                      <item.icon
                        className={`h-[18px] w-[18px] shrink-0 ${
                          active ? "text-primary" : "text-outline"
                        }`}
                      />
                      <span className="flex-1">{t(item.labelKey)}</span>
                      {active ? <div className="h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              handleLogout();
              closeMobileNav();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface-variant transition-smooth hover:bg-error-container hover:text-error"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" />
            <span className="flex-1 text-left">{t("auth.logout")}</span>
          </button>
        </div>

        {user ? (
          <div className="border-t border-outline-variant/10 bg-surface-container-low px-4 py-3">
            <div className="flex items-center gap-3">
              <UserAvatar
                username={user.username}
                profileImageUrl={user.profile_image_url}
                sizePx={32}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-on-surface">{user.username}</p>
                <p className="text-[11px] text-on-surface-variant">
                  {t(ROLE_LABEL_KEYS[user.role] ?? "shell.roleAdmin")}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-outline-variant/10 bg-surface-container-lowest lg:flex">
        {renderContent(false)}
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-[min(18rem,85vw)] p-0 sm:max-w-none">
          <SheetHeader className="sr-only">
            <SheetTitle>{t("shell.navigation")}</SheetTitle>
            <SheetDescription>{t("shell.navigationSheetDescription")}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full flex-col">{renderContent(true)}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
