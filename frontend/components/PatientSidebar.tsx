"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import {
  LayoutDashboard,
  MessageSquare,
  LogOut,
  Activity,
  PackageCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export default function PatientSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
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

  return (
    <aside className="w-[var(--sidebar-width)] bg-surface-container-lowest flex flex-col shrink-0 fixed inset-y-0 left-0 z-40 border-r border-outline-variant/10">
      {/* Logo */}
      <div className="h-[var(--topbar-height)] flex items-center gap-3 px-5">
        <div className="w-9 h-9 gradient-cta rounded-full flex items-center justify-center">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-on-surface font-bold text-base leading-tight">
            WheelSense
          </h1>
          <p className="text-on-surface-variant text-[11px]">Patient Hub</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl text-base font-medium transition-smooth group ${
                active
                  ? "bg-primary-container text-on-primary-container shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <item.icon
                className={`w-6 h-6 shrink-0 ${
                  active ? "text-primary" : "text-outline"
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
          className="flex items-center gap-4 px-4 py-3.5 rounded-2xl text-base font-medium
                     text-on-surface-variant hover:bg-error-container hover:text-error
                     transition-smooth w-full cursor-pointer"
        >
          <LogOut className="w-6 h-6 shrink-0" />
          <span className="flex-1 text-left">{t("auth.logout")}</span>
        </button>
      </div>
    </aside>
  );
}
