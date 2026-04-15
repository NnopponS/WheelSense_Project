"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, PenLine, Send, Trash2, UserRoundCheck, Users } from "lucide-react";
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
import {
  MessagingRecipientPicker,
  matchesRecipientRoleFilter,
  matchesRecipientSearch,
  type MessagingRecipientRow,
} from "@/components/messaging/MessagingRecipientPicker";
import { useAuth } from "@/hooks/useAuth";
import {
  WorkflowComposeAttachments,
  WorkflowMessageAttachmentLinks,
  type PendingAttachmentChip,
} from "@/components/messaging/WorkflowMessageAttachmentViews";
import { ApiError, api } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListWorkflowMessagesResponse,
  RoleMessageAttachmentOut,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";
import { canDeleteWorkflowMessage, WORKFLOW_MESSAGE_MAX_ATTACHMENTS } from "@/lib/workflowMessaging";

type RecipientTarget = "role" | "user";
type MessageTab = "all" | "inbox" | "sent";

const ROLE_OPTIONS = ["admin", "head_nurse", "supervisor", "observer", "patient"] as const;
const RECIPIENT_FILTER_ROLES = ["admin", "head_nurse", "supervisor", "observer", "patient"] as const;
type RecipientFilterRole = (typeof RECIPIENT_FILTER_ROLES)[number];

const TARGET_USER_NONE = "__none__";

type MessageRow = {
  id: number;
  subject: string;
  body: string;
  senderUserId: number;
  recipientRole: string | null;
  recipientUserId: number | null;
  recipientLabel: string;
  isRead: boolean;
  createdAt: string;
  attachments: RoleMessageAttachmentOut[];
};

function parseError(error: unknown, t: (key: TranslationKey) => string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return t("common.requestFailed");
}

function workflowRoleDisplay(role: string, t: (key: TranslationKey) => string): string {
  switch (role) {
    case "admin":
      return t("admin.workflowMessaging.roleLabelAdmin");
    case "head_nurse":
      return t("admin.workflowMessaging.roleLabelHeadNurse");
    case "supervisor":
      return t("admin.workflowMessaging.roleLabelSupervisor");
    case "observer":
      return t("admin.workflowMessaging.roleLabelObserver");
    case "patient":
      return t("admin.workflowMessaging.roleLabelPatient");
    default:
      return role;
  }
}

function recipientFilterRoleLabelKey(role: RecipientFilterRole): TranslationKey {
  switch (role) {
    case "admin":
      return "admin.workflowMessaging.roleLabelAdmin";
    case "head_nurse":
      return "admin.workflowMessaging.roleLabelHeadNurse";
    case "supervisor":
      return "admin.workflowMessaging.roleLabelSupervisor";
    case "observer":
      return "admin.workflowMessaging.roleLabelObserver";
    case "patient":
      return "admin.workflowMessaging.roleLabelPatient";
    default:
      return "admin.workflowMessaging.roleLabelAdmin";
  }
}

export function AdminWorkflowMailbox() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<MessageTab>("inbox");
  const [listSearch, setListSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientTarget, setRecipientTarget] = useState<RecipientTarget>("role");
  const [recipientRole, setRecipientRole] = useState<(typeof ROLE_OPTIONS)[number]>("supervisor");
  const [userFilterRole, setUserFilterRole] = useState<RecipientFilterRole>("head_nurse");
  const [recipientUserId, setRecipientUserId] = useState<string>(TARGET_USER_NONE);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentChip[]>([]);
  const [pendingReadId, setPendingReadId] = useState<number | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["admin", "messages", "list"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 200 }),
    refetchInterval: 20_000,
  });

  const recipientsQuery = useQuery({
    queryKey: ["admin", "messages", "recipients"],
    queryFn: () => api.listWorkflowMessagingRecipients(),
    staleTime: 60_000,
    enabled: composeOpen && recipientTarget === "user",
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (recipientTarget === "user") {
        const rid = Number(recipientUserId);
        if (recipientUserId === TARGET_USER_NONE || !Number.isFinite(rid) || rid <= 0) {
          throw new Error(t("admin.workflowMessaging.selectRecipientUser"));
        }
      }
      if (!body.trim() && pendingAttachments.length === 0) {
        throw new Error(t("admin.workflowMessaging.bodyRequired"));
      }

      const payload = {
        recipient_role: recipientTarget === "role" ? recipientRole : null,
        recipient_user_id: recipientTarget === "user" ? Number(recipientUserId) : null,
        subject: subject.trim() || t("admin.workflowMessaging.defaultSubject"),
        body: body.trim(),
        pending_attachment_ids: pendingAttachments.map((p) => p.pendingId),
      } satisfies SendWorkflowMessageRequest;

      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      setSubject("");
      setBody("");
      setPendingAttachments([]);
      setRecipientTarget("role");
      setRecipientRole("supervisor");
      setUserFilterRole("head_nurse");
      setRecipientUserId(TARGET_USER_NONE);
      setRecipientSearch("");
      setComposeOpen(false);
      setActiveTab("sent");
      await queryClient.invalidateQueries({ queryKey: ["admin", "messages"] });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.deleteWorkflowMessage(messageId);
    },
    onSuccess: async () => {
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "messages"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.markWorkflowMessageRead(messageId);
    },
    onSettled: () => {
      setPendingReadId(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "messages"] });
    },
  });

  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );

  const recipients = useMemo(
    () => [...((recipientsQuery.data ?? []) as MessagingRecipientRow[])].sort((left, right) =>
      left.display_name.localeCompare(right.display_name) || left.username.localeCompare(right.username),
    ),
    [recipientsQuery.data],
  );

  const rows = useMemo<MessageRow[]>(() => {
    return messages
      .map((message) => {
        const recipientPerson = message.recipient_person ?? null;
        const recipientLabel =
          recipientPerson?.display_name?.trim() ||
          (message.recipient_user_id != null
            ? t("admin.workflowMessaging.userNumber").replace("{id}", String(message.recipient_user_id))
            : null) ||
          (message.recipient_role ? workflowRoleDisplay(message.recipient_role, t) : null) ||
          t("admin.workflowMessaging.allRecipients");

        return {
          id: message.id,
          subject: message.subject || t("admin.workflowMessaging.defaultSubject"),
          body: message.body,
          senderUserId: message.sender_user_id,
          recipientRole: message.recipient_role,
          recipientUserId: message.recipient_user_id,
          recipientLabel,
          isRead: message.is_read,
          createdAt: message.created_at,
          attachments: message.attachments ?? [],
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [messages, t]);

  const inboxRows = useMemo(
    () => rows.filter((message) => message.senderUserId !== user?.id),
    [rows, user?.id],
  );

  const sentRows = useMemo(
    () => rows.filter((message) => message.senderUserId === user?.id),
    [rows, user?.id],
  );

  const folderRows =
    activeTab === "all" ? rows : activeTab === "inbox" ? inboxRows : sentRows;

  const listRows = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return folderRows;
    return folderRows.filter(
      (row) =>
        row.subject.toLowerCase().includes(q) ||
        row.body.toLowerCase().includes(q) ||
        row.recipientLabel.toLowerCase().includes(q),
    );
  }, [folderRows, listSearch]);

  const effectiveSelectedId =
    selectedId != null && folderRows.some((r) => r.id === selectedId) ? selectedId : null;

  const selected = useMemo(
    () =>
      effectiveSelectedId != null
        ? (folderRows.find((r) => r.id === effectiveSelectedId) ?? null)
        : null,
    [folderRows, effectiveSelectedId],
  );

  const unreadCount = inboxRows.filter((message) => !message.isRead).length;

  const recipientBaseForRole = useMemo(
    () =>
      recipients.filter(
        (r) => matchesRecipientRoleFilter(r, userFilterRole) && r.id !== user?.id,
      ),
    [recipients, userFilterRole, user?.id],
  );

  const recipientCandidates = useMemo(() => {
    const sorted = [...recipientBaseForRole].sort(
      (a, b) =>
        a.display_name.localeCompare(b.display_name) || a.username.localeCompare(b.username),
    );
    return sorted.filter((r) => matchesRecipientSearch(r, recipientSearch));
  }, [recipientBaseForRole, recipientSearch]);

  const sendError = sendMessageMutation.error ? parseError(sendMessageMutation.error, t) : null;
  const recipientError =
    recipientTarget === "user" && recipientsQuery.isSuccess && !recipients.length
      ? t("admin.workflowMessaging.noRecipientsFromApi")
      : null;

  const listLoading = messagesQuery.isLoading;

  return (
    <div className="space-y-5 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            {t("admin.workflowMessaging.badge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t("admin.workflowMessaging.title")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("admin.workflowMessaging.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">
              {t("admin.workflowMessaging.countTotal").replace("{count}", String(rows.length))}
            </Badge>
            <Badge variant="warning">
              {t("admin.workflowMessaging.countUnread").replace("{count}", String(unreadCount))}
            </Badge>
            <Badge variant="success">
              {t("admin.workflowMessaging.countSent").replace("{count}", String(sentRows.length))}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          className="shrink-0 gap-2"
          onClick={() => {
            setRecipientSearch("");
            setComposeOpen(true);
          }}
        >
          <PenLine className="h-4 w-4" />
          {t("messaging.mailbox.composeButton")}
        </Button>
      </div>

      <div className="flex min-h-[min(70vh,780px)] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm lg:flex-row">
        <div className="flex w-full min-w-0 flex-col border-border/80 lg:w-[min(100%,420px)] lg:border-r">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-2">
            <Button
              type="button"
              size="sm"
              variant={activeTab === "inbox" ? "default" : "outline"}
              className="gap-1"
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
              className="gap-1"
              onClick={() => {
                setActiveTab("sent");
                setSelectedId(null);
              }}
            >
              <Send className="h-4 w-4 opacity-80" />
              {t("messaging.mailbox.sentTab")} ({sentRows.length})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeTab === "all" ? "default" : "outline"}
              className="gap-1"
              onClick={() => {
                setActiveTab("all");
                setSelectedId(null);
              }}
            >
              <Users className="h-4 w-4 opacity-80" />
              {t("admin.workflowMessaging.tabAll")} ({rows.length})
            </Button>
          </div>
          <div className="border-b border-border/70 p-2">
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder={t("messaging.mailbox.searchPlaceholder")}
              className="h-9 bg-muted/30"
              aria-label={t("messaging.mailbox.searchPlaceholder")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {listLoading ? (
              <p className="p-4 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : listRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("admin.workflowMessaging.tableEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {listRows.map((row) => {
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
                        className="shrink-0 gap-1"
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
                        className="shrink-0 gap-1"
                        disabled={markReadMutation.isPending && pendingReadId === selected.id}
                        onClick={() => {
                          setPendingReadId(selected.id);
                          markReadMutation.mutate(selected.id);
                        }}
                      >
                        <UserRoundCheck className="h-4 w-4" />
                        {t("admin.workflowMessaging.markRead")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    {t("admin.workflowMessaging.fromUser").replace("{id}", String(selected.senderUserId))}
                  </p>
                  <p>{selected.recipientLabel}</p>
                  <p>
                    {selected.recipientRole
                      ? t("admin.workflowMessaging.roleLine").replace(
                          "{role}",
                          workflowRoleDisplay(selected.recipientRole, t),
                        )
                      : t("admin.workflowMessaging.directMessage")}
                  </p>
                </div>
                <Badge variant={selected.isRead ? "success" : "warning"}>
                  {selected.isRead
                    ? t("admin.workflowMessaging.statusRead")
                    : t("admin.workflowMessaging.statusUnread")}
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
          if (!open) {
            setRecipientSearch("");
            setPendingAttachments([]);
          }
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("admin.workflowMessaging.composeTitle")}</SheetTitle>
            <SheetDescription>{t("admin.workflowMessaging.composeDescription")}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 px-2 pb-6 pt-2">
            <div className="space-y-2">
              <Label htmlFor="admin-msg-target">{t("admin.workflowMessaging.targetType")}</Label>
              <Select
                value={recipientTarget}
                onValueChange={(value) => {
                  setRecipientTarget(value as RecipientTarget);
                  setRecipientUserId(TARGET_USER_NONE);
                  setRecipientSearch("");
                }}
              >
                <SelectTrigger id="admin-msg-target">
                  <SelectValue placeholder={t("admin.workflowMessaging.targetTypePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">{t("admin.workflowMessaging.targetRole")}</SelectItem>
                  <SelectItem value="user">{t("admin.workflowMessaging.targetUser")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipientTarget === "role" ? (
              <div className="space-y-2">
                <Label htmlFor="admin-msg-role">{t("admin.workflowMessaging.recipientRole")}</Label>
                <Select
                  value={recipientRole}
                  onValueChange={(value) => setRecipientRole(value as (typeof ROLE_OPTIONS)[number])}
                >
                  <SelectTrigger id="admin-msg-role">
                    <SelectValue placeholder={t("admin.workflowMessaging.recipientRolePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((role) => (
                      <SelectItem key={role} value={role}>
                        {workflowRoleDisplay(role, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>{t("messaging.compose.staffRoleLabel")}</Label>
                  <Select
                    value={userFilterRole}
                    onValueChange={(value) => {
                      setUserFilterRole(value as RecipientFilterRole);
                      setRecipientUserId(TARGET_USER_NONE);
                      setRecipientSearch("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("messaging.compose.selectStaffRolePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {RECIPIENT_FILTER_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {t(recipientFilterRoleLabelKey(role))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <MessagingRecipientPicker
                  idPrefix="admin-mail"
                  value={recipientUserId === TARGET_USER_NONE ? "" : recipientUserId}
                  onChange={(id) => setRecipientUserId(id ? id : TARGET_USER_NONE)}
                  allRecipients={recipientBaseForRole}
                  candidates={recipientCandidates}
                  search={recipientSearch}
                  onSearchChange={setRecipientSearch}
                  loading={recipientsQuery.isLoading}
                  disabled={false}
                  label={t("messaging.compose.recipientLabel")}
                  searchPlaceholderKey="messaging.compose.searchRecipients"
                  hintWhenHasMatchesKey="messaging.compose.pickRecipientHint"
                  emptyRoleKey="messaging.compose.noRecipientsInRole"
                  noMatchKey="messaging.compose.searchNoMatch"
                  t={t}
                />
                {recipientsQuery.isError ? (
                  <p className="text-xs text-destructive">{t("admin.workflowMessaging.recipientsLoadError")}</p>
                ) : null}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="admin-msg-subject">{t("admin.workflowMessaging.subject")}</Label>
              <Input
                id="admin-msg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("admin.workflowMessaging.subjectPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-msg-body">{t("admin.workflowMessaging.body")}</Label>
              <Textarea
                id="admin-msg-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("admin.workflowMessaging.bodyPlaceholder")}
              />
            </div>

            <WorkflowComposeAttachments
              idPrefix="admin-mail"
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

            {recipientError || sendError ? (
              <p className="text-sm text-destructive">{recipientError ?? sendError}</p>
            ) : null}

            <Button
              type="button"
              disabled={
                sendMessageMutation.isPending ||
                (!body.trim() && pendingAttachments.length === 0) ||
                (recipientTarget === "user" &&
                  (recipientUserId === TARGET_USER_NONE || recipientsQuery.isLoading))
              }
              onClick={() => sendMessageMutation.mutate()}
              className="w-full gap-2 sm:w-auto"
            >
              <Send className="h-4 w-4" />
              {sendMessageMutation.isPending ? t("admin.workflowMessaging.sending") : t("admin.workflowMessaging.send")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
