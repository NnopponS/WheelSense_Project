"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { compareAsc, format, isAfter, isBefore, isWithinInterval, parseISO } from "date-fns";
import { ArrowRight, CheckCircle2, CircleDot, ListTodo, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import type { CareScheduleOut, CareTaskOut } from "@/lib/api/task-scope-types";
import type { Room } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const MAX_EACH = 4;

function scheduleWindow(s: CareScheduleOut): { start: Date; end: Date } {
  const start = parseISO(s.starts_at);
  const end = s.ends_at ? parseISO(s.ends_at) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  return { start, end };
}

type RoadColumn = "past" | "now" | "next";

function classifySchedule(s: CareScheduleOut, now: Date): RoadColumn | null {
  const { start, end } = scheduleWindow(s);
  const st = (s.status || "").toLowerCase();
  if (st === "cancelled") return "past";
  if (st === "completed") return "past";
  if (st === "in_progress") return "now";
  if (st === "scheduled") {
    if (isBefore(end, now)) return "past";
    if (isWithinInterval(now, { start, end })) return "now";
    if (isAfter(start, now)) return "next";
  }
  return null;
}

function classifyTask(t: CareTaskOut, now: Date): RoadColumn | null {
  const st = (t.status || "").toLowerCase();
  if (st === "completed") return "past";
  if (!t.due_at) return st === "in_progress" ? "now" : "next";
  const due = parseISO(t.due_at);
  if (st === "in_progress") return "now";
  if (isBefore(due, now) && st !== "completed") return "now";
  if (isAfter(due, now)) return "next";
  return "next";
}

function roomLabel(roomId: number | null | undefined, rooms: Room[]): string | null {
  if (roomId == null) return null;
  const r = rooms.find((x) => x.id === roomId);
  if (!r) return null;
  const floor = r.floor_name ?? (r.floor_number != null ? String(r.floor_number) : null);
  return floor ? `${r.name} · ${floor}` : r.name;
}

interface PatientCareRoadmapProps {
  patientId: number;
}

export function PatientCareRoadmap({ patientId }: PatientCareRoadmapProps) {
  const { t } = useTranslation();

  const schedulesQuery = useQuery({
    queryKey: ["patient", "dashboard", "schedules", patientId],
    queryFn: () => api.listWorkflowSchedules({ patient_id: patientId, limit: 120 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["patient", "dashboard", "tasks", patientId],
    queryFn: () => api.listWorkflowTasks({ limit: 120 }),
  });

  const roomsQuery = useQuery({
    queryKey: ["patient", "dashboard", "rooms"],
    queryFn: () => api.listRooms(),
  });

  const schedules = (schedulesQuery.data ?? []) as CareScheduleOut[];
  const tasks = (tasksQuery.data ?? []) as CareTaskOut[];
  const rooms = (roomsQuery.data ?? []) as Room[];

  const patientTasks = useMemo(
    () => tasks.filter((x) => x.patient_id === patientId),
    [tasks, patientId],
  );

  const columns = useMemo(() => {
    const now = new Date();
    const past: { kind: "schedule" | "task"; item: CareScheduleOut | CareTaskOut; at: Date }[] = [];
    const nowCol: { kind: "schedule" | "task"; item: CareScheduleOut | CareTaskOut; at: Date }[] = [];
    const next: { kind: "schedule" | "task"; item: CareScheduleOut | CareTaskOut; at: Date }[] = [];

    for (const s of schedules) {
      const col = classifySchedule(s, now);
      if (!col) continue;
      const { start } = scheduleWindow(s);
      const row = { kind: "schedule" as const, item: s, at: start };
      if (col === "past") past.push(row);
      else if (col === "now") nowCol.push(row);
      else next.push(row);
    }
    for (const tk of patientTasks) {
      const col = classifyTask(tk, now);
      if (!col) continue;
      const at = tk.due_at ? parseISO(tk.due_at) : parseISO(tk.created_at);
      const row = { kind: "task" as const, item: tk, at };
      if (col === "past") past.push(row);
      else if (col === "now") nowCol.push(row);
      else next.push(row);
    }

    const byTimeDesc = (
      a: { at: Date },
      b: { at: Date },
    ) => compareAsc(b.at, a.at);
    const byTimeAsc = (a: { at: Date }, b: { at: Date }) => compareAsc(a.at, b.at);

    past.sort(byTimeDesc);
    nowCol.sort(byTimeAsc);
    next.sort(byTimeAsc);

    return {
      past: past.slice(0, MAX_EACH),
      now: nowCol.slice(0, MAX_EACH),
      next: next.slice(0, MAX_EACH),
    };
  }, [schedules, patientTasks]);

  const loading =
    schedulesQuery.isLoading || tasksQuery.isLoading || roomsQuery.isLoading;

  if (loading) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-6 text-sm text-muted-foreground">{t("common.loading")}</CardContent>
      </Card>
    );
  }

  const renderRow = (
    row: { kind: "schedule" | "task"; item: CareScheduleOut | CareTaskOut; at: Date },
    tone: "muted" | "primary" | "default",
  ) => {
    if (row.kind === "schedule") {
      const s = row.item as CareScheduleOut;
      const loc = roomLabel(s.room_id, rooms);
      return (
        <li
          key={`s-${s.id}`}
          className={cn(
            "rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm",
            tone === "primary" && "border-primary/40 bg-primary/5",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-foreground leading-snug">{s.title}</p>
              <p className="text-xs text-muted-foreground">
                {format(row.at, "PPp")} · {s.schedule_type}
              </p>
              {loc ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span>{loc}</span>
                </p>
              ) : null}
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
              {s.status}
            </Badge>
          </div>
        </li>
      );
    }
    const tk = row.item as CareTaskOut;
    return (
      <li
        key={`t-${tk.id}`}
        className={cn(
          "rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm",
          tone === "primary" && "border-primary/40 bg-primary/5",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-foreground leading-snug">{tk.title}</p>
            {tk.description ? (
              <p className="text-xs text-muted-foreground line-clamp-2">{tk.description}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {tk.due_at ? format(parseISO(tk.due_at), "PPp") : t("patient.roadmap.noDue")}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
            {tk.status}
          </Badge>
        </div>
      </li>
    );
  };

  const emptyAll =
    columns.past.length === 0 && columns.now.length === 0 && columns.next.length === 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t("patient.roadmap.title")}</h3>
          <p className="text-sm text-muted-foreground">{t("patient.roadmap.subtitle")}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 self-start sm:self-auto">
          <Link href="/patient/schedule">
            {t("patient.roadmap.openSchedule")}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {emptyAll ? (
        <Card className="border-dashed border-border/80">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("patient.roadmap.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {t("patient.roadmap.past")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {columns.past.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("patient.roadmap.none")}</p>
              ) : (
                <ul className="space-y-2">{columns.past.map((r) => renderRow(r, "muted"))}</ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/25 bg-primary/[0.03]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <CircleDot className="h-4 w-4 text-primary" />
                {t("patient.roadmap.now")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {columns.now.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("patient.roadmap.noneNow")}</p>
              ) : (
                <ul className="space-y-2">{columns.now.map((r) => renderRow(r, "primary"))}</ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <ListTodo className="h-4 w-4 text-sky-600" />
                {t("patient.roadmap.next")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {columns.next.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("patient.roadmap.none")}</p>
              ) : (
                <ul className="space-y-2">{columns.next.map((r) => renderRow(r, "default"))}</ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {t("patient.roadmap.locationHint")}
        <Link href="/patient/room-controls" className="text-primary underline-offset-2 hover:underline">
          {t("patient.roadmap.roomControlsLink")}
        </Link>
      </p>
    </section>
  );
}
