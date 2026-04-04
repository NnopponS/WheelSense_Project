"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { API_BASE } from "@/lib/constants";

/**
 * Streams plain text from `POST /api/chat/stream` (WheelSense FastAPI).
 * Pairs with backend `text/plain` streaming response.
 */
export default function AIChatPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<
    Array<{ id: number; title: string | null; updated_at: string }>
  >([]);
  const [provider, setProvider] = useState<"ollama" | "copilot" | "">("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");

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

  const authHeaders = useCallback((): HeadersInit => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("ws_token") : null;
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Array<{ id: number; title: string | null; updated_at: string }>;
      setConversations(data);
      if (!conversationId && data.length > 0) {
        setConversationId(data[0].id);
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
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ role: string; content: string }>;
        const filtered = data
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
        setMessages(filtered);
        setConversationId(id);
      } catch {
        // non-fatal
      }
    },
    [authHeaders],
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

  const send = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    const userMessage = { role: "user" as const, content: input.trim() };
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full gradient-cta text-white shadow-elevated flex items-center justify-center hover:opacity-90 transition-smooth"
        aria-label="Open EaseAI chat"
      >
        <MessageCircle className="w-7 h-7" />
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[min(100vw-2rem,24rem)] h-[28rem] surface-card shadow-modal flex flex-col overflow-hidden border border-outline-variant/20">
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15 bg-surface-container-low">
            <div>
              <p className="text-sm font-semibold text-on-surface">EaseAI</p>
              <p className="text-[11px] text-on-surface-variant capitalize">
                {user.role.replace("_", " ")}
              </p>
            </div>
            <button
              type="button"
              className="p-1 rounded-lg hover:bg-surface-container"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-3 py-2 border-b border-outline-variant/15 grid grid-cols-2 gap-2">
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
          <div className="px-3 py-2 border-b border-outline-variant/15">
            <div className="flex flex-wrap gap-1">
              {quickPrompts.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  className="text-[11px] px-2 py-1 rounded-lg bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                  onClick={() => setInput(qp)}
                >
                  {qp}
                </button>
              ))}
            </div>
            {conversations.length > 0 && (
              <div className="mt-2 flex gap-1 overflow-x-auto">
                {conversations.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`text-[11px] px-2 py-1 rounded-lg ${
                      conversationId === c.id
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container text-on-surface-variant"
                    }`}
                    onClick={() => void loadConversationMessages(c.id)}
                  >
                    {(c.title || "Untitled").slice(0, 18)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-sm text-on-surface whitespace-pre-wrap space-y-2">
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
                {m.content || (loading && m.role === "assistant" ? "…" : "")}
              </div>
            ))}
            {error && <p className="text-critical text-xs">{error}</p>}
          </div>
          <div className="p-3 border-t border-outline-variant/15 flex gap-2">
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
              className="px-3 rounded-xl gradient-cta text-white disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
