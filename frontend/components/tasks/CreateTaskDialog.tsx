"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X, FileText, ListTodo, Users } from "lucide-react";
import { RichReportEditor } from "@/components/tasks/RichReportEditor";
import {
  TaskReportAttachmentsBar,
  type PendingAttachmentItem,
} from "@/components/tasks/TaskReportAttachmentsBar";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCreateTask } from "@/hooks/useTasks";
import { useStaff } from "@/hooks/useStaff";
import { useActivePatients } from "@/hooks/usePatients";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Workspace staff roles only (excludes patient). Used for /users/search and assignee pickers. */
const STAFF_ROLE_VALUES = ["admin", "head_nurse", "supervisor", "observer"] as const;
type StaffRoleValue = (typeof STAFF_ROLE_VALUES)[number];
const STAFF_ROLES_API_PARAM = STAFF_ROLE_VALUES.join(",");

const STAFF_ROLE_LABEL_KEY: Record<StaffRoleValue, string> = {
  admin: "personnel.role.admin",
  head_nurse: "personnel.role.headNurse",
  supervisor: "personnel.role.supervisor",
  observer: "personnel.role.observer",
};

// ── Validation Schema ────────────────────────────────────────────────────────

const subtaskSchema = z.object({
  title: z.string().min(1, "Subtask title required"),
  description: z.string().optional(),
  assigned_user_ids: z.array(z.number()).default([]),
  report_spec: z
    .object({
      body_html: z.string().optional(),
      attachment_pending_ids: z.array(z.string()).optional(),
    })
    .optional(),
});

const taskSchema = z.object({
  /** Create dialog only creates ad-hoc patient-linked tasks; daily/routine hub uses "งานประจำวัน" in the tasks header. */
  task_type: z.literal("specific"),
  title: z.string().min(1, "Title is required").max(256),
  description: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "critical"]),
  patient_ids: z.array(z.number()).default([]),
  assigned_role: z.string().optional().nullable(),
  assigned_user_ids: z.array(z.number()).default([]),
  start_at: z.date().optional().nullable(),
  ends_at: z.date().optional().nullable(),
  subtasks: z.array(subtaskSchema),
  report_template: z.object({
    mode: z.enum(["structured", "rich"]),
    fields: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(["text", "number", "select", "textarea", "boolean"]),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
      })
    ),
    body_html: z.string().optional(),
  }),
}).superRefine((data, ctx) => {
  if (data.start_at && data.ends_at && data.ends_at < data.start_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ends_at"],
      message: "End date/time must be after start date/time",
    });
  }
});

type TaskFormValues = z.input<typeof taskSchema>;

// ── Component Props ──────────────────────────────────────────────────────────

export interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CreateTaskDialog({
  open,
  onOpenChange,
}: CreateTaskDialogProps) {
  const { t } = useTranslation();
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showReportTemplate, setShowReportTemplate] = useState(false);
  const [mainReportFiles, setMainReportFiles] = useState<PendingAttachmentItem[]>([]);
  const [subtaskReportFilesById, setSubtaskReportFilesById] = useState<
    Record<string, PendingAttachmentItem[]>
  >({});

  useEffect(() => {
    if (open) {
      setMainReportFiles([]);
      setSubtaskReportFilesById({});
    }
  }, [open]);
  /** Main task assignee popover: pick role first, then user. */
  const [mainAssigneeRole, setMainAssigneeRole] = useState<StaffRoleValue | "">("");
  /** Subtask assignee popovers keyed by stable field id (useFieldArray). */
  const [subtaskAssigneeRoleByRow, setSubtaskAssigneeRoleByRow] = useState<
    Record<string, StaffRoleValue | "">
  >({});

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      task_type: "specific",
      title: "",
      description: "",
      priority: "normal",
      patient_ids: [],
      assigned_role: undefined,
      assigned_user_ids: [],
      start_at: undefined,
      ends_at: undefined,
      subtasks: [],
      report_template: { mode: "structured", fields: [], body_html: "" },
    },
  });

  const subtasksField = useFieldArray({
    control: form.control,
    name: "subtasks",
  });

  const reportFields = useFieldArray({
    control: form.control,
    name: "report_template.fields",
  });

  const { mutateAsync: createTaskAsync, isPending } = useCreateTask();
  const { data: allStaff = [] } = useStaff({ roles: STAFF_ROLES_API_PARAM, limit: 200 });
  const { data: allPatients = [] } = useActivePatients({ limit: 200 });

  const getStaffName = (userId: number) => {
    const user = allStaff.find((s) => s.id === userId);
    return user?.display_name || user?.username || `User ${userId}`;
  };

  const staffUsersForRole = (role: StaffRoleValue | "") =>
    role ? allStaff.filter((u) => u.role === role) : [];

  const toDatetimeLocalValue = (date?: Date | null) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const parseDatetimeLocal = (value: string) => {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  };

  const onSubmit = async (data: TaskFormValues) => {
    const patientIds = data.patient_ids ?? [];
    const assigneeIds = data.assigned_user_ids ?? [];
    const patientTargets = patientIds.length ? patientIds : [undefined];
    const assignedRole = assigneeIds.length > 0 ? undefined : data.assigned_role ?? undefined;
    const results = await Promise.allSettled(
      patientTargets.map((patientId) =>
        createTaskAsync({
          task_type: data.task_type,
          title: data.title,
          description: data.description,
          priority: data.priority,
          patient_id: patientId,
          assigned_role: assignedRole,
          assigned_user_id: assigneeIds[0],
          assigned_user_ids: assigneeIds,
          start_at: data.start_at?.toISOString(),
          ends_at: data.ends_at?.toISOString(),
          due_at: data.ends_at?.toISOString(),
          subtasks: data.subtasks.map((st, index) => {
            const rowId = subtasksField.fields[index]?.id;
            const pendingIds = rowId
              ? subtaskReportFilesById[rowId]?.map((p) => p.pendingId) ?? []
              : [];
            return {
              title: st.title,
              description: st.description,
              assigned_user_id: st.assigned_user_ids?.[0],
              assigned_user_ids: st.assigned_user_ids ?? [],
              report_spec: {
                body_html: st.report_spec?.body_html,
                ...(pendingIds.length ? { attachment_pending_ids: pendingIds } : {}),
              },
            };
          }),
          report_template: data.report_template,
          report_template_pending_attachment_ids: mainReportFiles.map((f) => f.pendingId),
        })
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.success(t("tasks.createSuccess"));
      form.reset();
      setShowSubtasks(false);
      setShowReportTemplate(false);
      onOpenChange(false);
      return;
    }
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    const firstReason = rejected[0]?.reason;
    const firstError =
      firstReason instanceof Error
        ? firstReason.message
        : typeof firstReason === "string"
          ? firstReason
          : t("tasks.createError");
    toast.error(
      succeeded > 0
        ? `${firstError} (${succeeded} created, ${failed} failed)`
        : firstError
    );
  };

  const handleReset = () => {
    form.reset();
    setShowSubtasks(false);
    setShowReportTemplate(false);
    setMainReportFiles([]);
    setSubtaskReportFilesById({});
  };

  const startAt = form.watch("start_at");
  const endsAt = form.watch("ends_at");
  const selectedAssigneeIds = form.watch("assigned_user_ids") ?? [];
  const selectedPatientIds = form.watch("patient_ids") ?? [];
  const reportTemplateMode = form.watch("report_template.mode");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 py-5">
          <DialogTitle>{t("tasks.createNew")}</DialogTitle>
          <DialogDescription>{t("tasks.createDescription")}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="overflow-y-auto px-6 pb-6"
          style={{ maxHeight: "calc(90vh - 180px)" }}
        >
          <div className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium">
                {t("tasks.title")} *
              </Label>
              <Input
                id="title"
                {...form.register("title")}
                placeholder={t("tasks.titlePlaceholder")}
                maxLength={256}
                className="rounded-xl"
              />
              {form.formState.errors.title && (
                <p className="text-xs text-red-500">{form.formState.errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium">
                {t("tasks.description")}
              </Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder={t("tasks.descriptionPlaceholder")}
                rows={3}
                className="resize-none rounded-xl"
              />
            </div>

            {/* Priority & Assignee Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("tasks.priority")}</Label>
                <Select
                  value={form.watch("priority")}
                  onValueChange={(value) =>
                    form.setValue("priority", value as TaskFormValues["priority"])
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("priority.low")}</SelectItem>
                    <SelectItem value="normal">{t("priority.normal")}</SelectItem>
                    <SelectItem value="high">{t("priority.high")}</SelectItem>
                    <SelectItem value="critical">{t("priority.critical")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("tasks.assignee")}</Label>
                <div className="rounded-xl border border-input bg-input/30 p-2">
                  <div className="mb-2 flex flex-wrap gap-1">
                    {selectedAssigneeIds.length > 0 ? (
                      selectedAssigneeIds.map((userId) => (
                        <span
                          key={userId}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                        >
                          {getStaffName(userId)}
                          <button
                            type="button"
                            onClick={() =>
                              form.setValue(
                                "assigned_user_ids",
                                selectedAssigneeIds.filter((id) => id !== userId)
                              )
                            }
                            className="hover:text-primary/70"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("tasks.noAssignees")}</span>
                    )}
                  </div>
                  <Popover
                    onOpenChange={(nextOpen) => {
                      if (!nextOpen) setMainAssigneeRole("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-lg">
                        <Plus className="mr-1 h-3 w-3" />
                        {t("tasks.addAssignee")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-3" align="start">
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t("tasks.staffRole")}</Label>
                          <Select
                            value={mainAssigneeRole || undefined}
                            onValueChange={(v) => setMainAssigneeRole(v as StaffRoleValue)}
                          >
                            <SelectTrigger className="h-9 rounded-lg">
                              <SelectValue placeholder={t("tasks.selectRole")} />
                            </SelectTrigger>
                            <SelectContent>
                              {STAFF_ROLE_VALUES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {t(STAFF_ROLE_LABEL_KEY[role])}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {!mainAssigneeRole && (
                          <p className="text-xs text-muted-foreground">{t("tasks.roleRequired")}</p>
                        )}
                        {mainAssigneeRole ? (
                          <div className="max-h-56 space-y-1 overflow-y-auto">
                            {staffUsersForRole(mainAssigneeRole).length === 0 ? (
                              <p className="text-xs text-muted-foreground">{t("tasks.noStaffForRole")}</p>
                            ) : (
                              staffUsersForRole(mainAssigneeRole).map((user) => (
                                <button
                                  key={user.id}
                                  type="button"
                                  onClick={() => {
                                    if (!selectedAssigneeIds.includes(user.id)) {
                                      form.setValue("assigned_user_ids", [
                                        ...selectedAssigneeIds,
                                        user.id,
                                      ]);
                                    }
                                  }}
                                  className={cn(
                                    "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                                    selectedAssigneeIds.includes(user.id) && "bg-primary/10"
                                  )}
                                >
                                  {user.display_name || user.username}
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Patient & Date Time Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("tasks.patient")}</Label>
                <div className="rounded-xl border border-input bg-input/30 p-2">
                  <div className="mb-2 flex flex-wrap gap-1">
                    {selectedPatientIds.length > 0 ? (
                      selectedPatientIds.map((patientId) => {
                        const patient = allPatients.find((p) => p.id === patientId);
                        const label = patient
                          ? `${patient.first_name} ${patient.last_name}`
                          : `Patient ${patientId}`;
                        return (
                          <span
                            key={patientId}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                          >
                            {label}
                            <button
                              type="button"
                              onClick={() =>
                                form.setValue(
                                  "patient_ids",
                                  selectedPatientIds.filter((id) => id !== patientId)
                                )
                              }
                              className="hover:text-primary/70"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("tasks.selectPatient")}</span>
                    )}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-lg">
                        <Plus className="mr-1 h-3 w-3" />
                        {t("tasks.selectPatient")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2" align="start">
                      <div className="max-h-56 space-y-1 overflow-y-auto">
                        {allPatients.map((patient) => (
                          <button
                            key={patient.id}
                            type="button"
                            onClick={() => {
                              if (!selectedPatientIds.includes(patient.id)) {
                                form.setValue("patient_ids", [...selectedPatientIds, patient.id]);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                              selectedPatientIds.includes(patient.id) && "bg-primary/10"
                            )}
                          >
                            {patient.first_name} {patient.last_name}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Optional start/end datetime */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("tasks.selectDateTime")}</Label>
                <Input
                  type="datetime-local"
                  value={toDatetimeLocalValue(startAt)}
                  onChange={(e) => form.setValue("start_at", parseDatetimeLocal(e.target.value))}
                  className="rounded-xl"
                  aria-label="task-start-at"
                />
                <Input
                  type="datetime-local"
                  value={toDatetimeLocalValue(endsAt)}
                  onChange={(e) => form.setValue("ends_at", parseDatetimeLocal(e.target.value))}
                  className="rounded-xl"
                  aria-label="task-ends-at"
                />
                {form.formState.errors.ends_at && (
                  <p className="text-xs text-red-500">{form.formState.errors.ends_at.message}</p>
                )}
              </div>
            </div>

            {/* Subtasks Section */}
            <div className="rounded-xl border bg-card/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <ListTodo className="h-4 w-4" />
                  </div>
                  <Label className="text-sm font-medium">{t("tasks.subtasks")}</Label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSubtasks(!showSubtasks)}
                  className="rounded-lg"
                >
                  {showSubtasks ? t("tasks.hideSubtasks") : t("tasks.addSubtasks")}
                </Button>
              </div>

              {showSubtasks && (
                <div className="mt-4 space-y-3">
                  {subtasksField.fields.map((field, index) => (
                    <div key={field.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          {...form.register(`subtasks.${index}.title`)}
                          placeholder={t("tasks.subtaskTitle")}
                          className="flex-1 rounded-xl"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => subtasksField.remove(index)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        {...form.register(`subtasks.${index}.description`)}
                        placeholder={t("tasks.subtaskDescription")}
                        rows={2}
                        className="resize-none rounded-xl text-sm"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{t("tasks.subtaskAssignees")}:</span>
                        <Controller
                          control={form.control}
                          name={`subtasks.${index}.assigned_user_ids`}
                          render={({ field: assignIdsField }) => (
                            <div className="flex flex-wrap gap-1">
                              {assignIdsField.value?.map((userId) => {
                                const user = allStaff.find((s) => s.id === userId);
                                return (
                                  <span
                                    key={userId}
                                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                                  >
                                    {user?.display_name || user?.username || `User ${userId}`}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        assignIdsField.onChange(
                                          assignIdsField.value?.filter((id) => id !== userId)
                                        )
                                      }
                                      className="hover:text-primary/70"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </span>
                                );
                              })}
                              <Popover
                                onOpenChange={(nextOpen) => {
                                  if (!nextOpen) {
                                    setSubtaskAssigneeRoleByRow((prev) => {
                                      const next = { ...prev };
                                      delete next[field.id];
                                      return next;
                                    });
                                  }
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-6 rounded-full px-2 text-xs">
                                    <Plus className="h-3 w-3 mr-1" />
                                    {t("tasks.addAssignee")}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-3" align="start">
                                  {(() => {
                                    const subRole = subtaskAssigneeRoleByRow[field.id] ?? "";
                                    const setSubRole = (v: StaffRoleValue | "") =>
                                      setSubtaskAssigneeRoleByRow((prev) => ({
                                        ...prev,
                                        [field.id]: v,
                                      }));
                                    const users = staffUsersForRole(subRole);
                                    return (
                                      <div className="space-y-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">
                                            {t("tasks.staffRole")}
                                          </Label>
                                          <Select
                                            value={subRole || undefined}
                                            onValueChange={(v) => setSubRole(v as StaffRoleValue)}
                                          >
                                            <SelectTrigger className="h-11 rounded-lg text-sm">
                                              <SelectValue placeholder={t("tasks.selectRole")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {STAFF_ROLE_VALUES.map((role) => (
                                                <SelectItem key={role} value={role}>
                                                  {t(STAFF_ROLE_LABEL_KEY[role])}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        {!subRole && (
                                          <p className="text-xs text-muted-foreground">
                                            {t("tasks.roleRequired")}
                                          </p>
                                        )}
                                        {subRole ? (
                                          <div className="max-h-48 space-y-1 overflow-y-auto">
                                            {users.length === 0 ? (
                                              <p className="text-xs text-muted-foreground">
                                                {t("tasks.noStaffForRole")}
                                              </p>
                                            ) : (
                                              users.map((user) => (
                                                <button
                                                  key={user.id}
                                                  type="button"
                                                  onClick={() => {
                                                    if (!assignIdsField.value?.includes(user.id)) {
                                                      assignIdsField.onChange([
                                                        ...(assignIdsField.value || []),
                                                        user.id,
                                                      ]);
                                                    }
                                                  }}
                                                  className={cn(
                                                    "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                                                    assignIdsField.value?.includes(user.id) && "bg-primary/10"
                                                  )}
                                                >
                                                  {user.display_name || user.username}
                                                </button>
                                              ))
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">{t("tasks.reportTemplate")}</Label>
                        <Controller
                          control={form.control}
                          name={`subtasks.${index}.report_spec.body_html`}
                          render={({ field }) => (
                            <RichReportEditor
                              variant="formal"
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              placeholder={t("tasks.reportDescription")}
                              minHeightClassName="min-h-[100px]"
                            />
                          )}
                        />
                        <TaskReportAttachmentsBar
                          pendingItems={subtaskReportFilesById[field.id] ?? []}
                          onPendingItemsChange={(next) => {
                            setSubtaskReportFilesById((prev) => ({
                              ...prev,
                              [field.id]: next,
                            }));
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      subtasksField.append({
                        title: "",
                        description: undefined,
                        assigned_user_ids: [],
                        report_spec: { body_html: "", attachment_pending_ids: [] },
                      })
                    }
                    className="rounded-lg"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("tasks.addSubtask")}
                  </Button>
                </div>
              )}
            </div>

            {/* Report Template Section */}
            <div className="rounded-xl border bg-card/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <FileText className="h-4 w-4" />
                  </div>
                  <Label className="text-sm font-medium">{t("tasks.reportTemplate")}</Label>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReportTemplate(!showReportTemplate)}
                  className="rounded-lg"
                >
                  {showReportTemplate ? t("tasks.hideFields") : t("tasks.configureFields")}
                </Button>
              </div>

              {showReportTemplate && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("tasks.reportMode")}</Label>
                    <Select
                      value={reportTemplateMode}
                      onValueChange={(value) => {
                        form.setValue(
                          "report_template.mode",
                          value as "structured" | "rich"
                        );
                        if (value === "rich") {
                          setShowReportTemplate(true);
                        }
                      }}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="structured">{t("tasks.reportModeStructured")}</SelectItem>
                        <SelectItem value="rich">{t("tasks.reportModeFormalRich")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {reportTemplateMode === "rich" ? (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">{t("tasks.reportFormalBody")}</Label>
                      <Controller
                        control={form.control}
                        name="report_template.body_html"
                        render={({ field }) => (
                          <RichReportEditor
                            variant="formal"
                            value={field.value ?? ""}
                            onChange={field.onChange}
                            placeholder={t("tasks.reportFormalPlaceholder")}
                            minHeightClassName="min-h-[140px]"
                          />
                        )}
                      />
                      <TaskReportAttachmentsBar
                        pendingItems={mainReportFiles}
                        onPendingItemsChange={setMainReportFiles}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reportFields.fields.map((field, index) => (
                        <div key={field.id} className="flex gap-2">
                          <Input
                            {...form.register(`report_template.fields.${index}.key`)}
                            placeholder={t("tasks.fieldKey")}
                            className="w-28 rounded-xl"
                          />
                          <Input
                            {...form.register(`report_template.fields.${index}.label`)}
                            placeholder={t("tasks.fieldLabel")}
                            className="flex-1 rounded-xl"
                          />
                          <Select
                            value={form.watch(`report_template.fields.${index}.type`)}
                            onValueChange={(value) =>
                              form.setValue(
                                `report_template.fields.${index}.type`,
                                value as TaskFormValues["report_template"]["fields"][0]["type"]
                              )
                            }
                          >
                            <SelectTrigger className="w-28 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="select">Select</SelectItem>
                              <SelectItem value="textarea">Textarea</SelectItem>
                              <SelectItem value="boolean">Boolean</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => reportFields.remove(index)}
                            className="shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          reportFields.append({
                            key: "",
                            label: "",
                            type: "text",
                            required: false,
                          })
                        }
                        className="rounded-lg"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("tasks.addField")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <DialogFooter className="px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              handleReset();
              onOpenChange(false);
            }}
            className="rounded-xl"
          >
            {t("tasks.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            onClick={form.handleSubmit(onSubmit)}
            className="rounded-xl"
          >
            {isPending ? t("tasks.creating") : t("tasks.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
