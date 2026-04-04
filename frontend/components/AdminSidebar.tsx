"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import {
  LayoutDashboard,
  Users,
  Tablet,
  MapPin,
  Bell,
  UserCog,
  Building2,
  LogOut,
  Activity,
  Shield,
  ScrollText,
  Settings,
} from "lucide-react";
import type { ComponentType } from "react";

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
    ],
  },
  {
    categoryKey: "nav.category.admin",
    items: [
      { href: "/admin/users", labelKey: "nav.users", icon: Shield },
      { href: "/admin/facilities", labelKey: "nav.facilities", icon: Building2 },
      { href: "/admin/settings", labelKey: "nav.settings", icon: Settings },
      { href: "/admin/audit", labelKey: "nav.auditLog", icon: ScrollText },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-[var(--sidebar-width)] bg-surface-container-lowest flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r border-outline-variant/10">
      {/* Logo */}
      <div className="h-[var(--topbar-height)] flex items-center gap-3 px-5">
        <div className="w-9 h-9 gradient-cta rounded-lg flex items-center justify-center">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-on-surface font-bold text-base leading-tight">
            WheelSense
          </h1>
          <p className="text-on-surface-variant text-[11px]">Smart Care Platform</p>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 py-4 px-3 space-y-6 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.categoryKey}>
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-widest text-outline uppercase">
              {t(group.categoryKey)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth group ${
                      active
                        ? "bg-primary-fixed text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                    }`}
                  >
                    <item.icon
                      className={`w-[18px] h-[18px] shrink-0 ${
                        active ? "text-primary" : "text-outline"
                      }`}
                    />
                    <span className="flex-1">{t(item.labelKey)}</span>
                    {active && (
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom — Logout + User */}
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
        <div className="px-4 py-3 border-t border-outline-variant/10 bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full gradient-cta flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.username?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">
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
