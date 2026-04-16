"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CreateCareWorkflowJobInput } from "@/lib/api/task-scope-types";
import type { ListPatientsResponse, ListUsersResponse } from "@/lib/api/task-scope-types";
import { useTranslation } from "@/lib/i18n";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAFF_ROLE_FILTER = ["all", "admin", "head_nurse", "supervisor", "observer"] as const;

type DraftStepRow = {
  key: string;
  title: string;
  instructions: string;
  assigned_user_id: number | "";
};

function newRow(): DraftStepRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: "",
    instructions: "",
    assigned_user_id: "",
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function defaultDateParts(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function toIso(date: string, time: string): string {
  const dt = new Date(`${date}T${time}`);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString();
  return dt.toISOString();
}

function minutesBetween(startIso: string, endDate: string, endTime: string): number {
  const end = new Date(`${endDate}T${endTime}`);
  const start = new Date(startIso);
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) return 60;
  const m = Math.round((end.getTime() - start.getTime()) / 60000);
  return Math.max(5, Math.min(24 * 60, m || 60));
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  patients: ListPatientsResponse;
  users: ListUsersResponse;
  submitting: boolean;
  onSubmit: (payload: CreateCareWorkflowJobInput) => void;
};

export function WorkflowJobCreateDialog({
  open,
  onOpenChange,
  patients,
  users,
  submitting,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [startParts, setStartParts] = useState(defaultDateParts);
  const [endParts, setEndParts] = useState(() => {
    const s = defaultDateParts();
    const d = new Date(`${s.date}T${s.time}`);
    d.setMinutes(d.getMinutes() + 60);
    return {
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    };
  });
  const [patientIds, setPatientIds] = useState<number[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [staffRole, setStaffRole] = useState<(typeof STAFF_ROLE_FILTER)[number]>("all");
  const [staffSearch, setStaffSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [stepRows, setStepRows] = useState<DraftStepRow[]>(() => [newRow()]);

  useEffect(() => {
    if (!open) {
      setTitle("");
      const s = defaultDateParts();
      setStartParts(s);
      const d = new Date(`${s.date}T${s.time}`);
      d.setMinutes(d.getMinutes() + 60);
      setEndParts({
        date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      });
      setPatientIds([]);
      setAssigneeIds([]);
      setStaffRole("all");
      setStaffSearch("");
      setPatientSearch("");
      setStepRows([newRow()]);
    }
  }, [open]);

  const userList = users as User[];

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return userList.filter((u) => {
      if (staffRole !== "all" && u.role !== staffRole) return false;
      if (!q) return true;
      return `${u.username} ${u.role} ${u.id}`.toLowerCase().includes(q);
    });
  }, [userList, staffRole, staffSearch]);

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    return patients.filter((p) => {
      if (!q) return true;
      return `${p.first_name} ${p.last_name} ${p.id}`.toLowerCase().includes(q);
    });
  }, [patients, patientSearch]);

  const startIso = useMemo(() => toIso(startParts.date, startParts.time), [startParts]);

  const durationMinutes = useMemo(
    () => minutesBetween(startIso, endParts.date, endParts.time),
    [startIso, endParts.date, endParts.time],
  );

  const toggle = (arr: number[], id: number, set: (n: number[]) => void) => {
    if (arr.includes(id)) set(arr.filter((x) => x !== id));
    else set([...arr, id]);
  };

  const applyPreset = (preset: "vitals" | "meds" | "doc") => {
    const presets: Record<string, DraftStepRow[]> = {
      vitals: [
        { ...newRow(), title: t("workflowJobs.preset.vitals.title"), instructions: t("workflowJobs.preset.vitals.instructions") },
      ],
      meds: [
        { ...newRow(), title: t("workflowJobs.preset.meds.title"), instructions: t("workflowJobs.preset.meds.instructions") },
      ],
      doc: [
        { ...newRow(), title: t("workflowJobs.preset.doc.title"), instructions: t("workflowJobs.preset.doc.instructions") },
      ],
    };
    setStepRows((prev) => [...prev, ...presets[preset].map((r) => ({ ...r, key: `${Date.now()}-${r.title}` }))]);
  };

  const sectionLabel = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-border/80 bg-card p-0 sm:max-w-2xl">
        <div className="border-b border-border/70 bg-gradient-to-br from-primary/5 via-transparent to-transparent px-6 py-5">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              {t("workflowJobs.createJobPrimary")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {t("workflowJobs.createHint")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-6 px-6 py-5">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
              <p className={sectionLabel}>{t("workflowJobs.formSectionBasics")}</p>
            </div>
            <div>
              <Label htmlFor="wj-title">{t("workflowJobs.fieldTitle")}</Label>
              <Input
                id="wj-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 h-10"
                placeholder={t("workflowJobs.fieldTitlePlaceholder")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">{t("workflowJobs.windowStart")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("workflowJobs.fieldDate")}</Label>
                    <Input
                      type="date"
                      value={startParts.date}
                      onChange={(e) => setStartParts((p) => ({ ...p, date: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("workflowJobs.fieldTime")}</Label>
                    <Input
                      type="time"
                      value={startParts.time}
                      onChange={(e) => setStartParts((p) => ({ ...p, time: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-xs font-medium text-foreground">{t("workflowJobs.windowEnd")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("workflowJobs.fieldDate")}</Label>
                    <Input
                      type="date"
                      value={endParts.date}
                      onChange={(e) => setEndParts((p) => ({ ...p, date: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("workflowJobs.fieldTime")}</Label>
                    <Input
                      type="time"
                      value={endParts.time}
                      onChange={(e) => setEndParts((p) => ({ ...p, time: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("workflowJobs.durationComputed").replace("{m}", String(durationMinutes))}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className={sectionLabel}>{t("workflowJobs.formSectionStaff")}</p>
            <div className="flex flex-wrap gap-2">
              <Select value={staffRole} onValueChange={(v) => setStaffRole(v as (typeof STAFF_ROLE_FILTER)[number])}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder={t("workflowJobs.roleFilter")} />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLE_FILTER.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r === "all" ? t("workflowJobs.roleAll") : r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-9 max-w-xs flex-1"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder={t("workflowJobs.searchUsers")}
              />
            </div>
            <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-muted/15 p-2">
              {filteredStaff.slice(0, 60).map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={assigneeIds.includes(u.id)}
                    onCheckedChange={() => toggle(assigneeIds, u.id, setAssigneeIds)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{u.username}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({u.role})</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className={sectionLabel}>{t("workflowJobs.formSectionPatients")}</p>
            <Input
              className="h-9 max-w-md"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder={t("workflowJobs.searchPatients")}
            />
            <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border border-border/70 bg-muted/15 p-2">
              {filteredPatients.slice(0, 80).map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={patientIds.includes(p.id)}
                    onCheckedChange={() => toggle(patientIds, p.id, setPatientIds)}
                  />
                  <span>
                    {p.first_name} {p.last_name}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={sectionLabel}>{t("workflowJobs.formSectionSteps")}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset("vitals")}>
                  {t("workflowJobs.preset.addVitals")}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset("meds")}>
                  {t("workflowJobs.preset.addMeds")}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => applyPreset("doc")}>
                  {t("workflowJobs.preset.addDoc")}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("workflowJobs.stepsTemplateHint")}</p>

            <div className="space-y-3">
              {stepRows.map((row) => (
                <div
                  key={row.key}
                  className={cn(
                    "relative rounded-xl border border-border/80 bg-muted/10 p-3 pt-4 shadow-sm",
                    "ring-1 ring-transparent transition-shadow focus-within:ring-primary/20",
                  )}
                >
                  <div className="absolute left-2 top-2 text-muted-foreground/50">
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="grid gap-3 pl-5 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <Label className="text-xs">{t("workflowJobs.stepColTitle")}</Label>
                      <Input
                        className="mt-1 h-9"
                        value={row.title}
                        onChange={(e) => {
                          const v = e.target.value;
                          setStepRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, title: v } : r)));
                        }}
                        placeholder={t("workflowJobs.stepTitlePlaceholder")}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Label className="text-xs">{t("workflowJobs.stepColAssignee")}</Label>
                      <Select
                        value={row.assigned_user_id === "" ? "__none__" : String(row.assigned_user_id)}
                        onValueChange={(v) => {
                          setStepRows((rows) =>
                            rows.map((r) =>
                              r.key === row.key
                                ? { ...r, assigned_user_id: v === "__none__" ? "" : Number(v) }
                                : r,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder={t("workflowJobs.stepAssigneeAny")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("workflowJobs.stepAssigneeAny")}</SelectItem>
                          {userList.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.username} ({u.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end justify-end sm:col-span-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={stepRows.length <= 1}
                        onClick={() => setStepRows((rows) => rows.filter((r) => r.key !== row.key))}
                        aria-label={t("workflowJobs.removeStep")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="sm:col-span-12">
                      <Label className="text-xs">{t("workflowJobs.stepColInstructions")}</Label>
                      <Textarea
                        className="mt-1 min-h-[64px] text-sm"
                        value={row.instructions}
                        onChange={(e) => {
                          const v = e.target.value;
                          setStepRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, instructions: v } : r)));
                        }}
                        placeholder={t("workflowJobs.stepInstructionsPlaceholder")}
                      />
                    </div>
                  </div>
                  <p className="mt-2 pl-5 text-[10px] text-muted-foreground">{t("workflowJobs.stepLockedHint")}</p>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setStepRows((rows) => [...rows, newRow()])}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("workflowJobs.addStepRow")}
            </Button>
          </section>
        </div>

        <DialogFooter className="gap-2 border-t border-border/70 bg-muted/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={submitting || !title.trim()}
            onClick={() => {
              const steps = stepRows
                .map((r) => ({
                  title: r.title.trim(),
                  instructions: r.instructions.trim(),
                  assigned_user_id:
                    r.assigned_user_id === "" ? undefined : (r.assigned_user_id as number),
                }))
                .filter((s) => s.title.length > 0);
              let finalSteps = steps;
              if (finalSteps.length === 0) {
                finalSteps = [{ title: t("workflowJobs.defaultStep"), instructions: "", assigned_user_id: undefined }];
              }
              onSubmit({
                title: title.trim(),
                starts_at: startIso,
                duration_minutes: durationMinutes,
                patient_ids: patientIds,
                assignee_user_ids: assigneeIds,
                steps: finalSteps.map((s) => ({
                  title: s.title,
                  instructions: s.instructions || undefined,
                  assigned_user_id: s.assigned_user_id ?? null,
                })),
              });
            }}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("workflowJobs.submitCreate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
