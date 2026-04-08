"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  LogOut,
  Monitor,
  Activity,
  Users,
  Bell,
  Tablet,
  ClipboardList,
} from "lucide-react";
import type { ComponentType } from "react";
import UserAvatar from "@/components/shared/UserAvatar";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
}

const ITEMS: NavItem[] = [
  { href: "/observer", labelKey: "nav.observer.zone", icon: Monitor },
  { href: "/observer/patients", labelKey: "nav.observer.myPatients", icon: Users },
  { href: "/observer/alerts", labelKey: "nav.alerts", icon: Bell },
  { href: "/observer/devices", labelKey: "nav.observer.deviceStatus", icon: Tablet },
  { href: "/observer/prescriptions", labelKey: "nav.prescriptions", icon: ClipboardList },
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

export default function ObserverSidebar({ mobileOpen = false, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    if (href === "/observer") return pathname === "/observer";
    return pathname.startsWith(href);
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
            <h1 className="truncate text-base font-bold leading-tight text-on-surface">WheelSense</h1>
            <p className="text-[11px] text-on-surface-variant">{t("shell.platformSubtitle")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={isMobile ? closeMobileNav : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-smooth ${
                  active
                    ? "bg-on-surface text-surface"
                    : "text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

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

        <div className="border-t border-outline-variant/10 p-3">
          <button
            type="button"
            onClick={() => {
              handleLogout();
              closeMobileNav();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-critical transition-smooth hover:bg-critical-bg"
          >
            <LogOut className="h-4 w-4" />
            {t("auth.logout")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] shrink-0 flex-col border-r border-outline-variant/10 bg-surface-container-low lg:flex">
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
