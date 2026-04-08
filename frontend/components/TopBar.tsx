"use client";

import { useState } from "react";
import { Bell, Menu, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LanguageSwitcher from "./LanguageSwitcher";
import RoleSwitcher from "./RoleSwitcher";
import ProfileImageEditorModal from "./shared/ProfileImageEditorModal";
import UserAvatar from "./shared/UserAvatar";

interface TopBarProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

const ROLE_LABELS: Record<string, "shell.roleAdmin" | "shell.roleHeadNurse" | "shell.roleSupervisor" | "shell.roleObserver" | "shell.rolePatient"> = {
  admin: "shell.roleAdmin",
  head_nurse: "shell.roleHeadNurse",
  supervisor: "shell.roleSupervisor",
  observer: "shell.roleObserver",
  patient: "shell.rolePatient",
};

export default function TopBar({ title, subtitle, onMenuClick }: TopBarProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex min-h-[var(--topbar-height)] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onMenuClick ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
            aria-label={t("shell.openNavigation")}
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : null}
        {title ? (
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
              {title}
            </h1>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mx-0 hidden min-w-0 flex-1 md:flex md:max-w-md lg:mx-8">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="text" placeholder={t("shell.search")} className="pl-9" />
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <RoleSwitcher />
        <LanguageSwitcher />
        <ThemeToggle />

        <Button type="button" variant="ghost" size="icon" aria-label={t("shell.notifications")}>
          <Bell className="h-5 w-5" />
        </Button>

        {user ? (
          <div className="ml-1 flex min-w-0 items-center gap-2 border-l border-border pl-2 sm:ml-2 sm:pl-3">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              aria-label={t("profile.avatar.changePhoto")}
            >
              <UserAvatar
                username={user.username}
                profileImageUrl={user.profile_image_url}
                sizePx={32}
              />
            </button>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-medium leading-tight text-foreground">
                {user.username}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t(ROLE_LABELS[user.role] ?? "shell.roleAdmin")}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <ProfileImageEditorModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
