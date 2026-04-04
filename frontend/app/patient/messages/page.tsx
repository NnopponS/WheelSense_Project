"use client";

import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Send } from "lucide-react";

type RoleMessage = {
  id: number;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
  recipient_role: string | null;
};

type RecipientRole = "observer" | "supervisor" | "head_nurse";

export default function PatientMessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<RoleMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [markingId, setMarkingId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientRole, setRecipientRole] = useState<RecipientRole>("observer");

  const unreadCount = useMemo(
    () => messages.filter((message) => !message.is_read).length,
    [messages],
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<RoleMessage[]>(
        "/workflow/messages?inbox_only=true&limit=100",
      );
      setMessages(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;

    setSending(true);
    try {
      await api.post<RoleMessage>("/workflow/messages", {
        recipient_role: recipientRole,
        patient_id: user?.patient_id ?? null,
        subject: subject.trim(),
        body: body.trim(),
      });
      setSubject("");
      setBody("");
      await loadMessages();
    } finally {
      setSending(false);
    }
  }

  async function markAsRead(messageId: number) {
    setMarkingId(messageId);
    try {
      await api.post<RoleMessage>(`/workflow/messages/${messageId}/read`);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, is_read: true } : message,
        ),
      );
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">Messages</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Inbox: {messages.length} messages, {unreadCount} unread
          </p>
        </div>
        <button
          onClick={() => void loadMessages()}
          className="px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-sm font-medium transition-smooth"
        >
          Refresh
        </button>
      </div>

      <section className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-on-surface mb-4">
          Send a message to your care team
        </h3>
        <form onSubmit={sendMessage} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-on-surface-variant">Recipient role</span>
              <select
                value={recipientRole}
                onChange={(event) =>
                  setRecipientRole(event.target.value as RecipientRole)
                }
                className="w-full px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface text-on-surface"
              >
                <option value="observer">Observer</option>
                <option value="supervisor">Supervisor</option>
                <option value="head_nurse">Head Nurse</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-on-surface-variant">Subject</span>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface text-on-surface"
                placeholder="Medication question"
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-xs text-on-surface-variant">Message</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="w-full min-h-28 px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface text-on-surface"
              placeholder="Write your message for the care team."
            />
          </label>
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending..." : "Send message"}
          </button>
        </form>
      </section>

      <section className="bg-surface-container shadow-sm border border-outline-variant/20 rounded-3xl p-6">
        <h3 className="text-lg font-semibold text-on-surface mb-4">Inbox</h3>
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-error">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No messages in your inbox.</p>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`p-4 rounded-2xl border ${
                  message.is_read
                    ? "bg-surface border-outline-variant/20"
                    : "bg-primary/5 border-primary/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-on-surface">
                      {message.subject || "Care team message"}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {new Date(message.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!message.is_read && (
                    <button
                      onClick={() => void markAsRead(message.id)}
                      disabled={markingId === message.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-60"
                    >
                      {markingId === message.id ? "Updating..." : "Mark read"}
                    </button>
                  )}
                </div>
                <p className="text-sm text-on-surface-variant mt-3 whitespace-pre-wrap">
                  {message.body}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 text-xs text-on-surface-variant">
        <Mail className="w-4 h-4" />
        Messages are fetched from `GET /workflow/messages`.
      </div>
    </div>
  );
}
