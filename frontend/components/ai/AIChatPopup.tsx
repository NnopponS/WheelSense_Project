"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  History,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Mic,
  MicOff,
  Trash2,
  Volume2,
  VolumeX,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n";
import { ActionPlanPreview } from "./ActionPlanPreview";
import { EaseAIResponseCard } from "./EaseAIResponseCard";
import type { AITraceChip, ProviderAttemptTrace } from "./AITraceChips";
import { ExecutionStepList, type StepResult } from "./ExecutionStepList";
import type { components } from "@/lib/api/generated/schema";

type ExecutionPlan = components["schemas"]["ExecutionPlan"];
type JsonRecord = Record<string, unknown>;
type InlineActionStatus = "proposed" | "confirming" | "executing" | "executed" | "rejected" | "failed";

type InlineActionState = {
  status: InlineActionStatus;
  currentStepIndex: number;
  completedSteps: number[];
  failedSteps: number[];
  stepResults: StepResult[];
  error?: string | null;
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  readonly error?: string;
  readonly message?: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  grounding?: JsonRecord | null;
  executionResult?: JsonRecord | null;
  metadata?: JsonRecord | null;
  proposal?: ActionProposal | null;
  actionState?: InlineActionState | null;
};
type Conversation = { id: number; title: string | null; updated_at: string };

type ProposedAction = {
  action_id?: string | number | null;
  title?: string | null;
  description?: string | null;
  risk_level?: string | null;
  params?: JsonRecord | null;
  payload?: JsonRecord | null;
};

type ActionProposal = {
  proposal_id?: string | number | null;
  reply?: string | null;
  assistant_reply?: string | null;
  summary?: string | null;
  actions?: ProposedAction[] | null;
  mode?: "answer" | "plan";
  execution_plan?: ExecutionPlan | null;
  ai_trace?: AITraceChip[] | null;
  provider_attempts?: ProviderAttemptTrace[] | null;
  grounding?: JsonRecord | null;
};

type ExecuteResponse = {
  reply?: string | null;
  result?: unknown;
  message?: string | null;
  execution_result?: JsonRecord | null;
  step_results?: Array<{
    step_id: string;
    tool_name?: string;
    success: boolean;
    message?: string;
    error?: string;
    result?: unknown;
    executed_at?: string;
  }>;
};

function newMessageId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now()}-${random}`;
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

function hasThaiText(value: string): boolean {
  return /[\u0e00-\u0e7f]/.test(value);
}

function speechLangForText(value: string, fallback = "en-US"): string {
  return hasThaiText(value) ? "th-TH" : fallback;
}

function stripForSpeech(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function initialActionState(status: InlineActionStatus = "proposed"): InlineActionState {
  return {
    status,
    currentStepIndex: 0,
    completedSteps: [],
    failedSteps: [],
    stepResults: [],
    error: null,
  };
}

function coerceExecutionPlan(proposal: ActionProposal | null): ExecutionPlan | null {
  if (!proposal) return null;
  const top = proposal.execution_plan;
  if (top && Array.isArray(top.steps) && top.steps.length > 0) return top;
  const payload = proposal.actions?.[0]?.payload as Record<string, unknown> | undefined;
  const nested = payload?.execution_plan as ExecutionPlan | undefined;
  if (nested && Array.isArray(nested.steps) && nested.steps.length > 0) return nested;
  return null;
}

function shouldRenderProposal(proposal: ActionProposal | null): boolean {
  return Boolean(proposal && ((proposal.actions && proposal.actions.length > 0) || coerceExecutionPlan(proposal)));
}

function mergeGrounding(metadata: JsonRecord | null, explicit?: unknown): JsonRecord | null {
  const metaGrounding = asRecord(metadata?.grounding);
  const explicitGrounding = asRecord(explicit);
  const responseCards = asArray(metadata?.response_cards);
  const merged: JsonRecord = {
    ...(metaGrounding ?? {}),
    ...(explicitGrounding ?? {}),
  };
  if (responseCards.length > 0 && !Array.isArray(merged.response_cards)) {
    merged.response_cards = responseCards;
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

function coerceProposalFromMetadata(metadata: JsonRecord | null): ActionProposal | null {
  const direct =
    asRecord(metadata?.proposal) ??
    asRecord(metadata?.action_proposal) ??
    asRecord(metadata?.actionProposal);
  if (direct) return direct as ActionProposal;

  const executionPlan = asRecord(metadata?.execution_plan) as ExecutionPlan | null;
  if (executionPlan && Array.isArray(executionPlan.steps)) {
    return {
      mode: "plan",
      proposal_id: metadata?.proposal_id as string | number | null | undefined,
      summary: asString(metadata?.summary),
      execution_plan: executionPlan,
      grounding: mergeGrounding(metadata),
    };
  }
  return null;
}

function coerceActionStateFromMetadata(
  metadata: JsonRecord | null,
  proposal: ActionProposal | null,
  executionResult: JsonRecord | null,
): InlineActionState | null {
  if (!proposal) return null;
  const rawStatus = asString(metadata?.action_status) || asString(metadata?.status);
  const status: InlineActionStatus =
    rawStatus === "confirming" ||
    rawStatus === "executing" ||
    rawStatus === "executed" ||
    rawStatus === "rejected" ||
    rawStatus === "failed"
      ? rawStatus
      : executionResult
        ? "executed"
        : "proposed";
  return initialActionState(status);
}

function normalizeHistoryMessage(item: {
  id?: number | string;
  role: string;
  content: string;
  metadata?: JsonRecord | null;
  grounding?: JsonRecord | null;
  execution_result?: JsonRecord | null;
  executionResult?: JsonRecord | null;
}): Message {
  const metadata = asRecord(item.metadata);
  const grounding = mergeGrounding(metadata, item.grounding);
  const executionResult =
    asRecord(item.execution_result) ??
    asRecord(item.executionResult) ??
    asRecord(metadata?.execution_result) ??
    asRecord(metadata?.executionResult);
  const proposal = coerceProposalFromMetadata(metadata);
  return {
    id: item.id != null ? `history-${String(item.id)}` : newMessageId("history"),
    role: item.role as "user" | "assistant",
    content: item.content,
    metadata,
    grounding,
    executionResult,
    proposal,
    actionState: coerceActionStateFromMetadata(metadata, proposal, executionResult),
  };
}

function assistantHasRenderablePayload(message: Message): boolean {
  return Boolean(message.content || message.grounding || message.executionResult || message.proposal);
}

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(244,248,255,0.96))] px-3 py-2 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-sky-500/80 animate-bounce [animation-delay:0ms]" />
        <span className="h-2.5 w-2.5 rounded-full bg-cyan-500/80 animate-bounce [animation-delay:150ms]" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 animate-bounce [animation-delay:300ms]" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">EaseAI</p>
        <p className="text-xs text-foreground-variant">{label}</p>
      </div>
    </div>
  );
}

function InlineActionBlock({
  messageId,
  proposal,
  state,
  onConfirm,
  onReject,
}: {
  messageId: string;
  proposal: ActionProposal;
  state: InlineActionState | null | undefined;
  onConfirm: (messageId: string, proposal: ActionProposal) => void;
  onReject: (messageId: string, proposal: ActionProposal) => void;
}) {
  const plan = coerceExecutionPlan(proposal);
  const status = state?.status ?? "proposed";
  const isBusy = status === "confirming" || status === "executing";
  const steps = plan?.steps ?? [];

  if (!plan) return null;

  if (status === "proposed" || status === "confirming") {
    return (
      <div className="mt-3">
        <ActionPlanPreview
          plan={plan}
          proposalId={typeof proposal.proposal_id === "number" ? proposal.proposal_id : null}
          onConfirm={() => onConfirm(messageId, proposal)}
          onCancel={() => onReject(messageId, proposal)}
          isConfirming={isBusy}
          trace={proposal.ai_trace ?? []}
          providerAttempts={proposal.provider_attempts ?? []}
        />
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="mt-3 rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2 text-xs text-muted-foreground">
        <XCircle className="mr-1.5 inline h-4 w-4 text-muted-foreground" aria-hidden />
        Action plan rejected. No changes were made.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <ExecutionStepList
        steps={steps}
        executing={status === "executing"}
        currentStepIndex={state?.currentStepIndex ?? 0}
        completedSteps={state?.completedSteps ?? []}
        failedSteps={state?.failedSteps ?? []}
        stepResults={state?.stepResults ?? []}
      />
      {status === "executed" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4" aria-hidden />
          Action plan executed.
        </div>
      ) : null}
      {status === "failed" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mr-1.5 inline h-4 w-4" aria-hidden />
          {state?.error || "Action plan failed."}
        </div>
      ) : null}
      {status === "executing" ? (
        <div className="rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" aria-hidden />
          Executing confirmed action plan...
        </div>
      ) : null}
    </div>
  );
}

export default function AIChatPopup({ onClose }: { onClose?: () => void } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const pagePatientId = useMemo(() => {
    const m = pathname?.match(/^\/(?:admin|head-nurse|supervisor|observer)\/patients\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }, [pathname]);
  const pageContext = useMemo(() => {
    const search = searchParams?.toString();
    return {
      path: pathname || "",
      search: search ? `?${search}` : "",
      role: user?.role || "",
      ...(pagePatientId != null ? { page_patient_id: pagePatientId } : {}),
    };
  }, [pagePatientId, pathname, searchParams, user?.role]);
  const showAiTrace = searchParams?.get("ai_trace") === "1";

  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const quickPrompts = useMemo(() => {
    const demoPrompts = [
      t("aiChat.quick.demoRobertTimeline"),
      t("aiChat.quick.demoRobertRoutine"),
      t("aiChat.quick.demoRoomControl"),
    ];
    switch (user?.role) {
      case "admin":
        return [...demoPrompts, t("aiChat.quick.adminRisks"), t("aiChat.quick.adminAudit")];
      case "head_nurse":
        return [...demoPrompts, t("aiChat.quick.headNurseActions"), t("aiChat.quick.headNurseAlerts")];
      case "supervisor":
        return [...demoPrompts, t("aiChat.quick.supervisorVitals"), t("aiChat.quick.supervisorDirectives")];
      case "patient":
        return [t("aiChat.quick.patientVitals"), t("aiChat.quick.patientUnwell")];
      default:
        return [...demoPrompts, t("aiChat.quick.defaultTasks"), t("aiChat.quick.defaultAlerts")];
    }
  }, [t, user?.role]);

  const authHeaders = useCallback((): HeadersInit => {
    return {
      "Content-Type": "application/json",
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const recognitionAvailable = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
    setSpeechSupported(recognitionAvailable);
    setSpeechOutputSupported("speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined");
    setVoiceEnabled(window.localStorage.getItem("wheelsense.easeai.voice_output") === "1");
    return () => {
      recognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("wheelsense.easeai.voice_output", voiceEnabled ? "1" : "0");
    if (!voiceEnabled) {
      window.speechSynthesis?.cancel();
    }
  }, [voiceEnabled]);

  useEffect(() => {
    if (open) return;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    window.speechSynthesis?.cancel();
  }, [open]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as Conversation[];
      setConversations(data);
      if (conversationId != null && !data.some((row) => row.id === conversationId)) {
        setConversationId(null);
        setMessages([]);
        setHistoryNotice(t("aiChat.notice.conversationUnavailable"));
      }
    } catch {
      // keep chat usable if history fails
    }
  }, [authHeaders, conversationId, t]);

  const loadConversationMessages = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`${API_BASE}/chat/conversations/${id}/messages`, { headers: authHeaders() });
        if (res.status === 404) {
          setConversations((prev) => prev.filter((row) => row.id !== id));
          if (conversationId === id) {
            setConversationId(null);
            setMessages([]);
          }
          setShowHistory(false);
          setHistoryNotice(t("aiChat.notice.conversationUnavailable"));
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as Array<{
          id?: number | string;
          role: string;
          content: string;
          metadata?: JsonRecord | null;
          grounding?: JsonRecord | null;
          execution_result?: JsonRecord | null;
          executionResult?: JsonRecord | null;
        }>;
        const filtered = data
          .filter((item) => item.role === "user" || item.role === "assistant")
          .map(normalizeHistoryMessage);
        setMessages(filtered);
        setConversationId(id);
        setShowHistory(false);
        setHistoryNotice("");
      } catch {
        // non-fatal
      }
    },
    [authHeaders, conversationId, t],
  );

  useEffect(() => {
    if (!open || !user) return;
    void loadConversations();
  }, [open, user, loadConversations]);

  useEffect(() => {
    function handleOpenAi(event: Event) {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      setOpen(true);
      if (detail?.prompt) setInput(detail.prompt);
    }

    window.addEventListener("wheelsense:open-ai", handleOpenAi);
    return () => window.removeEventListener("wheelsense:open-ai", handleOpenAi);
  }, []);

  function handleNewChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setHistoryNotice("");
    setShowHistory(false);
  }

  async function handleDeleteConversation(id: number) {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok && res.status !== 404) return;
      setConversations((prev) => prev.filter((row) => row.id !== id));
      if (conversationId === id) {
        handleNewChat();
        setHistoryNotice(t("aiChat.notice.conversationRemoved"));
      }
    } catch {
      // non-fatal
    }
  }

  const speakAssistantText = useCallback((content: string) => {
    if (!voiceEnabled || !speechOutputSupported || typeof window === "undefined") return;
    const text = stripForSpeech(content);
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const fallbackLang = hasThaiText(t("aiChat.messagePlaceholder")) ? "th-TH" : (navigator.language || "en-US");
    utterance.lang = speechLangForText(text, fallbackLang);
    const languagePrefix = utterance.lang.slice(0, 2).toLowerCase();
    const voice = window.speechSynthesis
      .getVoices()
      .find((item) => item.lang.toLowerCase().startsWith(languagePrefix));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [speechOutputSupported, t, voiceEnabled]);

  const toggleVoiceOutput = useCallback(() => {
    if (!speechOutputSupported) {
      setSpeechNotice(t("aiChat.voice.outputUnavailable"));
      return;
    }
    setSpeechNotice("");
    setVoiceEnabled((prev) => !prev);
  }, [speechOutputSupported, t]);

  const toggleVoiceInput = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechNotice(t("aiChat.voice.inputUnsupported"));
      return;
    }
    const recognition = new Recognition();
    recognitionRef.current?.abort();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = hasThaiText(t("aiChat.messagePlaceholder")) ? "th-TH" : (navigator.language || "en-US");

    const baseInput = input.trim();
    let committed = "";
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) {
          committed = [committed, transcript].filter(Boolean).join(" ").trim();
        } else {
          interim = [interim, transcript].filter(Boolean).join(" ").trim();
        }
      }
      const nextInput = [baseInput, committed, interim].filter(Boolean).join(" ").trim();
      setInput(nextInput);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setSpeechNotice(event.message || event.error || t("aiChat.voice.inputError"));
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      setSpeechNotice("");
      setListening(true);
      recognition.start();
    } catch (error) {
      setListening(false);
      recognitionRef.current = null;
      setSpeechNotice(error instanceof Error ? error.message : t("aiChat.voice.inputError"));
    }
  }, [input, listening, t]);

  const fallbackSendStream = useCallback(async (nextMessages: Message[], convId: number | null) => {
    const res = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        conversation_id: convId,
        messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok || !res.body) {
      if (res.status === 404) {
        setConversationId(null);
        setHistoryNotice(t("aiChat.notice.previousRemoved"));
      }
      throw new Error(`Error: ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let assistant = "";
    const assistantId = newMessageId("assistant-stream");
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      assistant += dec.decode(value, { stream: true });
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = { ...last, content: assistant };
        }
        return copy;
      });
    }
    speakAssistantText(assistant);
  }, [authHeaders, speakAssistantText, t]);

  const patchMessageAction = useCallback((messageId: string, patch: Partial<InlineActionState>) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              actionState: {
                ...(message.actionState ?? initialActionState()),
                ...patch,
              },
            }
          : message,
      ),
    );
  }, []);

  const navigateFromEaseAI = useCallback((href: string) => {
    if (!href.startsWith("/") || href.startsWith("//")) return;
    router.push(href);
    setOpen(false);
  }, [router]);

  const autoNavigationHref = useCallback((grounding?: JsonRecord | null): string | null => {
    const cards = Array.isArray(grounding?.response_cards) ? grounding.response_cards : [];
    for (const item of cards) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const card = item as JsonRecord;
      if (card.kind !== "navigation" || card.auto_open !== true) continue;
      const href = typeof card.href === "string" ? card.href : "";
      if (href.startsWith("/") && !href.startsWith("//")) return href;
    }
    return null;
  }, []);

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const content = (overrideContent ?? input).trim();
    if (!content) return;
    setLoading(true);
    setError("");
    const userMessage: Message = { id: newMessageId("user"), role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");

    let convId = conversationId;
    try {
      if (!convId) {
        const createRes = await fetch(`${API_BASE}/chat/conversations`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ title: userMessage.content.slice(0, 80) }),
        });
        if (createRes.ok) {
          const conv = (await createRes.json()) as { id: number };
          convId = conv.id;
          setConversationId(conv.id);
          void loadConversations();
        }
      }

      const proposalRes = await fetch(
        showAiTrace ? `${API_BASE}/chat/actions/propose?ai_trace=1` : `${API_BASE}/chat/actions/propose`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            conversation_id: convId,
            message: userMessage.content,
            messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
            ...(pagePatientId != null ? { page_patient_id: pagePatientId } : {}),
            page_context: pageContext,
          }),
        },
      );

      if (proposalRes.status === 404 || proposalRes.status === 405) {
        await fallbackSendStream(nextMessages, convId ?? null);
        void loadConversations();
        return;
      }

      if (!proposalRes.ok) {
        throw new Error(`Error: ${proposalRes.status}`);
      }

      const data = (await proposalRes.json()) as ActionProposal;
      const href = autoNavigationHref(data.grounding ?? null);
      const reply = data.assistant_reply || data.reply || data.summary || "";
      const renderProposal = shouldRenderProposal(data);
      if (reply || data.grounding || renderProposal) {
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId("assistant"),
            role: "assistant",
            content: reply,
            grounding: data.grounding ?? null,
            proposal: renderProposal ? data : null,
            actionState: renderProposal ? initialActionState() : null,
          },
        ]);
      }
      speakAssistantText(reply);
      if (href) navigateFromEaseAI(href);
      void loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("aiChat.error.requestFailed"));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, autoNavigationHref, conversationId, fallbackSendStream, input, loadConversations, messages, navigateFromEaseAI, pageContext, pagePatientId, showAiTrace, speakAssistantText, t]);

  const rejectActions = useCallback(async (messageId: string, proposal: ActionProposal) => {
    if (!proposal.proposal_id) {
      setError(t("aiChat.actionPlan.missingProposalId"));
      return;
    }
    setError("");
    patchMessageAction(messageId, { status: "confirming", error: null });

    try {
      const proposalId = encodeURIComponent(String(proposal.proposal_id));
      const confirmRes = await fetch(`${API_BASE}/chat/actions/${proposalId}/confirm`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ approved: false, note: "Rejected from EaseAI chat." }),
      });
      if (!confirmRes.ok) {
        throw new Error(`Could not reject actions (${confirmRes.status}).`);
      }
      patchMessageAction(messageId, { status: "rejected", error: null });
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId("assistant"),
          role: "assistant",
          content: "Action plan rejected. No changes were made.",
        },
      ]);
      speakAssistantText("Action plan rejected. No changes were made.");
      void loadConversations();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("aiChat.error.actionExecutionFailed");
      setError(message);
      patchMessageAction(messageId, { status: "failed", error: message });
    }
  }, [authHeaders, loadConversations, patchMessageAction, speakAssistantText, t]);

  const confirmAndExecuteActions = useCallback(async (messageId: string, proposal: ActionProposal) => {
    if (!proposal.proposal_id) {
      setError(t("aiChat.actionPlan.missingProposalId"));
      return;
    }
    setError("");

    const plan = coerceExecutionPlan(proposal);
    const planSteps = plan?.steps ?? [];
    patchMessageAction(messageId, {
      status: "confirming",
      currentStepIndex: 0,
      completedSteps: [],
      failedSteps: [],
      stepResults: [],
      error: null,
    });

    try {
      const proposalId = encodeURIComponent(String(proposal.proposal_id));
      const confirmRes = await fetch(`${API_BASE}/chat/actions/${proposalId}/confirm`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ approved: true }),
      });
      if (!confirmRes.ok) {
        throw new Error(`Could not confirm actions (${confirmRes.status}).`);
      }

      patchMessageAction(messageId, { status: "executing", currentStepIndex: 0 });

      const executeRes = await fetch(`${API_BASE}/chat/actions/${proposalId}/execute`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ force: false }),
      });
      if (!executeRes.ok) {
        throw new Error(`Could not execute actions (${executeRes.status}).`);
      }

      const result = (await executeRes.json()) as ExecuteResponse;

      // Map step results from the response
      const executionResult =
        result.execution_result && typeof result.execution_result === "object"
          ? (result.execution_result as JsonRecord)
          : null;
      const executionSteps = Array.isArray(executionResult?.steps)
        ? (executionResult.steps as Array<JsonRecord>)
        : [];
      const responseStepResults =
        result.step_results && result.step_results.length > 0
          ? result.step_results
          : executionSteps.map((step) => ({
              step_id: String(step.step_id ?? ""),
              tool_name: typeof step.tool_name === "string" ? step.tool_name : undefined,
              success: !step.error,
              message: typeof step.message === "string" ? step.message : undefined,
              error: typeof step.error === "string" ? step.error : undefined,
              result: step.result,
              executed_at: typeof step.executed_at === "string" ? step.executed_at : undefined,
            }));

      let completed: number[] = [];
      const failed: number[] = [];
      let mappedResults: StepResult[] = [];
      if (responseStepResults.length > 0 && planSteps.length > 0) {
        mappedResults = responseStepResults.map((sr) => ({
          stepId: sr.step_id,
          success: sr.success,
          message: sr.message,
          data: sr.result,
          error: sr.error,
          executedAt: sr.executed_at,
        }));

        responseStepResults.forEach((sr, idx) => {
          const planIndex = planSteps.findIndex((step) => step.id === sr.step_id);
          const index = planIndex >= 0 ? planIndex : idx;
          if (sr.success) {
            completed.push(index);
          } else {
            failed.push(index);
          }
        });
      } else if (planSteps.length > 0) {
        completed = planSteps.map((_, i) => i);
      }

      patchMessageAction(messageId, {
        status: failed.length > 0 ? "failed" : "executed",
        currentStepIndex: planSteps.length,
        completedSteps: completed,
        failedSteps: failed,
        stepResults: mappedResults,
        error: failed.length > 0 ? "One or more steps failed." : null,
      });

      const reply = result.reply || result.message || t("aiChat.notice.actionExecuted");
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId("assistant"),
          role: "assistant",
          content: reply,
          executionResult,
        },
      ]);
      speakAssistantText(reply);
      void loadConversations();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t("aiChat.error.actionExecutionFailed");
      setError(message);
      const failedSteps =
        planSteps
          .map((_, i) => i)
          .filter((i) => !((messages.find((item) => item.id === messageId)?.actionState?.completedSteps ?? []).includes(i)));
      patchMessageAction(messageId, {
        status: "failed",
        failedSteps,
        currentStepIndex: planSteps.length,
        error: message,
      });
    }
  }, [authHeaders, loadConversations, messages, patchMessageAction, speakAssistantText, t]);

  const send = useCallback(() => {
    void sendMessage();
  }, [sendMessage]);

  const handleQuestionChoice = useCallback((reply: string) => {
    void sendMessage(reply);
  }, [sendMessage]);

  if (!user) return null;

  const activeTitle = conversations.find((row) => row.id === conversationId)?.title || null;
  const showThinkingBubble =
    loading &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.role !== "assistant" ||
      Boolean(messages[messages.length - 1]?.content));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="ws-ai-fab fixed right-4 z-50 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-elevated transition-smooth hover:bg-primary/90 sm:right-6 sm:h-14 sm:px-5"
        aria-label={t("aiChat.openChat")}
      >
        <Bot className="h-5 w-5" />
        <span className="hidden sm:inline">{t("aiChat.fab.label")}</span>
        <MessageCircle className="h-5 w-5 sm:hidden" />
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-50 flex h-[min(78vh,36rem)] overflow-hidden rounded-2xl border border-outline-variant/20 surface-card shadow-modal sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[min(100vw-2rem,28rem)]">
          {showHistory && (
            <div className="flex w-56 shrink-0 flex-col border-r border-outline-variant/15 bg-surface-container-low">
              <div className="flex items-center justify-between border-b border-outline-variant/15 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-variant">{t("aiChat.history")}</p>
                <button
                  type="button"
                  className="rounded-lg p-1 hover:bg-surface-container"
                  onClick={() => setShowHistory(false)}
                  aria-label={t("aiChat.closeHistory")}
                >
                  <PanelLeftClose className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                className="mx-2 mt-2 flex items-center gap-2 rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-container transition-smooth"
                onClick={handleNewChat}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("aiChat.newChat")}
              </button>
              <ul className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
                {conversations.map((row) => (
                  <li key={row.id}>
                    <div
                      className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-smooth ${
                        conversationId === row.id
                          ? "bg-primary-fixed/50 text-primary font-medium"
                          : "text-foreground-variant hover:bg-surface-container"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => void loadConversationMessages(row.id)}
                      >
                        <History className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{(row.title || t("aiChat.untitled")).slice(0, 30)}</span>
                      </button>
                      <button
                        type="button"
                        className="hidden rounded p-0.5 hover:bg-critical/20 group-hover:inline-flex"
                        onClick={() => void handleDeleteConversation(row.id)}
                        aria-label={t("aiChat.deleteConversation")}
                      >
                        <Trash2 className="h-3 w-3 text-critical" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
                {conversations.length === 0 ? (
                  <li className="px-3 py-4 text-center text-[11px] text-foreground-variant">
                    {t("aiChat.noConversations")}
                  </li>
                ) : null}
              </ul>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-outline-variant/15 bg-surface-container-low px-3 py-2.5">
              <button
                type="button"
                className="rounded-lg p-1 hover:bg-surface-container transition-smooth"
                onClick={() => setShowHistory((prev) => !prev)}
                aria-label={t("aiChat.toggleHistory")}
              >
                <PanelLeftOpen className="h-4 w-4" aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">EaseAI</p>
                <p className="truncate text-[11px] text-foreground-variant">
                  {activeTitle || t("aiChat.roleAssistant")}
                </p>
              </div>
              <button
                type="button"
                className={`rounded-lg p-1 transition-smooth ${
                  voiceEnabled
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "hover:bg-surface-container"
                } disabled:cursor-not-allowed disabled:opacity-40`}
                onClick={toggleVoiceOutput}
                disabled={!speechOutputSupported}
                aria-pressed={voiceEnabled}
                aria-label={voiceEnabled ? t("aiChat.voice.outputOff") : t("aiChat.voice.outputOn")}
                title={voiceEnabled ? t("aiChat.voice.outputOff") : t("aiChat.voice.outputOn")}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
              </button>
              <button
                type="button"
                className="rounded-lg p-1 hover:bg-surface-container transition-smooth"
                onClick={handleNewChat}
                aria-label={t("aiChat.newChat")}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="rounded-lg p-1 hover:bg-surface-container transition-smooth"
                onClick={() => {
                  setOpen(false);
                  onClose?.();
                }}
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {messages.length === 0 && !loading ? (
              <div className="flex flex-wrap gap-1 border-b border-outline-variant/15 px-3 py-2">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    className="rounded-lg bg-surface-container px-2 py-1 text-[11px] text-foreground-variant hover:bg-surface-container-high transition-smooth"
                    onClick={() => setInput(qp)}
                  >
                    {qp}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm text-foreground">
              {historyNotice ? (
                <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                  {historyNotice}
                </div>
              ) : null}
              {messages.length === 0 && !loading ? (
                <p className="text-foreground-variant">
                  {t("aiChat.emptyPrompt")}
                </p>
              ) : null}
              {messages.map((m, idx) => (
                <div
                  key={m.id || `${m.role}-${idx}`}
                  className={`${
                    m.role === "user"
                      ? "ml-8 rounded-xl bg-primary-container px-3 py-2 text-on-primary-container"
                      : "mr-8"
                  }`}
                >
                  {m.role === "assistant" ? (
                    assistantHasRenderablePayload(m) ? (
                      <>
                        <EaseAIResponseCard
                          content={m.content}
                          grounding={m.grounding}
                          executionResult={m.executionResult}
                          onQuestionChoice={handleQuestionChoice}
                          onNavigate={navigateFromEaseAI}
                        />
                        {m.proposal ? (
                          <InlineActionBlock
                            messageId={m.id}
                            proposal={m.proposal}
                            state={m.actionState}
                            onConfirm={(messageId, actionProposal) => void confirmAndExecuteActions(messageId, actionProposal)}
                            onReject={(messageId, actionProposal) => void rejectActions(messageId, actionProposal)}
                          />
                        ) : null}
                      </>
                    ) : loading ? (
                      <ThinkingIndicator label={t("aiChat.thinking")} />
                    ) : null
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              ))}
              {showThinkingBubble ? (
                <div className="mr-8">
                  <ThinkingIndicator label={t("aiChat.thinking")} />
                </div>
              ) : null}
              {error ? <p className="text-critical text-xs">{error}</p> : null}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-outline-variant/15 p-3">
              {speechNotice ? (
                <p className="mb-2 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700">
                  {speechNotice}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading || !speechSupported}
                  onClick={toggleVoiceInput}
                  className={`rounded-xl border border-outline-variant/25 px-3 transition-smooth ${
                    listening
                      ? "bg-critical/10 text-critical hover:bg-critical/15"
                      : "bg-surface-container text-foreground hover:bg-surface-container-high"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  aria-pressed={listening}
                  aria-label={listening ? t("aiChat.voice.inputStop") : t("aiChat.voice.inputStart")}
                  title={speechSupported ? (listening ? t("aiChat.voice.inputStop") : t("aiChat.voice.inputStart")) : t("aiChat.voice.inputUnsupported")}
                >
                  {listening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
                </button>
                <input
                  className="input-field flex-1 text-sm"
                  placeholder={listening ? t("aiChat.voice.listening") : t("aiChat.messagePlaceholder")}
                  aria-label={t("aiChat.messageInput")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void send()}
                  className="rounded-xl gradient-cta px-3 text-white disabled:opacity-50 transition-smooth"
                  aria-label={t("aiChat.send")}
                  title={t("aiChat.send")}
                >
                  <Send className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
