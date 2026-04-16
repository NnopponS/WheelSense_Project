"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  ListChecks,
  Mail,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import type { Notification, NotificationType } from "@/hooks/useNotifications";

interface NotificationDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  /** Staff-only: explains shared clinical inbox / impersonation context */
  inboxContextHint?: string;
}

const TYPE_LABEL_KEYS: Record<NotificationType, TranslationKey> = {
  alert: "notifications.typeAlert",
  task: "notifications.typeTask",
  workflow_job: "notifications.typeWorkflowJob",
  message: "notifications.typeMessage",
};

const typeConfig: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  alert: {
    icon: <AlertTriangle className="h-4 w-4" />,
    color: "bg-destructive/10 text-destructive",
  },
  task: {
    icon: <ClipboardList className="h-4 w-4" />,
    color: "bg-primary/10 text-primary",
  },
  workflow_job: {
    icon: <ListChecks className="h-4 w-4" />,
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  message: {
    icon: <Mail className="h-4 w-4" />,
    color: "bg-secondary/10 text-secondary-foreground",
  },
};

const PRIORITY_LABEL_KEYS: Record<string, TranslationKey> = {
  low: "priority.low",
  medium: "priority.medium",
  high: "priority.high",
  urgent: "priority.urgent",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-500/10 text-amber-600",
  urgent: "bg-destructive/10 text-destructive",
};

export function NotificationDrawer({
  isOpen,
  onOpenChange,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  inboxContextHint,
}: NotificationDrawerProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<NotificationType | "all">("all");

  function formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("notifications.justNow");
    if (diffMins < 60) return `${diffMins}${t("notifications.minutesShort")}`;
    if (diffHours < 24) return `${diffHours}${t("notifications.hoursShort")}`;
    if (diffDays < 7) return `${diffDays}${t("notifications.daysShort")}`;
    return date.toLocaleDateString(locale === "th" ? "th-TH" : "en-US");
  }

  const filteredNotifications =
    selectedType === "all"
      ? notifications
      : notifications.filter((n) => n.type === selectedType);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
      onOpenChange(false);
    }
  };

  const typeCounts = {
    alert: notifications.filter((n) => n.type === "alert" && !n.read).length,
    task: notifications.filter((n) => n.type === "task" && !n.read).length,
    workflow_job: notifications.filter((n) => n.type === "workflow_job" && !n.read).length,
    message: notifications.filter((n) => n.type === "message" && !n.read).length,
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="space-y-4">
          {/* Reserve space for SheetContent’s default absolute close control (top-right). */}
          <div className="flex items-start justify-between gap-2 pr-12">
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {t("shell.notifications")}
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </SheetTitle>
              {inboxContextHint ? (
                <p className="text-xs leading-snug text-muted-foreground">{inboxContextHint}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onMarkAllAsRead}
                  className="h-8 text-xs"
                >
                  <CheckCheck className="mr-1 h-3.5 w-3.5" />
                  {t("notifications.markAllRead")}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearAll}
                  className="h-8 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  {t("notifications.clear")}
                </Button>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1">
            {(["all", "alert", "task", "workflow_job", "message"] as const).map((type) => (
              <Button
                key={type}
                variant={selectedType === type ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSelectedType(type)}
                className={cn(
                  "h-7 text-xs",
                  selectedType === type && "bg-primary/10 text-primary"
                )}
              >
                {type === "all" ? t("notifications.filterAll") : t(TYPE_LABEL_KEYS[type])}
                {type !== "all" && typeCounts[type] > 0 && (
                  <span className="ml-1 text-[10px]">({typeCounts[type]})</span>
                )}
              </Button>
            ))}
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        {/* Notification list */}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-220px)]">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-3">
                <Check className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t("notifications.emptyTitle")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("notifications.emptySubtitle")}</p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const typeInfo = typeConfig[notification.type];
              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "group relative flex flex-col gap-1 rounded-lg border p-3 transition-all cursor-pointer",
                    notification.read
                      ? "bg-muted/30 border-transparent"
                      : "bg-card border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        typeInfo.color
                      )}
                    >
                      {typeInfo.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "text-sm font-medium truncate",
                          !notification.read && "text-foreground"
                        )}>
                          {notification.title}
                        </p>
                        {notification.priority && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-1 py-0 h-4",
                              priorityColors[notification.priority]
                            )}
                          >
                            {PRIORITY_LABEL_KEYS[notification.priority]
                              ? t(PRIORITY_LABEL_KEYS[notification.priority])
                              : notification.priority}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(notification.timestamp)}
                    </div>
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsRead(notification.id);
                        }}
                        className="h-6 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        {t("notifications.markRead")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
