"use client";

import { useMemo } from "react";
import type { TaskOut } from "@/types/tasks";
import { CalendarView, type CalendarEvent } from "@/components/calendar/CalendarView";
import { useTranslation } from "@/lib/i18n";
import { Loader2 } from "lucide-react";
import { addMinutes } from "date-fns";

interface UnifiedTaskCalendarProps {
  tasks: TaskOut[];
  isLoading: boolean;
  onTaskClick?: (task: TaskOut) => void;
}

/**
 * Unified Task Calendar
 * 
 * Displays both specific and routine tasks in a calendar view.
 * Maps TaskOut to CalendarEvent format.
 */
export function UnifiedTaskCalendar({ tasks, isLoading, onTaskClick }: UnifiedTaskCalendarProps) {
  const { t } = useTranslation();

  const calendarEvents = useMemo(() => {
    return tasks.map((task): CalendarEvent => {
      // Determine start and end times
      // Use due_at as primary, fallback to start_at or created_at
      const startTime = new Date(task.due_at || task.start_at || task.created_at);
      
      // For tasks without a specific end, default to 30 mins after start
      const endTime = task.ends_at 
        ? new Date(task.ends_at) 
        : addMinutes(startTime, 30);

      // Map status
      let calendarStatus: CalendarEvent["status"] = "scheduled";
      if (task.status === "in_progress") calendarStatus = "in_progress";
      if (task.status === "completed") calendarStatus = "completed";
      if (task.status === "cancelled" || task.status === "skipped") calendarStatus = "cancelled";

      return {
        id: task.id,
        title: task.title,
        startTime,
        endTime,
        status: calendarStatus,
        priority: task.priority as any,
        patientName: task.patient_name,
        assigneeName: task.assigned_user_name,
        workspaceTaskId: task.id, // Store target ID for interaction
      };
    });
  }, [tasks]);

  const handleEventClick = (event: CalendarEvent) => {
    if (onTaskClick) {
      const task = tasks.find((t) => t.id === event.id);
      if (task) {
        onTaskClick(task);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-xl border bg-card">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CalendarView
        events={calendarEvents}
        onEventClick={handleEventClick}
        showCreateButton={false} // Creation via page header or kanban is preferred
      />
    </div>
  );
}
