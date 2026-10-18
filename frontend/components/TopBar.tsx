"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu, Beaker, Volume2, VolumeX } from "lucide-react";
import { getAlertSoundEnabled, primeAlertAudioFromUserGesture, setAlertSoundEnabled } from "@/lib/alertSound";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { useNotifications } from "@/hooks/useNotifications";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { filterNavItemsByCapability, getNavConfig, isNavItemActive } from "@/lib/sidebarConfig";
import { hasCapability, type AppRole } from "@/lib/permissions";
import { NavigationSearch } from "./NavigationSearch";
import LanguageSwitcher from "./LanguageSwitcher";
import RoleSwitcher from "./RoleSwitcher";
import UserAvatar from "./shared/UserAvatar";
import { NotificationBell } from "./NotificationBell";
import { NotificationDrawer } from "./NotificationDrawer";
import { IncomingNotificationDialog } from "./notifications/IncomingNotificationDialog";

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

const ROLE_LABELS: Record<string, "shell.roleAdmin" | "shell.roleHeadCaregiver" | "shell.roleCaregiver" | "shell.rolePatient"> = {
  admin: "shell.roleAdmin",
  head_caregiver: "shell.roleHeadCaregiver",
  head_nurse: "shell.roleHeadCaregiver",
  supervisor: "shell.roleHeadCaregiver",
  caregiver: "shell.roleCaregiver",
  observer: "shell.roleCaregiver",
  patient: "shell.rolePatient",
};

export default function TopBar({ title, subtitle, onMenuClick }: TopBarProps) {
  const { user, impersonation, stopImpersonation } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [alertSoundOn, setAlertSoundOn] = useState(() => getAlertSoundEnabled());
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, hasNewNotifications, popupQueue, dismissPopup } = useNotifications();
  const { data: simulatorStatus } = useQuery({
    queryKey: ["shell", "topbar", "demo-simulator-status"],
    queryFn: () => api.get<SimulatorStatus>("/demo/simulator/status"),
    enabled: !!user,
    staleTime: getQueryStaleTimeMs("/demo/simulator/status"),
    refetchInterval: getQueryPollingMs("/demo/simulator/status"),
    retry: 3,
  });

  const currentNavLabel = useMemo(() => {
    if (!user) return undefined;
    const items = filterNavItemsByCapability(getNavConfig(user.role), (capability) =>
      hasCapability(user.role as AppRole, capability),
    ).flatMap((group) => group.items);
    const activeItem = items.find((item) => isNavItemActive(item, pathname, searchParams, user.role));
    return activeItem ? t(activeItem.key) : undefined;
  }, [pathname, searchParams, t, user]);

  const roleLabel = user ? t(ROLE_LABELS[user.role] ?? "shell.roleAdmin") : undefined;
  const resolvedTitle = title ?? currentNavLabel ?? roleLabel;

  const notificationInboxHint = useMemo(() => {
    if (!user || user.role === "patient") return undefined;
    if (impersonation.active) {
      return `${t("notifications.drawerInboxImpersonationLead")} ${user.username ?? t("shell.impersonationUserPlaceholder")} — ${t("notifications.drawerInboxImpersonationTail")}`;
    }
    if (user.role === "admin") return t("notifications.drawerInboxAdminHint");
    if (user.role === "head_caregiver") return t("notifications.drawerInboxHeadNurseHint");
    return undefined;
  }, [impersonation.active, t, user]);

  function enableAlertSound() {
    primeAlertAudioFromUserGesture();
    setAlertSoundEnabled(true);
    setAlertSoundOn(true);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-lg">
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
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 px-3 py-2 sm:min-h-[var(--topbar-height)] sm:px-6 sm:py-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-initial sm:gap-3">
        {onMenuClick ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={onMenuClick}
            aria-label={t("shell.openNavigation")}
          >
            <Menu className="h-6 w-6" />
          </Button>
        ) : null}
        {resolvedTitle ? (
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight text-foreground sm:text-lg">
              {resolvedTitle}
            </p>
            {(subtitle ?? roleLabel) ? (
              <p className="hidden truncate text-sm text-muted-foreground sm:block">
                {subtitle ?? roleLabel}
              </p>
            ) : null}
          </div>
        ) : null}
        </div>

        <div className="mx-0 hidden min-w-0 flex-1 md:flex md:max-w-md lg:mx-8">
          <NavigationSearch />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-0 sm:gap-2">
          <div className="hidden sm:block">
            <RoleSwitcher />
          </div>
          <div className="block">
            <LanguageSwitcher compact />
          </div>
          <div className="block">
            <ThemeToggle />
          </div>

          {user && user.role !== "patient" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={alertSoundOn ? "hidden text-primary sm:inline-flex" : "hidden text-muted-foreground sm:inline-flex"}
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
            <div className="flex shrink-0 items-center gap-2 sm:ml-2 sm:border-l sm:border-border sm:pl-3">
              <Link
              href="/account"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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

      {simulatorStatus?.is_simulator ? <div className="flex items-center gap-2 border-t border-warning/20 bg-warning-bg px-4 py-1 text-xs font-medium text-warning-foreground" role="status"><Beaker className="h-4 w-4" aria-hidden="true" />{t("redesign.simulation")}</div> : null}

      {popupQueue[0] ? <IncomingNotificationDialog key={popupQueue[0].id} notification={popupQueue[0]} pendingCount={popupQueue.length} canTriage={user?.role === "admin" || user?.role === "head_caregiver" || user?.role === "caregiver"} isSimulator={Boolean(simulatorStatus?.is_simulator)} soundEnabled={alertSoundOn} onEnableSound={enableAlertSound} onDismiss={dismissPopup} /> : null}

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
