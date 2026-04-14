"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  History,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Trash2,
  X,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n";
import { ActionPlanPreview } from "./ActionPlanPreview";
import { ExecutionStepList, type StepResult } from "./ExecutionStepList";
import type { components } from "@/lib/api/generated/schema";

type ExecutionPlan = components["schemas"]["ExecutionPlan"];

function renderMarkdown(text: string): string {
  const html = text
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
  return html;
}

type Message = { role: "user" | "assistant"; content: string };
type Conversation = { id: number; title: string | null; updated_at: string };

type ProposedAction = {
  action_id?: string | number | null;
  title?: string | null;
  description?: string | null;
  risk_level?: string | null;
  params?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

type ActionProposal = {
  proposal_id?: string | number | null;
  reply?: string | null;
  assistant_reply?: string | null;
  summary?: string | null;
  actions?: ProposedAction[] | null;
  mode?: "answer" | "plan";
  execution_plan?: ExecutionPlan | null;
};

type ExecuteResponse = {
  reply?: string | null;
  result?: unknown;
  message?: string | null;
  step_results?: Array<{
    step_id: string;
    success: boolean;
    message?: string;
    error?: string;
    executed_at?: string;
  }>;
};

function coerceExecutionPlan(proposal: ActionProposal | null): ExecutionPlan | null {
  if (!proposal) return null;
  const top = proposal.execution_plan;
  if (top && Array.isArray(top.steps) && top.steps.length > 0) return top;
  const payload = proposal.actions?.[0]?.payload as Record<string, unknown> | undefined;
  const nested = payload?.execution_plan as ExecutionPlan | undefined;
  if (nested && Array.isArray(nested.steps) && nested.steps.length > 0) return nested;
  return null;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(244,248,255,0.96))] px-3 py-2 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-sky-500/80 animate-bounce [animation-delay:0ms]" />
        <span className="h-2.5 w-2.5 rounded-full bg-cyan-500/80 animate-bounce [animation-delay:150ms]" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 animate-bounce [animation-delay:300ms]" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">EaseAI</p>
        <p className="text-xs text-foreground-variant">Analyzing your request</p>
      </div>
    </div>
  );
}

export default function AIChatPopup() {
  const pathname = usePathname();
  const pagePatientId = useMemo(() => {
    const m = pathname?.match(/^\/(?:admin|head-nurse|supervisor|observer)\/patients\/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }, [pathname]);

  const { user } = useAuth();
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
  const [proposal, setProposal] = useState<ActionProposal | null>(null);
  const [confirmingActions, setConfirmingActions] = useState(false);

  // Execution tracking state
  const [executing, setExecuting] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [failedSteps, setFailedSteps] = useState<number[]>([]);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [executionFinished, setExecutionFinished] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = useMemo(() => {
    switch (user?.role) {
      case "admin":
        return ["Summarize system risks today.", "What should I audit right now?"];
      case "head_nurse":
        return ["Prioritize ward actions for this shift.", "Summarize critical alerts with next steps."];
      case "supervisor":
        return ["Highlight concerning vitals trends.", "What directives need follow-up today?"];
      case "patient":
        return ["Explain my latest vitals simply.", "What should I do if I feel unwell?"];
      default:
        return ["What are my top tasks right now?", "Any urgent alerts I should check?"];
    }
  }, [user?.role]);

  const authHeaders = useCallback((): HeadersInit => {
    return {
      "Content-Type": "application/json",
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, proposal]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as Conversation[];
      setConversations(data);
      if (conversationId != null && !data.some((row) => row.id === conversationId)) {
        setConversationId(null);
        setMessages([]);
        setHistoryNotice("This conversation is no longer available.");
      }
    } catch {
      // keep chat usable if history fails
    }
  }, [authHeaders, conversationId]);

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
          setHistoryNotice("This conversation is no longer available.");
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ role: string; content: string }>;
        const filtered = data
          .filter((item) => item.role === "user" || item.role === "assistant")
          .map((item) => ({ role: item.role as "user" | "assistant", content: item.content }));
        setMessages(filtered);
        setConversationId(id);
        setShowHistory(false);
        setHistoryNotice("");
        setProposal(null);
      } catch {
        // non-fatal
      }
    },
    [authHeaders, conversationId],
  );

  useEffect(() => {
    if (!open || !user) return;
    void loadConversations();
  }, [open, user, loadConversations]);

  function handleNewChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setHistoryNotice("");
    setShowHistory(false);
    setProposal(null);
    resetExecutionState();
  }

  function resetExecutionState() {
    setExecuting(false);
    setCurrentStepIndex(0);
    setCompletedSteps([]);
    setFailedSteps([]);
    setStepResults([]);
    setExecutionFinished(false);
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
        setHistoryNotice("Conversation removed.");
      }
    } catch {
      // non-fatal
    }
  }

  async function fallbackSendStream(nextMessages: Message[], convId: number | null) {
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
        setHistoryNotice("The previous conversation was removed. Start a new chat.");
      }
      throw new Error(`Error: ${res.status}`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let assistant = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
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
  }

  const send = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    setProposal(null);
    const userMessage: Message = { role: "user", content: input.trim() };
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

      const proposalRes = await fetch(`${API_BASE}/chat/actions/propose`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          conversation_id: convId,
          message: userMessage.content,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          ...(pagePatientId != null ? { page_patient_id: pagePatientId } : {}),
        }),
      });

      if (proposalRes.status === 404 || proposalRes.status === 405) {
        await fallbackSendStream(nextMessages, convId ?? null);
        void loadConversations();
        return;
      }

      if (!proposalRes.ok) {
        throw new Error(`Error: ${proposalRes.status}`);
      }

      const data = (await proposalRes.json()) as ActionProposal;
      const reply = data.assistant_reply || data.reply;
      if (reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      }
      if ((data.actions && data.actions.length > 0) || coerceExecutionPlan(data)) {
        setProposal(data);
      }
      void loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, conversationId, input, loadConversations, messages, pagePatientId]);

  const activeExecutionPlan = proposal ? coerceExecutionPlan(proposal) : null;

  const confirmAndExecuteActions = useCallback(async () => {
    if (!proposal?.proposal_id) {
      setError(t("aiChat.actionPlan.missingProposalId"));
      return;
    }
    setConfirmingActions(true);
    setError("");
    setExecuting(true);

    // Initialize execution tracking from the plan
    const plan = coerceExecutionPlan(proposal);
    if (plan?.steps) {
      setCurrentStepIndex(0);
      setCompletedSteps([]);
      setFailedSteps([]);
      setStepResults([]);
    }

    try {
      const proposalId = encodeURIComponent(String(proposal.proposal_id));
      const confirmRes = await fetch(`${API_BASE}/chat/actions/${proposalId}/confirm`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!confirmRes.ok) {
        throw new Error(`Could not confirm actions (${confirmRes.status}).`);
      }

      const executeRes = await fetch(`${API_BASE}/chat/actions/${proposalId}/execute`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!executeRes.ok) {
        throw new Error(`Could not execute actions (${executeRes.status}).`);
      }

      const result = (await executeRes.json()) as ExecuteResponse;

      // Map step results from the response
      if (result.step_results && plan?.steps) {
        const mappedResults: StepResult[] = result.step_results.map((sr) => ({
          stepId: sr.step_id,
          success: sr.success,
          message: sr.message,
          error: sr.error,
          executedAt: sr.executed_at,
        }));
        setStepResults(mappedResults);

        // Update completed and failed steps
        const completed: number[] = [];
        const failed: number[] = [];
        result.step_results.forEach((sr, idx) => {
          if (sr.success) {
            completed.push(idx);
          } else {
            failed.push(idx);
          }
        });
        setCompletedSteps(completed);
        setFailedSteps(failed);
        setCurrentStepIndex(plan.steps.length);
      } else if (plan?.steps) {
        // No detailed step results, mark all as completed
        setCompletedSteps(plan.steps.map((_, i) => i));
        setCurrentStepIndex(plan.steps.length);
      }

      setExecutionFinished(true);

      const reply = result.reply || result.message || "Action executed.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      void loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action execution failed.");
      // Mark any remaining steps as failed
      if (plan?.steps) {
        const remaining = plan.steps
          .map((_, i) => i)
          .filter((i) => !completedSteps.includes(i));
        setFailedSteps((prev) => [...prev, ...remaining]);
      }
    } finally {
      setConfirmingActions(false);
      setExecuting(false);
    }
  }, [proposal, authHeaders, loadConversations, completedSteps, t]);

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
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full gradient-cta text-white shadow-elevated hover:opacity-90 transition-smooth"
        aria-label="Open EaseAI chat"
      >
        <MessageCircle className="h-7 w-7" />
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[36rem] w-[min(100vw-2rem,28rem)] overflow-hidden rounded-2xl border border-outline-variant/20 surface-card shadow-modal">
          {showHistory && (
            <div className="flex w-56 shrink-0 flex-col border-r border-outline-variant/15 bg-surface-container-low">
              <div className="flex items-center justify-between border-b border-outline-variant/15 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-variant">History</p>
                <button
                  type="button"
                  className="rounded-lg p-1 hover:bg-surface-container"
                  onClick={() => setShowHistory(false)}
                  aria-label="Close history"
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
                New Chat
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
                        <span className="truncate">{(row.title || "Untitled").slice(0, 30)}</span>
                      </button>
                      <button
                        type="button"
                        className="hidden rounded p-0.5 hover:bg-critical/20 group-hover:inline-flex"
                        onClick={() => void handleDeleteConversation(row.id)}
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3 w-3 text-critical" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
                {conversations.length === 0 ? (
                  <li className="px-3 py-4 text-center text-[11px] text-foreground-variant">
                    No conversations yet.
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
                aria-label="Toggle history"
              >
                <PanelLeftOpen className="h-4 w-4" aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">EaseAI</p>
                <p className="truncate text-[11px] text-foreground-variant">
                  {activeTitle || `${user.role.replace("_", " ")} assistant`}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 hover:bg-surface-container transition-smooth"
                onClick={handleNewChat}
                aria-label="New chat"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="rounded-lg p-1 hover:bg-surface-container transition-smooth"
                onClick={() => setOpen(false)}
                aria-label="Close"
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
                  Ask about patients, alerts, workflows, or ward operations.
                </p>
              ) : null}
              {messages.map((m, idx) => (
                <div
                  key={`${m.role}-${idx}`}
                  className={`rounded-xl px-3 py-2 ${
                    m.role === "user"
                      ? "bg-primary-container text-on-primary-container ml-8"
                      : "bg-surface-container-low mr-8"
                  }`}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <div
                        className="prose-sm [&_pre]:my-1 [&_code]:text-xs [&_li]:my-0"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                      />
                    ) : loading ? (
                      <ThinkingIndicator />
                    ) : null
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              ))}
              {showThinkingBubble ? (
                <div className="mr-8">
                  <ThinkingIndicator />
                </div>
              ) : null}
              {error ? <p className="text-critical text-xs">{error}</p> : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Action plan: unified preview (top-level or nested in action payload) */}
            {activeExecutionPlan && proposal?.mode === "plan" && !executionFinished ? (
              <div className="border-t border-outline-variant/15 px-3 py-3">
                <ActionPlanPreview
                  plan={activeExecutionPlan}
                  proposalId={typeof proposal.proposal_id === "number" ? proposal.proposal_id : null}
                  onConfirm={() => void confirmAndExecuteActions()}
                  onCancel={() => {
                    setProposal(null);
                    resetExecutionState();
                  }}
                  isConfirming={confirmingActions}
                />
              </div>
            ) : null}

            {/* Execution Step List - shown during and after execution */}
            {activeExecutionPlan?.steps && (executing || executionFinished) ? (
              <div className="border-t border-outline-variant/15 px-3 py-3">
                <ExecutionStepList
                  steps={activeExecutionPlan.steps}
                  executing={executing}
                  currentStepIndex={currentStepIndex}
                  completedSteps={completedSteps}
                  failedSteps={failedSteps}
                  stepResults={stepResults}
                />
                {executionFinished && (
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-outline-variant/25 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-container-low transition-smooth"
                    onClick={() => {
                      setProposal(null);
                      resetExecutionState();
                    }}
                  >
                    <CheckCircle2 className="inline h-4 w-4 mr-1" />
                    Done
                  </button>
                )}
              </div>
            ) : null}

            <div className="flex gap-2 border-t border-outline-variant/15 p-3">
              <input
                className="input-field flex-1 text-sm"
                placeholder="Message..."
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
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
