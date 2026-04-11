"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  History,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE } from "@/lib/constants";

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
};

type ExecuteResponse = {
  reply?: string | null;
  result?: unknown;
  message?: string | null;
};

export default function AIChatPopup() {
  const { user } = useAuth();
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
    const token = typeof window !== "undefined" ? localStorage.getItem("ws_token") : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      if (data.actions && data.actions.length > 0) {
        setProposal(data);
      }
      void loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, conversationId, input, loadConversations, messages]);

  const confirmAndExecuteActions = useCallback(async () => {
    if (!proposal?.proposal_id) {
      setError("Action proposal id is missing.");
      return;
    }
    setConfirmingActions(true);
    setError("");
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
      const reply = result.reply || result.message || "Action executed.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setProposal(null);
      void loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action execution failed.");
    } finally {
      setConfirmingActions(false);
    }
  }, [proposal?.proposal_id, authHeaders, loadConversations]);

  if (!user) return null;

  const activeTitle = conversations.find((row) => row.id === conversationId)?.title || null;

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
                    <div
                      className="prose-sm [&_pre]:my-1 [&_code]:text-xs [&_li]:my-0"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content || "") }}
                    />
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              ))}
              {error ? <p className="text-critical text-xs">{error}</p> : null}
              <div ref={messagesEndRef} />
            </div>

            {proposal?.actions && proposal.actions.length > 0 ? (
              <div className="border-t border-outline-variant/15 bg-amber-50/60 px-3 py-3 dark:bg-amber-950/20">
                <div className="mb-2 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Confirm AI actions
                  </p>
                </div>
                <p className="text-xs text-foreground-variant">
                  {proposal.summary || "The assistant prepared changes and needs your confirmation before execution."}
                </p>
                <div className="mt-2 max-h-28 space-y-2 overflow-y-auto rounded-xl border border-outline-variant/20 bg-surface p-2">
                  {proposal.actions.map((action, index) => (
                    <div key={`${action.action_id ?? "a"}-${index}`} className="rounded-lg border border-outline-variant/15 p-2">
                      <p className="text-xs font-semibold text-foreground">
                        {action.title || `Action ${index + 1}`}
                      </p>
                      {action.description ? (
                        <p className="mt-0.5 text-[11px] text-foreground-variant">{action.description}</p>
                      ) : null}
                      {action.risk_level ? (
                        <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3" />
                          {action.risk_level}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-outline-variant/25 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-container-low transition-smooth"
                    onClick={() => setProposal(null)}
                    disabled={confirmingActions}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-xl gradient-cta px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    onClick={() => void confirmAndExecuteActions()}
                    disabled={confirmingActions}
                  >
                    {confirmingActions ? "Executing..." : "Confirm and Execute"}
                  </button>
                </div>
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
