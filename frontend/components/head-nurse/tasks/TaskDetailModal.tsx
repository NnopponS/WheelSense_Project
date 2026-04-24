"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type {
  TaskOut,
  TaskUpdate,
  TaskReportCreate,
  TaskReportOut,
  SubtaskItem,
  ReportTemplateField,
} from "@/types/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Archive,
  ArchiveRestore,
  Trash2,
  Plus,
  AlertCircle,
  User,
  Calendar,
  FileText,
  ListChecks,
  ChevronRight,
  ChevronDown,
  Save,
  X,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";
import { getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { RichReportEditor } from "@/components/tasks/RichReportEditor";
import { TaskReportAttachmentsBar } from "@/components/tasks/TaskReportAttachmentsBar";
import { useTranslation } from "@/lib/i18n";

interface TaskDetailModalProps {
  task: TaskOut;
  role?: "admin" | "head-nurse" | "supervisor" | "observer" | "patient";
  isOpen: boolean;
  onClose: () => void;
  reports?: TaskReportOut[];
  isLoadingReports?: boolean;
  onUpdateTask?: (taskId: number, data: TaskUpdate) => void;
  onSubmitReport?: (taskId: number, data: TaskReportCreate) => void;
  onDeleteTask?: (taskId: number) => void;
  onArchiveTask?: (taskId: number) => void;
  onRestoreTask?: (taskId: number) => void;
  canManage?: boolean;
  canExecute?: boolean;
}

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "skipped", label: "Skipped" },
  { value: "cancelled", label: "Cancelled" },
];

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(dateStr?: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "critical":
      return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30";
    case "high":
      return "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30";
    case "normal":
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "low":
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30";
    default:
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
    case "in_progress":
      return "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "cancelled":
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30";
    case "skipped":
      return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    default:
      return "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30";
  }
}

function buildReportSchema(fields: ReportTemplateField[]): z.ZodObject<any> {
  const schemaShape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let fieldSchema: z.ZodTypeAny;

    switch (field.type) {
      case "number":
        fieldSchema = z.coerce.number()
          .min(1, `${field.label} is required`)
          .refine((val) => !isNaN(val), { message: `${field.label} must be a number` });
        break;
      case "boolean":
        fieldSchema = z.boolean();
        break;
      case "select":
        fieldSchema = z.string().min(1, `${field.label} is required`);
        break;
      case "textarea":
        fieldSchema = z.string().trim();
        break;
      default:
        fieldSchema = z.string().trim();
        break;
    }

    if (field.required) {
      schemaShape[field.key] = fieldSchema;
    } else {
      schemaShape[field.key] = fieldSchema.optional().or(z.literal(""));
    }
  }

  return z.object(schemaShape);
}

export function TaskDetailModal({
  task,
  role = "head-nurse",
  isOpen,
  onClose,
  reports = [],
  isLoadingReports = false,
  onUpdateTask,
  onSubmitReport,
  onDeleteTask,
  onArchiveTask,
  onRestoreTask,
  canManage = false,
  canExecute = false,
}: TaskDetailModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("details");
  const [editedFields, setEditedFields] = useState<Partial<TaskUpdate>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedReports, setExpandedReports] = useState<Set<number>>(
    new Set()
  );

  const patientsQuery = useQuery({
    queryKey: ["tasks", "detail-modal", "patients"],
    queryFn: () => api.get<ListPatientsResponse>("/patients"),
    staleTime: getQueryStaleTimeMs("/patients"),
    enabled: isOpen && canManage,
  });
  const workspacePatients = patientsQuery.data ?? [];

  const reportSchema = useMemo(() => {
    const mode = (task.report_template?.mode || "structured").toLowerCase();
    const notesField = { notes: z.string().optional() };
    if (mode === "rich") {
      return z.object({
        body_html: z.string().optional(),
        ...notesField,
      });
    }
    if (!task.report_template?.fields?.length) {
      return z.object(notesField).passthrough();
    }
    return buildReportSchema(task.report_template.fields).extend(notesField);
  }, [task.report_template]);

  const reportForm = useForm({
    resolver: zodResolver(reportSchema),
    defaultValues: {},
    mode: "onChange",
  });

  useEffect(() => {
    if (isOpen) {
      setEditedFields({});
      setHasChanges(false);
      setActiveTab("details");
      setShowReportForm(false);
      setNewSubtaskTitle("");
      setExpandedReports(new Set());
      reportForm.reset({});
    }
  }, [task.id, isOpen, reportForm]);

  const handleFieldChange = (field: keyof TaskUpdate, value: any) => {
    setEditedFields((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!onUpdateTask || Object.keys(editedFields).length === 0) return;
    setIsSubmitting(true);
    // Parent callback (useUpdateTask mutate) handles its own success/error toasts.
    // We reset local state optimistically; parent will update selectedTask on success.
    onUpdateTask(task.id, editedFields);
    setEditedFields({});
    setHasChanges(false);
    setIsSubmitting(false);
  };

  const handleDelete = () => {
    if (!onDeleteTask) return;
    setShowDeleteDialog(false);
    setIsSubmitting(true);
    // Parent handles toast and closing the modal (setSelectedTask(null)) on success.
    onDeleteTask(task.id);
    setIsSubmitting(false);
  };

  const handleArchive = () => {
    if (!onArchiveTask) return;
    onArchiveTask(task.id);
  };

  const handleRestore = () => {
    if (!onRestoreTask) return;
    onRestoreTask(task.id);
  };

  const handleSubtaskToggle = (subtaskId: string, currentStatus: string) => {
    if (!canManage && !canExecute) return;
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    const updatedSubtasks = task.subtasks.map((st) =>
      st.id === subtaskId ? { ...st, status: newStatus } : st
    );
    if (onUpdateTask) {
      onUpdateTask(task.id, { subtasks: updatedSubtasks });
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim() || !canManage) return;
    const newSubtask: SubtaskItem = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `st-${Date.now()}`,
      title: newSubtaskTitle.trim(),
      status: "pending",
      report_spec: {},
    };
    const updatedSubtasks = [...task.subtasks, newSubtask];
    if (onUpdateTask) {
      onUpdateTask(task.id, { subtasks: updatedSubtasks });
    }
    setNewSubtaskTitle("");
    toast.success("Subtask added");
  };

  const handleRemoveSubtask = (subtaskId: string) => {
    if (!canManage) return;
    const updatedSubtasks = task.subtasks.filter((st) => st.id !== subtaskId);
    if (onUpdateTask) {
      onUpdateTask(task.id, { subtasks: updatedSubtasks });
    }
    toast.success("Subtask removed");
  };

  const toggleReportExpand = (reportId: number) => {
    setExpandedReports((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  const completedSubtasks = task.subtasks.filter(
    (st) => st.status === "completed"
  ).length;
  const totalSubtasks = task.subtasks.length;
  const subtaskProgress =
    totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

  const patchSubtask = useCallback(
    (subtaskId: string, updater: (row: SubtaskItem) => SubtaskItem) => {
      if (!onUpdateTask || !canManage) return;
      const next = task.subtasks.map((s) => (s.id === subtaskId ? updater({ ...s }) : s));
      onUpdateTask(task.id, { subtasks: next });
    },
    [canManage, onUpdateTask, task.id, task.subtasks],
  );

  const handleReportSubmit = reportForm.handleSubmit(async (data) => {
    if (!onSubmitReport) return;
    setIsSubmitting(true);
    const { notes, ...reportRest } = data as { notes?: string } & Record<string, unknown>;
    const reportData: TaskReportCreate = {
      report_data: reportRest,
      notes: notes ?? "",
    };
    // Parent (useSubmitTaskReport) handles its own success/error toasts and cache invalidation.
    onSubmitReport(task.id, reportData);
    setShowReportForm(false);
    reportForm.reset({});
    setIsSubmitting(false);
  });

  // Support both single-assignee (number) and multi-assignee (number[]) shapes.
  const assigneeIds: number[] = Array.isArray(task.assigned_user_ids)
    ? task.assigned_user_ids
    : task.assigned_user_id != null
    ? [task.assigned_user_id]
    : [];
  const hasSubmittedReport =
    reports.length > 0 &&
    (assigneeIds.length === 0 ||
      reports.some((r) => assigneeIds.includes(r.submitted_by_user_id)));

  const patientHref = (() => {
    if (!task.patient_id) return "#";
    switch (role) {
      case "admin":
        return `/admin/patients/${task.patient_id}`;
      case "supervisor":
        return `/supervisor/personnel/${task.patient_id}`;
      case "observer":
        return `/observer/personnel/${task.patient_id}`;
      case "head-nurse":
      default:
        return `/head-nurse/patients/${task.patient_id}`;
    }
  })();

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col p-0 sm:rounded-2xl">
          <DialogHeader className="px-6 py-5 border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    variant="outline"
                    className={getPriorityColor(task.priority)}
                  >
                    {task.priority}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={getStatusColor(task.status)}
                  >
                    {task.status.replace("_", " ")}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {task.task_type === "specific" ? "Specific" : "Routine"}
                  </Badge>
                </div>
                <DialogTitle className="text-xl font-semibold leading-tight">
                  {task.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Task details for {task.title}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1 overflow-hidden flex flex-col"
          >
            <div className="px-6 pt-4 border-b border-border">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="details" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="subtasks" className="gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  Subtasks
                  {totalSubtasks > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {completedSubtasks}/{totalSubtasks}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="reports" className="gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  Reports
                  {task.report_count > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {task.report_count}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto">
              <TabsContent
                value="details"
                className="m-0 data-[state=active]:flex data-[state=active]:flex-col"
              >
                <div className="px-6 py-5 space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="task-title">{t("headNurse.taskModal.titleLabel")}</Label>
                    {canManage ? (
                      <Input
                        id="task-title"
                        value={editedFields.title ?? task.title}
                        onChange={(e) =>
                          handleFieldChange("title", e.target.value)
                        }
                      />
                    ) : (
                      <div className="text-sm font-medium px-3 py-2 bg-muted/30 rounded-md">
                        {task.title}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="task-description">{t("headNurse.taskModal.descriptionLabel")}</Label>
                    {canManage ? (
                      <Textarea
                        id="task-description"
                        value={
                          editedFields.description ?? task.description ?? ""
                        }
                        onChange={(e) =>
                          handleFieldChange("description", e.target.value)
                        }
                        rows={3}
                        placeholder={t("headNurse.taskModal.descriptionPlaceholder")}
                      />
                    ) : (
                      <div className="text-sm px-3 py-2 bg-muted/30 rounded-md min-h-[60px]">
                        {task.description || "—"}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("headNurse.taskModal.priorityLabel")}</Label>
                      {canManage ? (
                        <Select
                          value={editedFields.priority ?? task.priority}
                          onValueChange={(v) =>
                            handleFieldChange("priority", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className={getPriorityColor(task.priority)}
                        >
                          {task.priority}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t("headNurse.taskModal.statusLabel")}</Label>
                      {(canManage || canExecute) ? (
                        <Select
                          value={editedFields.status ?? task.status}
                          onValueChange={(v) => handleFieldChange("status", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className={getStatusColor(task.status)}
                        >
                          {task.status.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("headNurse.taskModal.patientLabel")}</Label>
                      {task.patient_name ? (
                        <Link
                          href={patientHref}
                          className="text-sm text-primary hover:underline flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <User className="h-3.5 w-3.5" />
                          {task.patient_name}
                        </Link>
                      ) : (
                        <div className="text-sm text-muted-foreground">—</div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t("headNurse.taskModal.assigneeLabel")}</Label>
                      <div className="text-sm flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {task.assigned_user_name || "Unassigned"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t("headNurse.taskModal.createdByLabel")}</Label>
                    <div className="text-sm">
                      {task.created_by_user_name || "—"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="task-due">{t("headNurse.taskModal.dueDateLabel")}</Label>
                      {canManage ? (
                        <Input
                          id="task-due"
                          type="datetime-local"
                          value={
                            editedFields.due_at
                              ? new Date(editedFields.due_at)
                                  .toISOString()
                                  .slice(0, 16)
                              : task.due_at
                              ? new Date(task.due_at)
                                  .toISOString()
                                  .slice(0, 16)
                              : ""
                          }
                          onChange={(e) =>
                            handleFieldChange("due_at", e.target.value)
                          }
                        />
                      ) : (
                        <div className="text-sm flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatDate(task.due_at)}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t("headNurse.taskModal.shiftDateLabel")}</Label>
                      <div className="text-sm">
                        {formatDateShort(task.shift_date)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">{t("headNurse.taskModal.createdLabel")}</span>{" "}
                      {formatDate(task.created_at)}
                    </div>
                    <div>
                      <span className="font-medium">{t("headNurse.taskModal.updatedLabel")}</span>{" "}
                      {formatDate(task.updated_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {task.report_count} report
                      {task.report_count !== 1 ? "s" : ""} submitted
                    </span>
                  </div>

                  {(task.report_template?.mode || "").toLowerCase() === "rich" &&
                    (task.report_template?.body_html ||
                      (task.report_template?.attachments?.length ?? 0) > 0) && (
                      <div className="space-y-2 rounded-xl border border-border bg-card/40 p-4">
                        <Label className="text-xs text-muted-foreground">
                          Report template (formal)
                        </Label>
                        {task.report_template?.body_html ? (
                          <div
                            className="prose prose-sm dark:prose-invert max-w-none rounded-lg border bg-muted/20 px-3 py-2 [&_li>p]:font-semibold"
                            dangerouslySetInnerHTML={{
                              __html: task.report_template.body_html,
                            }}
                          />
                        ) : null}
                        {(task.report_template?.attachments?.length ?? 0) > 0 ? (
                          <TaskReportAttachmentsBar
                            pendingItems={[]}
                            onPendingItemsChange={() => {}}
                            readOnly
                            taskId={task.id}
                            serverAttachments={task.report_template.attachments}
                          />
                        ) : null}
                      </div>
                    )}
                </div>
              </TabsContent>

              <TabsContent
                value="subtasks"
                className="m-0 data-[state=active]:flex data-[state=active]:flex-col"
              >
                <div className="px-6 py-5 space-y-5">
                  {totalSubtasks > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{t("headNurse.taskModal.progressLabel")}</span>
                        <span className="text-muted-foreground">
                          {completedSubtasks}/{totalSubtasks} completed
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${subtaskProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {totalSubtasks === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <ListChecks className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-muted-foreground text-sm">
                        No subtasks yet
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {task.subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/20 transition-colors"
                        >
                          <Checkbox
                            checked={subtask.status === "completed"}
                            onCheckedChange={() =>
                              handleSubtaskToggle(subtask.id, subtask.status)
                            }
                            disabled={!canManage && !canExecute}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-sm ${
                                subtask.status === "completed"
                                  ? "line-through text-muted-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {subtask.title}
                            </div>
                            {subtask.assigned_user_id && (
                              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Assigned
                              </div>
                            )}
                            {subtask.report_spec?.body_html ? (
                              <div
                                className="mt-2 text-xs prose prose-sm dark:prose-invert max-w-none rounded border bg-muted/15 px-2 py-1.5 [&_li>p]:font-semibold"
                                dangerouslySetInnerHTML={{
                                  __html: subtask.report_spec.body_html,
                                }}
                              />
                            ) : null}
                            {(subtask.report_spec?.attachments?.length ?? 0) > 0 ? (
                              <div className="mt-2">
                                <TaskReportAttachmentsBar
                                  readOnly
                                  taskId={task.id}
                                  pendingItems={[]}
                                  onPendingItemsChange={() => {}}
                                  serverAttachments={subtask.report_spec?.attachments}
                                />
                              </div>
                            ) : null}
                            {canManage ? (
                              <div className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                                  <Checkbox
                                    checked={Boolean(subtask.report_spec?.patient_calendar_sync)}
                                    onCheckedChange={(checked) =>
                                      patchSubtask(subtask.id, (row) => ({
                                        ...row,
                                        report_spec: {
                                          ...row.report_spec,
                                          patient_calendar_sync: checked === true,
                                          patient_calendar_patient_id:
                                            checked === true
                                              ? (row.report_spec?.patient_calendar_patient_id ??
                                                task.patient_id ??
                                                undefined)
                                              : undefined,
                                        },
                                      }))
                                    }
                                  />
                                  <span>{t("headNurse.taskModal.addToCalendar")}</span>
                                </label>
                                {subtask.report_spec?.patient_calendar_sync ? (
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{t("headNurse.taskModal.patientLabel")}</Label>
                                    <Select
                                      value={(() => {
                                        const pid =
                                          subtask.report_spec?.patient_calendar_patient_id ??
                                          task.patient_id;
                                        return pid != null ? String(pid) : "__pick__";
                                      })()}
                                      onValueChange={(v) =>
                                        patchSubtask(subtask.id, (row) => ({
                                          ...row,
                                          report_spec: {
                                            ...row.report_spec,
                                            patient_calendar_sync: true,
                                            patient_calendar_patient_id:
                                              v === "__pick__" ? undefined : Number(v),
                                          },
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="h-11 text-sm">
                                        <SelectValue placeholder={t("headNurse.taskModal.selectPatient")} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__pick__" disabled>
                                          Select patient…
                                        </SelectItem>
                                        {workspacePatients.map((p) => (
                                          <SelectItem key={p.id} value={String(p.id)}>
                                            {p.first_name} {p.last_name} (#{p.id})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {subtask.report_spec?.patient_calendar_schedule_id != null ? (
                                      <p className="text-[11px] text-muted-foreground">
                                        Linked schedule #
                                        {subtask.report_spec.patient_calendar_schedule_id}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                              onClick={() => handleRemoveSubtask(subtask.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {canManage && (
                    <div className="flex gap-2 pt-2">
                      <Input
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleAddSubtask()
                        }
                        placeholder={t("headNurse.taskModal.subtaskPlaceholder")}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddSubtask}
                        disabled={!newSubtaskTitle.trim()}
                        className="gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent
                value="reports"
                className="m-0 data-[state=active]:flex data-[state=active]:flex-col"
              >
                <div className="px-6 py-5 space-y-5">
                  {isLoadingReports ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="p-4 rounded-lg border border-border animate-pulse"
                        >
                          <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                          <div className="h-3 bg-muted rounded w-1/4 mb-3" />
                          <div className="h-3 bg-muted rounded w-full mb-2" />
                          <div className="h-3 bg-muted rounded w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <FileText className="h-10 w-10 text-muted-foreground/40" />
                      <p className="text-muted-foreground text-sm">
                        No reports submitted yet
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...reports].reverse().map((report) => {
                        const isExpanded = expandedReports.has(report.id);
                        return (
                          <div
                            key={report.id}
                            className="border border-border rounded-lg overflow-hidden"
                          >
                            <button
                              onClick={() => toggleReportExpand(report.id)}
                              className="w-full flex items-center gap-3 p-4 hover:bg-muted/20 transition-colors text-left"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">
                                  {report.submitted_by_user_name || "Unknown"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDate(report.submitted_at)}
                                </div>
                              </div>
                              {report.attachments.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  <Paperclip className="h-3 w-3 mr-1" />
                                  {report.attachments.length}
                                </Badge>
                              )}
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                                {report.notes && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">
                                      Notes
                                    </Label>
                                    <div className="text-sm mt-1 p-3 bg-muted/30 rounded-md">
                                      {report.notes}
                                    </div>
                                  </div>
                                )}
                                {Object.keys(report.report_data).length > 0 && (
                                  <div>
                                    <Label className="text-xs text-muted-foreground">
                                      Report Data
                                    </Label>
                                    <div className="mt-2 space-y-2">
                                      {Object.entries(report.report_data).map(
                                        ([key, value]) => (
                                          <div
                                            key={key}
                                            className="flex items-start gap-2 text-sm"
                                          >
                                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                            <div className="flex-1">
                                              <span className="font-medium capitalize">
                                                {key.replace(/_/g, " ")}:
                                              </span>{" "}
                                              <span className="text-muted-foreground">
                                                {String(value)}
                                              </span>
                                            </div>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {canExecute && !hasSubmittedReport && (
                    <div className="pt-4 border-t border-border">
                      {!showReportForm ? (
                        <Button
                          onClick={() => setShowReportForm(true)}
                          className="w-full gap-2"
                        >
                          <FileText className="h-4 w-4" />
                          Submit Report
                        </Button>
                      ) : (
                        <form
                          onSubmit={handleReportSubmit}
                          className="space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold">{t("headNurse.taskModal.submitReportTitle")}</h3>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowReportForm(false);
                                reportForm.reset({});
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {(task.report_template?.mode || "").toLowerCase() ===
                          "rich" ? (
                            <div className="space-y-2">
                              <Label>{t("headNurse.taskModal.reportLabel")}</Label>
                              <Controller
                                control={reportForm.control}
                                name="body_html"
                                render={({ field }) => (
                                  <RichReportEditor
                                    variant="formal"
                                    value={
                                      typeof field.value === "string"
                                        ? field.value
                                        : ""
                                    }
                                    onChange={field.onChange}
                                    placeholder={t("headNurse.taskModal.reportPlaceholder")}
                                    minHeightClassName="min-h-[160px]"
                                  />
                                )}
                              />
                              {reportForm.formState.errors.body_html && (
                                <p className="text-xs text-destructive flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  {String(
                                    reportForm.formState.errors.body_html?.message
                                  )}
                                </p>
                              )}
                            </div>
                          ) : (
                            task.report_template?.fields?.map((field) => (
                              <div key={field.key} className="space-y-1.5">
                                <Label htmlFor={`report-${field.key}`}>
                                  {field.label}
                                  {field.required && (
                                    <span className="text-destructive ml-1">
                                      *
                                    </span>
                                  )}
                                </Label>

                                {field.type === "textarea" ? (
                                  <Textarea
                                    id={`report-${field.key}`}
                                    {...reportForm.register(field.key)}
                                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                                    rows={3}
                                  />
                                ) : field.type === "select" ? (
                                  <Select
                                    onValueChange={(value) =>
                                      reportForm.setValue(field.key, value)
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={`Select ${field.label.toLowerCase()}`}
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {field.options?.map((opt) => (
                                        <SelectItem key={opt} value={opt}>
                                          {opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : field.type === "number" ? (
                                  <Input
                                    id={`report-${field.key}`}
                                    type="number"
                                    {...reportForm.register(field.key, {
                                      valueAsNumber: true,
                                    })}
                                    placeholder={`Enter ${field.label.toLowerCase()}`}
                                  />
                                ) : field.type === "boolean" ? (
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id={`report-${field.key}`}
                                      checked={
                                        (reportForm.watch(field.key) as boolean) ||
                                        false
                                      }
                                      onCheckedChange={(checked) =>
                                        reportForm.setValue(
                                          field.key,
                                          Boolean(checked)
                                        )
                                      }
                                    />
                                    <Label
                                      htmlFor={`report-${field.key}`}
                                      className="cursor-pointer"
                                    >
                                      Yes
                                    </Label>
                                  </div>
                                ) : (
                                  <Input
                                    id={`report-${field.key}`}
                                    {...reportForm.register(field.key)}
                                    placeholder={`Enter ${field.label.toLowerCase()}`}
                                  />
                                )}

                                {(reportForm.formState.errors as Record<string, { message?: string } | undefined>)[
                                  field.key
                                ] && (
                                  <p className="text-xs text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {String(
                                      (
                                        reportForm.formState.errors as Record<
                                          string,
                                          { message?: string } | undefined
                                        >
                                      )[field.key]?.message
                                    )}
                                  </p>
                                )}
                              </div>
                            ))
                          )}

                          <div className="space-y-1.5">
                            <Label htmlFor="report-notes">
                              Notes{" "}
                              <span className="text-muted-foreground text-xs">
                                (optional)
                              </span>
                            </Label>
                            <Textarea
                              id="report-notes"
                              {...reportForm.register("notes")}
                              placeholder={t("headNurse.taskModal.notesPlaceholder")}
                              rows={2}
                            />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                setShowReportForm(false);
                                reportForm.reset({});
                              }}
                              disabled={isSubmitting}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              className="flex-1 gap-2"
                              disabled={isSubmitting}
                            >
                              {isSubmitting && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                              Submit Report
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="px-6 py-4 border-t border-border">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {canManage && (
                <>
                  {task.is_active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleArchive}
                      disabled={isSubmitting}
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={handleRestore}
                      disabled={isSubmitting}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isSubmitting}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                  {hasChanges && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={handleSave}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Changes
                    </Button>
                  )}
                </>
              )}
              {canExecute && !hasSubmittedReport && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setActiveTab("reports");
                    setShowReportForm(true);
                  }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Submit Report
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("headNurse.taskModal.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{task.title}&quot;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
