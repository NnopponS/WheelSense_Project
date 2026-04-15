"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, PenLine, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  WorkflowComposeAttachments,
  WorkflowMessageAttachmentLinks,
  type PendingAttachmentChip,
} from "@/components/messaging/WorkflowMessageAttachmentViews";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListWorkflowMessagesResponse,
  RoleMessageAttachmentOut,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";
import { canDeleteWorkflowMessage, WORKFLOW_MESSAGE_MAX_ATTACHMENTS } from "@/lib/workflowMessaging";

const NO_RECIPIENT_SELECTED = "__none__";

type MessagingRecipient = {
  id: number;
  username: string;
  role: string;
  display_name: string;
  kind: string;
};

type MessageRow = {
  id: number;
  subject: string;
  body: string;
  isRead: boolean;
  recipientLabel: string;
  createdAt: string;
  senderUserId: number;
  recipientRole: string | null;
  recipientUserId: number | null;
  attachments: RoleMessageAttachmentOut[];
};

function toErrorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function PatientWorkflowMailbox() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"inbox" | "sent">("inbox");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientUserId, setRecipientUserId] = useState<string>(NO_RECIPIENT_SELECTED);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentChip[]>([]);

  const recipientsQuery = useQuery({
    queryKey: ["patient", "messages", "recipients"],
    queryFn: () => api.listWorkflowMessagingRecipients(),
    staleTime: 60_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["patient", "messages", "list"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 200 }),
    refetchInterval: 20_000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const rid = Number(recipientUserId);
      if (
        recipientUserId === NO_RECIPIENT_SELECTED ||
        !Number.isFinite(rid) ||
        rid <= 0
      ) {
        throw new Error("Select a recipient");
      }
      if (!body.trim() && pendingAttachments.length === 0) {
        throw new Error("body");
      }
      const payload = {
        recipient_user_id: rid,
        patient_id: user?.patient_id ?? null,
        subject: subject.trim() || "Patient message",
        body: body.trim(),
        pending_attachment_ids: pendingAttachments.map((p) => p.pendingId),
      } satisfies SendWorkflowMessageRequest;

      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      setSubject("");
      setBody("");
      setPendingAttachments([]);
      setRecipientUserId(NO_RECIPIENT_SELECTED);
      setComposeOpen(false);
      setActiveTab("sent");
      await queryClient.invalidateQueries({ queryKey: ["patient", "messages"] });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.deleteWorkflowMessage(messageId);
    },
    onSuccess: async () => {
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["patient", "messages"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.markWorkflowMessageRead(messageId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patient", "messages"] });
    },
  });

  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );

  const recipients = useMemo(
    () => (recipientsQuery.data ?? []) as MessagingRecipient[],
    [recipientsQuery.data],
  );

  const rows = useMemo<MessageRow[]>(() => {
    return messages
      .map((message) => {
        const person = message.recipient_person;
        const recipientLabel =
          person?.display_name?.trim() ||
          (message.recipient_user_id != null ? `User #${message.recipient_user_id}` : null) ||
          message.recipient_role ||
          "-";
        return {
          id: message.id,
          subject: message.subject || t("patient.messages.defaultSubject"),
          body: message.body,
          isRead: message.is_read,
          recipientLabel,
          createdAt: message.created_at,
          senderUserId: message.sender_user_id,
          recipientRole: message.recipient_role,
          recipientUserId: message.recipient_user_id,
          attachments: message.attachments ?? [],
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [messages, t]);

  const inboxRows = useMemo(
    () => rows.filter((r) => r.senderUserId !== user?.id),
    [rows, user?.id],
  );

  const sentRows = useMemo(
    () => rows.filter((r) => r.senderUserId === user?.id),
    [rows, user?.id],
  );

  const tabRows = activeTab === "inbox" ? inboxRows : sentRows;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabRows;
    return tabRows.filter(
      (row) =>
        row.subject.toLowerCase().includes(q) ||
        row.body.toLowerCase().includes(q) ||
        row.recipientLabel.toLowerCase().includes(q),
    );
  }, [tabRows, search]);

  const effectiveSelectedId =
    selectedId != null && tabRows.some((r) => r.id === selectedId) ? selectedId : null;

  const selected = useMemo(
    () =>
      effectiveSelectedId != null
        ? (tabRows.find((r) => r.id === effectiveSelectedId) ?? null)
        : null,
    [tabRows, effectiveSelectedId],
  );

  const unreadCount = inboxRows.filter((m) => !m.isRead).length;
  const sendError = sendMessageMutation.error
    ? toErrorText(sendMessageMutation.error, t("patient.messages.requestFailed"))
    : null;

  const loading = messagesQuery.isLoading;

  const patientMessageMeta = selected ? (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>
        {t("headNurse.messages.fromUserPrefix")}
        {selected.senderUserId}
      </p>
      <p>{selected.recipientLabel}</p>
      {selected.recipientRole ? (
        <p>
          {t("headNurse.messages.recipientRolePrefix")}
          {selected.recipientRole}
        </p>
      ) : null}
      {selected.recipientUserId != null ? (
        <p>
          {t("headNurse.messages.toUserPrefix")}
          {selected.recipientUserId}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("patient.messages.title")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("patient.messages.inboxIntro")} {rows.length} {t("patient.messages.messagesWord")},{" "}
            {unreadCount} {t("patient.messages.unreadLabel")}.
          </p>
        </div>
        <Button type="button" className="shrink-0 gap-2" onClick={() => setComposeOpen(true)}>
          <PenLine className="h-4 w-4" />
          {t("messaging.mailbox.composeButton")}
        </Button>
      </div>

      <div className="flex min-h-[min(70vh,780px)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm lg:flex-row">
        <div className="flex w-full min-w-0 flex-col border-border/80 lg:w-[min(100%,400px)] lg:border-r">
          <div className="flex items-center gap-2 border-b border-border/70 p-2">
            <Button
              type="button"
              size="sm"
              variant={activeTab === "inbox" ? "default" : "outline"}
              className="flex-1 gap-1 sm:flex-none"
              onClick={() => {
                setActiveTab("inbox");
                setSelectedId(null);
              }}
            >
              <Inbox className="h-4 w-4 opacity-80" />
              {t("messaging.mailbox.inboxTab")} ({inboxRows.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === "sent" ? "default" : "outline"}
              className="flex-1 gap-1 sm:flex-none"
              onClick={() => {
                setActiveTab("sent");
                setSelectedId(null);
              }}
            >
              <Mail className="h-4 w-4 opacity-80" />
              {t("messaging.mailbox.sentTab")} ({sentRows.length})
            </Button>
          </div>
          <div className="border-b border-border/70 p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("messaging.mailbox.searchPlaceholder")}
              className="h-9 bg-muted/30"
              aria-label={t("messaging.mailbox.searchPlaceholder")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : filteredRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {activeTab === "inbox" ? t("patient.messages.empty") : t("supervisor.messages.emptySent")}
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {filteredRows.map((row) => {
                  const isSel = effectiveSelectedId === row.id;
                  const unread = activeTab === "inbox" && !row.isRead;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-3 text-left transition-colors hover:bg-muted/50",
                          isSel && "bg-primary/10 ring-1 ring-inset ring-primary/25",
                          unread && "border-l-2 border-l-primary pl-[10px]",
                        )}
                      >
                        <span
                          className={cn(
                            "line-clamp-1 text-sm",
                            unread ? "font-semibold text-foreground" : "text-foreground",
                          )}
                        >
                          {row.subject}
                        </span>
                        <span className="line-clamp-1 text-xs text-muted-foreground">
                          {row.recipientLabel} · {formatRelativeTime(row.createdAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-[280px] min-w-0 flex-1 flex-col bg-background/40 lg:min-h-0">
          {selected ? (
            <>
              <div className="border-b border-border/70 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-lg font-semibold leading-snug text-foreground">{selected.subject}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(selected.createdAt)} · {formatRelativeTime(selected.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canDeleteWorkflowMessage(user, {
                      sender_user_id: selected.senderUserId,
                      recipient_user_id: selected.recipientUserId,
                    }) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={deleteMessageMutation.isPending}
                        onClick={() => {
                          if (typeof window !== "undefined" && window.confirm(t("messaging.delete.confirm"))) {
                            deleteMessageMutation.mutate(selected.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("messaging.delete.button")}
                      </Button>
                    ) : null}
                    {activeTab === "inbox" && !selected.isRead ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => markReadMutation.mutate(selected.id)}
                      >
                        {t("patient.messages.markRead")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {patientMessageMeta}
                <Badge variant={selected.isRead ? "success" : "warning"}>
                  {selected.isRead ? t("patient.messages.read") : t("patient.messages.unread")}
                </Badge>
                {selected.attachments.length > 0 ? (
                  <WorkflowMessageAttachmentLinks messageId={selected.id} attachments={selected.attachments} />
                ) : null}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{selected.body}</p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <Mail className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">{t("messaging.mailbox.selectMessage")}</p>
              <p className="max-w-sm text-xs text-muted-foreground">{t("messaging.mailbox.readingPaneHint")}</p>
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={composeOpen}
        onOpenChange={(open) => {
          setComposeOpen(open);
          if (!open) setPendingAttachments([]);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("patient.messages.sendCardTitle")}</SheetTitle>
            <SheetDescription>{t("patient.messages.recipientUserHint")}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 px-2 pb-6 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("patient.messages.recipientUser")}</Label>
                <Select
                  value={recipientUserId}
                  onValueChange={setRecipientUserId}
                  disabled={recipientsQuery.isLoading || recipients.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        recipientsQuery.isLoading
                          ? t("common.loading")
                          : recipients.length === 0
                            ? t("patient.messages.noRecipients")
                            : t("patient.messages.recipientPlaceholder")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_RECIPIENT_SELECTED} className="text-muted-foreground">
                      {t("patient.messages.recipientPlaceholder")}
                    </SelectItem>
                    {recipients.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.display_name} (@{r.username}) · {r.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recipientsQuery.isError ? (
                  <p className="text-xs text-destructive">{t("patient.messages.recipientsLoadFailed")}</p>
                ) : null}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("patient.messages.subject")}</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t("patient.messages.subjectPlaceholder")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("patient.messages.body")}</Label>
              <Textarea
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("patient.messages.bodyPlaceholder")}
              />
            </div>

            <WorkflowComposeAttachments
              idPrefix="patient-mail"
              items={pendingAttachments}
              disabled={sendMessageMutation.isPending}
              busy={sendMessageMutation.isPending}
              onRemove={(pendingId) =>
                setPendingAttachments((prev) => prev.filter((p) => p.pendingId !== pendingId))
              }
              onAdd={async (file) => {
                if (pendingAttachments.length >= WORKFLOW_MESSAGE_MAX_ATTACHMENTS) return;
                const out = await api.uploadWorkflowMessageAttachment(file);
                setPendingAttachments((prev) => [
                  ...prev,
                  { pendingId: out.pending_id, filename: out.filename },
                ]);
              }}
            />

            {sendError ? <p className="text-sm text-destructive">{sendError}</p> : null}

            <Button
              type="button"
              disabled={
                sendMessageMutation.isPending ||
                (!body.trim() && pendingAttachments.length === 0) ||
                recipientUserId === NO_RECIPIENT_SELECTED
              }
              onClick={() => sendMessageMutation.mutate()}
              className="w-full gap-2 sm:w-auto"
            >
              <Send className="h-4 w-4" />
              {sendMessageMutation.isPending ? t("patient.messages.sending") : t("patient.messages.send")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
