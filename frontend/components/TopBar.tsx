"use client";

import { useAuth } from "@/hooks/useAuth";
import { Bell, Search } from "lucide-react";
import LanguageSwitcher from "./LanguageSwitcher";
import RoleSwitcher from "./RoleSwitcher";

interface TopBarProps {
  title?: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { user } = useAuth();

  return (
    <header className="h-[var(--topbar-height)] bg-surface-container-lowest flex items-center justify-between px-6 shrink-0 sticky top-0 z-30">
      {/* Left — breadcrumb / title */}
      <div className="flex items-center gap-3">
        {title && (
          <div>
            <h1 className="text-lg font-semibold text-on-surface leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs text-on-surface-variant">{subtitle}</p>
            )}
          </div>
        )}
      </div>

      {/* Center — search */}
      <div className="hidden md:flex flex-1 max-w-md mx-8">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
          <input
            type="text"
            placeholder="Search..."
            className="input-field input-field--leading-icon py-2 text-sm bg-surface-container-low"
          />
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2">
        <RoleSwitcher />
        <LanguageSwitcher />

        <button
          className="relative p-2.5 rounded-lg text-on-surface-variant
                     hover:bg-surface-container-high transition-smooth cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
        </button>

        {/* User avatar */}
        {user && (
          <div className="flex items-center gap-2 ml-2 pl-3 border-l border-outline-variant/20">
            <div className="w-8 h-8 rounded-full gradient-cta flex items-center justify-center text-white text-xs font-bold">
              {user.username?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-medium text-on-surface leading-tight">
                {user.username}
              </p>
              <p className="text-[11px] text-on-surface-variant capitalize">
                {user.role}
              </p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
