"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Fan,
  Gauge,
  HeartPulse,
  HelpCircle,
  House,
  Lightbulb,
  ListChecks,
  Power,
  Siren,
  Smartphone,
  Snowflake,
  Table2,
  Tv,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MovementTimelineCard } from "@/components/timeline/MovementTimelineCard";
import { formatDateTime } from "@/lib/datetime";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import type { SmartDevice } from "@/lib/types";

type JsonRecord = Record<string, unknown>;
const TechnicalDetails = createContext(false);

export type EaseAIBackendCard = JsonRecord;

type Choice = {
  key: string;
  label: string;
  reply: string;
  description?: string;
  recommended?: boolean;
};

type Column = {
  key: string;
  label: string;
};

export type EaseAIResponseCardsProps = {
  cards: EaseAIBackendCard[];
  onQuestionChoice?: (reply: string) => void;
  onNavigate?: (href: string) => void;
  showTechnicalDetails?: boolean;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cardType(card: EaseAIBackendCard): string {
  return (
    asString(card.type) ||
    asString(card.card_type) ||
    asString(card.kind) ||
    asString(card.name) ||
    "tool_result"
  )
    .trim()
    .toLowerCase();
}

function cardPayload(card: EaseAIBackendCard): JsonRecord {
  return asRecord(card.payload) ?? asRecord(card.data) ?? asRecord(card.result) ?? card;
}

function nestedPayload(card: EaseAIBackendCard, keys: string[]): JsonRecord {
  const payload = cardPayload(card);
  for (const key of keys) {
    const nested = asRecord(payload[key]);
    if (nested) return nested;
  }
  return payload;
}

function firstRecord(...values: unknown[]): JsonRecord | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function titleFor(card: EaseAIBackendCard, fallback: string): string {
  const payload = cardPayload(card);
  return asString(card.title) || asString(payload.title) || asString(payload.heading) || fallback;
}

function provenanceItems(card: EaseAIBackendCard): string[] {
  const payload = cardPayload(card);
  const raw = [
    ...asArray(card.provenance),
    ...asArray(payload.provenance),
    card.source,
    payload.source,
    card.tool_name,
    payload.tool_name,
    card.generated_at,
    payload.generated_at,
  ];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      const record = asRecord(item);
      if (!record) return "";
      return asString(record.label) || asString(record.source) || asString(record.tool_name) || asString(record.name);
    })
    .filter((item, index, all) => item.trim() && all.indexOf(item) === index);
}

function CardShell({
  icon,
  title,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-outline-variant/25 bg-surface-container-low/45 p-3", className)}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h4 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function Provenance({ items }: { items: string[] }) {
  const showTechnicalDetails = useContext(TechnicalDetails);
  if (!showTechnicalDetails) return null;
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.slice(0, 4).map((item) => (
        <Badge key={item} variant="outline" className="rounded-full px-2 py-0 text-[10px] font-medium">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function TimelineCard({ card }: { card: EaseAIBackendCard }) {
  const showTechnicalDetails = useContext(TechnicalDetails);
  const payload = cardPayload(card);
  const events = (
    asArray(payload.events).length > 0
      ? asArray(payload.events)
      : asArray(card.events).length > 0
        ? asArray(card.events)
        : asArray(payload.timeline)
  )
    .map((item) => asRecord(item))
    .filter(Boolean) as JsonRecord[];

  return (
    <div className="space-y-2">
      <MovementTimelineCard
        events={events}
        roomLabel={asString(payload.room_name) || asString(payload.roomLabel) || asString(card.room_name)}
        limit={asNumber(payload.limit) ?? 5}
        showTechnicalDetails={showTechnicalDetails}
        compact
        embedded
      />
      <Provenance items={provenanceItems(card)} />
    </div>
  );
}

function metricText(metric: unknown): string {
  const record = asRecord(metric);
  if (!record) return "";
  const value = record.value;
  const unit = asString(record.unit);
  if (value == null || value === "") return "";
  return `${String(value)}${unit ? ` ${unit}` : ""}`;
}

function PatientHealthAnalysisCard({ card }: { card: EaseAIBackendCard }) {
  const { t } = useTranslation();
  const payload = nestedPayload(card, ["health", "health_analysis", "patient_health_analysis", "analysis"]);
  const baseline = asRecord(payload.baseline) ?? {};
  const riskLevel = asString(payload.risk_level) || asString(payload.riskLevel) || "unknown";
  const score = asNumber(payload.overall_score ?? payload.score);
  const riskFactors = asArray(payload.risk_factors).map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];
  const recommendations = asArray(payload.recommendations).map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];

  return (
    <CardShell icon={<HeartPulse className="h-4 w-4" />} title={titleFor(card, t("ai.card.healthAnalysis"))}>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-surface px-3 py-2">
          <p className="text-muted-foreground">{t("ai.card.risk")}</p>
          <p className="mt-0.5 font-semibold capitalize text-foreground">{riskLevel.replace(/_/g, " ")}</p>
        </div>
        <div className="rounded-lg bg-surface px-3 py-2">
          <p className="text-muted-foreground">{t("ai.card.score")}</p>
          <p className="mt-0.5 font-semibold text-foreground">{score != null ? `${score}/100` : t("ai.card.notReported")}</p>
        </div>
        <div className="rounded-lg bg-surface px-3 py-2">
          <p className="text-muted-foreground">{t("ai.card.baselineHr")}</p>
          <p className="mt-0.5 font-semibold text-foreground">{metricText(baseline.heart_rate_bpm) || t("ai.card.notReported")}</p>
        </div>
        <div className="rounded-lg bg-surface px-3 py-2">
          <p className="text-muted-foreground">{t("ai.card.baselineSpo2")}</p>
          <p className="mt-0.5 font-semibold text-foreground">{metricText(baseline.spo2) || t("ai.card.notReported")}</p>
        </div>
      </div>
      {asString(payload.trend_summary) ? (
        <p className="mt-2 text-xs text-muted-foreground">{asString(payload.trend_summary)}</p>
      ) : null}
      {riskFactors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-foreground">
          {riskFactors.slice(0, 3).map((factor, index) => (
            <li key={`${asString(factor.label)}-${index}`} className="rounded-lg bg-surface px-2 py-1">
              <span className="font-medium">{asString(factor.label) || "Risk factor"}</span>
              {asString(factor.evidence) ? <span className="text-muted-foreground"> - {asString(factor.evidence)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {recommendations.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {recommendations.slice(0, 3).map((item, index) => (
            <Badge key={`${asString(item.title)}-${index}`} variant="secondary" className="max-w-full truncate rounded-full">
              {asString(item.title) || asString(item.suggested_action) || "Recommendation"}
            </Badge>
          ))}
        </div>
      ) : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function TaskDraftCard({ card }: { card: EaseAIBackendCard }) {
  const payload = nestedPayload(card, ["task", "draft"]);
  const taskTitle = asString(payload.title) || asString(payload.task_title) || titleFor(card, "Task Draft");
  const rows = [
    ["Patient", asString(payload.patient_name) || (payload.patient_id != null ? `Patient #${String(payload.patient_id)}` : "Not linked")],
    ["Due", payload.due_at ? formatDateTime(asString(payload.due_at)) : asString(payload.due) || "No deadline"],
    ["Assigned", asString(payload.assignee) || (payload.assign_to_self ? "You" : asString(payload.assigned_role)) || (payload.assigned_user_id != null ? `User #${String(payload.assigned_user_id)}` : "Unassigned")],
  ];

  return (
    <CardShell icon={<ClipboardCheck className="h-4 w-4" />} title={taskTitle}>
      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {asString(payload.description) && payload.description !== taskTitle ? <p className="mt-2 text-xs text-muted-foreground">{asString(payload.description)}</p> : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function normalizeChoices(card: EaseAIBackendCard): Choice[] {
  const payload = cardPayload(card);
  const rawChoices = asArray(payload.choices).length > 0 ? asArray(payload.choices) : asArray(payload.options);
  return rawChoices
    .map((item, index): Choice | null => {
      if (typeof item === "string") {
        return { key: `${index}-${item}`, label: item, reply: item };
      }
      const record = asRecord(item);
      if (!record) return null;
      const label = asString(record.label) || asString(record.text) || asString(record.title) || asString(record.value);
      const reply =
        asString(record.reply) ||
        asString(record.message) ||
        asString(record.complete_reply) ||
        asString(record.value) ||
        label;
      if (!label || !reply) return null;
      return {
        key: asString(record.id) || `${index}-${label}`,
        label,
        reply,
        description: asString(record.description) || asString(record.subtitle) || undefined,
        recommended: record.recommended === true,
      };
    })
    .filter(Boolean) as Choice[];
}

function QuestionChoicesCard({
  card,
  onQuestionChoice,
}: {
  card: EaseAIBackendCard;
  onQuestionChoice?: (reply: string) => void;
}) {
  const choices = normalizeChoices(card);
  const payload = cardPayload(card);
  const [customReply, setCustomReply] = useState("");
  const sections = asArray(payload.sections).map(asRecord).filter(Boolean) as JsonRecord[];
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [customs, setCustoms] = useState<Record<string, string>>({});

  function buildCustomReply(value: string): string {
    const template = asString(payload.custom_reply_template);
    if (template) return template.split("{input}").join(value);
    const prefix = asString(payload.custom_reply_prefix);
    return prefix ? `${prefix}${value}` : value;
  }

  if (sections.length > 0) {
    const sectionValue = (field: string) => picked[field] || customs[field]?.trim() || "";
    const allAnswered = sections.every(
      (section, index) => sectionValue(asString(section.field) || `s${index}`) !== "",
    );
    return (
      <CardShell icon={<HelpCircle className="h-4 w-4" />} title={titleFor(card, "Choose a Reply")}>
        {asString(payload.question) ? (
          <p className="mb-2 text-xs text-muted-foreground">{asString(payload.question)}</p>
        ) : null}
        <div className="space-y-3">
          {sections.map((section, index) => {
            const field = asString(section.field) || `s${index}`;
            const sectionChoices = normalizeChoices(section as EaseAIBackendCard);
            const selected = picked[field] || "";
            const customValue = customs[field] || "";
            return (
              <div key={field}>
                <p className="mb-1 text-xs font-medium text-foreground">{asString(section.question)}</p>
                {sectionChoices.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {sectionChoices.map((choice) => (
                      <Button
                        key={choice.key}
                        type="button"
                        size="sm"
                        variant={selected === choice.reply ? "default" : "outline"}
                        className="h-auto px-3 py-1.5"
                        onClick={() =>
                          setPicked((prev) => ({
                            ...prev,
                            [field]: prev[field] === choice.reply ? "" : choice.reply,
                          }))
                        }
                        disabled={!onQuestionChoice}
                      >
                        {choice.label}
                      </Button>
                    ))}
                  </div>
                ) : null}
                {section.allow_custom !== false ? (
                  <Input
                    className="mt-1.5"
                    aria-label={asString(section.question) || field}
                    value={customValue}
                    onChange={(event) =>
                      setCustoms((prev) => ({ ...prev, [field]: event.target.value }))
                    }
                    placeholder={asString(section.custom_placeholder) || "Type an answer…"}
                    disabled={!onQuestionChoice}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3 w-full"
          disabled={!onQuestionChoice || !allAnswered}
          onClick={() => {
            const parts = sections.map((section, index) => {
              const field = asString(section.field) || `s${index}`;
              return `${asString(section.reply_prefix)}${sectionValue(field)}`;
            });
            onQuestionChoice?.(parts.join(" · "));
          }}
        >
          Send
        </Button>
        <Provenance items={provenanceItems(card)} />
      </CardShell>
    );
  }

  return (
    <CardShell icon={<HelpCircle className="h-4 w-4" />} title={titleFor(card, "Choose a Reply")}>
      {asString(payload.question) || asString(payload.prompt) ? (
        <p className="mb-2 text-xs text-muted-foreground">{asString(payload.question) || asString(payload.prompt)}</p>
      ) : null}
      <div className="grid gap-2">
        {choices.map((choice) => (
          <Button
            key={choice.key}
            type="button"
            variant="outline"
            className="h-auto flex-col items-start px-3 py-2 text-left"
            onClick={() => onQuestionChoice?.(choice.reply)}
            disabled={!onQuestionChoice}
          >
            <span className="flex items-center gap-2 font-medium text-foreground">
              {choice.label}
              {choice.recommended ? (
                <Badge variant="warning" className="rounded-full px-2 py-0 text-[10px]">
                  Recommended
                </Badge>
              ) : null}
            </span>
            {choice.description ? <span className="mt-0.5 block text-muted-foreground">{choice.description}</span> : null}
          </Button>
        ))}
      </div>
      {payload.allow_custom !== false ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const reply = customReply.trim();
            if (reply) onQuestionChoice?.(buildCustomReply(reply));
          }}
        >
          <Input
            className="min-w-0 flex-1"
            aria-label="Your answer"
            value={customReply}
            onChange={(event) => setCustomReply(event.target.value)}
            placeholder={asString(payload.custom_placeholder) || "Type your own details..."}
            disabled={!onQuestionChoice}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!onQuestionChoice || !customReply.trim()}
          >
            Send
          </Button>
        </form>
      ) : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function PlanSummaryCard({ card }: { card: EaseAIBackendCard }) {
  const payload = cardPayload(card);
  const plan = asRecord(payload.execution_plan) ?? asRecord(payload.plan) ?? payload;
  const steps = asArray(plan.steps).map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];

  return (
    <CardShell icon={<ListChecks className="h-4 w-4" />} title={titleFor(card, "Plan Summary")}>
      {asString(plan.summary) ? <p className="text-xs text-foreground">{asString(plan.summary)}</p> : null}
      {steps.length > 0 ? (
        <ol className="mt-2 space-y-1 text-xs">
          {steps.slice(0, 6).map((step, index) => (
            <li key={`${asString(step.id)}-${index}`} className="rounded-lg bg-surface px-2 py-1">
              <span className="font-medium text-foreground">{index + 1}. {asString(step.title) || asString(step.intent) || "Step"}</span>
              {asString(step.tool_name) ? <span className="text-muted-foreground"> - {asString(step.tool_name)}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function formatDatePart(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "Not set";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatTimePart(value: unknown): string {
  const raw = asString(value);
  if (!raw) return "Not set";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function TaskSuccessCard({ card }: { card: EaseAIBackendCard }) {
  const { t } = useTranslation();
  const payload = cardPayload(card);
  const result = asRecord(payload.task) ?? payload;
  const dueAt = result.due_at;
  const assignedTo =
    asString(result.assigned_role) ||
    (result.assigned_user_id != null ? `User #${String(result.assigned_user_id)}` : "") ||
    "Unassigned";
  const rows = [
    ["Task", asString(result.title) || `Task #${String(result.id ?? "")}`],
    ["Patient", asString(result.patient_name) || (result.patient_id != null ? `Patient #${String(result.patient_id)}` : "Not linked")],
    ["Date", formatDatePart(dueAt)],
    ["Time", formatTimePart(dueAt)],
    ["Assigned to", assignedTo],
  ];

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/85 p-3 text-emerald-950">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <p className="font-semibold text-emerald-700">{titleFor(card, "Task created successfully")}</p>
      </div>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-emerald-900/70">{label}</dt>
            <dd className="min-w-0 font-medium text-emerald-950">{value || "Not set"}</dd>
          </div>
        ))}
        <div className="contents">
          <dt className="text-success-foreground/80">{t("workflow.console.field.status")}</dt>
          <dd>
            <Badge variant="warning" className="rounded-full px-2 py-0 text-[11px]">
              {asString(result.status) || "pending"}
            </Badge>
          </dd>
        </div>
      </dl>
      <Provenance items={provenanceItems(card)} />
    </section>
  );
}

function normalizeColumns(rows: JsonRecord[], rawColumns: unknown[]): Column[] {
  const parsed = rawColumns
    .map((item): Column | null => {
      if (typeof item === "string") return { key: item, label: item.replace(/_/g, " ") };
      const record = asRecord(item);
      if (!record) return null;
      const key = asString(record.key) || asString(record.id) || asString(record.accessor);
      if (!key) return null;
      return { key, label: asString(record.label) || asString(record.title) || key.replace(/_/g, " ") };
    })
    .filter(Boolean) as Column[];
  if (parsed.length > 0) return parsed;
  const keys = new Set<string>();
  rows.slice(0, 5).forEach((row) => Object.keys(row).forEach((key) => keys.add(key)));
  // Prefer human-readable room_name over raw room_id
  if (keys.has("room_name")) keys.delete("room_id");
  return [...keys].map((key) => ({ key, label: key.replace(/_/g, " ") }));
}

function DataTableCard({ card }: { card: EaseAIBackendCard }) {
  const { t } = useTranslation();
  const [visibleRows, setVisibleRows] = useState(8);
  const payload = cardPayload(card);
  const rawColumns = asArray(payload.columns);
  const rawRows = asArray(payload.rows).length > 0 ? asArray(payload.rows) : asArray(payload.data);
  const rows = rawRows
    .map((item) => {
      const record = asRecord(item);
      if (record) return record;
      if (!Array.isArray(item)) return null;
      const row: JsonRecord = {};
      item.forEach((value, index) => {
        const column = rawColumns[index];
        const columnRecord = asRecord(column);
        const key = typeof column === "string" ? column : asString(columnRecord?.key) || asString(columnRecord?.id) || `column_${index + 1}`;
        row[key] = value;
      });
      return row;
    })
    .filter(Boolean) as JsonRecord[];
  const columns = normalizeColumns(rows, rawColumns);

  return (
    <CardShell icon={<Table2 className="h-4 w-4" />} title={titleFor(card, t("ai.card.dataTable"))}>
      {rows.length === 0 || columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ai.card.noRows")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-outline-variant/20 text-muted-foreground">
                {columns.slice(0, 6).map((column) => (
                  <th key={column.key} className="whitespace-nowrap px-2 py-1 font-medium capitalize">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, visibleRows).map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-outline-variant/10 last:border-b-0">
                  {columns.slice(0, 6).map((column) => (
                    <td key={column.key} className="max-w-40 truncate px-2 py-1 text-foreground">
                      {column.key === "due_at"
                        ? row.due_at
                          ? formatDateTime(String(row.due_at))
                          : t("tasks.noDeadline")
                        : String(row[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 8 || (asNumber(payload.total_count) ?? 0) > rows.length ? (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{Math.min(visibleRows, rows.length)} / {asNumber(payload.total_count) ?? rows.length}</span>
          {visibleRows < rows.length ? <Button variant="ghost" size="sm" onClick={() => setVisibleRows((count) => count + 8)}>{t("nav.showMore")}</Button> : null}
        </div>
      ) : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function PatientSummaryCard({ card }: { card: EaseAIBackendCard }) {
  const { t } = useTranslation();
  const payload = nestedPayload(card, ["patient", "profile", "summary"]);
  const name =
    asString(payload.patient_name) ||
    [asString(payload.first_name), asString(payload.last_name)].filter(Boolean).join(" ") ||
    (payload.patient_id != null ? `Patient #${String(payload.patient_id)}` : "Patient summary");
  const rows = [
    ["Room", asString(payload.room_name) || (payload.room_id != null ? `Room ${String(payload.room_id)}` : "")],
    ["Risk", asString(payload.risk_level) || asString(payload.risk)],
    ["Status", asString(payload.status) || asString(payload.care_status)],
    ["Care level", asString(payload.care_level)],
    ["Conditions", asArray(payload.medical_conditions).map((item) => asString(asRecord(item)?.condition) || asString(item)).filter(Boolean).join(", ")],
    ["Allergies", asArray(payload.allergies).map(asString).filter(Boolean).join(", ")],
    ["Updated", asString(payload.updated_at) ? formatDateTime(asString(payload.updated_at)) : ""],
  ].filter(([, value]) => value);

  return (
    <CardShell icon={<UserRound className="h-4 w-4" />} title={name}>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("ai.card.noPatientFields")}</p>
      )}
      {asString(payload.summary) ? <p className="mt-2 text-xs text-muted-foreground">{asString(payload.summary)}</p> : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function displayValue(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function ProfileSummaryCard({ card }: { card: EaseAIBackendCard }) {
  const { t } = useTranslation();
  const payload = nestedPayload(card, ["profile", "patient", "staff", "person", "summary"]);
  const name =
    asString(payload.display_name) ||
    asString(payload.name) ||
    asString(payload.patient_name) ||
    asString(payload.staff_name) ||
    [asString(payload.first_name), asString(payload.last_name)].filter(Boolean).join(" ") ||
    "Profile summary";
  const rows = [
    ["Role", asString(payload.role) || asString(payload.person_type)],
    ["Status", asString(payload.status) || asString(payload.care_level)],
    ["Room", asString(payload.room_name) || (payload.room_id != null ? `Room ${String(payload.room_id)}` : "")],
    ["Phone", asString(payload.phone)],
    ["Email", asString(payload.email)],
    ["Updated", asString(payload.updated_at) ? formatDateTime(asString(payload.updated_at)) : ""],
  ].filter(([, value]) => value);

  return (
    <CardShell icon={<UserRound className="h-4 w-4" />} title={titleFor(card, name)}>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("ai.card.noProfileFields")}</p>
      )}
      {asString(payload.summary) ? <p className="mt-2 text-xs text-muted-foreground">{asString(payload.summary)}</p> : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function StaffSummaryCard({ card }: { card: EaseAIBackendCard }) {
  const payload = nestedPayload(card, ["staff", "caregiver", "profile", "summary"]);
  const name =
    asString(payload.staff_name) ||
    asString(payload.caregiver_name) ||
    asString(payload.display_name) ||
    [asString(payload.first_name), asString(payload.last_name)].filter(Boolean).join(" ") ||
    (payload.caregiver_id != null ? `Staff #${String(payload.caregiver_id)}` : "Staff summary");
  const rows = [
    ["Role", asString(payload.role)],
    ["Status", asString(payload.status) || asString(payload.is_active)],
    ["Department", asString(payload.department)],
    ["Specialty", asString(payload.specialty)],
    ["Phone", asString(payload.phone)],
    ["Email", asString(payload.email)],
    ["Tasks", displayValue(payload.open_tasks ?? payload.task_count)],
    ["Schedules", displayValue(payload.upcoming_schedules ?? payload.schedule_count)],
    ["Updated", asString(payload.updated_at) ? formatDateTime(asString(payload.updated_at)) : ""],
  ].filter(([, value]) => value);

  return (
    <CardShell icon={<ClipboardCheck className="h-4 w-4" />} title={titleFor(card, name)}>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 truncate font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {asString(payload.summary) ? <p className="mt-2 text-xs text-muted-foreground">{asString(payload.summary)}</p> : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function StaffTimelineResponseCard({ card }: { card: EaseAIBackendCard }) {
  const { t } = useTranslation();
  const payload = nestedPayload(card, ["timeline", "staff_timeline"]);
  const events = (
    asArray(payload.items).length > 0
      ? asArray(payload.items)
      : asArray(payload.events).length > 0
        ? asArray(payload.events)
        : asArray(payload.timeline)
  )
    .map((item) => asRecord(item))
    .filter(Boolean) as JsonRecord[];

  return (
    <CardShell icon={<CalendarClock className="h-4 w-4" />} title={titleFor(card, t("ai.card.staffTimeline"))}>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ai.card.noStaffEvents")}</p>
      ) : (
        <ol className="space-y-2 text-xs">
          {events.slice(0, 6).map((event, index) => {
            const when =
              asString(event.due_at) ||
              asString(event.starts_at) ||
              asString(event.timestamp) ||
              asString(event.time);
            return (
              <li key={`${asString(event.id)}-${index}`} className="rounded-lg bg-surface px-2 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {asString(event.title) || asString(event.label) || asString(event.kind) || "Timeline item"}
                  </span>
                  {asString(event.status) ? (
                    <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] capitalize">
                      {asString(event.status)}
                    </Badge>
                  ) : null}
                </div>
                {when ? <p className="mt-1 text-muted-foreground">{formatDateTime(when)}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function SensorStatusCard({ card }: { card: EaseAIBackendCard }) {
  const payload = nestedPayload(card, ["sensor_status", "sensors", "devices"]);
  const rawDevices =
    asArray(payload.devices).length > 0
      ? asArray(payload.devices)
      : asArray(payload.sensors).length > 0
        ? asArray(payload.sensors)
        : asArray(payload.items).length > 0
          ? asArray(payload.items)
          : [payload];
  const devices = rawDevices.map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];

  return (
    <CardShell icon={<Smartphone className="h-4 w-4" />} title={titleFor(card, "Sensor Status")}>
      <div className="space-y-2">
        {devices.slice(0, 5).map((device, index) => {
          const status = asString(device.status) || asString(device.freshness) || (device.online === true ? "online" : device.online === false ? "offline" : "");
          const battery = displayValue(device.battery_pct ?? device.battery ?? device.sensor_battery);
          const lastSeen = asString(device.last_seen) || asString(device.lastTelemetryAt) || asString(device.timestamp);
          return (
            <div key={`${asString(device.device_id)}-${index}`} className="rounded-lg bg-surface px-2 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {asString(device.display_name) || asString(device.device_id) || asString(device.name) || "Device"}
                </span>
                {status ? (
                  <Badge variant={status === "online" || status === "fresh" ? "success" : "warning"} className="rounded-full px-2 py-0 text-[10px] capitalize">
                    {status}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-muted-foreground">
                {[battery ? `Battery ${battery}%` : "", lastSeen ? `Last seen ${formatDateTime(lastSeen)}` : ""].filter(Boolean).join(" - ")}
              </p>
            </div>
          );
        })}
      </div>
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function HealthTrendChartCard({ card }: { card: EaseAIBackendCard }) {
  const { t } = useTranslation();
  const payload = nestedPayload(card, ["health_trend_chart", "trend", "chart"]);
  const points = (
    asArray(payload.points).length > 0
      ? asArray(payload.points)
      : asArray(payload.series).length > 0
        ? asArray(payload.series)
        : asArray(payload.data)
  )
    .map((item) => asRecord(item))
    .filter(Boolean) as JsonRecord[];
  const latest = points[points.length - 1] ?? firstRecord(payload.latest, payload.summary) ?? {};
  const rows = [
    ["Heart rate", displayValue(latest.heart_rate_bpm ?? latest.hr)],
    ["SpO2", displayValue(latest.spo2)],
    ["Calories", displayValue(latest.calories_kcal ?? latest.calories)],
    ["Distance", displayValue(latest.distance_m ?? latest.distance)],
  ].filter(([, value]) => value);

  return (
    <CardShell icon={<BarChart3 className="h-4 w-4" />} title={titleFor(card, t("ai.card.healthTrend"))}>
      {points.length > 0 ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />
          {points.length} points
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface px-2 py-2">
              <p className="text-muted-foreground">{label}</p>
              <p className="font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("ai.card.noTrendValues")}</p>
      )}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function ToolResultCard({ card }: { card: EaseAIBackendCard }) {
  const payload = cardPayload(card);
  const toolName = asString(card.tool_name) || asString(payload.tool_name) || asString(payload.name) || "Tool result";
  const status = asString(payload.status) || asString(card.status) || (payload.error ? "error" : "ok");
  const summary = asString(payload.summary) || asString(payload.message) || asString(card.summary);

  return (
    <CardShell icon={<Wrench className="h-4 w-4" />} title={titleFor(card, toolName)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status === "error" ? "destructive" : "outline"} className="rounded-full capitalize">
          {status}
        </Badge>
        {toolName ? <code className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">{toolName}</code> : null}
      </div>
      {summary ? <p className="mt-2 text-xs text-foreground">{summary}</p> : null}
      {payload.error ? <p className="mt-2 text-xs text-critical">{String(payload.error)}</p> : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function NavigationCard({ card, onNavigate }: { card: EaseAIBackendCard; onNavigate?: (href: string) => void }) {
  const payload = cardPayload(card);
  const href = asString(card.href) || asString(payload.href);
  const description = asString(card.description) || asString(payload.description) || asString(card.summary);

  return (
    <CardShell icon={<ArrowRight className="h-4 w-4" />} title={titleFor(card, "Open page")}>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {href ? (
        <button
          type="button"
          onClick={() => onNavigate?.(href)}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

type LayoutRoom = { room_id: number | null; label: string; x: number; y: number; w: number; h: number };

function normalizeLayoutRooms(card: JsonRecord): LayoutRoom[] {
  const payload = cardPayload(card);
  const source =
    asArray(payload.layout_rooms).length > 0 ? asArray(payload.layout_rooms) : asArray(card.layout_rooms);
  return source
    .map((item): LayoutRoom | null => {
      const record = asRecord(item);
      if (!record) return null;
      const x = asNumber(record.x);
      const y = asNumber(record.y);
      const w = asNumber(record.w);
      const h = asNumber(record.h);
      if (x == null || y == null || w == null || h == null) return null;
      return {
        room_id: asNumber(record.room_id),
        label: asString(record.label) || asString(record.name),
        x,
        y,
        w,
        h,
      };
    })
    .filter(Boolean) as LayoutRoom[];
}

function FloorplanSvg({
  layoutRooms,
  roomState,
}: {
  layoutRooms: LayoutRoom[];
  roomState?: (roomId: number | null) => "critical" | "occupied" | "normal" | "none";
}) {
  const pad = 2;
  const maxX = Math.max(...layoutRooms.map((r) => r.x + r.w));
  const maxY = Math.max(...layoutRooms.map((r) => r.y + r.h));
  const tones = {
    critical: { fill: "rgba(220,38,38,0.18)", stroke: "#dc2626" },
    occupied: { fill: "rgba(16,185,129,0.30)", stroke: "#059669" },
    normal: { fill: "rgba(16,185,129,0.08)", stroke: "#10b981" },
    none: { fill: "rgba(148,163,184,0.10)", stroke: "#94a3b8" },
  } as const;
  return (
    <svg
      viewBox={`0 0 ${maxX + pad} ${maxY + pad}`}
      role="img"
      aria-label="Floor plan"
      className="mt-1.5 w-full rounded-md border border-outline-variant/15 bg-surface"
    >
      {layoutRooms.map((room, index) => {
        const state = roomState?.(room.room_id) ?? "none";
        const tone = tones[state];
        const fontSize = Math.min(3.2, room.h * 0.28);
        return (
          <g key={`${room.room_id ?? room.label}-${index}`}>
            <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1.2} fill={tone.fill} stroke={tone.stroke} strokeWidth={0.7} />
            <text
              x={room.x + room.w / 2}
              y={room.y + room.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fill="currentColor"
              className="text-foreground"
            >
              {room.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function FloorplanMapCard({ card }: { card: EaseAIBackendCard }) {
  const layoutRooms = normalizeLayoutRooms(card);
  return (
    <CardShell icon={<House className="h-4 w-4" />} title={titleFor(card, "Floor plan")}>
      {layoutRooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No layout rooms.</p>
      ) : (
        <FloorplanSvg layoutRooms={layoutRooms} />
      )}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function smartDeviceIcon(device: JsonRecord) {
  const name = asString(device.name).toLowerCase();
  const dtype = asString(device.device_type).toLowerCase();
  if (name.includes("tv") || name.includes("television")) return Tv;
  if (name.includes("alarm") || name.includes("siren") || name.includes("bell")) return BellRing;
  if (dtype === "light") return Lightbulb;
  if (dtype === "climate" || dtype === "ac") return Snowflake;
  if (dtype === "fan") return Fan;
  return Power;
}

const CHAT_DEVICE_OFF_STATES = new Set(["off", "unknown", "unavailable", "standby", "none", ""]);

function deviceStateIsOn(state: unknown): boolean {
  return !CHAT_DEVICE_OFF_STATES.has(String(state ?? "").trim().toLowerCase());
}

type DeviceControlOverride = { state: string; on: boolean; pending: boolean; error: boolean };

/**
 * Direct smart-device toggles from chat cards. Card buttons behave like the
 * Smart Home dashboard's manual toggles (POST /api/ha/devices/{id}/control),
 * which drives the physical relays and keeps room screens in sync — the same
 * endpoint the REST UI uses, so no extra confirmation round-trip is needed.
 */
function useDirectDeviceControl() {
  const queryClient = useQueryClient();
  const [overrides, setOverrides] = useState<Record<number, DeviceControlOverride>>({});

  const toggle = useCallback(
    async (deviceId: number, currentlyOn: boolean) => {
      setOverrides((prev) => ({
        ...prev,
        [deviceId]: {
          state: prev[deviceId]?.state ?? (currentlyOn ? "on" : "off"),
          on: currentlyOn,
          pending: true,
          error: false,
        },
      }));
      try {
        const res = await api.post<{ data?: { state?: string } }>(
          `/ha/devices/${deviceId}/control`,
          { action: currentlyOn ? "turn_off" : "turn_on" },
        );
        const nextState = res?.data?.state ?? (currentlyOn ? "off" : "on");
        setOverrides((prev) => ({
          ...prev,
          [deviceId]: { state: nextState, on: deviceStateIsOn(nextState), pending: false, error: false },
        }));
        void queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey.some(
              (key) => typeof key === "string" && (key.includes("smart-devices") || key === "ha"),
            ),
        });
      } catch {
        setOverrides((prev) => ({
          ...prev,
          [deviceId]: {
            ...(prev[deviceId] ?? { state: "", on: currentlyOn }),
            pending: false,
            error: true,
          },
        }));
      }
    },
    [queryClient],
  );

  return { overrides, toggle };
}

type DirectDeviceControl = ReturnType<typeof useDirectDeviceControl>;

function SmartDeviceControlRow({
  device,
  control,
  onQuestionChoice,
}: {
  device: JsonRecord;
  control: DirectDeviceControl;
  onQuestionChoice?: (reply: string) => void;
}) {
  const Icon = smartDeviceIcon(device);
  const deviceId = asNumber(device.id);
  const deviceName = asString(device.name) || "Device";
  const override = deviceId != null ? control.overrides[deviceId] : undefined;
  const state = override?.state ?? (asString(device.state) || (device.on === true ? "on" : "off"));
  const isOn = override ? override.on : device.on === true || deviceStateIsOn(state);
  const pending = override?.pending === true;
  const errored = override?.error === true;
  const controllable = device.is_active !== false;

  return (
    <li className="flex items-center gap-1.5 text-[11px]">
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", isOn ? "text-emerald-600" : "text-muted-foreground")}
      />
      <span className="min-w-0 flex-1 truncate text-foreground">{deviceName}</span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0 text-[10px] font-medium",
          errored
            ? "bg-critical/15 text-critical"
            : isOn
              ? "bg-emerald-500/15 text-emerald-700"
              : "bg-muted text-muted-foreground",
        )}
      >
        {errored ? "failed" : pending ? "…" : state || (isOn ? "on" : "off")}
      </span>
      <button
        type="button"
        disabled={!controllable || pending || (deviceId == null && !onQuestionChoice)}
        onClick={() => {
          if (deviceId != null) {
            void control.toggle(deviceId, isOn);
          } else {
            onQuestionChoice?.(`Turn ${isOn ? "off" : "on"} ${deviceName}`);
          }
        }}
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-smooth",
          isOn
            ? "bg-surface-container-high text-foreground hover:bg-surface-container-highest"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          (!controllable || pending) && "cursor-not-allowed opacity-50",
        )}
      >
        {pending ? "…" : isOn ? "Turn off" : "Turn on"}
      </button>
    </li>
  );
}

function SmartHomeCard({
  card,
  onQuestionChoice,
}: {
  card: EaseAIBackendCard;
  onQuestionChoice?: (reply: string) => void;
}) {
  const payload = cardPayload(card);
  const control = useDirectDeviceControl();
  const rooms = asArray(payload.rooms).map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];
  const stats = asRecord(payload.stats) ?? {};
  const alertTotal = asNumber(stats.alerts) ?? 0;
  const layoutRooms = normalizeLayoutRooms(card);
  const stateByRoomId = new Map<number, "critical" | "occupied" | "normal">();
  for (const room of rooms) {
    const roomId = asNumber(room.room_id);
    if (roomId == null) continue;
    stateByRoomId.set(
      roomId,
      (asNumber(room.alert_count) ?? 0) > 0 ? "critical" : room.occupied === true ? "occupied" : "normal",
    );
  }

  return (
    <CardShell icon={<House className="h-4 w-4" />} title={titleFor(card, "Smart home status")}>
      <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
        <Badge variant="outline" className="rounded-full px-2 py-0">
          {asNumber(stats.occupied_rooms) ?? 0}/{asNumber(stats.total_rooms) ?? rooms.length} rooms occupied
        </Badge>
        <Badge variant="outline" className="rounded-full px-2 py-0">
          {asNumber(stats.devices_on) ?? 0}/{asNumber(stats.total_devices) ?? 0} devices on
        </Badge>
        {alertTotal > 0 ? (
          <Badge variant="destructive" className="rounded-full px-2 py-0">
            {alertTotal} alert{alertTotal === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
      {layoutRooms.length > 0 ? (
        <FloorplanSvg layoutRooms={layoutRooms} roomState={(roomId) => (roomId == null ? "none" : stateByRoomId.get(roomId) ?? "none")} />
      ) : null}
      <div className="space-y-2">
        {rooms.map((room, index) => {
          const roomAlerts = asNumber(room.alert_count) ?? 0;
          const occupied = room.occupied === true;
          const occupants = asArray(room.occupants).map(asString).filter(Boolean);
          const devices = asArray(room.devices).map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];
          const cameraUrl = asString(room.camera_url);
          const hasCamera = room.camera_available === true || Boolean(cameraUrl);
          return (
            <div
              key={`${asString(room.room_id)}-${index}`}
              className={cn(
                "rounded-lg border bg-surface px-2.5 py-2",
                roomAlerts > 0 ? "border-critical/40" : "border-outline-variant/20",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      roomAlerts > 0 ? "bg-critical" : occupied ? "bg-emerald-500" : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                    {asString(room.room_name) || `Room ${asString(room.room_id)}`}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {roomAlerts > 0 ? (
                    <Badge variant="destructive" className="rounded-full px-1.5 py-0 text-[10px]">
                      {roomAlerts} alert{roomAlerts === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  {occupied ? (
                    <Badge variant="success" className="rounded-full px-1.5 py-0 text-[10px]">
                      occupied
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px] text-muted-foreground">
                      empty
                    </Badge>
                  )}
                </div>
              </div>
              {occupants.length > 0 ? (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {occupants.join(", ")}
                </p>
              ) : null}
              {cameraUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- live camera frame from platform API
                <img
                  src={cameraUrl}
                  alt={`${asString(room.room_name) || "Room"} camera`}
                  loading="lazy"
                  className="mt-1.5 h-24 w-full rounded-md border border-outline-variant/15 object-cover"
                />
              ) : null}
              {devices.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {devices.map((device, deviceIndex) => (
                    <SmartDeviceControlRow
                      key={`${asString(device.id)}-${deviceIndex}`}
                      device={device}
                      control={control}
                      onQuestionChoice={onQuestionChoice}
                    />
                  ))}
                </ul>
              ) : (
                hasCamera ? null : <p className="mt-1 text-[11px] text-muted-foreground">No smart devices</p>
              )}
            </div>
          );
        })}
      </div>
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

const ALERT_CRITICAL = new Set(["critical", "emergency", "high", "fall", "fall_detected", "sos"]);
const ALERT_WARNING = new Set(["warning", "medium", "caution"]);

function alertSeverityTone(alert: JsonRecord): "critical" | "warning" | "info" {
  const severity = asString(alert.severity).toLowerCase();
  const alertType = asString(alert.alert_type).toLowerCase();
  if (ALERT_CRITICAL.has(severity) || ALERT_CRITICAL.has(alertType)) return "critical";
  if (ALERT_WARNING.has(severity)) return "warning";
  return "info";
}

function AlertFeedCard({
  card,
  onQuestionChoice,
  onNavigate,
}: {
  card: EaseAIBackendCard;
  onQuestionChoice?: (reply: string) => void;
  onNavigate?: (href: string) => void;
}) {
  const payload = cardPayload(card);
  const alerts = asArray(payload.alerts).map((item) => asRecord(item)).filter(Boolean) as JsonRecord[];
  const total = asNumber(payload.total_count) ?? alerts.length;

  return (
    <CardShell icon={<Siren className="h-4 w-4" />} title={titleFor(card, "Active alerts")}>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active alerts.</p>
      ) : (
        <ul className="space-y-1.5">
          {alerts.slice(0, 8).map((alert, index) => {
            const tone = alertSeverityTone(alert);
            const alertId = asNumber(alert.id);
            const label = (asString(alert.alert_type) || "alert").replace(/_/g, " ");
            return (
              <li
                key={`${asString(alert.id)}-${index}`}
                className={cn(
                  "rounded-lg border px-2.5 py-2 text-xs",
                  tone === "critical"
                    ? "border-critical/40 bg-critical/5"
                    : tone === "warning"
                      ? "border-amber-300/60 bg-amber-50/60"
                      : "border-outline-variant/20 bg-surface",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Badge
                      variant={tone === "critical" ? "destructive" : tone === "warning" ? "warning" : "outline"}
                      className="shrink-0 rounded-full px-1.5 py-0 text-[10px] capitalize"
                    >
                      {asString(alert.severity) || "info"}
                    </Badge>
                    <span className="min-w-0 truncate font-medium capitalize text-foreground">{label}</span>
                  </div>
                  {alertId != null && onQuestionChoice ? (
                    <button
                      type="button"
                      onClick={() => onQuestionChoice(`Acknowledge alert ${alertId}`)}
                      className="shrink-0 rounded-md bg-surface-container-high px-1.5 py-0.5 text-[10px] font-semibold text-foreground transition-smooth hover:bg-surface-container-highest"
                    >
                      Acknowledge
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {[
                    alert.patient_id != null ? `Patient #${String(alert.patient_id)}` : "",
                    asString(alert.created_at) ? formatDateTime(asString(alert.created_at)) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {total > alerts.length ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">+{total - alerts.length} more</p>
      ) : null}
      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate("/admin")}
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
        >
          Open overview
          <ArrowRight className="h-3 w-3" />
        </button>
      ) : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function deviceDisplayLabel(payload: JsonRecord): string {
  const entity = asString(payload.ha_entity_id);
  if (entity) {
    const slug = entity.split(".").pop() || "";
    const stripped = slug.replace(/^ws\d+_room\d+_/, "").replace(/_/g, " ");
    if (stripped.trim()) return stripped.trim();
  }
  return payload.device_id != null ? `Device #${String(payload.device_id)}` : "Device";
}

function DeviceControlCard({
  card,
  onQuestionChoice,
}: {
  card: EaseAIBackendCard;
  onQuestionChoice?: (reply: string) => void;
}) {
  const payload = cardPayload(card);
  const control = useDirectDeviceControl();
  const targetId = asNumber(payload.device_id);
  const { data: haDevices } = useQuery({
    queryKey: ["chat", "ha", "devices"],
    queryFn: () => api.get<SmartDevice[]>("/ha/devices"),
    staleTime: 10_000,
    retry: false,
  });
  const target = useMemo(
    () => (targetId == null ? null : (haDevices ?? []).find((d) => d.id === targetId) ?? null),
    [haDevices, targetId],
  );
  const roomId = target?.room_id ?? null;
  const roomDevices = useMemo(() => {
    if (!haDevices || roomId == null) return [] as SmartDevice[];
    return haDevices.filter((d) => d.room_id === roomId && d.is_active !== false);
  }, [haDevices, roomId]);
  const roomConfig = asRecord(target?.config);
  const roomName =
    asString(roomConfig?.room_name) || asString(roomConfig?.room_key) || "this room";

  const override = targetId != null ? control.overrides[targetId] : undefined;
  const baseIsOn = payload.on === true || deviceStateIsOn(payload.state);
  const isOn = override ? override.on : baseIsOn;
  const pending = override?.pending === true;
  const label = deviceDisplayLabel(payload);
  const action = (asString(payload.action) || "").replace(/_/g, " ");
  const state = override?.state ?? (asString(payload.state) || (isOn ? "on" : "off"));

  return (
    <CardShell icon={<Power className="h-4 w-4" />} title={titleFor(card, "Device updated")}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            isOn ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
          )}
        >
          <Power className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold capitalize text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">
            {action ? `${action} → ` : ""}now {state}
          </p>
        </div>
        <button
          type="button"
          disabled={pending || (targetId == null && !onQuestionChoice)}
          onClick={() => {
            if (targetId != null) {
              void control.toggle(targetId, isOn);
            } else {
              onQuestionChoice?.(`Turn ${isOn ? "off" : "on"} ${label}`);
            }
          }}
          className={cn(
            "shrink-0 rounded-md bg-surface-container-high px-2 py-1 text-[10px] font-semibold text-foreground transition-smooth hover:bg-surface-container-highest",
            pending && "cursor-not-allowed opacity-50",
          )}
        >
          {pending ? "…" : isOn ? "Turn off" : "Turn on"}
        </button>
      </div>
      {roomDevices.length > 1 ? (
        <div className="mt-2 border-t border-outline-variant/15 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            All devices in {roomName}
          </p>
          <ul className="space-y-1">
            {roomDevices.map((device) => (
              <SmartDeviceControlRow
                key={device.id}
                device={device as unknown as JsonRecord}
                control={control}
                onQuestionChoice={onQuestionChoice}
              />
            ))}
          </ul>
        </div>
      ) : null}
      <Provenance items={provenanceItems(card)} />
    </CardShell>
  );
}

function renderCard(
  card: EaseAIBackendCard,
  onQuestionChoice?: (reply: string) => void,
  onNavigate?: (href: string) => void,
) {
  switch (cardType(card)) {
    case "timeline":
    case "movement_timeline":
    case "patient_timeline":
      return <TimelineCard card={card} />;
    case "patient_health_analysis":
    case "health_analysis":
      return <PatientHealthAnalysisCard card={card} />;
    case "task_draft":
      return <TaskDraftCard card={card} />;
    case "question_choices":
    case "choices":
      return <QuestionChoicesCard card={card} onQuestionChoice={onQuestionChoice} />;
    case "plan_summary":
      return <PlanSummaryCard card={card} />;
    case "task_success":
    case "task_created":
      return <TaskSuccessCard card={card} />;
    case "data_table":
    case "table":
      return <DataTableCard card={card} />;
    case "patient_summary":
      return <PatientSummaryCard card={card} />;
    case "staff_summary":
      return <StaffSummaryCard card={card} />;
    case "staff_timeline":
      return <StaffTimelineResponseCard card={card} />;
    case "profile_summary":
    case "patient_profile":
    case "staff_profile":
      return <ProfileSummaryCard card={card} />;
    case "navigation":
      return <NavigationCard card={card} onNavigate={onNavigate} />;
    case "smart_home":
    case "smart_home_status":
      return <SmartHomeCard card={card} onQuestionChoice={onQuestionChoice} />;
    case "alert_feed":
    case "alerts":
      return <AlertFeedCard card={card} onQuestionChoice={onQuestionChoice} onNavigate={onNavigate} />;
    case "device_control":
    case "device_control_result":
      return <DeviceControlCard card={card} onQuestionChoice={onQuestionChoice} />;
    case "floorplan_map":
      return <FloorplanMapCard card={card} />;
    case "sensor_status":
      return <SensorStatusCard card={card} />;
    case "health_trend_chart":
    case "health_trend":
      return <HealthTrendChartCard card={card} />;
    case "tool_result":
    default:
      return <ToolResultCard card={card} />;
  }
}

export function EaseAIResponseCards({ cards, onQuestionChoice, onNavigate, showTechnicalDetails = false }: EaseAIResponseCardsProps) {
  if (cards.length === 0) return null;

  return (
    <TechnicalDetails value={showTechnicalDetails}>
    <div className="flex flex-col gap-3">
      {cards.map((card, index) => (
        <div key={`${cardType(card)}-${asString(card.id) || index}`}>
          {renderCard(card, onQuestionChoice, onNavigate)}
        </div>
      ))}
    </div>
    </TechnicalDetails>
  );
}

export function responseCardsFromUnknown(value: unknown): EaseAIBackendCard[] {
  const record = asRecord(value);
  const source =
    asArray(value).length > 0
      ? asArray(value)
      : asArray(record?.cards).length > 0
        ? asArray(record?.cards)
        : asArray(record?.response_cards).length > 0
          ? asArray(record?.response_cards)
          : asArray(record?.results).length > 0
            ? asArray(record?.results)
            : [];
  return source.map((item) => asRecord(item)).filter(Boolean) as EaseAIBackendCard[];
}

export function taskSuccessCardFromResult(result: JsonRecord): EaseAIBackendCard {
  return {
    type: "task_success",
    title: "Task created successfully",
    payload: result,
    source: "execution_result",
  };
}

export function timelineCardFromPayload(payload: JsonRecord): EaseAIBackendCard {
  return {
    type: "timeline",
    title: "Movement Timeline",
    payload,
    source: "get_patient_timeline",
  };
}
