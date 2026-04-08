"use client";

import { useState } from "react";
import { Bell, Search } from "lucide-react";
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
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-height)] shrink-0 items-center justify-between border-b border-border/70 bg-card/95 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        {title ? (
          <div>
            <h1 className="text-lg font-semibold leading-tight text-foreground">{title}</h1>
            {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mx-8 hidden max-w-md flex-1 md:flex">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="text" placeholder="Search..." className="pl-9" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <RoleSwitcher />
        <LanguageSwitcher />
        <ThemeToggle />

        <Button type="button" variant="ghost" size="icon" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </Button>

        {user ? (
          <div className="ml-2 flex items-center gap-2 border-l border-border pl-3">
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
            <div className="hidden lg:block">
              <p className="text-sm font-medium leading-tight text-foreground">
                {user.username}
              </p>
              <p className="text-[11px] capitalize text-muted-foreground">{user.role}</p>
            </div>
          </div>
        ) : null}
      </div>

      <ProfileImageEditorModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
