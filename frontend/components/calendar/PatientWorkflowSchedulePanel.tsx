"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import { CalendarView, type CalendarViewMode } from "@/components/calendar/CalendarView";
import { AgendaView } from "@/components/calendar/AgendaView";
import { ScheduleForm } from "@/components/calendar/ScheduleForm";
import { schedulesToCalendarEvents } from "@/components/calendar/scheduleEventMapper";
import type { CareScheduleOut } from "@/lib/api/task-scope-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function PatientWorkflowSchedulePanel({
  patientId,
  patientFullName,
  canManage,
}: {
  patientId: number;
  patientFullName: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>("month");
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<CareScheduleOut | null>(null);
  const [schedulePickerDate, setSchedulePickerDate] = useState<Date | null>(null);

  const schedulesQuery = useQuery({
    queryKey: ["workflow-schedules", "patient", patientId],
    enabled: Number.isFinite(patientId) && patientId > 0,
    queryFn: () => api.listWorkflowSchedules({ patient_id: patientId, limit: 300 }),
  });

  const patientNameById = useMemo(
    () => new Map<number, string>([[patientId, patientFullName]]),
    [patientId, patientFullName],
  );

  const patientSchedules = useMemo(() => {
    const rows = (schedulesQuery.data ?? []) as CareScheduleOut[];
    return rows.filter((row) => row.patient_id === patientId);
  }, [patientId, schedulesQuery.data]);

  const patientCalendarEvents = useMemo(
    () => schedulesToCalendarEvents(patientSchedules, patientNameById),
    [patientNameById, patientSchedules],
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarDays className="h-4 w-4" />
            {t("caregivers.workPanel.calendarTitle")}
          </CardTitle>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              className="gap-1"
              onClick={() => {
                setEditingSchedule(null);
                setSchedulePickerDate(new Date());
                setScheduleFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {t("caregivers.workPanel.addSupplementary")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <CalendarView
            events={patientCalendarEvents}
            viewMode={calendarViewMode}
            onViewModeChange={setCalendarViewMode}
            currentDate={calendarAnchor}
            onDateChange={setCalendarAnchor}
            onEventClick={(ev) => {
              if (!canManage) return;
              const full = patientSchedules.find((row) => row.id === ev.id) ?? null;
              setEditingSchedule(full);
              setSchedulePickerDate(new Date(ev.startTime));
              setScheduleFormOpen(true);
            }}
            onDateClick={(date) => {
              if (!canManage) return;
              setEditingSchedule(null);
              setSchedulePickerDate(date);
              setScheduleFormOpen(true);
            }}
            onCreateClick={() => {
              if (!canManage) return;
              setEditingSchedule(null);
              setSchedulePickerDate(new Date());
              setScheduleFormOpen(true);
            }}
            showCreateButton={canManage}
          />
          <AgendaView
            events={patientCalendarEvents}
            onEventClick={(ev) => {
              if (!canManage) return;
              const full = patientSchedules.find((row) => row.id === ev.id) ?? null;
              if (!full) return;
              setEditingSchedule(full);
              setSchedulePickerDate(new Date(ev.startTime));
              setScheduleFormOpen(true);
            }}
          />
        </CardContent>
      </Card>

      <ScheduleForm
        open={scheduleFormOpen}
        onClose={() => {
          setScheduleFormOpen(false);
          setEditingSchedule(null);
        }}
        onSuccess={() => void schedulesQuery.refetch()}
        initialDate={
          editingSchedule ? new Date(editingSchedule.starts_at) : schedulePickerDate ?? new Date()
        }
        schedule={editingSchedule}
        mode={editingSchedule ? "edit" : "create"}
        defaultAssigneeUserId={editingSchedule ? editingSchedule.assigned_user_id : (user?.id ?? null)}
        defaultPatientId={patientId}
        lockedPatientId={patientId}
      />
    </>
  );
}
