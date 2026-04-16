"use client";

import { useMemo } from "react";
import {
  format,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  isSameDay,
  addDays,
  compareAsc,
} from "date-fns";
import { Clock, User, MapPin, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./CalendarView";

interface AgendaViewProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventComplete?: (event: CalendarEvent) => void;
  showCompleteButton?: boolean;
  maxDays?: number;
  className?: string;
  emptyMessage?: string;
  title?: string;
}

const statusIcons = {
  scheduled: Circle,
  in_progress: AlertCircle,
  completed: CheckCircle2,
  cancelled: Circle,
};

const statusColors = {
  scheduled: "text-blue-600",
  in_progress: "text-amber-600",
  completed: "text-emerald-600",
  cancelled: "text-slate-400",
};

const priorityBadges = {
  low: { variant: "secondary" as const, label: "Low" },
  medium: { variant: "default" as const, label: "Medium" },
  high: { variant: "warning" as const, label: "High" },
  urgent: { variant: "destructive" as const, label: "Urgent" },
};

export function AgendaView({
  events,
  onEventClick,
  onEventComplete,
  showCompleteButton = false,
  maxDays = 7,
  className,
  emptyMessage = "No upcoming events",
  title = "Upcoming Schedule",
}: AgendaViewProps) {
  const { t } = useTranslation();

  const groupedEvents = useMemo(() => {
    // Sort events by start time
    const sorted = [...events].sort((a, b) =>
      compareAsc(new Date(a.startTime), new Date(b.startTime))
    );

    // Group by day
    const groups: Record<string, CalendarEvent[]> = {};
    const today = startOfDay(new Date());

    for (let i = 0; i < maxDays; i++) {
      const date = addDays(today, i);
      const key = format(date, "yyyy-MM-dd");
      groups[key] = [];
    }

    sorted.forEach((event) => {
      const eventDate = startOfDay(new Date(event.startTime));
      const key = format(eventDate, "yyyy-MM-dd");
      if (groups[key]) {
        groups[key].push(event);
      }
    });

    return groups;
  }, [events, maxDays]);

  const getDayLabel = (dateKey: string) => {
    const date = new Date(dateKey);
    if (isToday(date)) return t("headNurse.today") || "Today";
    if (isTomorrow(date)) return "Tomorrow";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "EEEE, MMM d");
  };

  const hasAnyEvents = Object.values(groupedEvents).some(
    (dayEvents) => dayEvents.length > 0
  );

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAnyEvents ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dateKey, dayEvents]) => {
            if (dayEvents.length === 0) return null;

            return (
              <div key={dateKey} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {getDayLabel(dateKey)}
                </h4>
                <div className="space-y-2">
                  {dayEvents.map((event) => {
                    const StatusIcon = statusIcons[event.status || "scheduled"];
                    const priority = event.priority
                      ? priorityBadges[event.priority]
                      : null;

                    return (
                      <div
                        key={
                          event.instanceKey ??
                          `${event.sourceScheduleId ?? event.id}-${event.startTime.getTime()}`
                        }
                        className={cn(
                          "group flex items-start gap-3 rounded-xl border border-border/50 bg-card p-3 transition-colors",
                          onEventClick && "cursor-pointer hover:bg-muted/50"
                        )}
                        onClick={() => onEventClick?.(event)}
                      >
                        {/* Status indicator */}
                        <div className="mt-0.5 flex-shrink-0">
                          <StatusIcon
                            className={cn(
                              "h-5 w-5",
                              statusColors[event.status || "scheduled"]
                            )}
                          />
                        </div>

                        {/* Event content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium leading-tight">
                              {event.title}
                            </div>
                            {priority && (
                              <Badge
                                variant={priority.variant}
                                className="flex-shrink-0 text-xs"
                              >
                                {priority.label}
                              </Badge>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(event.startTime), "HH:mm")} -{" "}
                              {format(new Date(event.endTime), "HH:mm")}
                            </span>

                            {event.patientName && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {event.patientName}
                              </span>
                            )}

                            {event.assigneeName && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.assigneeName}
                              </span>
                            )}
                          </div>

                          {event.scheduleType && (
                            <div className="mt-2">
                              <Badge variant="outline" className="text-xs">
                                {event.scheduleType}
                              </Badge>
                              {event.recurrence && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  ↻ {event.recurrence}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Complete button */}
                        {showCompleteButton &&
                          event.status !== "completed" &&
                          onEventComplete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventComplete(event);
                              }}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              Done
                            </Button>
                          )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default AgendaView;
