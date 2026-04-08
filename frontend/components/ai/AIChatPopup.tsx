"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  History,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE } from "@/lib/constants";

/* ── Minimal markdown renderer ─────────────────────────────────────────── */

function renderMarkdown(text: string): string {
  const html = text
    // code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-surface-container-low rounded-lg p-2 my-1 text-xs overflow-x-auto"><code>$2</code></pre>')
    // inline code
    .replace(/`([^`]+)`/g, '<code class="bg-surface-container-low rounded px-1 py-0.5 text-xs">$1</code>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // unordered list items
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // numbered list items
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // headings
    .replace(/^### (.+)$/gm, '<p class="font-semibold mt-1">$1</p>')
    .replace(/^## (.+)$/gm, '<p class="font-bold mt-1">$1</p>')
    .replace(/^# (.+)$/gm, '<p class="font-bold text-base mt-1">$1</p>')
    // line breaks → <br>
    .replace(/\n/g, "<br />");
  return html;
}

/* ── Types ──────────────────────────────────────────────────────────────── */

type Message = { role: "user" | "assistant"; content: string };
type Conversation = { id: number; title: string | null; updated_at: string };

/* ── Component ─────────────────────────────────────────────────────────── */

export default function AIChatPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [provider, setProvider] = useState<"ollama" | "copilot" | "">("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* ── Role-based quick prompts ────────────────────────────────────────── */

  const quickPrompts = useMemo(() => {
    switch (user?.role) {
      case "admin":
        return ["Summarize system health risks now.", "What should I check for offline devices?"];
      case "head_nurse":
        return ["Prioritize ward actions for this shift.", "Summarize critical alerts with next steps."];
      case "supervisor":
        return ["Highlight concerning vitals trends.", "What care directives need follow-up today?"];
      case "patient":
        return ["Explain my latest vitals simply.", "What should I do if I feel unwell?"];
      default:
        return ["What are my top tasks right now?", "Any urgent alerts I should check?"];
    }
  }, [user?.role]);

  /* ── Auth headers ───────────────────────────────────────────────────── */

  const authHeaders = useCallback((): HeadersInit => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("ws_token") : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  /* ── Auto-scroll ────────────────────────────────────────────────────── */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Load data on open ──────────────────────────────────────────────── */

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Conversation[];
      setConversations(data);
      if (
        conversationId != null &&
        !data.some((conversation) => conversation.id === conversationId)
      ) {
        setConversationId(null);
        setMessages([]);
        setHistoryNotice("This conversation is no longer available.");
      }
    } catch {
      // keep chat usable even if history endpoint fails
    }
  }, [authHeaders, conversationId]);

  const loadConversationMessages = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`${API_BASE}/chat/conversations/${id}/messages`, {
          headers: authHeaders(),
        });
        if (res.status === 404) {
          setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
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
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
        setMessages(filtered);
        setConversationId(id);
        setShowHistory(false);
        setHistoryNotice("");
      } catch {
        // non-fatal
      }
    },
    [authHeaders, conversationId],
  );

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/ai`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { provider: "ollama" | "copilot"; model: string };
      setProvider(data.provider);
      setModel(data.model);
    } catch {
      // non-fatal
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!open || !user) return;
    void loadConversations();
    void loadSettings();
  }, [open, user, loadConversations, loadSettings]);

  /* ── New Chat ───────────────────────────────────────────────────────── */

  function handleNewChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setHistoryNotice("");
    setShowHistory(false);
  }

  /* ── Delete conversation ────────────────────────────────────────────── */

  async function handleDeleteConversation(id: number) {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok && res.status !== 404) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        handleNewChat();
        setHistoryNotice("Conversation removed.");
      }
    } catch {
      // non-fatal
    }
  }

  /* ── Send message ───────────────────────────────────────────────────── */

  const send = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
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
          body: JSON.stringify({
            title: userMessage.content.slice(0, 80),
          }),
        });
        if (createRes.ok) {
          const conv = (await createRes.json()) as { id: number };
          convId = conv.id;
          setConversationId(conv.id);
          void loadConversations();
        }
      }

      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          conversation_id: convId,
          provider: provider || undefined,
          model: model.trim() || undefined,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 404) {
          setConversationId(null);
          setHistoryNotice("The previous conversation was removed. Start a new chat.");
        }
        setError(`Error: ${res.status}`);
        return;
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
          if (copy.length === 0) return copy;
          const last = copy[copy.length - 1];
          if (last.role === "assistant") {
            copy[copy.length - 1] = { ...last, content: assistant };
          }
          return copy;
        });
      }
      void loadConversations();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [input, messages, conversationId, authHeaders, loadConversations, provider, model]);

  if (!user) return null;

  const activeTitle =
    conversations.find((c) => c.id === conversationId)?.title || null;

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <>
      {/* ── FAB ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full gradient-cta text-white shadow-elevated hover:opacity-90 transition-smooth"
        aria-label="Open EaseAI chat"
      >
        <MessageCircle className="h-7 w-7" />
      </button>

      {/* ── Popup ──────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[36rem] w-[min(100vw-2rem,28rem)] overflow-hidden rounded-2xl border border-outline-variant/20 surface-card shadow-modal">
          {/* ── History sidebar ─────────────────────────────────── */}
          {showHistory && (
            <div className="flex w-56 shrink-0 flex-col border-r border-outline-variant/15 bg-surface-container-low">
              <div className="flex items-center justify-between border-b border-outline-variant/15 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  History
                </p>
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
                className="mx-2 mt-2 flex items-center gap-2 rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container transition-smooth"
                onClick={handleNewChat}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New Chat
              </button>
              <ul className="mt-2 flex-1 overflow-y-auto px-1 pb-2 space-y-0.5">
                {conversations.map((c) => (
                  <li key={c.id} className="group">
                    <button
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-smooth ${
                        conversationId === c.id
                          ? "bg-primary-fixed/50 text-primary font-medium"
                          : "text-on-surface-variant hover:bg-surface-container"
                      }`}
                      onClick={() => void loadConversationMessages(c.id)}
                    >
                      <History className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate flex-1">
                        {(c.title || "Untitled").slice(0, 30)}
                      </span>
                      <button
                        type="button"
                        className="ml-auto hidden rounded p-0.5 hover:bg-critical/20 group-hover:inline-flex"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteConversation(c.id);
                        }}
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3 w-3 text-critical" aria-hidden />
                      </button>
                    </button>
                  </li>
                ))}
                {conversations.length === 0 && (
                  <li className="px-3 py-4 text-center text-[11px] text-on-surface-variant">
                    No conversations yet.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* ── Main panel ─────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-outline-variant/15 bg-surface-container-low px-3 py-2.5">
              <button
                type="button"
                className="rounded-lg p-1 hover:bg-surface-container transition-smooth"
                onClick={() => setShowHistory((o) => !o)}
                aria-label="Toggle history"
              >
                <PanelLeftOpen className="h-4 w-4" aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-on-surface">EaseAI</p>
                <p className="truncate text-[11px] text-on-surface-variant">
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

            {/* Settings dropdown */}
            <div className="border-b border-outline-variant/15">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] text-on-surface-variant hover:bg-surface-container-low transition-smooth"
                onClick={() => setSettingsOpen((o) => !o)}
              >
                <span>
                  {provider || "ollama"} · {model || "default"}
                </span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {settingsOpen && (
                <div className="grid grid-cols-2 gap-2 px-3 pb-2">
                  <select
                    className="input-field text-xs"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as "ollama" | "copilot")}
                  >
                    <option value="ollama">ollama</option>
                    <option value="copilot">copilot</option>
                  </select>
                  <input
                    className="input-field text-xs"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="model"
                  />
                </div>
              )}
            </div>

            {/* Quick prompts (only when no messages) */}
            {messages.length === 0 && !loading && (
              <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-outline-variant/15">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    className="rounded-lg bg-surface-container px-2 py-1 text-[11px] text-on-surface-variant hover:bg-surface-container-high transition-smooth"
                    onClick={() => setInput(qp)}
                  >
                    {qp}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 text-sm text-on-surface space-y-2">
              {historyNotice ? (
                <div className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                  {historyNotice}
                </div>
              ) : null}
              {messages.length === 0 && !loading && (
                <p className="text-on-surface-variant">
                  Ask about patients, alerts, workflows, or ward operations.
                </p>
              )}
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
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(
                          m.content || (loading && idx === messages.length - 1 ? "…" : ""),
                        ),
                      }}
                    />
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              ))}
              {error ? <p className="text-critical text-xs">{error}</p> : null}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 border-t border-outline-variant/15 p-3">
              <input
                className="input-field flex-1 text-sm"
                placeholder="Message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              />
              <button
                type="button"
                disabled={loading}
                onClick={send}
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
