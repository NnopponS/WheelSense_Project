"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, ListChecks, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type {
  CareScheduleOut,
  CareTaskOut,
  ShiftChecklistItemApi,
} from "@/lib/api/task-scope-types";
import type { User } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { utcShiftDateString } from "@/lib/shiftChecklistDefaults";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type CaregiverSummary = {
  id: number;
  fullName: string;
  role: string;
};

function nextNewRowSequence(items: ShiftChecklistItemApi[]): number {
  let max = 0;
  for (const it of items) {
    const match = /^new-(\d+)$/.exec(it.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

const CHECKLIST_GROUPS: {
  category: ShiftChecklistItemApi["category"];
  titleKey: "observer.page.shiftStart" | "observer.page.roomRounds" | "observer.page.documentation";
}[] = [
  { category: "shift", titleKey: "observer.page.shiftStart" },
  { category: "room", titleKey: "observer.page.roomRounds" },
  { category: "patient", titleKey: "observer.page.documentation" },
];

type TemplateEditorProps = {
  initialItems: ShiftChecklistItemApi[];
  linkedUser: User;
  /** Hide bottom save button when parent shows a sticky footer save. */
  hideBottomSave?: boolean;
  onSavingChange?: (pending: boolean) => void;
};

export type StaffChecklistTemplateEditorHandle = {
  save: () => void;
};

/** Isolated editor: parent sets `key` so state resets after template refetch. */
const StaffChecklistTemplateEditor = forwardRef<
  StaffChecklistTemplateEditorHandle,
  TemplateEditorProps
>(function StaffChecklistTemplateEditor(
  { initialItems, linkedUser, hideBottomSave, onSavingChange },
  ref,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const newRowSeq = useRef(nextNewRowSequence(initialItems));
  const [draftItems, setDraftItems] = useState<ShiftChecklistItemApi[]>(() =>
    initialItems.map((i) => ({ ...i, checked: false })),
  );
  const [templateErr, setTemplateErr] = useState<string | null>(null);

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!draftItems.length) {
        throw new Error(t("headNurse.staff.templateEmpty"));
      }
      const ids = draftItems.map((x) => x.id.trim()).filter(Boolean);
      if (new Set(ids).size !== ids.length) {
        throw new Error(t("headNurse.staff.templateDuplicateIds"));
      }
      const trimmed = draftItems.map((row) => ({
        ...row,
        id: row.id.trim(),
        label_key: row.label_key.trim(),
      }));
      const invalid = trimmed.some((row) => !row.id || !row.label_key);
      if (invalid) {
        throw new Error(t("headNurse.staff.templateRowInvalid"));
      }
      await api.putShiftChecklistUserTemplate(linkedUser.id, { items: trimmed });
    },
    onMutate: () => {
      onSavingChange?.(true);
    },
    onSuccess: async () => {
      setTemplateErr(null);
      await queryClient.invalidateQueries({ queryKey: ["shift-checklist"] });
      await queryClient.refetchQueries({
        queryKey: ["shift-checklist", "template", linkedUser.id],
      });
    },
    onError: (e: Error) => {
      setTemplateErr(e.message);
    },
    onSettled: () => {
      onSavingChange?.(false);
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      save: () => {
        saveTemplateMutation.mutate();
      },
    }),
    [saveTemplateMutation],
  );

  const addItem = (category: ShiftChecklistItemApi["category"]) => {
    const id = `new-${newRowSeq.current}`;
    newRowSeq.current += 1;
    setDraftItems((prev) => [...prev, { id, label_key: "", checked: false, category }]);
    setTemplateErr(null);
  };

  const removeRow = (id: string) => {
    setDraftItems((prev) => prev.filter((x) => x.id !== id));
  };

  const updateRow = (id: string, patch: Partial<ShiftChecklistItemApi>) => {
    setDraftItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const previewLabel = (labelText: string) => {
    const trimmed = labelText.trim();
    return trimmed || "—";
  };

  return (
    <Card id="staff-checklist-template" className="border-border/70 shadow-none scroll-mt-4">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base">{t("headNurse.staff.templateSection")}</CardTitle>
        <CardDescription>{t("headNurse.staff.templateHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {draftItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-4 py-6 text-center">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("headNurse.staff.templateEmptyHint")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {CHECKLIST_GROUPS.map(({ category, titleKey }) => (
                <Button
                  key={category}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  onClick={() => addItem(category)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t(titleKey)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          CHECKLIST_GROUPS.map(({ category, titleKey }) => {
            const rows = draftItems.filter((i) => i.category === category);
            return (
              <div key={category}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(titleKey)}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => addItem(category)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("headNurse.staff.addInSection")}
                  </Button>
                </div>
                <div className="space-y-2">
                  {rows.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/70 bg-card/40 p-3 shadow-sm"
                    >
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Label className="text-[10px] uppercase text-muted-foreground">
                            {t("headNurse.staff.labelOrKeyPlaceholder")}
                          </Label>
                          <Input
                            value={item.label_key}
                            onChange={(e) => updateRow(item.id, { label_key: e.target.value })}
                            placeholder={t("headNurse.staff.labelOrKeyPlaceholder")}
                            className="h-9 text-sm"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            <span className="font-medium">{t("headNurse.staff.rowIdLabel")}:</span>{" "}
                            <code className="rounded bg-muted/80 px-1 py-0.5 font-mono">{item.id}</code>
                          </p>
                          <div className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {t("headNurse.staff.previewLabel")}
                            </p>
                            <p className="text-sm leading-snug text-foreground">
                              {previewLabel(item.label_key)}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(item.id)}
                          aria-label={t("headNurse.staff.removeRowAria")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {draftItems.length > 0 && !hideBottomSave ? (
          <div className="border-t border-border/70 pt-4">
            <Button
              type="button"
              className="w-full sm:ml-auto sm:w-auto sm:min-w-[12rem]"
              disabled={saveTemplateMutation.isPending}
              onClick={() => saveTemplateMutation.mutate()}
            >
              {saveTemplateMutation.isPending ? t("common.saving") : t("headNurse.staff.saveTemplate")}
            </Button>
          </div>
        ) : null}

        {templateErr ? (
          <p className="text-sm text-destructive" role="alert">
            {templateErr}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caregiver: CaregiverSummary | null;
  linkedUser: User | null;
  tasksForUser: CareTaskOut[];
  schedulesForUser: CareScheduleOut[];
};

export function HeadNurseStaffMemberSheet({
  open,
  onOpenChange,
  caregiver,
  linkedUser,
  tasksForUser,
  schedulesForUser,
}: Props) {
  const { t } = useTranslation();
  const templateEditorRef = useRef<StaffChecklistTemplateEditorHandle>(null);
  const [templateFooterSaving, setTemplateFooterSaving] = useState(false);
  const [checklistDate, setChecklistDate] = useState(() => utcShiftDateString());

  const workspaceChecklist = useQuery({
    queryKey: ["shift-checklist", "workspace", checklistDate, "sheet", linkedUser?.id],
    queryFn: () => api.listShiftChecklistWorkspace({ shift_date: checklistDate }),
    enabled: open && !!linkedUser,
  });

  const checklistRow = useMemo(() => {
    const rows = workspaceChecklist.data ?? [];
    if (!linkedUser) return null;
    return rows.find((r) => r.user_id === linkedUser.id) ?? null;
  }, [workspaceChecklist.data, linkedUser]);

  const templateQuery = useQuery({
    queryKey: ["shift-checklist", "template", linkedUser?.id],
    queryFn: () => api.getShiftChecklistUserTemplate(linkedUser!.id),
    enabled: open && !!linkedUser,
  });

  if (!caregiver) return null;

  const checklistItems = checklistRow?.items ?? [];
  const checklistPercent = checklistRow?.percent_complete ?? 0;
  const hasChecklistItems = checklistItems.length > 0;

  const templateSyncToken = templateQuery.dataUpdatedAt ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="space-y-3 border-b border-border px-6 py-5 text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-muted/40">
              <ListChecks className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <SheetTitle className="text-lg font-semibold leading-snug tracking-tight">
                {caregiver.fullName}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {caregiver.role ? (
                    <Badge variant="secondary" className="font-normal capitalize">
                      {caregiver.role.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground">
                    {t("clinical.table.caregiver")} #{caregiver.id}
                  </span>
                  {linkedUser ? (
                    <Badge variant="outline" className="font-mono text-xs">
                      @{linkedUser.username}
                    </Badge>
                  ) : null}
                </div>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 min-h-[200px] flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5 pb-6">
            {!linkedUser ? (
              <Card className="border-dashed border-border/80 bg-muted/20">
                <CardContent className="pt-6">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("headNurse.staff.noLinkedUser")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {templateQuery.isLoading ? (
                  <Card className="border-border/70 shadow-none">
                    <CardContent className="py-8">
                      <div className="space-y-3 animate-pulse">
                        <div className="h-24 rounded-lg bg-muted" />
                        <div className="h-24 rounded-lg bg-muted" />
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <StaffChecklistTemplateEditor
                    ref={templateEditorRef}
                    key={`${linkedUser.id}-${templateSyncToken}`}
                    initialItems={templateQuery.data?.items ?? []}
                    linkedUser={linkedUser}
                    hideBottomSave
                    onSavingChange={setTemplateFooterSaving}
                  />
                )}

                <Card className="border-border/70 shadow-none">
                  <CardHeader className="space-y-1 pb-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{t("headNurse.staff.workSectionTitle")}</CardTitle>
                    </div>
                    <CardDescription>{t("headNurse.staff.workSectionDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("headNurse.staff.assignedTasks")}
                      </h4>
                      {tasksForUser.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                          {t("headNurse.staff.none")}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {tasksForUser.map((task) => (
                            <li
                              key={task.id}
                              className="rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 text-sm shadow-sm"
                            >
                              <p className="font-medium leading-snug text-foreground">{task.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {task.description}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {task.status}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px]">
                                  {task.priority}
                                </Badge>
                                {task.due_at ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    {formatDateTime(task.due_at)} · {formatRelativeTime(task.due_at)}
                                  </span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {t("headNurse.staff.assignedSchedules")}
                      </h4>
                      {schedulesForUser.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-center text-xs text-muted-foreground">
                          {t("headNurse.staff.none")}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {schedulesForUser.map((s) => (
                            <li
                              key={s.id}
                              className="rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 text-sm shadow-sm"
                            >
                              <p className="font-medium text-foreground">{s.title}</p>
                              <p className="text-xs text-muted-foreground">{s.schedule_type}</p>
                              <p className="mt-1.5 text-[11px] text-muted-foreground">
                                {formatDateTime(s.starts_at)} · {formatRelativeTime(s.starts_at)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 shadow-none">
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{t("headNurse.staff.checklistSection")}</CardTitle>
                        <CardDescription>{t("headNurse.staff.checklistSectionDesc")}</CardDescription>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold tabular-nums leading-none text-foreground">
                          {workspaceChecklist.isLoading ? "—" : `${checklistPercent}%`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("observer.page.completeLabel")}
                        </p>
                      </div>
                    </div>
                    <div className="flex max-w-xs flex-col gap-1.5">
                      <Label htmlFor="sheet-shift-date" className="text-xs">
                        {t("shiftChecklistWorkspace.dateLabel")}
                      </Label>
                      <Input
                        id="sheet-shift-date"
                        type="date"
                        value={checklistDate}
                        onChange={(e) => setChecklistDate(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    {!workspaceChecklist.isLoading && hasChecklistItems ? (
                      <Progress value={checklistPercent} className="h-2" />
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {workspaceChecklist.isLoading ? (
                      <div className="space-y-3 animate-pulse">
                        <div className="h-10 rounded-lg bg-muted" />
                        <div className="h-10 rounded-lg bg-muted" />
                        <div className="h-10 rounded-lg bg-muted" />
                      </div>
                    ) : checklistRow && hasChecklistItems ? (
                      CHECKLIST_GROUPS.map(({ category, titleKey }) => {
                        const filtered = checklistItems.filter((i) => i.category === category);
                        if (!filtered.length) return null;
                        return (
                          <div key={category}>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {t(titleKey)}
                            </h4>
                            <div className="space-y-2">
                              {filtered.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5"
                                >
                                  <Checkbox checked={item.checked} disabled className="pointer-events-none" />
                                  <span
                                    className={cn(
                                      "text-sm leading-snug",
                                      item.checked
                                        ? "text-muted-foreground line-through"
                                        : "text-foreground",
                                    )}
                                  >
                                    {item.label_key}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-3 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                        {t("headNurse.staff.noChecklistRow")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
            </div>
          </div>

          {linkedUser && !templateQuery.isLoading ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  document.getElementById("staff-checklist-template")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {t("headNurse.staff.scrollToTemplate")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={templateFooterSaving}
                onClick={() => templateEditorRef.current?.save()}
              >
                {templateFooterSaving ? t("common.saving") : t("headNurse.staff.saveTemplate")}
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
