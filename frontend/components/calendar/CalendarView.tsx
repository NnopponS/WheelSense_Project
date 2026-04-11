"use client";

import { Fragment, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  getHours,
  setHours,
  setMinutes,
  eachHourOfInterval,
  addWeeks,
  subWeeks,
  addDays as addDaysFn,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CalendarViewMode = "month" | "week" | "day";

export interface CalendarEvent {
  id: number;
  title: string;
  startTime: Date;
  endTime: Date;
  patientId?: number | null;
  patientName?: string | null;
  assigneeId?: number | null;
  assigneeName?: string | null;
  scheduleType?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "scheduled" | "in_progress" | "completed" | "cancelled";
  color?: string;
  recurrence?: string | null;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  viewMode?: CalendarViewMode;
  onViewModeChange?: (mode: CalendarViewMode) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onDateClick?: (date: Date) => void;
  onCreateClick?: (date?: Date) => void;
  currentDate?: Date;
  onDateChange?: (date: Date) => void;
  className?: string;
  showCreateButton?: boolean;
  readOnly?: boolean;
}

const statusColors = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

export function CalendarView({
  events,
  viewMode = "month",
  onViewModeChange,
  onEventClick,
  onDateClick,
  onCreateClick,
  currentDate: controlledDate,
  onDateChange,
  className,
  showCreateButton = true,
  readOnly = false,
}: CalendarViewProps) {
  const [internalDate, setInternalDate] = useState(new Date());
  const [internalViewMode, setInternalViewMode] = useState<CalendarViewMode>(viewMode);

  const currentDate = controlledDate ?? internalDate;
  const activeViewMode = onViewModeChange ? viewMode : internalViewMode;

  const handleDateChange = (date: Date) => {
    if (onDateChange) {
      onDateChange(date);
    } else {
      setInternalDate(date);
    }
  };

  const handleViewModeChange = (mode: CalendarViewMode) => {
    if (onViewModeChange) {
      onViewModeChange(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const navigatePrevious = () => {
    switch (activeViewMode) {
      case "month":
        handleDateChange(subMonths(currentDate, 1));
        break;
      case "week":
        handleDateChange(subWeeks(currentDate, 1));
        break;
      case "day":
        handleDateChange(addDaysFn(currentDate, -1));
        break;
    }
  };

  const navigateNext = () => {
    switch (activeViewMode) {
      case "month":
        handleDateChange(addMonths(currentDate, 1));
        break;
      case "week":
        handleDateChange(addWeeks(currentDate, 1));
        break;
      case "day":
        handleDateChange(addDaysFn(currentDate, 1));
        break;
    }
  };

  const navigateToday = () => {
    handleDateChange(new Date());
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getEventsForDate = (date: Date) => {
    return events.filter((event) => isSameDay(new Date(event.startTime), date));
  };

  const getEventsForHour = (date: Date, hour: number) => {
    const hourStart = setMinutes(setHours(date, hour), 0);
    const hourEnd = setMinutes(setHours(date, hour + 1), 0);
    return events.filter((event) => {
      const eventStart = new Date(event.startTime);
      return eventStart >= hourStart && eventStart < hourEnd;
    });
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }

    return (
      <div className="flex flex-col">
        {/* Week day headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {weekDays.map((dayName) => {
            return (
              <div
                key={dayName}
                className="py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {dayName}
              </div>
            );
          })}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {days.map((date, index) => {
            const isCurrentMonth = isSameMonth(date, monthStart);
            const isTodayDate = isToday(date);
            const dayEvents = getEventsForDate(date);

            return (
              <div
                key={index}
                className={cn(
                  "min-h-[100px] border-b border-r border-border p-2 transition-colors",
                  !isCurrentMonth && "bg-muted/30 text-muted-foreground",
                  isTodayDate && "bg-primary/5",
                  !readOnly && "cursor-pointer hover:bg-muted/50",
                  index % 7 === 6 && "border-r-0"
                )}
                onClick={() => onDateClick?.(date)}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isTodayDate &&
                        "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    )}
                  >
                    {format(date, "d")}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {dayEvents.length}
                    </span>
                  )}
                </div>

                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-xs font-medium",
                        statusColors[event.status || "scheduled"],
                        !readOnly && "cursor-pointer hover:opacity-80"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                    >
                      {format(new Date(event.startTime), "HH:mm")} {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate);
    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      weekDates.push(addDays(weekStart, i));
    }

    const hours = eachHourOfInterval({
      start: setHours(setMinutes(weekStart, 0), 0),
      end: setHours(setMinutes(weekStart, 0), 23),
    });

    return (
      <div className="flex flex-col">
        {/* Header row with dates */}
        <div className="grid grid-cols-8 border-b border-border">
          <div className="border-r border-border p-2"></div>
          {weekDates.map((date, i) => {
            const isTodayDate = isToday(date);
            return (
              <div
                key={i}
                className={cn(
                  "p-2 text-center",
                  isTodayDate && "bg-primary/5"
                )}
              >
                <div className="text-xs text-muted-foreground">
                  {weekDays[i]}
                </div>
                <div
                  className={cn(
                    "mx-auto mt-1 flex h-7 w-7 items-center justify-center text-sm font-medium",
                    isTodayDate && "rounded-full bg-primary text-primary-foreground"
                  )}
                >
                  {format(date, "d")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-8">
          {hours.map((hour: Date, hourIndex) => (
            <Fragment key={`hour-row-${hourIndex}`}>
              {/* Time label */}
              <div
                key={`time-${hourIndex}`}
                className="border-b border-r border-border p-2 text-right text-xs text-muted-foreground"
              >
                {format(hour, "HH:mm")}
              </div>

              {/* Day columns */}
              {weekDates.map((date, dayIndex) => {
                const hourEvents = getEventsForHour(date, getHours(hour));
                return (
                  <div
                    key={`${hourIndex}-${dayIndex}`}
                    className={cn(
                      "min-h-[48px] border-b border-r border-border p-1",
                      isToday(date) && "bg-primary/5",
                      !readOnly && "cursor-pointer hover:bg-muted/30"
                    )}
                    onClick={() => onDateClick?.(setHours(date, getHours(hour)))}
                  >
                    {hourEvents.map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "mb-1 truncate rounded px-1 py-0.5 text-xs",
                          statusColors[event.status || "scheduled"],
                          !readOnly && "cursor-pointer hover:opacity-80"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(event);
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours = eachHourOfInterval({
      start: setHours(setMinutes(currentDate, 0), 0),
      end: setHours(setMinutes(currentDate, 0), 23),
    });

    return (
      <div className="flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              {format(currentDate, "EEEE")}
            </div>
            <div
              className={cn(
                "mx-auto mt-1 inline-flex h-10 w-10 items-center justify-center text-lg font-semibold",
                isToday(currentDate) &&
                  "rounded-full bg-primary text-primary-foreground"
              )}
            >
              {format(currentDate, "d")}
            </div>
          </div>
        </div>

        {/* Hour rows */}
        <div className="flex flex-col">
          {hours.map((hour: Date, index) => {
            const hourEvents = getEventsForHour(currentDate, getHours(hour));
            return (
              <div
                key={index}
                className={cn(
                  "flex border-b border-border",
                  !readOnly && "cursor-pointer hover:bg-muted/30"
                )}
                onClick={() => onDateClick?.(hour)}
              >
                <div className="w-20 border-r border-border p-3 text-right text-sm text-muted-foreground">
                  {format(hour, "HH:mm")}
                </div>
                <div className="flex-1 p-2">
                  {hourEvents.map((event) => (
                    <Card
                      key={event.id}
                      className={cn(
                        "mb-2 cursor-pointer transition-opacity hover:opacity-80",
                        event.color || statusColors[event.status || "scheduled"]
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                    >
                      <CardContent className="p-3">
                        <div className="font-medium">{event.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-sm">
                          <Clock className="h-3 w-3" />
                          {format(new Date(event.startTime), "HH:mm")} -{" "}
                          {format(new Date(event.endTime), "HH:mm")}
                        </div>
                        {event.patientName && (
                          <div className="mt-1 text-sm">
                            {event.patientName}
                          </div>
                        )}
                        {event.assigneeName && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {event.assigneeName}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={navigatePrevious}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={navigateToday}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={navigateNext}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-4 text-lg font-semibold">
            {activeViewMode === "day"
              ? format(currentDate, "MMMM d, yyyy")
              : format(currentDate, "MMMM yyyy")}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-1">
            {(["month", "week", "day"] as const).map((mode) => (
              <Button
                key={mode}
                variant={activeViewMode === mode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => handleViewModeChange(mode)}
                className="capitalize"
              >
                {mode}
              </Button>
            ))}
          </div>

          {showCreateButton && !readOnly && (
            <Button onClick={() => onCreateClick?.(currentDate)}>
              <Plus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Calendar content */}
      <div className="max-h-[calc(100vh-16rem)] overflow-auto">
        {activeViewMode === "month" && renderMonthView()}
        {activeViewMode === "week" && renderWeekView()}
        {activeViewMode === "day" && renderDayView()}
      </div>
    </Card>
  );
}

export default CalendarView;
