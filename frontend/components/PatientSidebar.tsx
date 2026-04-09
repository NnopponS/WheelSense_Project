"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  MessageSquare,
  LogOut,
  Activity,
  PackageCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";

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

export default function PatientSidebar({ mobileOpen = false, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const items: {
    href: string;
    labelKey: TranslationKey;
    icon: LucideIcon;
  }[] = [
    { href: "/patient", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { href: "/patient/messages", labelKey: "nav.messages", icon: MessageSquare },
    { href: "/patient/pharmacy", labelKey: "nav.pharmacy", icon: PackageCheck },
  ];

  function isActive(href: string): boolean {
    if (href === "/patient") return pathname === "/patient";
    return pathname.startsWith(href);
  }

  function closeMobileNav() {
    onMobileOpenChange?.(false);
  }

  function renderContent(isMobile = false) {
    return (
      <>
        <div className="flex h-[var(--topbar-height)] items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight text-on-surface">WheelSense</h1>
            <p className="text-[11px] text-on-surface-variant">{t("shell.platformSubtitle")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={isMobile ? closeMobileNav : undefined}
                className={`flex items-center gap-4 rounded-2xl px-4 py-3.5 text-base font-medium transition-smooth group ${
                  active
                    ? "bg-primary-container text-on-primary-container shadow-sm"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                <item.icon
                  className={`h-6 w-6 shrink-0 ${active ? "text-primary" : "text-outline"}`}
                />
                <span className="flex-1">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {user ? (
          <div className="border-t border-outline-variant/10 bg-surface-container-low px-4 py-3">
            <Link href="/account" className="flex items-center gap-3 rounded-lg p-1 transition-smooth hover:bg-surface-container">
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
            </Link>
          </div>
        ) : null}

        <div className="border-t border-outline-variant/10 px-3 pb-3 pt-3">
          <button
            type="button"
            onClick={() => {
              handleLogout();
              closeMobileNav();
            }}
            className="flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-base font-medium text-on-surface-variant transition-smooth hover:bg-error-container hover:text-error"
          >
            <LogOut className="h-6 w-6 shrink-0" />
            <span className="flex-1 text-left">{t("auth.logout")}</span>
          </button>
        </div>
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
