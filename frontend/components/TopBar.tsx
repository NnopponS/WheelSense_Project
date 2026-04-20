"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, Beaker, Volume2, VolumeX } from "lucide-react";
import { getAlertSoundEnabled, primeAlertAudioFromUserGesture, setAlertSoundEnabled } from "@/lib/alertSound";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { useNotifications } from "@/hooks/useNotifications";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import LanguageSwitcher from "./LanguageSwitcher";
import RoleSwitcher from "./RoleSwitcher";
import UserAvatar from "./shared/UserAvatar";
import { NotificationBell } from "./NotificationBell";
import { NotificationDrawer } from "./NotificationDrawer";

type SimulatorStatus = {
  env_mode: string;
  is_simulator: boolean;
  workspace_exists: boolean;
};

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
  const { user, impersonation, stopImpersonation } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alertSoundOn, setAlertSoundOn] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, hasNewNotifications } = useNotifications();
  const { data: simulatorStatus } = useQuery({
    queryKey: ["shell", "topbar", "demo-simulator-status"],
    queryFn: () => api.get<SimulatorStatus>("/demo/simulator/status"),
    enabled: !!user,
    staleTime: getQueryStaleTimeMs("/demo/simulator/status"),
    refetchInterval: getQueryPollingMs("/demo/simulator/status"),
    retry: 3,
  });

  useEffect(() => {
    setAlertSoundOn(getAlertSoundEnabled());
  }, []);

  const notificationInboxHint = useMemo(() => {
    if (!user || user.role === "patient") return undefined;
    if (impersonation.active) {
      return `${t("notifications.drawerInboxImpersonationLead")} ${user.username ?? t("shell.impersonationUserPlaceholder")} — ${t("notifications.drawerInboxImpersonationTail")}`;
    }
    if (user.role === "admin") return t("notifications.drawerInboxAdminHint");
    if (user.role === "head_nurse") return t("notifications.drawerInboxHeadNurseHint");
    return undefined;
  }, [impersonation.active, t, user]);

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-card/95 backdrop-blur">
      {impersonation.active ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-base text-foreground sm:px-6">
          <p className="min-w-0">
            <span className="font-semibold">{t("shell.impersonationActingAs")}</span>{" "}
            <span className="font-medium">
              {user?.username ?? t("shell.impersonationUserPlaceholder")}
            </span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void stopImpersonation().then(() => router.push("/admin"));
            }}
          >
            {t("shell.impersonationStop")}
          </Button>
        </div>
      ) : null}
      <div className="flex min-h-[var(--topbar-height)] shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
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
            <Menu className="h-6 w-6" />
          </Button>
        ) : null}
        {title ? (
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold leading-tight text-foreground sm:text-xl">
              {title}
            </h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        ) : null}
        </div>

        <div className="mx-0 hidden min-w-0 flex-1 md:flex md:max-w-md lg:mx-8">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input type="text" placeholder={t("shell.search")} className="pl-10" />
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <RoleSwitcher />
          {/* Environment Badge - Only shown for admins in simulator mode */}
          {simulatorStatus?.is_simulator && user?.role === "admin" ? (
            <Badge 
              variant="secondary" 
              className="hidden sm:inline-flex bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-100"
            >
              <Beaker className="mr-1 h-5 w-5" />
              SIM
            </Badge>
          ) : null}
          <LanguageSwitcher />
          <ThemeToggle />

          {user && user.role !== "patient" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={alertSoundOn ? "text-primary" : "text-muted-foreground"}
              aria-label={alertSoundOn ? t("shell.alertSoundOn") : t("shell.alertSoundOff")}
              aria-pressed={alertSoundOn}
              title={t("shell.alertSound")}
              onClick={() => {
                const next = !alertSoundOn;
                if (next) {
                  primeAlertAudioFromUserGesture();
                }
                setAlertSoundEnabled(next);
                setAlertSoundOn(next);
              }}
            >
              {alertSoundOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
            </Button>
          ) : null}

          <NotificationBell
            onClick={() => setNotificationsOpen(true)}
            unreadCount={unreadCount}
            hasNewNotifications={hasNewNotifications}
          />

          {user ? (
            <div className="ml-1 flex min-w-0 items-center gap-2 border-l border-border pl-2 sm:ml-2 sm:pl-3">
              <Link
              href="/account"
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              aria-label={t("shell.openAccountSettings")}
            >
              <UserAvatar
                username={user.username}
                profileImageUrl={user.profile_image_url}
                sizePx={32}
              />
              </Link>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-base font-medium leading-tight text-foreground">
                  {user.username}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t(ROLE_LABELS[user.role] ?? "shell.roleAdmin")}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <NotificationDrawer
        isOpen={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        notifications={notifications}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
        onClearAll={clearAll}
        inboxContextHint={notificationInboxHint}
      />
    </header>
  );
}
