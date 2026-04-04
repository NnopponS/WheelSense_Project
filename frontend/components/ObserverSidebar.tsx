"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
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

export default function ObserverSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useTranslation();

  return (
    <aside className="w-[var(--sidebar-width)] bg-surface-container-low flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r border-outline-variant/10">
      <div className="h-[var(--topbar-height)] flex items-center gap-3 px-5 border-b border-outline-variant/10">
        <Activity className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-on-surface font-bold text-base">WheelSense</h1>
          <p className="text-on-surface-variant text-[11px] uppercase tracking-wide">
            Observer
          </p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {ITEMS.map((item) => {
          const active =
            item.href === "/observer"
              ? pathname === "/observer"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth ${
                active
                  ? "bg-on-surface text-surface"
                  : "text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-outline-variant/10">
        <button
          type="button"
          onClick={() => {
            logout();
            router.push("/login");
          }}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-critical"
        >
          <LogOut className="w-4 h-4" />
          {t("auth.logout")}
        </button>
      </div>
    </aside>
  );
}
