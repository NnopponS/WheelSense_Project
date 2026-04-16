"use client";
"use no memo";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  CalendarClock,
  ClipboardList,
  Download,
  FileText,
  History,
  MessageSquare,
  Plus,
  Printer,
  Send,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import ReportPreviewTable from "@/components/reports/ReportPreviewTable";
import {
  buildReportCsv,
  buildReportFilename,
  downloadTextFile,
  type ReportColumn,
  type ReportRow,
} from "@/components/reports/report-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ApiError, api, type UserSearchResult } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type { Alert, VitalReading } from "@/lib/types";
import type {
  AuditTrailEventOut,
  CareDirectiveOut,
  CareScheduleOut,
  CareTaskOut,
  CreateWorkflowDirectiveRequest,
  CreateWorkflowHandoverRequest,
  CreateWorkflowScheduleRequest,
  CreateWorkflowTaskRequest,
  GetAlertSummaryResponse,
  GetVitalsAveragesResponse,
  GetWardSummaryResponse,
  HandoverNoteOut,
  ListPatientsResponse,
  ListWorkflowDirectivesResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
  ListWorkflowSchedulesResponse,
  ListWorkflowTasksResponse,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";

const EMPTY_SELECT = "__empty__";
const STAFF_ROLE_OPTIONS = ["admin", "head_nurse", "supervisor", "observer"] as const;
type ConsoleRole = "admin" | "head_nurse" | "supervisor" | "observer";
type ConsoleTab = "queue" | "transfer" | "coordination" | "audit" | "reports";
type WorkflowItemType = "task" | "schedule" | "directive";
type AssignmentMode = "role" | "person";
type RecurrencePreset = "once" | "every_shift" | "daily" | "weekdays" | "weekly" | "advanced";
type ReportTemplateId =
  | "ward-overview"
  | "alert-summary"
  | "vitals-window"
  | "handover-notes"
  | "workflow-audit";
type SummaryTone = "info" | "warning" | "critical" | "success";

type WorkflowListRow = {
  id: number;
  itemType: WorkflowItemType;
  title: string;
  patientName: string;
  patientId: number | null;
  ownerLabel: string;
  status: string;
  timestamp: string;
  secondaryLabel: string;
  notePreview: string;
  routingRole: string | null;
  routingUserId: number | null;
};

type TaskFormState = {
  patientId: string;
  title: string;
  description: string;
  priority: string;
  dueAt: string;
  assignmentMode: AssignmentMode;
  assignedRole: string;
  assignedUserId: string;
};

type ScheduleFormState = {
  patientId: string;
  title: string;
  scheduleType: string;
  startsAt: string;
  recurrencePreset: RecurrencePreset;
  recurrenceRule: string;
  notes: string;
  assignmentMode: AssignmentMode;
  assignedRole: string;
  assignedUserId: string;
};

type DirectiveFormState = {
  patientId: string;
  title: string;
  directiveText: string;
  assignmentMode: AssignmentMode;
  targetRole: string;
  targetUserId: string;
  effectiveFrom: string;
};

type MessageFormState = {
  targetMode: AssignmentMode;
  recipientRole: string;
  recipientUserId: string;
  patientId: string;
  subject: string;
  body: string;
};

type HandoverFormState = {
  patientId: string;
  targetRole: string;
  shiftDate: string;
  shiftLabel: string;
  priority: string;
  note: string;
};

type TransferDialogState = {
  mode: "claim" | "handoff";
  row: WorkflowListRow;
} | null;

type SummaryMetric = {
  label: string;
  value: number;
  tone: SummaryTone;
  icon: typeof Bell;
};

type ReportView = {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  metrics: SummaryMetric[];
  note: string;
};

type PatientLike = {
  id: number;
  first_name: string;
  last_name: string;
  care_level?: string | null;
};

const defaultTaskForm: TaskFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  description: "",
  priority: "normal",
  dueAt: "",
  assignmentMode: "role",
  assignedRole: "observer",
  assignedUserId: EMPTY_SELECT,
};

const defaultScheduleForm: ScheduleFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  scheduleType: "round",
  startsAt: "",
  recurrencePreset: "daily",
  recurrenceRule: "RRULE:FREQ=DAILY",
  notes: "",
  assignmentMode: "role",
  assignedRole: "observer",
  assignedUserId: EMPTY_SELECT,
};

const defaultDirectiveForm: DirectiveFormState = {
  patientId: EMPTY_SELECT,
  title: "",
  directiveText: "",
  assignmentMode: "role",
  targetRole: "observer",
  targetUserId: EMPTY_SELECT,
  effectiveFrom: "",
};

const defaultMessageForm: MessageFormState = {
  targetMode: "role",
  recipientRole: "supervisor",
  recipientUserId: EMPTY_SELECT,
  patientId: EMPTY_SELECT,
  subject: "",
  body: "",
};

const defaultHandoverForm: HandoverFormState = {
  patientId: EMPTY_SELECT,
  targetRole: "supervisor",
  shiftDate: "",
  shiftLabel: "current shift",
  priority: "routine",
  note: "",
};

function formatConsoleError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function tabFromSearch(value: string | null): ConsoleTab {
  if (value === "transfer" || value === "coordination" || value === "audit" || value === "reports") {
    return value;
  }
  return "queue";
}

/** Hub pages (`/head-nurse/tasks`, `/observer/tasks`) use `?tab=` for the top tab bar; inner console panels must use a different key. */
const WORKFLOW_CONSOLE_TAB_QP = "wtab";

const LEGACY_CONSOLE_TAB_IN_TAB_QP = new Set(["transfer", "coordination", "audit", "reports"]);

function consoleTabFromSearchParams(searchParams: URLSearchParams): ConsoleTab {
  const wtab = searchParams.get(WORKFLOW_CONSOLE_TAB_QP);
  if (wtab !== null) return tabFromSearch(wtab);
  const hubTab = searchParams.get("tab");
  if (hubTab !== null && LEGACY_CONSOLE_TAB_IN_TAB_QP.has(hubTab)) {
    return hubTab as ConsoleTab;
  }
  return "queue";
}

function stripLegacyConsoleTabFromTabQP(next: URLSearchParams) {
  const t = next.get("tab");
  if (t !== null && LEGACY_CONSOLE_TAB_IN_TAB_QP.has(t)) next.delete("tab");
}

function labelPatient(patient: PatientLike | undefined, unitWideLabel: string): string {
  if (!patient) return unitWideLabel;
  return `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`;
}

function labelUser(user: UserSearchResult): string {
  const linked = user.caregiver_id
    ? `Staff #${user.caregiver_id}`
    : user.patient_id
      ? `Patient #${user.patient_id}`
      : null;
  const display = user.display_name || user.username;
  return linked ? `${display} (${linked})` : display;
}

function optionalNumber(value: string): number | null {
  return value === EMPTY_SELECT ? null : Number(value);
}

function optionalRole(value: string): string | null {
  return value === EMPTY_SELECT ? null : value;
}

function toIsoOrNull(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function toRequiredIso(value: string): string {
  return new Date(value).toISOString();
}

function recurrenceRuleForPreset(preset: RecurrencePreset): string {
  switch (preset) {
    case "once":
      return "";
    case "every_shift":
      return "RRULE:FREQ=DAILY";
    case "daily":
      return "RRULE:FREQ=DAILY";
    case "weekdays":
      return "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly":
      return "RRULE:FREQ=WEEKLY";
    case "advanced":
      return "RRULE:FREQ=DAILY";
    default:
      return "";
  }
}

function statusVariant(status: string) {
  if (status === "completed" || status === "acknowledged") return "success" as const;
  if (status === "cancelled") return "outline" as const;
  if (status === "in_progress" || status === "active") return "warning" as const;
  if (status === "pending" || status === "scheduled") return "secondary" as const;
  return "outline" as const;
}

function priorityVariant(value: string) {
  if (value === "critical") return "destructive" as const;
  if (value === "high" || value === "warning") return "warning" as const;
  if (value === "normal" || value === "routine") return "secondary" as const;
  return "outline" as const;
}

function isOpenWorkflowStatus(status: string): boolean {
  return !["completed", "cancelled", "acknowledged"].includes(status);
}

function reportToneForCount(count: number): SummaryTone {
  if (count <= 0) return "success";
  if (count >= 10) return "critical";
  if (count >= 4) return "warning";
  return "info";
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function withinWindow(value: string | null | undefined, hours: number, nowMs: number): boolean {
  const parsed = toMs(value);
  if (parsed === null) return false;
  return parsed >= nowMs - hours * 60 * 60 * 1000;
}

function buildReportView(params: {
  templateId: ReportTemplateId;
  windowHours: number;
  auditDomain: string;
  patients: ListPatientsResponse;
  alerts: Alert[];
  vitals: VitalReading[];
  handovers: HandoverNoteOut[];
  auditEvents: AuditTrailEventOut[];
  wardSummary: GetWardSummaryResponse | null;
  alertSummary: GetAlertSummaryResponse | null;
  vitalsAverage: GetVitalsAveragesResponse | null;
  tasks: ListWorkflowTasksResponse;
  directives: ListWorkflowDirectivesResponse;
  unitWide: string;
  t: (key: TranslationKey) => string;
}): ReportView {
  const {
    templateId,
    windowHours,
    auditDomain,
    patients,
    alerts,
    vitals,
    handovers,
    auditEvents,
    wardSummary,
    alertSummary,
    vitalsAverage,
    tasks,
    directives,
    unitWide,
    t,
  } = params;

  const nowMs = Date.now();
  const patientMap = new Map(patients.map((patient) => [patient.id, patient]));
  const activeAlerts = alerts.filter((alert) => alert.status === "active");
  const recentActiveAlerts = activeAlerts.filter((alert) => withinWindow(alert.timestamp, windowHours, nowMs));
  const recentVitals = vitals.filter((reading) => withinWindow(reading.timestamp, windowHours, nowMs));
  const recentHandovers = handovers.filter((item) => withinWindow(item.created_at, windowHours, nowMs));
  const recentAudit = auditEvents.filter((event) => withinWindow(event.created_at, windowHours, nowMs));
  const filteredAudit = auditDomain === "all" ? recentAudit : recentAudit.filter((event) => event.domain === auditDomain);
  const openTasks = tasks.filter((task) => task.status === "pending" || task.status === "in_progress");
  const activeDirectives = directives.filter((directive) => directive.status === "active");

  const latestVitalsByPatient = new Map<number, VitalReading>();
  for (const reading of recentVitals) {
    const current = latestVitalsByPatient.get(reading.patient_id);
    if (!current || reading.timestamp > current.timestamp) {
      latestVitalsByPatient.set(reading.patient_id, reading);
    }
  }

  if (templateId === "alert-summary") {
    return {
      title: t("workflow.console.report.alertSummary.title"),
      subtitle: t("workflow.console.report.alertSummary.subtitle"),
      columns: [
        { key: "alert", label: t("workflow.console.report.alertSummary.col.alert") },
        { key: "patient", label: t("workflow.console.report.alertSummary.col.patient") },
        { key: "severity", label: t("workflow.console.report.alertSummary.col.severity") },
        { key: "time", label: t("workflow.console.report.alertSummary.col.time"), className: "whitespace-normal" },
      ],
      rows: recentActiveAlerts
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, 16)
        .map((alert) => ({
          id: alert.id,
          alert: alert.title,
          patient: alert.patient_id ? labelPatient(patientMap.get(alert.patient_id), unitWide) : unitWide,
          severity: alert.severity,
          time: `${formatDateTime(alert.timestamp)} | ${formatRelativeTime(alert.timestamp)}`,
        })),
      metrics: [
        {
          label: t("workflow.console.report.alertSummary.metric.activeAlerts"),
          value: alertSummary?.total_active ?? activeAlerts.length,
          tone: reportToneForCount(activeAlerts.length),
          icon: Bell,
        },
        {
          label: t("workflow.console.report.alertSummary.metric.criticalAlerts"),
          value: activeAlerts.filter((alert) => alert.severity === "critical").length,
          tone: "critical",
          icon: AlertTriangle,
        },
        {
          label: t("workflow.console.report.alertSummary.metric.recentAlerts"),
          value: recentActiveAlerts.length,
          tone: "warning",
          icon: Bell,
        },
        {
          label: t("workflow.console.report.alertSummary.metric.resolvedAlerts"),
          value: alertSummary?.total_resolved ?? 0,
          tone: "success",
          icon: ShieldCheck,
        },
      ],
      note: t("workflow.console.report.alertSummary.note"),
    };
  }

  if (templateId === "vitals-window") {
    return {
      title: t("workflow.console.report.vitalsWindow.title"),
      subtitle: t("workflow.console.report.vitalsWindow.subtitle"),
      columns: [
        { key: "patient", label: t("workflow.console.report.vitalsWindow.col.patient") },
        { key: "heartRate", label: t("workflow.console.report.vitalsWindow.col.hr") },
        { key: "spo2", label: t("workflow.console.report.vitalsWindow.col.spo2") },
        { key: "captured", label: t("workflow.console.report.vitalsWindow.col.captured"), className: "whitespace-normal" },
      ],
      rows: Array.from(latestVitalsByPatient.values())
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
        .slice(0, 16)
        .map((reading) => ({
          id: reading.id,
          patient: labelPatient(patientMap.get(reading.patient_id), unitWide),
          heartRate: reading.heart_rate_bpm != null ? `${reading.heart_rate_bpm} bpm` : "-",
          spo2: reading.spo2 != null ? `${reading.spo2}%` : "-",
          captured: `${formatDateTime(reading.timestamp)} | ${formatRelativeTime(reading.timestamp)}`,
        })),
      metrics: [
        {
          label: t("workflow.console.report.vitalsWindow.metric.vitalsCaptured"),
          value: recentVitals.length,
          tone: recentVitals.length ? "info" : "success",
          icon: Stethoscope,
        },
        {
          label: t("workflow.console.report.vitalsWindow.metric.patientsWithVitals"),
          value: latestVitalsByPatient.size,
          tone: latestVitalsByPatient.size ? "warning" : "success",
          icon: Users,
        },
        {
          label: t("workflow.console.report.vitalsWindow.metric.avgSpo2"),
          value: Math.round(vitalsAverage?.spo2_avg ?? 0),
          tone: "info",
          icon: ShieldCheck,
        },
        {
          label: t("workflow.console.report.vitalsWindow.metric.avgHr"),
          value: Math.round(vitalsAverage?.heart_rate_bpm_avg ?? 0),
          tone: "info",
          icon: CalendarClock,
        },
      ],
      note: t("workflow.console.report.vitalsWindow.note"),
    };
  }

  if (templateId === "handover-notes") {
    return {
      title: t("workflow.console.report.handoverNotes.title"),
      subtitle: t("workflow.console.report.handoverNotes.subtitle"),
      columns: [
        { key: "patient", label: t("workflow.console.report.handoverNotes.col.patient") },
        { key: "target", label: t("workflow.console.report.handoverNotes.col.target") },
        { key: "priority", label: t("workflow.console.report.handoverNotes.col.priority") },
        { key: "note", label: t("workflow.console.report.handoverNotes.col.note"), className: "whitespace-normal" },
        { key: "created", label: t("workflow.console.report.handoverNotes.col.created"), className: "whitespace-normal" },
      ],
      rows: recentHandovers
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, 16)
        .map((item) => ({
          id: item.id,
          patient: item.patient_id ? labelPatient(patientMap.get(item.patient_id), unitWide) : unitWide,
          target: item.target_role || t("workflow.console.openHandoff"),
          priority: item.priority,
          note: item.note,
          created: `${formatDateTime(item.created_at)} | ${formatRelativeTime(item.created_at)}`,
        })),
      metrics: [
        {
          label: t("workflow.console.report.handoverNotes.metric.handovers"),
          value: recentHandovers.length,
          tone: recentHandovers.length ? "warning" : "success",
          icon: ArrowRightLeft,
        },
        {
          label: t("workflow.console.report.handoverNotes.metric.criticalNotes"),
          value: recentHandovers.filter((item) => item.priority === "critical").length,
          tone: "critical",
          icon: AlertTriangle,
        },
        {
          label: t("workflow.console.report.handoverNotes.metric.openTargets"),
          value: recentHandovers.filter((item) => !item.target_role).length,
          tone: "info",
          icon: Users,
        },
        {
          label: t("workflow.console.report.handoverNotes.metric.shiftTagged"),
          value: recentHandovers.filter((item) => Boolean(item.shift_label)).length,
          tone: "info",
          icon: CalendarClock,
        },
      ],
      note: t("workflow.console.report.handoverNotes.note"),
    };
  }

  if (templateId === "workflow-audit") {
    return {
      title: t("workflow.console.report.workflowAudit.title"),
      subtitle: t("workflow.console.report.workflowAudit.subtitle"),
      columns: [
        { key: "domain", label: t("workflow.console.report.workflowAudit.col.domain") },
        { key: "action", label: t("workflow.console.report.workflowAudit.col.action") },
        { key: "entity", label: t("workflow.console.report.workflowAudit.col.entity") },
        { key: "patient", label: t("workflow.console.report.workflowAudit.col.patient") },
        { key: "created", label: t("workflow.console.report.workflowAudit.col.created"), className: "whitespace-normal" },
      ],
      rows: filteredAudit
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, 20)
        .map((event) => ({
          id: event.id,
          domain: event.domain,
          action: event.action,
          entity: `${event.entity_type}${event.entity_id != null ? ` #${event.entity_id}` : ""}`,
          patient: event.patient_id ? labelPatient(patientMap.get(event.patient_id), unitWide) : unitWide,
          created: `${formatDateTime(event.created_at)} | ${formatRelativeTime(event.created_at)}`,
        })),
      metrics: [
        {
          label: t("workflow.console.report.workflowAudit.metric.auditEvents"),
          value: filteredAudit.length,
          tone: filteredAudit.length ? "warning" : "success",
          icon: History,
        },
        {
          label: t("workflow.console.report.workflowAudit.metric.taskChanges"),
          value: recentAudit.filter((event) => event.domain === "task").length,
          tone: "info",
          icon: ClipboardList,
        },
        {
          label: t("workflow.console.report.workflowAudit.metric.directiveChanges"),
          value: recentAudit.filter((event) => event.domain === "directive").length,
          tone: "warning",
          icon: FileText,
        },
        {
          label: t("workflow.console.report.workflowAudit.metric.messagingEvents"),
          value: recentAudit.filter((event) => event.domain === "messaging").length,
          tone: "info",
          icon: MessageSquare,
        },
      ],
      note: t("workflow.console.report.workflowAudit.note"),
    };
  }

  return {
    title: t("workflow.console.report.wardOverview.title"),
    subtitle: t("workflow.console.report.wardOverview.subtitle"),
    columns: [
      { key: "patient", label: t("workflow.console.report.wardOverview.col.patient") },
      { key: "careLevel", label: t("workflow.console.report.wardOverview.col.careLevel") },
      { key: "alerts", label: t("workflow.console.report.wardOverview.col.alerts") },
      { key: "taskLoad", label: t("workflow.console.report.wardOverview.col.openTasks") },
      { key: "directiveLoad", label: t("workflow.console.report.wardOverview.col.directives") },
      { key: "lastVitals", label: t("workflow.console.report.wardOverview.col.lastVitals"), className: "whitespace-normal" },
    ],
    rows: patients
      .slice()
      .sort((left, right) => left.id - right.id)
      .map((patient) => {
        const latestVitals = latestVitalsByPatient.get(patient.id);
        return {
          id: patient.id,
          patient: labelPatient(patient, unitWide),
          careLevel: patient.care_level,
          alerts: activeAlerts.filter((alert) => alert.patient_id === patient.id).length,
          taskLoad: openTasks.filter((task) => task.patient_id === patient.id).length,
          directiveLoad: activeDirectives.filter((directive) => directive.patient_id === patient.id).length,
          lastVitals: latestVitals
            ? `HR ${latestVitals.heart_rate_bpm ?? "-"} | SpO2 ${latestVitals.spo2 ?? "-"} | ${formatRelativeTime(latestVitals.timestamp)}`
            : "-",
        };
      }),
    metrics: [
      {
        label: t("workflow.console.report.wardOverview.metric.patients"),
        value: wardSummary?.total_patients ?? patients.length,
        tone: "info",
        icon: Users,
      },
      {
        label: t("workflow.console.report.wardOverview.metric.openTasks"),
        value: openTasks.length,
        tone: reportToneForCount(openTasks.length),
        icon: ClipboardList,
      },
      {
        label: t("workflow.console.report.wardOverview.metric.activeDirectives"),
        value: activeDirectives.length,
        tone: reportToneForCount(activeDirectives.length),
        icon: FileText,
      },
      {
        label: t("workflow.console.report.wardOverview.metric.activeAlerts"),
        value: wardSummary?.active_alerts ?? activeAlerts.length,
        tone: reportToneForCount(activeAlerts.length),
        icon: Bell,
      },
    ],
    note: t("workflow.console.report.wardOverview.note"),
  };
}

export function OperationsConsole({
  role,
  title,
  subtitle,
}: {
  role: ConsoleRole;
  title: string;
  subtitle: string;
}) {
  const { t } = useTranslation();
  const unitWide = t("workflow.console.unitWide");
  const unassignedLabel = t("workflow.console.unassigned");
  const requestFailedMsg = t("workflow.console.requestFailed");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  /** Tasks hub embeds the console under `/{role}/tasks` — hide inner queue/transfer/… tabs; use standalone `/{role}/workflow` for full panels. */
  const isWorkflowEmbeddedInTasksHub = /\/(head-nurse|observer|supervisor)\/tasks$/.test(pathname ?? "");
  const activeTab: ConsoleTab = isWorkflowEmbeddedInTasksHub
    ? "queue"
    : consoleTabFromSearchParams(searchParams);

  const baseKey = [role, "workflow"] as const;
  /** Matches `GET /api/analytics/wards/summary` — observer is not authorized for workspace-wide ward totals. */
  const canLoadWardSummary =
    role === "admin" || role === "head_nurse" || role === "supervisor";
  const [queueSearch, setQueueSearch] = useState("");
  const [queueTypeFilter, setQueueTypeFilter] = useState<"all" | WorkflowItemType>("all");
  const [queueStatusFilter, setQueueStatusFilter] = useState("all");
  const [selectedRow, setSelectedRow] = useState<WorkflowListRow | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<WorkflowItemType>("task");
  const [taskForm, setTaskForm] = useState<TaskFormState>(defaultTaskForm);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(defaultScheduleForm);
  const [directiveForm, setDirectiveForm] = useState<DirectiveFormState>(defaultDirectiveForm);
  const [messageForm, setMessageForm] = useState<MessageFormState>(defaultMessageForm);
  const [handoverForm, setHandoverForm] = useState<HandoverFormState>(defaultHandoverForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [transferDialog, setTransferDialog] = useState<TransferDialogState>(null);
  const [transferTargetMode, setTransferTargetMode] = useState<AssignmentMode>("role");
  const [transferTargetRole, setTransferTargetRole] = useState("observer");
  const [transferTargetUserId, setTransferTargetUserId] = useState(EMPTY_SELECT);
  const [transferNote, setTransferNote] = useState("");
  const [coordinationError, setCoordinationError] = useState<string | null>(null);
  const [reportTemplateId, setReportTemplateId] = useState<ReportTemplateId>("ward-overview");
  const [reportWindowHours, setReportWindowHours] = useState("24");
  const [auditDomain, setAuditDomain] = useState("all");

  const reportTemplates = useMemo(
    () =>
      [
        {
          id: "ward-overview" as const,
          title: t("workflow.console.reportTemplate.wardOverview.title"),
          description: t("workflow.console.reportTemplate.wardOverview.description"),
        },
        {
          id: "alert-summary" as const,
          title: t("workflow.console.reportTemplate.alertSummary.title"),
          description: t("workflow.console.reportTemplate.alertSummary.description"),
        },
        {
          id: "vitals-window" as const,
          title: t("workflow.console.reportTemplate.vitalsWindow.title"),
          description: t("workflow.console.reportTemplate.vitalsWindow.description"),
        },
        {
          id: "handover-notes" as const,
          title: t("workflow.console.reportTemplate.handoverNotes.title"),
          description: t("workflow.console.reportTemplate.handoverNotes.description"),
        },
        {
          id: "workflow-audit" as const,
          title: t("workflow.console.reportTemplate.workflowAudit.title"),
          description: t("workflow.console.reportTemplate.workflowAudit.description"),
        },
      ] satisfies Array<{ id: ReportTemplateId; title: string; description: string }>,
    [t],
  );

  const patientsQuery = useQuery({
    queryKey: [...baseKey, "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const usersQuery = useQuery({
    queryKey: [...baseKey, "users"],
    queryFn: () =>
      api.searchUsers({
        roles: STAFF_ROLE_OPTIONS.join(","),
        limit: 100,
      }),
  });

  const tasksQuery = useQuery({
    queryKey: [...baseKey, "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 200 }),
  });

  const schedulesQuery = useQuery({
    queryKey: [...baseKey, "schedules"],
    queryFn: () => api.listWorkflowSchedules({ limit: 200 }),
  });

  const directivesQuery = useQuery({
    queryKey: [...baseKey, "directives"],
    queryFn: () => api.listWorkflowDirectives({ limit: 200 }),
  });

  const messagesQuery = useQuery({
    queryKey: [...baseKey, "messages"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 200 }),
    refetchInterval: 20_000,
  });

  const handoversQuery = useQuery({
    queryKey: [...baseKey, "handovers"],
    queryFn: () => api.listWorkflowHandovers({ limit: 120 }),
  });

  const auditQuery = useQuery({
    queryKey: [...baseKey, "audit"],
    queryFn: () => api.listWorkflowAudit({ limit: 120 }),
  });

  const alertsQuery = useQuery({
    queryKey: [...baseKey, "alerts"],
    queryFn: () => api.listAlerts({ status: "active", limit: 200 }),
  });

  const vitalsQuery = useQuery({
    queryKey: [...baseKey, "vitals"],
    queryFn: () => api.listVitalReadings({ limit: 240 }),
  });

  const wardSummaryQuery = useQuery({
    queryKey: [...baseKey, "ward-summary"],
    queryFn: () => api.getWardSummary(),
    enabled: canLoadWardSummary,
  });

  const alertSummaryQuery = useQuery({
    queryKey: [...baseKey, "alert-summary"],
    queryFn: () => api.getAlertSummary(),
  });

  const vitalsAverageQuery = useQuery({
    queryKey: [...baseKey, "vitals-average", reportWindowHours],
    queryFn: () => api.getVitalsAverages(Number(reportWindowHours)),
  });

  const detailQuery = useQuery({
    queryKey: [...baseKey, "detail", selectedRow?.itemType ?? "task", selectedRow?.id ?? 0],
    queryFn: () => api.getWorkflowItemDetail(selectedRow!.itemType, selectedRow!.id),
    enabled: selectedRow !== null,
  });

  const patients = useMemo(() => (patientsQuery.data ?? []) as ListPatientsResponse, [patientsQuery.data]);
  const users = useMemo(() => (usersQuery.data ?? []) as UserSearchResult[], [usersQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data ?? []) as ListWorkflowTasksResponse, [tasksQuery.data]);

  // region agent log
  useEffect(() => {
    const linked = tasks.filter((t) => t.workflow_job_id != null).length;
    void fetch("http://127.0.0.1:7687/ingest/3079ba95-d656-44c3-9953-dc1c569178f1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4d0de1" },
      body: JSON.stringify({
        sessionId: "4d0de1",
        hypothesisId: "H5",
        location: "OperationsConsole.tsx:tasks",
        message: "ops console tasks query",
        data: {
          role,
          tasksLen: tasks.length,
          workflowLinked: linked,
          fetchStatus: tasksQuery.fetchStatus,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [tasks, role, tasksQuery.fetchStatus]);
  // endregion

  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as ListWorkflowSchedulesResponse,
    [schedulesQuery.data],
  );
  const directives = useMemo(
    () => (directivesQuery.data ?? []) as ListWorkflowDirectivesResponse,
    [directivesQuery.data],
  );
  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );
  const handovers = useMemo(
    () => (handoversQuery.data ?? []) as ListWorkflowHandoversResponse,
    [handoversQuery.data],
  );
  const auditEvents = useMemo(
    () => (auditQuery.data ?? []) as AuditTrailEventOut[],
    [auditQuery.data],
  );
  const alerts = useMemo(() => (alertsQuery.data ?? []) as Alert[], [alertsQuery.data]);
  const vitals = useMemo(() => (vitalsQuery.data ?? []) as VitalReading[], [vitalsQuery.data]);
  const wardSummary = useMemo(
    () => (wardSummaryQuery.data ?? null) as GetWardSummaryResponse | null,
    [wardSummaryQuery.data],
  );
  const alertSummary = useMemo(
    () => (alertSummaryQuery.data ?? null) as GetAlertSummaryResponse | null,
    [alertSummaryQuery.data],
  );
  const vitalsAverage = useMemo(
    () => (vitalsAverageQuery.data ?? null) as GetVitalsAveragesResponse | null,
    [vitalsAverageQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: String(user.id),
        label: labelUser(user),
      })),
    [users],
  );

  const queueRows = useMemo<WorkflowListRow[]>(() => {
    const taskRows = tasks.map((task: CareTaskOut) => ({
      id: task.id,
      itemType: "task" as const,
      title: task.title,
      patientName: task.patient_id ? labelPatient(patientMap.get(task.patient_id), unitWide) : unitWide,
      patientId: task.patient_id,
      ownerLabel: task.assigned_person?.display_name || task.assigned_role || unassignedLabel,
      status: task.status,
      timestamp: task.due_at || task.updated_at || task.created_at,
      secondaryLabel: task.priority,
      notePreview: task.description,
      routingRole: task.assigned_role,
      routingUserId: task.assigned_user_id,
    }));

    const scheduleRows = schedules.map((schedule: CareScheduleOut) => ({
      id: schedule.id,
      itemType: "schedule" as const,
      title: schedule.title,
      patientName: schedule.patient_id ? labelPatient(patientMap.get(schedule.patient_id), unitWide) : unitWide,
      patientId: schedule.patient_id,
      ownerLabel: schedule.assigned_person?.display_name || schedule.assigned_role || unassignedLabel,
      status: schedule.status,
      timestamp: schedule.starts_at || schedule.updated_at || schedule.created_at,
      secondaryLabel: schedule.schedule_type,
      notePreview: schedule.notes ?? "",
      routingRole: schedule.assigned_role,
      routingUserId: schedule.assigned_user_id,
    }));

    const directiveRows = directives.map((directive: CareDirectiveOut) => ({
      id: directive.id,
      itemType: "directive" as const,
      title: directive.title,
      patientName: directive.patient_id ? labelPatient(patientMap.get(directive.patient_id), unitWide) : unitWide,
      patientId: directive.patient_id,
      ownerLabel: directive.target_person?.display_name || directive.target_role || unassignedLabel,
      status: directive.status,
      timestamp: directive.effective_from || directive.updated_at || directive.created_at,
      secondaryLabel: directive.target_role || "person",
      notePreview: directive.directive_text,
      routingRole: directive.target_role,
      routingUserId: directive.target_user_id,
    }));

    return [...taskRows, ...scheduleRows, ...directiveRows].sort(
      (left, right) => right.timestamp.localeCompare(left.timestamp),
    );
  }, [directives, patientMap, schedules, tasks, unitWide, unassignedLabel]);

  const openQueueRows = useMemo(
    () => queueRows.filter((row) => isOpenWorkflowStatus(row.status)),
    [queueRows],
  );

  const filteredQueueRows = useMemo(() => {
    return queueRows.filter((row) => {
      if (queueTypeFilter !== "all" && row.itemType !== queueTypeFilter) return false;
      if (queueStatusFilter !== "all" && row.status !== queueStatusFilter) return false;
      if (!queueSearch.trim()) return true;
      const needle = queueSearch.trim().toLowerCase();
      return [
        row.title,
        row.patientName,
        row.ownerLabel,
        row.status,
        row.notePreview,
        row.secondaryLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [queueSearch, queueRows, queueStatusFilter, queueTypeFilter]);

  const recentMessages = useMemo(
    () => [...messages].sort((left, right) => right.created_at.localeCompare(left.created_at)),
    [messages],
  );

  const reportView = useMemo(
    () =>
      buildReportView({
        templateId: reportTemplateId,
        windowHours: Number(reportWindowHours),
        auditDomain,
        patients,
        alerts,
        vitals,
        handovers,
        auditEvents,
        wardSummary,
        alertSummary,
        vitalsAverage,
        tasks,
        directives,
        unitWide,
        t,
      }),
    [
      alertSummary,
      alerts,
      auditDomain,
      auditEvents,
      directives,
      handovers,
      patients,
      reportTemplateId,
      reportWindowHours,
      t,
      tasks,
      unitWide,
      vitals,
      vitalsAverage,
      wardSummary,
    ],
  );

  async function invalidateConsoleData() {
    await queryClient.invalidateQueries({ queryKey: [...baseKey] });
  }

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        patient_id: optionalNumber(taskForm.patientId),
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        due_at: toIsoOrNull(taskForm.dueAt),
        assigned_role: taskForm.assignmentMode === "role" ? optionalRole(taskForm.assignedRole) : null,
        assigned_user_id:
          taskForm.assignmentMode === "person" ? optionalNumber(taskForm.assignedUserId) : null,
      } satisfies CreateWorkflowTaskRequest;

      await api.createWorkflowTask(payload);
    },
    onSuccess: async () => {
      setTaskForm(defaultTaskForm);
      setCreateError(null);
      await invalidateConsoleData();
    },
    onError: (error) => setCreateError(formatConsoleError(error, requestFailedMsg)),
  });

  const createScheduleMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        patient_id: optionalNumber(scheduleForm.patientId),
        title: scheduleForm.title.trim(),
        schedule_type: scheduleForm.scheduleType.trim(),
        starts_at: toRequiredIso(scheduleForm.startsAt),
        recurrence_rule:
          scheduleForm.recurrencePreset === "advanced"
            ? scheduleForm.recurrenceRule.trim()
            : recurrenceRuleForPreset(scheduleForm.recurrencePreset),
        notes: scheduleForm.notes.trim(),
        assigned_role:
          scheduleForm.assignmentMode === "role" ? optionalRole(scheduleForm.assignedRole) : null,
        assigned_user_id:
          scheduleForm.assignmentMode === "person"
            ? optionalNumber(scheduleForm.assignedUserId)
            : null,
      } satisfies CreateWorkflowScheduleRequest;

      await api.createWorkflowSchedule(payload);
    },
    onSuccess: async () => {
      setScheduleForm(defaultScheduleForm);
      setCreateError(null);
      await invalidateConsoleData();
    },
    onError: (error) => setCreateError(formatConsoleError(error, requestFailedMsg)),
  });

  const createDirectiveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        patient_id: optionalNumber(directiveForm.patientId),
        title: directiveForm.title.trim(),
        directive_text: directiveForm.directiveText.trim(),
        target_role:
          directiveForm.assignmentMode === "role" ? optionalRole(directiveForm.targetRole) : null,
        target_user_id:
          directiveForm.assignmentMode === "person"
            ? optionalNumber(directiveForm.targetUserId)
            : null,
        effective_from: directiveForm.effectiveFrom ? toRequiredIso(directiveForm.effectiveFrom) : null,
      } satisfies CreateWorkflowDirectiveRequest;

      await api.createWorkflowDirective(payload);
    },
    onSuccess: async () => {
      setDirectiveForm(defaultDirectiveForm);
      setCreateError(null);
      await invalidateConsoleData();
    },
    onError: (error) => setCreateError(formatConsoleError(error, requestFailedMsg)),
  });

  const claimMutation = useMutation({
    mutationFn: async (payload: { row: WorkflowListRow; note: string }) =>
      api.post<unknown>(
        `/workflow/items/${encodeURIComponent(payload.row.itemType)}/${payload.row.id}/claim`,
        { note: payload.note },
      ),
    onSuccess: async () => {
      setTransferDialog(null);
      setTransferNote("");
      await invalidateConsoleData();
    },
    onError: (error) => setCoordinationError(formatConsoleError(error, requestFailedMsg)),
  });

  const handoffMutation = useMutation({
    mutationFn: async (payload: {
      row: WorkflowListRow;
      note: string;
      targetMode: AssignmentMode;
      targetRole: string;
      targetUserId: string;
    }) =>
      api.post<unknown>(
        `/workflow/items/${encodeURIComponent(payload.row.itemType)}/${payload.row.id}/handoff`,
        {
          target_mode: payload.targetMode === "role" ? "role" : "user",
          target_role: payload.targetMode === "role" ? payload.targetRole : null,
          target_user_id:
            payload.targetMode === "person" ? optionalNumber(payload.targetUserId) : null,
          note: payload.note,
        },
      ),
    onSuccess: async () => {
      setTransferDialog(null);
      setTransferTargetMode("role");
      setTransferTargetRole("observer");
      setTransferTargetUserId(EMPTY_SELECT);
      setTransferNote("");
      await invalidateConsoleData();
    },
    onError: (error) => setCoordinationError(formatConsoleError(error, requestFailedMsg)),
  });

  const sendThreadMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRow) throw new Error("No workflow item selected.");
      if (!selectedRow.routingRole && !selectedRow.routingUserId) {
        throw new Error("This item does not have a routing target yet.");
      }
      const payload = {
        recipient_role: selectedRow.routingUserId ? null : selectedRow.routingRole,
        recipient_user_id: selectedRow.routingUserId,
        patient_id: selectedRow.patientId,
        workflow_item_type: selectedRow.itemType,
        workflow_item_id: selectedRow.id,
        subject: `Update: ${selectedRow.title}`,
        body: replyBody.trim(),
      } satisfies SendWorkflowMessageRequest;
      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      setReplyBody("");
      setDetailError(null);
      await invalidateConsoleData();
      if (selectedRow) {
        await queryClient.invalidateQueries({
          queryKey: [...baseKey, "detail", selectedRow.itemType, selectedRow.id],
        });
      }
    },
    onError: (error) => setDetailError(formatConsoleError(error, requestFailedMsg)),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        recipient_role:
          messageForm.targetMode === "role" ? optionalRole(messageForm.recipientRole) : null,
        recipient_user_id:
          messageForm.targetMode === "person" ? optionalNumber(messageForm.recipientUserId) : null,
        patient_id: optionalNumber(messageForm.patientId),
        subject: messageForm.subject.trim(),
        body: messageForm.body.trim(),
      } satisfies SendWorkflowMessageRequest;
      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      setMessageForm(defaultMessageForm);
      setCoordinationError(null);
      await invalidateConsoleData();
    },
    onError: (error) => setCoordinationError(formatConsoleError(error, requestFailedMsg)),
  });

  const createHandoverMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        patient_id: optionalNumber(handoverForm.patientId),
        target_role: optionalRole(handoverForm.targetRole),
        shift_date: handoverForm.shiftDate || null,
        shift_label: handoverForm.shiftLabel.trim(),
        priority: handoverForm.priority,
        note: handoverForm.note.trim(),
      } satisfies CreateWorkflowHandoverRequest;
      await api.createWorkflowHandover(payload);
    },
    onSuccess: async () => {
      setHandoverForm(defaultHandoverForm);
      setCoordinationError(null);
      await invalidateConsoleData();
    },
    onError: (error) => setCoordinationError(formatConsoleError(error, requestFailedMsg)),
  });

  const summaryMetrics = useMemo<Array<{
    icon: typeof Bell;
    label: string;
    value: number;
    tone: "info" | "warning" | "critical" | "success";
  }>>(
    () => [
      {
        icon: ClipboardList,
        label: t("workflow.console.summary.openItems"),
        value: openQueueRows.length,
        tone: openQueueRows.length > 0 ? "warning" : "success",
      },
      {
        icon: Bell,
        label: t("workflow.console.summary.activeAlerts"),
        value: wardSummary?.active_alerts ?? alertSummary?.total_active ?? alerts.length,
        tone:
          (wardSummary?.active_alerts ?? alertSummary?.total_active ?? alerts.length) > 0
            ? "critical"
            : "success",
      },
      {
        icon: MessageSquare,
        label: t("workflow.console.summary.messages"),
        value: recentMessages.length,
        tone: recentMessages.length > 0 ? "info" : "success",
      },
      {
        icon: ArrowRightLeft,
        label: t("workflow.console.summary.handovers"),
        value: handovers.length,
        tone: handovers.length > 0 ? "warning" : "info",
      },
    ],
    [alertSummary?.total_active, alerts.length, handovers.length, openQueueRows.length, recentMessages.length, t, wardSummary?.active_alerts],
  );

  const queueColumns = useMemo<ColumnDef<WorkflowListRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Item",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{row.original.title}</p>
              <Badge variant="outline">{row.original.itemType}</Badge>
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.notePreview || "-"}</p>
          </div>
        ),
      },
      { accessorKey: "patientName", header: "Patient" },
      { accessorKey: "ownerLabel", header: "Owner" },
      {
        accessorKey: "secondaryLabel",
        header: "Type / Priority",
        cell: ({ row }) => <Badge variant="secondary">{row.original.secondaryLabel || "-"}</Badge>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>,
      },
      {
        accessorKey: "timestamp",
        header: "Next action",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedRow(row.original)}>
            Open
          </Button>
        ),
      },
    ],
    [],
  );

  const transferColumns = useMemo<ColumnDef<WorkflowListRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Workflow item",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.patientName}</p>
          </div>
        ),
      },
      { accessorKey: "ownerLabel", header: "Current owner" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setTransferDialog({ mode: "claim", row: row.original });
                setTransferNote("");
                setCoordinationError(null);
              }}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              Claim
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setTransferDialog({ mode: "handoff", row: row.original });
                setTransferTargetMode("role");
                setTransferTargetRole("observer");
                setTransferTargetUserId(EMPTY_SELECT);
                setTransferNote("");
                setCoordinationError(null);
              }}
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Handoff
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const messageColumns = useMemo<ColumnDef<ListWorkflowMessagesResponse[number]>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Message",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.subject || "(No subject)"}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: "recipient_role",
        header: "Routing",
        cell: ({ row }) => {
          const sender =
            row.original.sender_person?.display_name || `User #${row.original.sender_user_id}`;
          const recipient = row.original.recipient_person?.display_name
            || row.original.recipient_role
            || (row.original.recipient_user_id ? `User #${row.original.recipient_user_id}` : "Direct");
          return (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>From: {sender}</p>
              <p>To: {recipient}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "patient_id",
        header: "Patient",
        cell: ({ row }) =>
          row.original.patient_id ? labelPatient(patientMap.get(row.original.patient_id), unitWide) : unitWide,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.created_at)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.created_at)}</p>
          </div>
        ),
      },
    ],
    [patientMap, unitWide],
  );

  const handoverColumns = useMemo<ColumnDef<HandoverNoteOut>[]>(
    () => [
      {
        accessorKey: "note",
        header: "Handover",
        cell: ({ row }) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={priorityVariant(row.original.priority)}>{row.original.priority}</Badge>
              <p className="text-xs text-muted-foreground">{row.original.shift_label || "Shift handoff"}</p>
            </div>
            <p className="line-clamp-3 text-sm text-foreground">{row.original.note}</p>
          </div>
        ),
      },
      {
        accessorKey: "patient_id",
        header: "Patient",
        cell: ({ row }) =>
          row.original.patient_id ? labelPatient(patientMap.get(row.original.patient_id), unitWide) : unitWide,
      },
      {
        accessorKey: "target_role",
        header: "Target",
        cell: ({ row }) => row.original.target_role || "Open handoff",
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.created_at)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.created_at)}</p>
          </div>
        ),
      },
    ],
    [patientMap, unitWide],
  );

  const auditColumns = useMemo<ColumnDef<AuditTrailEventOut>[]>(
    () => [
      { accessorKey: "domain", header: "Domain" },
      { accessorKey: "action", header: "Action" },
      {
        accessorKey: "entity_type",
        header: "Entity",
        cell: ({ row }) =>
          `${row.original.entity_type}${row.original.entity_id != null ? ` #${row.original.entity_id}` : ""}`,
      },
      {
        accessorKey: "patient_id",
        header: "Patient",
        cell: ({ row }) =>
          row.original.patient_id ? labelPatient(patientMap.get(row.original.patient_id), unitWide) : unitWide,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.created_at)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.created_at)}</p>
          </div>
        ),
      },
    ],
    [patientMap, unitWide],
  );

  const isLoadingAny =
    patientsQuery.isLoading ||
    usersQuery.isLoading ||
    tasksQuery.isLoading ||
    schedulesQuery.isLoading ||
    directivesQuery.isLoading;

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void invalidateConsoleData()}>
            {t("workflow.console.refresh")}
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryMetrics.map((metric) => (
          <SummaryStatCard
            key={metric.label}
            icon={metric.icon}
            label={metric.label}
            value={metric.value}
            tone={metric.tone}
          />
        ))}
      </section>

      {!isWorkflowEmbeddedInTasksHub ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-wrap gap-2 p-3">
            {([
              ["queue", t("workflow.console.tab.queue")],
              ["transfer", t("workflow.console.tab.transfer")],
              ["coordination", t("workflow.console.tab.coordination")],
              ["audit", t("workflow.console.tab.audit")],
              ["reports", t("workflow.console.tab.reports")],
            ] as const).map(([tab, label]) => (
              <Button
                key={tab}
                type="button"
                variant={activeTab === tab ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const next = new URLSearchParams(searchParams.toString());
                  if (tab === "queue") {
                    next.delete(WORKFLOW_CONSOLE_TAB_QP);
                    stripLegacyConsoleTabFromTabQP(next);
                  } else {
                    next.set(WORKFLOW_CONSOLE_TAB_QP, tab);
                    stripLegacyConsoleTabFromTabQP(next);
                  }
                  const query = next.toString();
                  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
                }}
              >
                {label}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "queue" ? (
        <div className="space-y-4">
          <Card className="border-border/70">
            <CardContent className="grid gap-4 p-4 md:grid-cols-[1.4fr_0.9fr_0.9fr]">
              <div className="space-y-2">
                <Label htmlFor="workflow-search">Search queue</Label>
                <Input
                  id="workflow-search"
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  placeholder="Search by title, patient, owner, or note"
                />
              </div>
              <div className="space-y-2">
                <Label>Item type</Label>
                <Select
                  value={queueTypeFilter}
                  onValueChange={(value) => setQueueTypeFilter(value as "all" | WorkflowItemType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All items</SelectItem>
                    <SelectItem value="task">Tasks</SelectItem>
                    <SelectItem value="schedule">Schedules</SelectItem>
                    <SelectItem value="directive">Directives</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={queueStatusFilter} onValueChange={setQueueStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">pending</SelectItem>
                    <SelectItem value="in_progress">in_progress</SelectItem>
                    <SelectItem value="scheduled">scheduled</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="completed">completed</SelectItem>
                    <SelectItem value="acknowledged">acknowledged</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <DataTableCard
            title="Operations queue"
            description="Tasks, schedules, and directives consolidated into one queue."
            data={filteredQueueRows}
            columns={queueColumns}
            isLoading={isLoadingAny}
            emptyText="No workflow items match the current filters."
          />
        </div>
      ) : null}

      {activeTab === "transfer" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Create workflow item</CardTitle>
                <CardDescription>
                  Standardized create flow with assignment mode and recurrence presets.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(["task", "schedule", "directive"] as const).map((itemType) => (
                    <Button
                      key={itemType}
                      type="button"
                      variant={formKind === itemType ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFormKind(itemType)}
                    >
                      {itemType}
                    </Button>
                  ))}
                </div>

                {formKind === "task" ? (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setCreateError(null);
                      createTaskMutation.mutate();
                    }}
                  >
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={taskForm.title}
                        onChange={(event) =>
                          setTaskForm((current) => ({ ...current, title: event.target.value }))
                        }
                        placeholder="Task title"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Patient</Label>
                        <Select
                          value={taskForm.patientId}
                          onValueChange={(value) =>
                            setTaskForm((current) => ({ ...current, patientId: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={unitWide} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_SELECT}>{unitWide}</SelectItem>
                            {patients.map((patient) => (
                              <SelectItem key={patient.id} value={String(patient.id)}>
                                {labelPatient(patient, unitWide)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select
                          value={taskForm.priority}
                          onValueChange={(value) =>
                            setTaskForm((current) => ({ ...current, priority: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">normal</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                            <SelectItem value="critical">critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        rows={3}
                        value={taskForm.description}
                        onChange={(event) =>
                          setTaskForm((current) => ({ ...current, description: event.target.value }))
                        }
                        placeholder="Expected outcome or handling notes"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Due at</Label>
                        <Input
                          type="datetime-local"
                          value={taskForm.dueAt}
                          onChange={(event) =>
                            setTaskForm((current) => ({ ...current, dueAt: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Assign by</Label>
                        <Select
                          value={taskForm.assignmentMode}
                          onValueChange={(value) =>
                            setTaskForm((current) => ({
                              ...current,
                              assignmentMode: value as AssignmentMode,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="role">role</SelectItem>
                            <SelectItem value="person">person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {taskForm.assignmentMode === "role" ? (
                      <div className="space-y-2">
                        <Label>Assigned role</Label>
                        <Select
                          value={taskForm.assignedRole}
                          onValueChange={(value) =>
                            setTaskForm((current) => ({ ...current, assignedRole: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAFF_ROLE_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Assigned person</Label>
                        <Select
                          value={taskForm.assignedUserId}
                          onValueChange={(value) =>
                            setTaskForm((current) => ({ ...current, assignedUserId: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a user" />
                          </SelectTrigger>
                          <SelectContent>
                            {userOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button type="submit" disabled={createTaskMutation.isPending}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create task
                    </Button>
                  </form>
                ) : null}

                {formKind === "schedule" ? (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setCreateError(null);
                      createScheduleMutation.mutate();
                    }}
                  >
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={scheduleForm.title}
                        onChange={(event) =>
                          setScheduleForm((current) => ({ ...current, title: event.target.value }))
                        }
                        placeholder="Schedule title"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Patient</Label>
                        <Select
                          value={scheduleForm.patientId}
                          onValueChange={(value) =>
                            setScheduleForm((current) => ({ ...current, patientId: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={unitWide} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_SELECT}>{unitWide}</SelectItem>
                            {patients.map((patient) => (
                              <SelectItem key={patient.id} value={String(patient.id)}>
                                {labelPatient(patient, unitWide)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Schedule type</Label>
                        <Input
                          value={scheduleForm.scheduleType}
                          onChange={(event) =>
                            setScheduleForm((current) => ({
                              ...current,
                              scheduleType: event.target.value,
                            }))
                          }
                          placeholder="round"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Starts at</Label>
                        <Input
                          type="datetime-local"
                          value={scheduleForm.startsAt}
                          onChange={(event) =>
                            setScheduleForm((current) => ({
                              ...current,
                              startsAt: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Recurrence preset</Label>
                        <Select
                          value={scheduleForm.recurrencePreset}
                          onValueChange={(value) =>
                            setScheduleForm((current) => {
                              const preset = value as RecurrencePreset;
                              return {
                                ...current,
                                recurrencePreset: preset,
                                recurrenceRule:
                                  preset === "advanced"
                                    ? current.recurrenceRule || "RRULE:FREQ=DAILY"
                                    : recurrenceRuleForPreset(preset),
                              };
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="once">once</SelectItem>
                            <SelectItem value="every_shift">every_shift</SelectItem>
                            <SelectItem value="daily">daily</SelectItem>
                            <SelectItem value="weekdays">weekdays</SelectItem>
                            <SelectItem value="weekly">weekly</SelectItem>
                            <SelectItem value="advanced">Advanced recurrence</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {scheduleForm.recurrencePreset === "advanced" ? (
                      <div className="space-y-2">
                        <Label>Advanced recurrence</Label>
                        <Input
                          value={scheduleForm.recurrenceRule}
                          onChange={(event) =>
                            setScheduleForm((current) => ({
                              ...current,
                              recurrenceRule: event.target.value,
                            }))
                          }
                          placeholder="RRULE:FREQ=DAILY"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        rows={3}
                        value={scheduleForm.notes}
                        onChange={(event) =>
                          setScheduleForm((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Context for whoever executes this schedule"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Assign by</Label>
                        <Select
                          value={scheduleForm.assignmentMode}
                          onValueChange={(value) =>
                            setScheduleForm((current) => ({
                              ...current,
                              assignmentMode: value as AssignmentMode,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="role">role</SelectItem>
                            <SelectItem value="person">person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {scheduleForm.assignmentMode === "role" ? (
                        <div className="space-y-2">
                          <Label>Assigned role</Label>
                          <Select
                            value={scheduleForm.assignedRole}
                            onValueChange={(value) =>
                              setScheduleForm((current) => ({ ...current, assignedRole: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAFF_ROLE_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Assigned person</Label>
                          <Select
                            value={scheduleForm.assignedUserId}
                            onValueChange={(value) =>
                              setScheduleForm((current) => ({ ...current, assignedUserId: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a user" />
                            </SelectTrigger>
                            <SelectContent>
                              {userOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <Button type="submit" disabled={createScheduleMutation.isPending}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create schedule
                    </Button>
                  </form>
                ) : null}

                {formKind === "directive" ? (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setCreateError(null);
                      createDirectiveMutation.mutate();
                    }}
                  >
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={directiveForm.title}
                        onChange={(event) =>
                          setDirectiveForm((current) => ({ ...current, title: event.target.value }))
                        }
                        placeholder="Directive title"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Patient</Label>
                        <Select
                          value={directiveForm.patientId}
                          onValueChange={(value) =>
                            setDirectiveForm((current) => ({ ...current, patientId: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={unitWide} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={EMPTY_SELECT}>{unitWide}</SelectItem>
                            {patients.map((patient) => (
                              <SelectItem key={patient.id} value={String(patient.id)}>
                                {labelPatient(patient, unitWide)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Effective from</Label>
                        <Input
                          type="datetime-local"
                          value={directiveForm.effectiveFrom}
                          onChange={(event) =>
                            setDirectiveForm((current) => ({
                              ...current,
                              effectiveFrom: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Assign by</Label>
                        <Select
                          value={directiveForm.assignmentMode}
                          onValueChange={(value) =>
                            setDirectiveForm((current) => ({
                              ...current,
                              assignmentMode: value as AssignmentMode,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="role">role</SelectItem>
                            <SelectItem value="person">person</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {directiveForm.assignmentMode === "role" ? (
                        <div className="space-y-2">
                          <Label>Target role</Label>
                          <Select
                            value={directiveForm.targetRole}
                            onValueChange={(value) =>
                              setDirectiveForm((current) => ({ ...current, targetRole: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAFF_ROLE_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Target person</Label>
                          <Select
                            value={directiveForm.targetUserId}
                            onValueChange={(value) =>
                              setDirectiveForm((current) => ({ ...current, targetUserId: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a user" />
                            </SelectTrigger>
                            <SelectContent>
                              {userOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Directive</Label>
                      <Textarea
                        rows={4}
                        value={directiveForm.directiveText}
                        onChange={(event) =>
                          setDirectiveForm((current) => ({
                            ...current,
                            directiveText: event.target.value,
                          }))
                        }
                        placeholder="Directive details"
                      />
                    </div>
                    <Button type="submit" disabled={createDirectiveMutation.isPending}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create directive
                    </Button>
                  </form>
                ) : null}

                {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
              </CardContent>
            </Card>

            <DataTableCard
              title="Transfer board"
              description="Claim work, reassign it, or hand it off with a note."
              data={openQueueRows}
              columns={transferColumns}
              isLoading={isLoadingAny}
              emptyText="No open workflow items need transfer actions."
            />
          </div>
        </div>
      ) : null}

      {activeTab === "coordination" ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Role message</CardTitle>
                <CardDescription>
                  Send operational context to a role or a named person.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setCoordinationError(null);
                    sendMessageMutation.mutate();
                  }}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Target mode</Label>
                      <Select
                        value={messageForm.targetMode}
                        onValueChange={(value) =>
                          setMessageForm((current) => ({
                            ...current,
                            targetMode: value as AssignmentMode,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role">role</SelectItem>
                          <SelectItem value="person">person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Patient</Label>
                      <Select
                        value={messageForm.patientId}
                        onValueChange={(value) =>
                          setMessageForm((current) => ({ ...current, patientId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={unitWide} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>{unitWide}</SelectItem>
                          {patients.map((patient) => (
                            <SelectItem key={patient.id} value={String(patient.id)}>
                              {labelPatient(patient, unitWide)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {messageForm.targetMode === "role" ? (
                    <div className="space-y-2">
                      <Label>Recipient role</Label>
                      <Select
                        value={messageForm.recipientRole}
                        onValueChange={(value) =>
                          setMessageForm((current) => ({ ...current, recipientRole: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ROLE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Recipient person</Label>
                      <Select
                        value={messageForm.recipientUserId}
                        onValueChange={(value) =>
                          setMessageForm((current) => ({ ...current, recipientUserId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {userOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      value={messageForm.subject}
                      onChange={(event) =>
                        setMessageForm((current) => ({ ...current, subject: event.target.value }))
                      }
                      placeholder="Message subject"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Body</Label>
                    <Textarea
                      rows={4}
                      value={messageForm.body}
                      onChange={(event) =>
                        setMessageForm((current) => ({ ...current, body: event.target.value }))
                      }
                      placeholder="Operational update or instruction"
                    />
                  </div>
                  <Button type="submit" disabled={sendMessageMutation.isPending}>
                    <Send className="mr-2 h-4 w-4" />
                    Send message
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Create handover</CardTitle>
                <CardDescription>
                  Record shift-to-shift continuity with target role and priority.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setCoordinationError(null);
                    createHandoverMutation.mutate();
                  }}
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Patient</Label>
                      <Select
                        value={handoverForm.patientId}
                        onValueChange={(value) =>
                          setHandoverForm((current) => ({ ...current, patientId: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={unitWide} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>{unitWide}</SelectItem>
                          {patients.map((patient) => (
                            <SelectItem key={patient.id} value={String(patient.id)}>
                              {labelPatient(patient, unitWide)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Target role</Label>
                      <Select
                        value={handoverForm.targetRole}
                        onValueChange={(value) =>
                          setHandoverForm((current) => ({ ...current, targetRole: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY_SELECT}>Open handoff</SelectItem>
                          {STAFF_ROLE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Shift date</Label>
                      <Input
                        type="date"
                        value={handoverForm.shiftDate}
                        onChange={(event) =>
                          setHandoverForm((current) => ({ ...current, shiftDate: event.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Shift label</Label>
                      <Input
                        value={handoverForm.shiftLabel}
                        onChange={(event) =>
                          setHandoverForm((current) => ({ ...current, shiftLabel: event.target.value }))
                        }
                        placeholder="morning shift"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={handoverForm.priority}
                      onValueChange={(value) =>
                        setHandoverForm((current) => ({ ...current, priority: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="routine">routine</SelectItem>
                        <SelectItem value="urgent">urgent</SelectItem>
                        <SelectItem value="critical">critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Note</Label>
                    <Textarea
                      rows={4}
                      value={handoverForm.note}
                      onChange={(event) =>
                        setHandoverForm((current) => ({ ...current, note: event.target.value }))
                      }
                      placeholder="What the next staff member must know"
                    />
                  </div>
                  <Button type="submit" disabled={createHandoverMutation.isPending}>
                    <Plus className="mr-2 h-4 w-4" />
                    Save handover
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {coordinationError ? <p className="text-sm text-destructive">{coordinationError}</p> : null}

          <DataTableCard
            title="Recent messages"
            description="Recent role-based operational messages in this workspace."
            data={recentMessages}
            columns={messageColumns}
            isLoading={messagesQuery.isLoading || patientsQuery.isLoading}
            emptyText="No workflow messages found."
          />

          <DataTableCard
            title="Recent handovers"
            description="Shift handovers and continuity notes."
            data={handovers}
            columns={handoverColumns}
            isLoading={handoversQuery.isLoading || patientsQuery.isLoading}
            emptyText="No handovers recorded yet."
          />
        </div>
      ) : null}

      {activeTab === "audit" ? (
        <DataTableCard
          title="Workflow audit"
          description="Trace workflow changes across tasks, schedules, directives, handovers, and messaging."
          data={auditEvents}
          columns={auditColumns}
          isLoading={auditQuery.isLoading || patientsQuery.isLoading}
          emptyText="No workflow audit entries have been recorded yet."
          rightSlot={<History className="h-4 w-4 text-muted-foreground" />}
        />
      ) : null}

      {activeTab === "reports" ? (
        <div className="space-y-4">
          <Card className="border-border/70">
            <CardContent className="grid gap-4 p-4 lg:grid-cols-[1.1fr_0.8fr_0.8fr_auto]">
              <div className="space-y-2">
                <Label>{t("workflow.console.reports.reportTemplate")}</Label>
                <Select
                  value={reportTemplateId}
                  onValueChange={(value) => setReportTemplateId(value as ReportTemplateId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reportTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {reportTemplates.find((item) => item.id === reportTemplateId)?.description}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("workflow.console.reports.window")}</Label>
                <Select value={reportWindowHours} onValueChange={setReportWindowHours}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">{t("workflow.console.reports.window6h")}</SelectItem>
                    <SelectItem value="12">{t("workflow.console.reports.window12h")}</SelectItem>
                    <SelectItem value="24">{t("workflow.console.reports.window24h")}</SelectItem>
                    <SelectItem value="72">{t("workflow.console.reports.window72h")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("workflow.console.reports.auditDomain")}</Label>
                <Select value={auditDomain} onValueChange={setAuditDomain}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">all</SelectItem>
                    <SelectItem value="task">task</SelectItem>
                    <SelectItem value="schedule">schedule</SelectItem>
                    <SelectItem value="directive">directive</SelectItem>
                    <SelectItem value="handover">handover</SelectItem>
                    <SelectItem value="messaging">messaging</SelectItem>
                    <SelectItem value="alert">alert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadTextFile(
                      buildReportFilename(reportView.title, Number(reportWindowHours)),
                      buildReportCsv(reportView.columns, reportView.rows),
                      "text/csv",
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t("workflow.console.reports.csv")}
                </Button>
                <Button type="button" variant="outline" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t("workflow.console.reports.print")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {reportView.metrics.map((metric) => (
              <SummaryStatCard
                key={metric.label}
                icon={metric.icon}
                label={metric.label}
                value={metric.value}
                tone={metric.tone}
              />
            ))}
          </div>

          <Card className="border-border/70">
            <CardHeader className="space-y-2">
              <CardTitle className="text-base">{reportView.title}</CardTitle>
              <CardDescription>{reportView.subtitle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReportPreviewTable
                columns={reportView.columns}
                rows={reportView.rows}
                emptyText={t("workflow.console.reports.emptyTable")}
                caption={reportView.note}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Dialog
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRow(null);
            setReplyBody("");
            setDetailError(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedRow?.title ?? "Workflow item"}</DialogTitle>
            <DialogDescription>
              {selectedRow ? `${selectedRow.itemType} | ${selectedRow.patientName}` : "Workflow detail"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[72vh] space-y-5 overflow-y-auto px-6 pb-6">
            {detailQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading workflow detail...</p>
            ) : detailQuery.isError ? (
              <p className="text-sm text-destructive">{formatConsoleError(detailQuery.error, requestFailedMsg)}</p>
            ) : detailQuery.data != null &&
              detailQuery.data.item != null &&
              typeof detailQuery.data.item === "object" ? (
              <>
                <section className="grid gap-3 rounded-lg border border-border bg-muted/25 p-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                    <Badge className="mt-2" variant={statusVariant(String(detailQuery.data?.item?.status ?? selectedRow?.status ?? "open"))}>
                      {String(detailQuery.data?.item?.status ?? selectedRow?.status ?? "open")}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owner</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedRow?.ownerLabel ?? "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</p>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {selectedRow?.patientName ?? unitWide}
                    </p>
                  </div>
                </section>

                <section className="grid gap-3 md:grid-cols-2">
                  {[
                    {
                      label: "Priority",
                      value:
                        typeof detailQuery.data?.item?.priority === "string"
                          ? detailQuery.data?.item?.priority
                          : null,
                    },
                    {
                      label: "Schedule type",
                      value:
                        typeof detailQuery.data?.item?.schedule_type === "string"
                          ? detailQuery.data?.item?.schedule_type
                          : null,
                    },
                    {
                      label: "Due at",
                      value:
                        typeof detailQuery.data?.item?.due_at === "string"
                          ? formatDateTime(detailQuery.data?.item?.due_at)
                          : null,
                    },
                    {
                      label: "Starts at",
                      value:
                        typeof detailQuery.data?.item?.starts_at === "string"
                          ? formatDateTime(detailQuery.data?.item?.starts_at)
                          : null,
                    },
                    {
                      label: "Effective from",
                      value:
                        typeof detailQuery.data?.item?.effective_from === "string"
                          ? formatDateTime(detailQuery.data?.item?.effective_from)
                          : null,
                    },
                  ]
                    .filter((field) => field.value)
                    .map((field) => (
                      <div key={field.label} className="rounded-lg border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {field.label}
                        </p>
                        <p className="mt-1 text-sm text-foreground">{field.value}</p>
                      </div>
                    ))}
                </section>

                {[
                  {
                    label: "Description",
                    value:
                      typeof detailQuery.data?.item?.description === "string"
                        ? detailQuery.data?.item?.description
                        : null,
                  },
                  {
                    label: "Notes",
                    value:
                      typeof detailQuery.data?.item?.notes === "string"
                        ? detailQuery.data?.item?.notes
                        : null,
                  },
                  {
                    label: "Directive",
                    value:
                      typeof detailQuery.data?.item?.directive_text === "string"
                        ? detailQuery.data?.item?.directive_text
                        : null,
                  },
                ]
                  .filter((field) => field.value)
                  .map((field) => (
                    <section key={field.label} className="rounded-lg border border-border p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {field.label}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{field.value}</p>
                    </section>
                  ))}

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Item discussion</h3>
                    <p className="text-xs text-muted-foreground">
                      Use this thread for questions and updates tied to the selected workflow item.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(detailQuery.data?.messages ?? []).length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                        No discussion yet.
                      </p>
                    ) : (
                      (detailQuery.data?.messages ?? []).map((message) => (
                        <div key={message.id} className="rounded-lg border border-border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">
                              {message.sender_person?.display_name || `User #${message.sender_user_id}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatRelativeTime(message.created_at)}
                            </p>
                          </div>
                          {message.subject ? (
                            <p className="mt-2 text-xs font-semibold text-muted-foreground">
                              {message.subject}
                            </p>
                          ) : null}
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      sendThreadMessageMutation.mutate();
                    }}
                  >
                    <Label htmlFor="workflow-thread-reply">Reply</Label>
                    <Textarea
                      id="workflow-thread-reply"
                      rows={3}
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      placeholder="Ask a question or send an update"
                    />
                    {detailError ? <p className="text-sm text-destructive">{detailError}</p> : null}
                    <Button type="submit" disabled={!replyBody.trim() || sendThreadMessageMutation.isPending}>
                      <Send className="mr-2 h-4 w-4" />
                      Send reply
                    </Button>
                  </form>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Audit</h3>
                  {(detailQuery.data?.audit ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No item audit entries yet.</p>
                  ) : (
                    (detailQuery.data?.audit ?? []).map((event) => (
                      <div key={event.id} className="rounded-lg border border-border p-3 text-sm">
                        <p className="font-medium text-foreground">{event.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.entity_type} | {formatRelativeTime(event.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </section>
              </>
            ) : detailQuery.data ? (
              <p className="text-sm text-muted-foreground">
                Workflow detail response did not include an item payload.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTransferDialog(null);
            setTransferNote("");
            setCoordinationError(null);
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {transferDialog?.mode === "claim" ? "Claim workflow item" : "Handoff workflow item"}
            </DialogTitle>
            <DialogDescription>
              {transferDialog ? `${transferDialog.row.title} | ${transferDialog.row.patientName}` : "Transfer workflow item"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {transferDialog?.mode === "handoff" ? (
              <>
                <div className="space-y-2">
                  <Label>Target mode</Label>
                  <Select
                    value={transferTargetMode}
                    onValueChange={(value) => setTransferTargetMode(value as AssignmentMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="role">role</SelectItem>
                      <SelectItem value="person">person</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {transferTargetMode === "role" ? (
                  <div className="space-y-2">
                    <Label>Target role</Label>
                    <Select value={transferTargetRole} onValueChange={setTransferTargetRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Target person</Label>
                    <Select value={transferTargetUserId} onValueChange={setTransferTargetUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a user" />
                      </SelectTrigger>
                      <SelectContent>
                        {userOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            ) : null}

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                rows={4}
                value={transferNote}
                onChange={(event) => setTransferNote(event.target.value)}
                placeholder={
                  transferDialog?.mode === "claim"
                    ? "Optional ownership note"
                    : "Context for the receiving team or person"
                }
              />
            </div>

            {coordinationError ? <p className="text-sm text-destructive">{coordinationError}</p> : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTransferDialog(null);
                  setTransferNote("");
                  setCoordinationError(null);
                }}
              >
                Cancel
              </Button>
              {transferDialog?.mode === "claim" ? (
                <Button
                  type="button"
                  disabled={claimMutation.isPending}
                  onClick={() => {
                    if (!transferDialog) return;
                    setCoordinationError(null);
                    claimMutation.mutate({ row: transferDialog.row, note: transferNote.trim() });
                  }}
                >
                  Claim item
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={
                    handoffMutation.isPending
                    || (transferTargetMode === "person" && transferTargetUserId === EMPTY_SELECT)
                  }
                  onClick={() => {
                    if (!transferDialog) return;
                    setCoordinationError(null);
                    handoffMutation.mutate({
                      row: transferDialog.row,
                      note: transferNote.trim(),
                      targetMode: transferTargetMode,
                      targetRole: transferTargetRole,
                      targetUserId: transferTargetUserId,
                    });
                  }}
                >
                  Handoff item
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
