"use client";

import { useMemo, useState } from "react";
import { addMinutes, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Filter } from "lucide-react";
import { api } from "@/lib/api";
import type {
  ListPatientsResponse,
  ListTimelineEventsResponse,
} from "@/lib/api/task-scope-types";
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
import { buildPatientNameMap } from "@/components/calendar/scheduleEventMapper";

const ALL_FILTER = "__all__";

export default function HeadNurseTimelinePage() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPatientId, setSelectedPatientId] = useState<string>(ALL_FILTER);
  const [selectedSource, setSelectedSource] = useState<string>(ALL_FILTER);

  const timelineQuery = useQuery({
    queryKey: ["head-nurse", "timeline", "events"],
    queryFn: () => api.listTimelineEvents({ limit: 300 }),
    refetchInterval: 30_000,
  });
  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "timeline", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const timelineEvents = useMemo(
    () => (timelineQuery.data ?? []) as ListTimelineEventsResponse,
    [timelineQuery.data],
  );
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const patientNameById = useMemo(() => buildPatientNameMap(patients), [patients]);

  const sources = useMemo(
    () =>
      Array.from(new Set(timelineEvents.map((event) => event.source).filter(Boolean))).sort(),
    [timelineEvents],
  );

  const filteredTimeline = useMemo(() => {
    return timelineEvents.filter((event) => {
      if (selectedPatientId !== ALL_FILTER && event.patient_id !== Number(selectedPatientId)) {
        return false;
      }
      if (selectedSource !== ALL_FILTER && event.source !== selectedSource) {
        return false;
      }
      return true;
    });
  }, [timelineEvents, selectedPatientId, selectedSource]);

  const events = useMemo<CalendarEvent[]>(() => {
    return filteredTimeline.map((event) => {
      const start = new Date(event.timestamp);
      return {
        id: event.id,
        title: `${event.event_type} - ${event.room_name || "Ward"}`,
        startTime: start,
        endTime: addMinutes(start, 20),
        patientId: event.patient_id,
        patientName:
          event.patient_id != null
            ? patientNameById.get(event.patient_id) ?? `Patient #${event.patient_id}`
            : null,
        assigneeId: event.caregiver_id,
        assigneeName: event.source,
        scheduleType: event.event_type,
        priority: "medium",
        status: "completed",
        recurrence: null,
      };
    });
  }, [filteredTimeline, patientNameById]);

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return {
      total: filteredTimeline.length,
      today: filteredTimeline.filter(
        (event) => format(new Date(event.timestamp), "yyyy-MM-dd") === today,
      ).length,
      distinctSources: new Set(filteredTimeline.map((event) => event.source)).size,
    };
  }, [filteredTimeline]);

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">Ward Timeline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Calendar-style activity history for patient events, room transitions, and ward updates.
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Events</p>
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sources</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.distinctSources}</p>
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
            Filter by source
          </p>
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger>
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER}>All sources</SelectItem>
              {sources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
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
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          showCreateButton={false}
          readOnly
        />

        <div className="space-y-4">
          <AgendaView
            events={events}
            maxDays={7}
            title="Recent activity"
            emptyMessage="No timeline events in the current filter."
          />

          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <Filter className="h-4 w-4" />
                Timeline Focus
              </p>
              <p className="text-sm text-muted-foreground">
                Use day/week view for incident reconstruction and handoff reviews.
              </p>
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                Events are sorted by timestamp and projected into a single time surface.
              </p>
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4" />
                Sources update every 30 seconds.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

