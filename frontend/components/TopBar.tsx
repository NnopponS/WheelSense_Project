"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { Bell, Search } from "lucide-react";
import LanguageSwitcher from "./LanguageSwitcher";
import RoleSwitcher from "./RoleSwitcher";
import ProfileImageEditorModal from "./shared/ProfileImageEditorModal";
import UserAvatar from "./shared/UserAvatar";

interface TopBarProps {
  title?: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [profileOpen, setProfileOpen] = useState(false);

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
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ring-offset-2 ring-offset-surface-container-lowest"
              aria-label={t("profile.avatar.changePhoto")}
            >
              <UserAvatar
                username={user.username}
                profileImageUrl={user.profile_image_url}
                sizePx={32}
              />
            </button>
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

      <ProfileImageEditorModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
