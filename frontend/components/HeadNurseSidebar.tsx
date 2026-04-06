"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Bell,
  FileText,
  MessageSquare,
  Activity,
  LogOut,
  Stethoscope,
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

const GROUPS: NavGroup[] = [
  {
    categoryKey: "nav.category.care",
    items: [
      { href: "/head-nurse", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/head-nurse/patients", labelKey: "nav.patients", icon: Users },
      { href: "/head-nurse/staff", labelKey: "nav.staff", icon: UserCog },
    ],
  },
  {
    categoryKey: "nav.category.operations",
    items: [
      { href: "/head-nurse/alerts", labelKey: "nav.alerts", icon: Bell },
      { href: "/head-nurse/specialists", labelKey: "nav.specialists", icon: Stethoscope },
      { href: "/head-nurse/reports", labelKey: "nav.reports", icon: FileText },
      { href: "/head-nurse/messages", labelKey: "nav.messages", icon: MessageSquare },
    ],
  },
];

export default function HeadNurseSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  function isActive(href: string): boolean {
    if (href === "/head-nurse") return pathname === "/head-nurse";
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-[var(--sidebar-width)] bg-surface-container-lowest flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r border-outline-variant/10">
      <div className="h-[var(--topbar-height)] flex items-center gap-3 px-5">
        <div className="w-9 h-9 gradient-cta rounded-lg flex items-center justify-center">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-on-surface font-bold text-base leading-tight">WheelSense</h1>
          <p className="text-on-surface-variant text-[11px] uppercase tracking-wide">
            Head Nurse
          </p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-6 overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.categoryKey}>
            <p className="px-3 mb-2 text-[10px] font-semibold tracking-widest text-outline uppercase">
              {t(group.categoryKey)}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth ${
                    isActive(item.href)
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {t(item.labelKey)}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {user && (
        <div className="px-4 py-3 border-t border-outline-variant/10 bg-surface-container-low">
          <div className="flex items-center gap-3">
            <UserAvatar
              username={user.username}
              profileImageUrl={user.profile_image_url}
              sizePx={32}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{user.username}</p>
              <p className="text-[11px] text-on-surface-variant capitalize">{user.role}</p>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 border-t border-outline-variant/10">
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-critical hover:bg-critical-bg transition-smooth"
        >
          <LogOut className="w-[18px] h-[18px]" />
          {t("auth.logout")}
        </button>
      </div>
    </aside>
  );
}
