"use client";

import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Mail, MessageSquare, Send, UserRoundCheck } from "lucide-react";

interface RoleMessage {
  id: number;
  sender_user_id: number;
  recipient_role: string | null;
  recipient_user_id: number | null;
  patient_id: number | null;
  subject: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

const ROLE_OPTIONS = ["admin", "head_nurse", "supervisor", "observer", "patient"];

export default function HeadNurseMessagesPage() {
  const { user } = useAuth();
  const { data: messages, isLoading, refetch } =
    useQuery<RoleMessage[]>("/workflow/messages?inbox_only=false&limit=120");

  const [recipientRole, setRecipientRole] = useState("supervisor");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [patientId, setPatientId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"inbox" | "sent">("inbox");
  const [notice, setNotice] = useState<string | null>(null);

  const inbox = useMemo(() => {
    const uid = user?.id;
    return (messages ?? []).filter((item) => {
      if (uid == null) return item.sender_user_id !== uid;
      return item.sender_user_id !== uid;
    });
  }, [messages, user?.id]);

  const sent = useMemo(() => {
    const uid = user?.id;
    return (messages ?? []).filter((item) => item.sender_user_id === uid);
  }, [messages, user?.id]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      await api.post<RoleMessage>("/workflow/messages", {
        recipient_role: recipientRole,
        subject: subject.trim(),
        body: body.trim(),
        patient_id: patientId ? Number(patientId) : undefined,
      });
      setSubject("");
      setBody("");
      setPatientId("");
      setActiveTab("sent");
      setNotice("Message sent.");
      await refetch();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to send message.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markRead(messageId: number) {
    try {
      await api.post<RoleMessage>(`/workflow/messages/${messageId}/read`);
      await refetch();
    } catch {
      // Keep page responsive even if read receipt fails.
    }
  }

  const list = activeTab === "inbox" ? inbox : sent;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">Clinical messages</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Send role-targeted updates and track read status across teams.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="surface-card p-5 xl:col-span-1">
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2 mb-3">
            <Send className="w-4 h-4 text-primary" />
            Compose message
          </h3>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">Recipient role</label>
              <select
                value={recipientRole}
                onChange={(e) => setRecipientRole(e.target.value)}
                className="input-field py-2.5 text-sm"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="input-field py-2.5 text-sm"
                placeholder="Shift coordination update"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Patient ID (optional)
              </label>
              <input
                type="number"
                min={1}
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="input-field py-2.5 text-sm"
                placeholder="e.g. 12"
              />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">Message</label>
              <textarea
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="input-field py-2.5 text-sm resize-y"
                placeholder="Provide concise operational instructions for the next shift."
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !body.trim()}
              className="w-full gradient-cta py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send message"}
            </button>
          </form>
          {notice && (
            <p className="text-xs text-on-surface-variant mt-3 rounded-lg bg-surface-container-low px-3 py-2">
              {notice}
            </p>
          )}
        </section>

        <section className="surface-card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
              <Mail className="w-4 h-4 text-info" />
              Message center
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("inbox")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  activeTab === "inbox"
                    ? "bg-primary-fixed text-primary"
                    : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                Inbox ({inbox.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("sent")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  activeTab === "sent"
                    ? "bg-primary-fixed text-primary"
                    : "bg-surface-container-low text-on-surface-variant"
                }`}
              >
                Sent ({sent.length})
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-14">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl bg-surface-container-low px-4 py-8 text-center">
              <MessageSquare className="w-8 h-8 text-outline mx-auto mb-2" />
              <p className="text-sm text-on-surface-variant">
                {activeTab === "inbox"
                  ? "No messages in inbox."
                  : "No sent messages yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {list.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-surface-container-low px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-on-surface truncate">
                        {item.subject || "(No subject)"}
                      </p>
                      <p className="text-xs text-outline mt-0.5">
                        From user #{item.sender_user_id}
                        {item.recipient_role ? ` · to role ${item.recipient_role}` : ""}
                        {item.patient_id ? ` · patient ${item.patient_id}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-outline shrink-0">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface-variant mt-2 whitespace-pre-wrap">
                    {item.body}
                  </p>
                  {activeTab === "inbox" && (
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`text-[10px] px-2 py-1 rounded-full uppercase font-semibold ${
                          item.is_read
                            ? "bg-success-bg text-success"
                            : "bg-warning-bg text-warning"
                        }`}
                      >
                        {item.is_read ? "read" : "unread"}
                      </span>
                      {!item.is_read && (
                        <button
                          type="button"
                          onClick={() => void markRead(item.id)}
                          className="px-2.5 py-1 rounded-md text-xs font-medium bg-info-bg text-info hover:opacity-80 transition-smooth inline-flex items-center gap-1"
                        >
                          <UserRoundCheck className="w-3 h-3" />
                          Mark read
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
