"use client";

import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

interface NotificationBellProps {
  onClick: () => void;
  unreadCount: number;
  hasNewNotifications?: boolean;
}

export function NotificationBell({
  onClick,
  unreadCount,
  hasNewNotifications,
}: NotificationBellProps) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-label={t("shell.notifications")}
        className={cn(
          "relative transition-all duration-300",
          hasNewNotifications && "animate-pulse"
        )}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {hasNewNotifications && unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-destructive/60" />
        )}
      </Button>
    </div>
  );
}
