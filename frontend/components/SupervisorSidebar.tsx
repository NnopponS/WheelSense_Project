"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import {
  Users,
  LayoutDashboard,
  Activity,
  LogOut,
  MapPin,
  Clock,
  Pill,
} from "lucide-react";
import type { ComponentType } from "react";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
}

const ITEMS: NavItem[] = [
  { href: "/supervisor", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/supervisor/patients", labelKey: "nav.patients", icon: Users },
  { href: "/supervisor/emergency", labelKey: "nav.emergencyMap", icon: MapPin },
  { href: "/supervisor/directives", labelKey: "nav.tasksDirectives", icon: Clock },
  { href: "/supervisor/prescriptions", labelKey: "nav.prescriptions", icon: Pill },
];

export default function SupervisorSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    if (href === "/supervisor") return pathname === "/supervisor";
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-[var(--sidebar-width)] bg-surface-container-lowest flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r border-outline-variant/30">
      {/* Logo */}
      <div className="h-[var(--topbar-height)] flex items-center gap-3 px-5">
        <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-on-surface font-bold text-base leading-tight">
            WheelSense
          </h1>
          <p className="text-on-surface-variant text-[11px] uppercase tracking-wide">Supervisor</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth group ${
                active
                  ? "bg-primary text-on-primary font-semibold shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              <item.icon
                className={`w-[18px] h-[18px] shrink-0 ${
                  active ? "text-on-primary" : "text-outline"
                }`}
              />
              <span className="flex-1">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-3 space-y-1">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                     text-on-surface-variant hover:bg-error-container hover:text-error
                     transition-smooth w-full cursor-pointer"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className="flex-1 text-left">{t("auth.logout")}</span>
        </button>
      </div>

      {/* User Info */}
      {user && (
        <div className="px-4 py-3 border-t border-outline-variant/30 bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
              {user.username?.[0]?.toUpperCase() || "S"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-on-surface truncate">
                {user.username}
              </p>
              <p className="text-[11px] text-on-surface-variant capitalize">
                {user.role}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
