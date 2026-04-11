"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListChecks, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import type { CareScheduleOut, ListPatientsResponse } from "@/lib/api/task-scope-types";
import type { TranslationKey } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n";
import { utcShiftDateString } from "@/lib/shiftChecklistDefaults";
import { formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

type Props = {
  linkedUsers: User[];
};

export function StaffRoutineAndCalendarPanel({ linkedUsers }: Props) {
  const { t } = useTranslation();
  const [shiftDate, setShiftDate] = useState(() => utcShiftDateString());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [calendarAnchor, setCalendarAnchor] = useState(() => new Date());
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<CareScheduleOut | null>(null);
  const [pickerDate, setPickerDate] = useState<Date | undefined>();
  const [primaryAssigneeUserId, setPrimaryAssigneeUserId] = useState<number | null>(() =>
    linkedUsers[0]?.id ?? null,
  );

  const linkedUserIds = useMemo(() => new Set(linkedUsers.map((u) => u.id)), [linkedUsers]);

  useEffect(() => {
    if (!linkedUsers.length) return;
    setPrimaryAssigneeUserId((prev) =>
      prev != null && linkedUsers.some((u) => u.id === prev) ? prev : linkedUsers[0].id,
    );
  }, [linkedUsers]);

  const checklistQuery = useQuery({
    queryKey: ["shift-checklist", "workspace", shiftDate, "staff-panel"],
    queryFn: () => api.listShiftChecklistWorkspace({ shift_date: shiftDate }),
    enabled: linkedUsers.length > 0,
  });

  const schedulesQuery = useQuery({
    queryKey: ["admin", "staff-detail", "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 400 }),
  });

  const patientsQuery = useQuery({
    queryKey: ["admin", "staff-detail", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const patientNameById = useMemo(
    () => buildPatientNameMap((patientsQuery.data ?? []) as ListPatientsResponse),
    [patientsQuery.data],
  );

  const filteredSchedules = useMemo(() => {
    const rows = (schedulesQuery.data ?? []) as CareScheduleOut[];
    return rows.filter(
      (s) => s.assigned_user_id != null && linkedUserIds.has(s.assigned_user_id),
    );
  }, [schedulesQuery.data, linkedUserIds]);

  const calendarEvents: CalendarEvent[] = useMemo(
    () => schedulesToCalendarEvents(filteredSchedules, patientNameById),
    [filteredSchedules, patientNameById],
  );

  const workspaceRows = useMemo(() => {
    const rows = checklistQuery.data ?? [];
    return rows.filter((row) => linkedUserIds.has(row.user_id));
  }, [checklistQuery.data, linkedUserIds]);

  const invalidateSchedules = useCallback(() => {
    void schedulesQuery.refetch();
  }, [schedulesQuery]);

  if (linkedUsers.length === 0) {
    return (
      <Card className="border-outline-variant/20">
        <CardHeader>
          <CardTitle className="text-base">{t("caregivers.workPanel.title")}</CardTitle>
          <CardDescription>{t("caregivers.workPanel.noLinkedAccount")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const defaultAssignee =
    primaryAssigneeUserId != null && linkedUserIds.has(primaryAssigneeUserId)
      ? primaryAssigneeUserId
      : linkedUsers[0]?.id ?? null;

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-low px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground-variant">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              {t("caregivers.workPanel.routineBadge")}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-foreground">{t("caregivers.workPanel.routineTitle")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-foreground-variant">
              {t("caregivers.workPanel.routineHint")}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <Label htmlFor="staff-shift-date">{t("shiftChecklistWorkspace.dateLabel")}</Label>
            <Input
              id="staff-shift-date"
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
            />
          </div>
        </div>

        <Card className="border-outline-variant/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("shiftChecklistWorkspace.staff")}</CardTitle>
            <CardDescription>{t("caregivers.workPanel.routineScope")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {checklistQuery.isError ? (
              <p className="text-sm text-critical">{t("shiftChecklistWorkspace.loadError")}</p>
            ) : checklistQuery.isLoading ? (
              <p className="text-sm text-foreground-variant">…</p>
            ) : workspaceRows.length === 0 ? (
              <p className="text-sm text-foreground-variant">{t("caregivers.workPanel.noChecklistRows")}</p>
            ) : (
              workspaceRows.map((row) => (
                <div
                  key={row.user_id}
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{row.username}</p>
                      <Badge variant="secondary" className="mt-1 capitalize">
                        {t("shiftChecklistWorkspace.role")}: {row.role.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="text-right text-sm text-foreground-variant">
                      <p>
                        {t("shiftChecklistWorkspace.updated")}:{" "}
                        {row.updated_at ? formatRelativeTime(row.updated_at) : t("shiftChecklistWorkspace.never")}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-foreground-variant">
                      <span>{t("shiftChecklistWorkspace.progress")}</span>
                      <span className="tabular-nums font-medium text-foreground">{row.percent_complete}%</span>
                    </div>
                    <Progress value={row.percent_complete} className="h-2" />
                  </div>
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {row.items.map((item) => (
                      <li
                        key={`${row.user_id}-${item.id}`}
                        className="flex items-start gap-2 rounded-lg border border-outline-variant/15 bg-card/60 px-2 py-1.5 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          readOnly
                          className="mt-0.5 h-3.5 w-3.5 rounded border-outline-variant"
                          aria-label={item.label_key}
                        />
                        <span className={item.checked ? "text-foreground-variant line-through" : "text-foreground"}>
                          {t(item.label_key as TranslationKey)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface-container-low px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground-variant">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {t("caregivers.workPanel.supplementaryBadge")}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-foreground">
              {t("caregivers.workPanel.supplementaryTitle")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-foreground-variant">
              {t("caregivers.workPanel.supplementaryHint")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {linkedUsers.length > 1 ? (
              <div className="flex min-w-[12rem] flex-col gap-1">
                <Label className="text-xs">{t("caregivers.workPanel.defaultAssignee")}</Label>
                <Select
                  value={primaryAssigneeUserId != null ? String(primaryAssigneeUserId) : String(linkedUsers[0].id)}
                  onValueChange={(v) => setPrimaryAssigneeUserId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {linkedUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button type="button" className="gap-2" onClick={() => setScheduleFormOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("caregivers.workPanel.addSupplementary")}
            </Button>
          </div>
        </div>

        <Card className="border-outline-variant/20 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("caregivers.workPanel.calendarTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {schedulesQuery.isError ? (
              <p className="text-sm text-critical">{t("caregivers.workPanel.schedulesError")}</p>
            ) : (
              <CalendarView
                events={calendarEvents}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                currentDate={calendarAnchor}
                onDateChange={setCalendarAnchor}
                onEventClick={(ev) => {
                  const full = filteredSchedules.find((s) => s.id === ev.id) ?? null;
                  setEditingSchedule(full);
                  setScheduleFormOpen(true);
                }}
                onDateClick={(d) => {
                  setPickerDate(d);
                  setEditingSchedule(null);
                  setCalendarAnchor(d);
                  setScheduleFormOpen(true);
                }}
                onCreateClick={() => {
                  setPickerDate(new Date());
                  setEditingSchedule(null);
                  setScheduleFormOpen(true);
                }}
                showCreateButton
              />
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">{t("caregivers.workPanel.agendaTitle")}</h3>
              <AgendaView
                events={calendarEvents}
                onEventClick={(ev) => {
                  const full = filteredSchedules.find((s) => s.id === ev.id) ?? null;
                  setEditingSchedule(full);
                  setScheduleFormOpen(true);
                }}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <ScheduleForm
        open={scheduleFormOpen}
        onClose={() => {
          setScheduleFormOpen(false);
          setEditingSchedule(null);
        }}
        onSuccess={invalidateSchedules}
        initialDate={
          editingSchedule ? new Date(editingSchedule.starts_at) : pickerDate ?? calendarAnchor
        }
        schedule={editingSchedule}
        mode={editingSchedule ? "edit" : "create"}
        defaultAssigneeUserId={editingSchedule ? editingSchedule.assigned_user_id : defaultAssignee}
      />
    </div>
  );
}
