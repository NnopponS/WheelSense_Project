"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListChecks, Plus, Users } from "lucide-react";
import { api } from "@/lib/api";
import type {
  CareScheduleOut,
  ListCaregiversResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";
import { Button } from "@/components/ui/button";
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
import { ScheduleForm } from "@/components/calendar/ScheduleForm";
import {
  buildPatientNameMap,
  schedulesToCalendarEvents,
} from "@/components/calendar/scheduleEventMapper";

const ALL_FILTER = "__all__";

export default function HeadNurseCalendarPage() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPatientId, setSelectedPatientId] = useState<string>(ALL_FILTER);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>(ALL_FILTER);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<CareScheduleOut | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const schedulesQuery = useQuery({
    queryKey: ["head-nurse", "calendar", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 300 }),
  });

  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "calendar", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const caregiversQuery = useQuery({
    queryKey: ["head-nurse", "calendar", "caregivers"],
    queryFn: () => api.listCaregivers({ limit: 240 }),
  });

  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as CareScheduleOut[],
    [schedulesQuery.data],
  );
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const caregivers = useMemo(
    () => (caregiversQuery.data ?? []) as ListCaregiversResponse,
    [caregiversQuery.data],
  );

  const patientNameById = useMemo(() => buildPatientNameMap(patients), [patients]);
  const caregiverNameById = useMemo(
    () =>
      new Map(
        caregivers.map((caregiver) => [
          caregiver.id,
          `${caregiver.first_name} ${caregiver.last_name}`.trim() || `Caregiver #${caregiver.id}`,
        ]),
      ),
    [caregivers],
  );

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      if (
        selectedPatientId !== ALL_FILTER &&
        schedule.patient_id !== Number(selectedPatientId)
      ) {
        return false;
      }
      if (
        selectedAssigneeId !== ALL_FILTER &&
        schedule.assigned_user_id !== Number(selectedAssigneeId)
      ) {
        return false;
      }
      return true;
    });
  }, [schedules, selectedPatientId, selectedAssigneeId]);

  const events = useMemo<CalendarEvent[]>(() => {
    return schedulesToCalendarEvents(filteredSchedules, patientNameById).map((event) => ({
      ...event,
      assigneeName:
        event.assigneeId != null ? caregiverNameById.get(event.assigneeId) ?? null : null,
    }));
  }, [filteredSchedules, patientNameById, caregiverNameById]);

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      totalSchedules: filteredSchedules.length,
      todaySchedules: filteredSchedules.filter(
        (schedule) => format(new Date(schedule.starts_at), "yyyy-MM-dd") === today,
      ).length,
      recurringSchedules: filteredSchedules.filter((schedule) => Boolean(schedule.recurrence_rule))
        .length,
      assignedSchedules: filteredSchedules.filter((schedule) => schedule.assigned_user_id != null)
        .length,
    };
  }, [filteredSchedules]);

  const handleCreateClick = useCallback((date?: Date) => {
    setSelectedDate(date);
    setEditingSchedule(null);
    setIsFormOpen(true);
  }, []);

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      const schedule = schedules.find((item) => item.id === event.id) ?? null;
      if (!schedule) return;
      setEditingSchedule(schedule);
      setSelectedDate(new Date(schedule.starts_at));
      setIsFormOpen(true);
    },
    [schedules],
  );

  const handleFormSuccess = useCallback(() => {
    void schedulesQuery.refetch();
    setEditingSchedule(null);
    setSelectedDate(undefined);
    setIsFormOpen(false);
  }, [schedulesQuery]);

  const handleCloseForm = useCallback(() => {
    setEditingSchedule(null);
    setSelectedDate(undefined);
    setIsFormOpen(false);
  }, []);

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground md:text-3xl">Head Nurse Calendar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Calendar-centric workspace for staff assignment, patient scheduling, and shift follow-up.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/head-nurse/staff">
              <Users className="mr-1.5 h-4 w-4" />
              Staff
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/head-nurse/patients">
              <ListChecks className="mr-1.5 h-4 w-4" />
              Patients
            </Link>
          </Button>
          <Button size="sm" onClick={() => handleCreateClick()}>
            <Plus className="mr-1.5 h-4 w-4" />
            New schedule
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Schedules</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.totalSchedules}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Today</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">
              {stats.todaySchedules}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Recurring</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.recurringSchedules}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Assigned</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.assignedSchedules}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
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
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filter by assignee
          </p>
          <Select value={selectedAssigneeId} onValueChange={setSelectedAssigneeId}>
            <SelectTrigger>
              <SelectValue placeholder="All staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All staff</SelectItem>
              {caregivers.map((caregiver) => (
                <SelectItem key={caregiver.id} value={String(caregiver.id)}>
                  {caregiver.first_name} {caregiver.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <CalendarView
          events={events}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onEventClick={handleEventClick}
          onDateClick={handleCreateClick}
          onCreateClick={handleCreateClick}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          showCreateButton
        />

        <div className="space-y-4">
          <AgendaView
            events={events}
            onEventClick={handleEventClick}
            maxDays={10}
            title="Upcoming agenda"
            emptyMessage="No schedules in this filter."
          />

          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarDays className="h-4 w-4" />
                Calendar Coverage
              </div>
              <p className="text-sm text-muted-foreground">
                Use this view to assign schedules across all patients and staff without switching
                into separate pages.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ScheduleForm
        open={isFormOpen}
        onClose={handleCloseForm}
        onSuccess={handleFormSuccess}
        schedule={editingSchedule}
        initialDate={selectedDate}
        mode={editingSchedule ? "edit" : "create"}
      />
    </div>
  );
}

