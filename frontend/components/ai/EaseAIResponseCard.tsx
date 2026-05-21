"use client";

import { ClipboardCheck, Sparkles } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import {
  EaseAIResponseCards,
  responseCardsFromUnknown,
  taskSuccessCardFromResult,
  timelineCardFromPayload,
  type EaseAIBackendCard,
} from "./EaseAIResponseCards";

type JsonRecord = Record<string, unknown>;

type EaseAIResponseCardProps = {
  content: string;
  grounding?: JsonRecord | null;
  executionResult?: JsonRecord | null;
  loading?: boolean;
  onQuestionChoice?: (reply: string) => void;
  onNavigate?: (href: string) => void;
};

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-surface-container-low rounded-lg p-2 my-1 text-xs overflow-x-auto"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-surface-container-low rounded px-1 py-0.5 text-xs">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^### (.+)$/gm, '<p class="font-semibold mt-1">$1</p>')
    .replace(/^## (.+)$/gm, '<p class="font-bold mt-1">$1</p>')
    .replace(/^# (.+)$/gm, '<p class="font-bold text-base mt-1">$1</p>')
    .replace(/\n/g, "<br />");
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getTimelinePayload(grounding?: JsonRecord | null): JsonRecord | null {
  if (!grounding) return null;
  if (grounding.tool_name === "get_patient_timeline") {
    return asRecord(grounding.result);
  }
  for (const item of asArray(grounding.tool_results)) {
    const row = asRecord(item);
    if (row?.tool_name === "get_patient_timeline") {
      return asRecord(row.result);
    }
  }
  return null;
}

function getTaskResult(executionResult?: JsonRecord | null): JsonRecord | null {
  if (!executionResult) return null;
  for (const item of asArray(executionResult.steps)) {
    const step = asRecord(item);
    if (step?.tool_name !== "create_task_management_task") continue;
    const result = asRecord(step.result);
    if (result) return result;
  }
  return null;
}

function responseCardsFromGrounding(
  grounding?: JsonRecord | null,
  executionResult?: JsonRecord | null,
): EaseAIBackendCard[] {
  const cards: EaseAIBackendCard[] = [];

  cards.push(...responseCardsFromUnknown(grounding?.response_cards));
  cards.push(...responseCardsFromUnknown(asRecord(grounding?.result)?.response_cards));
  for (const item of asArray(grounding?.tool_results)) {
    const row = asRecord(item);
    cards.push(...responseCardsFromUnknown(row?.response_cards));
    cards.push(...responseCardsFromUnknown(asRecord(row?.result)?.response_cards));
  }

  cards.push(...responseCardsFromUnknown(executionResult?.response_cards));
  for (const item of asArray(executionResult?.steps)) {
    const step = asRecord(item);
    cards.push(...responseCardsFromUnknown(step?.response_cards));
    cards.push(...responseCardsFromUnknown(asRecord(step?.result)?.response_cards));
  }

  if (cards.length === 0) {
    const timelinePayload = getTimelinePayload(grounding);
    const timelineEvents = asArray(timelinePayload?.events);
    if (timelinePayload && timelineEvents.length > 0) {
      cards.push(timelineCardFromPayload(timelinePayload));
    }
  }

  const taskResult = getTaskResult(executionResult);
  if (taskResult && !cards.some((card) => asString(card.type) === "task_success" || asString(card.card_type) === "task_success")) {
    cards.push(taskSuccessCardFromResult(taskResult));
  }

  return cards;
}

export function EaseAIResponseCard({
  content,
  grounding,
  executionResult,
  loading = false,
  onQuestionChoice,
  onNavigate,
}: EaseAIResponseCardProps) {
  const responseCards = responseCardsFromGrounding(grounding, executionResult);
  const hasRichBlock = responseCards.length > 0;

  return (
    <article className={cn("rounded-2xl border border-outline-variant/25 bg-surface p-3 shadow-sm", loading && "animate-pulse")}>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <p className="text-sm font-semibold text-foreground">EaseAI Assistant</p>
      </div>

      {content ? (
        <div
          className="prose-sm text-foreground [&_pre]:my-1 [&_code]:text-xs [&_li]:my-0"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2 text-sm text-muted-foreground">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Thinking...
        </div>
      ) : null}

      {hasRichBlock ? (
        <div className="mt-3">
          <EaseAIResponseCards cards={responseCards} onQuestionChoice={onQuestionChoice} onNavigate={onNavigate} />
        </div>
      ) : null}

      {executionResult?.message && responseCards.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface-container-low px-3 py-2 text-xs text-muted-foreground">
          {asString(executionResult.message) || formatDateTime(new Date().toISOString())}
        </p>
      ) : null}
    </article>
  );
}
