"use client";

import { useMemo, useState } from "react";
import { addMinutes, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type {
  CareDirectiveOut,
  CareTaskOut,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgendaView } from "@/components/calendar/AgendaView";
import { CalendarView, type CalendarEvent, type CalendarViewMode } from "@/components/calendar/CalendarView";
import {
  buildPatientNameMap,
  schedulesToCalendarEvents,
} from "@/components/calendar/scheduleEventMapper";

const ALL_FILTER = "__all__";

function normalizeTaskPriority(priority: string): CalendarEvent["priority"] {
  if (priority === "critical") return "urgent";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

function normalizeTaskStatus(status: string): CalendarEvent["status"] {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "in_progress") return "in_progress";
  return "scheduled";
}

export default function SupervisorCalendarPage() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPatientId, setSelectedPatientId] = useState<string>(ALL_FILTER);
  const [selectedLayer, setSelectedLayer] = useState<"combined" | "schedules" | "tasks" | "directives">(
    "combined",
  );

  const schedulesQuery = useQuery({
    queryKey: ["supervisor", "calendar", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 300 }),
  });
  const tasksQuery = useQuery({
    queryKey: ["supervisor", "calendar", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 300 }),
  });
  const directivesQuery = useQuery({
    queryKey: ["supervisor", "calendar", "directives"],
    queryFn: () => api.listWorkflowDirectives({ limit: 200 }),
  });
  const patientsQuery = useQuery({
    queryKey: ["supervisor", "calendar", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const tasks = useMemo(() => (tasksQuery.data ?? []) as CareTaskOut[], [tasksQuery.data]);
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as CareDirectiveOut[],
    [directivesQuery.data],
  );
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );

  const patientNameById = useMemo(() => buildPatientNameMap(patients), [patients]);

  const scheduleEvents = useMemo(() => {
    const source = schedulesQuery.data ?? [];
    return schedulesToCalendarEvents(source, patientNameById).map((event) => ({
      ...event,
      scheduleType: event.scheduleType ?? "schedule",
    }));
  }, [schedulesQuery.data, patientNameById]);

  const taskEvents = useMemo<CalendarEvent[]>(() => {
    return tasks
      .filter((task) => task.due_at || task.created_at)
      .map((task) => {
        const start = new Date(task.due_at ?? task.created_at ?? new Date().toISOString());
        return {
          id: Number(`2${task.id}`),
          title: `[Task] ${task.title}`,
          startTime: start,
          endTime: addMinutes(start, 30),
          patientId: task.patient_id ?? null,
          patientName:
            task.patient_id != null
              ? patientNameById.get(task.patient_id) ?? `Patient #${task.patient_id}`
              : null,
          assigneeId: task.assigned_user_id ?? null,
          assigneeName: task.assigned_role ? `Role: ${task.assigned_role}` : null,
          scheduleType: "task",
          priority: normalizeTaskPriority(task.priority),
          status: normalizeTaskStatus(task.status),
          recurrence: null,
        };
      });
  }, [tasks, patientNameById]);

  const directiveEvents = useMemo<CalendarEvent[]>(() => {
    return directives.map((directive) => {
      const start = new Date(directive.effective_from || directive.created_at);
      return {
        id: Number(`3${directive.id}`),
        title: `[Directive] ${directive.title}`,
        startTime: start,
        endTime: addMinutes(start, 45),
        patientId: directive.patient_id ?? null,
        patientName:
          directive.patient_id != null
            ? patientNameById.get(directive.patient_id) ?? `Patient #${directive.patient_id}`
            : null,
        assigneeId: null,
        assigneeName: directive.target_role ?? null,
        scheduleType: "directive",
        priority: directive.target_role ? "high" : "medium",
        status: directive.status === "active" ? "scheduled" : "completed",
        recurrence: null,
      };
    });
  }, [directives, patientNameById]);

  const allEvents = useMemo(() => {
    if (selectedLayer === "schedules") return scheduleEvents;
    if (selectedLayer === "tasks") return taskEvents;
    if (selectedLayer === "directives") return directiveEvents;
    return [...scheduleEvents, ...taskEvents, ...directiveEvents];
  }, [selectedLayer, scheduleEvents, taskEvents, directiveEvents]);

  const filteredEvents = useMemo(() => {
    if (selectedPatientId === ALL_FILTER) return allEvents;
    const patientId = Number(selectedPatientId);
    return allEvents.filter((event) => event.patientId === patientId);
  }, [allEvents, selectedPatientId]);

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      total: filteredEvents.length,
      today: filteredEvents.filter((event) => format(event.startTime, "yyyy-MM-dd") === today)
        .length,
      urgentTasks: taskEvents.filter((event) => event.priority === "urgent").length,
      activeDirectives: directives.filter((directive) => directive.status === "active").length,
    };
  }, [filteredEvents, taskEvents, directives]);

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">Supervisor Calendar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Combined calendar for schedules, due tasks, and directives with read-heavy command view.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Timeline events</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Today</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{stats.today}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Urgent tasks</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-600">
              {stats.urgentTasks}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Active directives
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.activeDirectives}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Calendar layer
          </p>
          <Select
            value={selectedLayer}
            onValueChange={(value) =>
              setSelectedLayer(
                value as "combined" | "schedules" | "tasks" | "directives",
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select layer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="combined">Combined</SelectItem>
              <SelectItem value="schedules">Schedules</SelectItem>
              <SelectItem value="tasks">Tasks</SelectItem>
              <SelectItem value="directives">Directives</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filter by patient
          </p>
          <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
            <SelectTrigger>
              <SelectValue placeholder="All patients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All patients</SelectItem>
              {patients.map((patient) => (
                <SelectItem key={patient.id} value={String(patient.id)}>
                  {patient.first_name} {patient.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <CalendarView
          events={filteredEvents}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          showCreateButton={false}
          readOnly
        />

        <div className="space-y-4">
          <AgendaView
            events={filteredEvents}
            maxDays={7}
            title="7-day agenda"
            emptyMessage="No events in current filter."
          />

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4" />
                Supervisor Focus
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="inline-flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Schedules are read-only here for faster monitoring.
                </p>
                <p className="inline-flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Tasks and directives are projected into the same timeline to reduce page switches.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Legend</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">[Schedule]</Badge>
              <Badge variant="outline">[Task]</Badge>
              <Badge variant="outline">[Directive]</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

