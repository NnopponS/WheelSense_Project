"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HeadNurseStaffMemberSheet } from "@/components/head-nurse/HeadNurseStaffMemberSheet";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { api } from "@/lib/api";
import type { CareScheduleOut, CareTaskOut, ShiftChecklistWorkspaceRow } from "@/lib/api/task-scope-types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type { User } from "@/lib/types";
import { utcShiftDateString } from "@/lib/shiftChecklistDefaults";
import { formatRelativeTime } from "@/lib/datetime";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ExternalLink, Pencil } from "lucide-react";

const ROLE_TO_I18N: Record<string, TranslationKey> = {
  admin: "personnel.role.admin",
  head_nurse: "personnel.role.headNurse",
  supervisor: "personnel.role.supervisor",
  observer: "personnel.role.observer",
  patient: "personnel.role.patient",
};

type FloorStaffRole = "observer" | "supervisor";
type RoleFilter = "all" | FloorStaffRole;

function formatStaffRole(role: string, t: (key: TranslationKey) => string): string {
  const key = ROLE_TO_I18N[role];
  return key ? t(key) : role.replace(/_/g, " ");
}

/** Local calendar YYYY-MM-DD for schedule filtering (matches picker day in browser TZ). */
function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface RoutineDayOverviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_STAFF_SUGGESTIONS = 3;

export function RoutineDayOverviewSheet({ open, onOpenChange }: RoutineDayOverviewSheetProps) {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const [shiftDate, setShiftDate] = useState(() => utcShiftDateString());
  const [sheetRow, setSheetRow] = useState<ShiftChecklistWorkspaceRow | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  /** When true, shift date follows the current UTC calendar day (updates after UTC midnight). */
  const followUtcTodayRef = useRef(true);

  const canEditTemplates = me?.role === "admin" || me?.role === "head_nurse";

  const workspaceQuery = useQuery({
    queryKey: ["shift-checklist", "workspace", shiftDate, "routine-day-sheet"],
    queryFn: () => api.listShiftChecklistWorkspace({ shift_date: shiftDate }),
    enabled: open,
  });

  const schedulesQuery = useQuery({
    queryKey: ["workflow", "schedules", "routine-day-sheet"],
    queryFn: () => api.listWorkflowSchedules({ limit: 400 }),
    enabled: open,
  });

  const workflowTasksQuery = useQuery({
    queryKey: ["workflow", "tasks", "routine-day-sheet"],
    queryFn: () => api.listWorkflowTasks({ limit: 400 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    followUtcTodayRef.current = shiftDate === utcShiftDateString();
  }, [open, shiftDate]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      if (!followUtcTodayRef.current) return;
      const today = utcShiftDateString();
      setShiftDate((d) => (d === today ? d : today));
    }, 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  const scheduleCountByUserId = useMemo(() => {
    const map = new Map<number, number>();
    const rows = (schedulesQuery.data ?? []) as CareScheduleOut[];
    for (const s of rows) {
      if (s.assigned_user_id == null) continue;
      if (localDateKey(s.starts_at) !== shiftDate) continue;
      const uid = s.assigned_user_id;
      map.set(uid, (map.get(uid) ?? 0) + 1);
    }
    return map;
  }, [schedulesQuery.data, shiftDate]);

  const baseRows = workspaceQuery.data ?? [];

  const filteredRows = useMemo(() => {
    let rows = baseRows;
    if (roleFilter !== "all") {
      rows = rows.filter((r) => r.role === roleFilter);
    }
    const q = staffSearch.trim().toLowerCase();
    if (q.length > 0) {
      rows = rows.filter((r) => r.username.toLowerCase().includes(q));
    }
    return rows;
  }, [baseRows, roleFilter, staffSearch]);

  const staffSuggestions = useMemo(() => {
    const q = staffSearch.trim();
    if (q.length === 0) return [];
    return filteredRows.slice(0, MAX_STAFF_SUGGESTIONS);
  }, [filteredRows, staffSearch]);

  const linkedUserForSheet: User | null = useMemo(() => {
    if (!sheetRow || !me) return null;
    return {
      id: sheetRow.user_id,
      workspace_id: me.workspace_id,
      username: sheetRow.username,
      role: sheetRow.role as User["role"],
      is_active: true,
      caregiver_id: null,
      patient_id: null,
      created_at: "",
      updated_at: "",
    };
  }, [sheetRow, me]);

  const caregiverForSheet = sheetRow
    ? { id: sheetRow.user_id, fullName: sheetRow.username, role: sheetRow.role }
    : null;

  const tasksForMemberSheet = useMemo((): CareTaskOut[] => {
    if (!sheetRow) return [];
    const rows = (workflowTasksQuery.data ?? []) as CareTaskOut[];
    return rows.filter((task) => task.assigned_user_id === sheetRow.user_id);
  }, [workflowTasksQuery.data, sheetRow]);

  const schedulesForMemberSheet = useMemo((): CareScheduleOut[] => {
    if (!sheetRow) return [];
    const rows = (schedulesQuery.data ?? []) as CareScheduleOut[];
    return rows.filter((s) => s.assigned_user_id === sheetRow.user_id);
  }, [schedulesQuery.data, sheetRow]);

  function handlePickStaff(row: ShiftChecklistWorkspaceRow) {
    setStaffSearch("");
    setSearchOpen(false);
    if (canEditTemplates) {
      setSheetRow(row);
      return;
    }
    const el = document.getElementById(`routine-staff-${row.user_id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-lg">
          <SheetHeader className="shrink-0 text-left">
            <SheetTitle>{t("tasks.dailyRoutineTitle")}</SheetTitle>
            <SheetDescription>{t("tasks.dailyRoutineSubtitle")}</SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" className="gap-1.5" asChild>
                <Link
                  href={me?.role === "admin" ? "/admin/personnel?tab=staff" : "/head-nurse/staff"}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("tasks.dailyRoutineOpenStaffHub")}
                </Link>
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="routine-shift-date">{t("shiftChecklistWorkspace.dateLabel")}</Label>
              <Input
                id="routine-shift-date"
                type="date"
                value={shiftDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setShiftDate(v);
                  followUtcTodayRef.current = v === utcShiftDateString();
                }}
              />
              <p className="text-xs text-muted-foreground">{t("tasks.dailyRoutineDailyResetHint")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="routine-role-filter">{t("tasks.dailyRoutineRoleFilter")}</Label>
                <Select
                  value={roleFilter}
                  onValueChange={(v) => setRoleFilter(v as RoleFilter)}
                >
                  <SelectTrigger id="routine-role-filter" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("tasks.dailyRoutineRoleFilterAll")}</SelectItem>
                    <SelectItem value="observer">{t("personnel.role.observer")}</SelectItem>
                    <SelectItem value="supervisor">{t("personnel.role.supervisor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="routine-staff-search">{t("tasks.dailyRoutineStaffSearchLabel")}</Label>
                <div className="relative">
                  <Input
                    id="routine-staff-search"
                    autoComplete="off"
                    placeholder={t("tasks.dailyRoutineStaffSearchPlaceholder")}
                    value={staffSearch}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStaffSearch(v);
                      setSearchOpen(v.trim().length > 0);
                    }}
                    onFocus={() => {
                      if (staffSearch.trim().length > 0) setSearchOpen(true);
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setSearchOpen(false), 150);
                    }}
                  />
                  {searchOpen && staffSuggestions.length > 0 ? (
                    <ul
                      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[11rem] overflow-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
                      role="listbox"
                    >
                      {staffSuggestions.map((row) => (
                        <li key={row.user_id} role="option">
                          <button
                            type="button"
                            className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-2 text-left hover:bg-muted"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handlePickStaff(row)}
                          >
                            <span className="font-medium text-foreground">{row.username}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatStaffRole(row.role, t)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>

            {workspaceQuery.isError ? (
              <p className="text-sm text-destructive">{t("shiftChecklistWorkspace.loadError")}</p>
            ) : workspaceQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">…</p>
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("tasks.dailyRoutineNoStaffMatch")}</p>
            ) : (
              <div className="space-y-3">
                {filteredRows.map((row) => {
                  const bookings = scheduleCountByUserId.get(row.user_id) ?? 0;
                  return (
                    <div
                      id={`routine-staff-${row.user_id}`}
                      key={row.user_id}
                      className={cn(
                        "scroll-mt-4 rounded-xl border border-border/70 bg-card/50 p-4 space-y-3 text-left transition-colors",
                        canEditTemplates && "hover:bg-muted/30",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{row.username}</p>
                          <Badge variant="secondary" className="mt-1 font-normal">
                            {t("shiftChecklistWorkspace.role")}: {formatStaffRole(row.role, t)}
                          </Badge>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                          {canEditTemplates ? (
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => setSheetRow(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {t("tasks.dailyRoutineEditUser")}
                            </Button>
                          ) : null}
                          <div className="text-right text-sm text-muted-foreground">
                            <p>
                              {t("shiftChecklistWorkspace.updated")}:{" "}
                              {row.updated_at
                                ? formatRelativeTime(row.updated_at)
                                : t("shiftChecklistWorkspace.never")}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{t("shiftChecklistWorkspace.progress")}</span>
                          <span className="tabular-nums font-medium text-foreground">
                            {row.percent_complete}%
                          </span>
                        </div>
                        <Progress value={row.percent_complete} className="h-2" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("tasks.scheduleBookingsForDay").replace(/\{count\}/g, String(bookings))}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {canEditTemplates ? (
        <HeadNurseStaffMemberSheet
          open={sheetRow != null}
          onOpenChange={(next) => {
            if (!next) setSheetRow(null);
          }}
          caregiver={caregiverForSheet}
          linkedUser={linkedUserForSheet}
          tasksForUser={tasksForMemberSheet}
          schedulesForUser={schedulesForMemberSheet}
        />
      ) : null}
    </>
  );
}
