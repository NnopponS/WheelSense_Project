"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Inbox, Mail, PenLine, Send, Trash2, UserRoundCheck } from "lucide-react";
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
import { api, ApiError } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListPatientsResponse,
  ListWorkflowMessagesResponse,
  RoleMessageAttachmentOut,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";
import { canDeleteWorkflowMessage, WORKFLOW_MESSAGE_MAX_ATTACHMENTS } from "@/lib/workflowMessaging";

const EMPTY_SELECT = "__empty__";

/** Matches `GET /workflow/messaging/recipients` (staff + patient accounts in workspace). */
const RECIPIENT_FILTER_ROLES = ["admin", "head_nurse", "supervisor", "observer", "patient"] as const;
type RecipientFilterRole = (typeof RECIPIENT_FILTER_ROLES)[number];

const composeSchema = z.object({
  filterRole: z.enum(RECIPIENT_FILTER_ROLES),
  recipientUserId: z.string().min(1, "recipient"),
  patientId: z.string(),
  subject: z.string().trim().min(1, "subject"),
  body: z.string(),
});

type ComposeValues = z.infer<typeof composeSchema>;

export type StaffMailboxVariant = "head_nurse" | "supervisor" | "observer";

type MessageRow = {
  id: number;
  subject: string;
  body: string;
  senderUserId: number;
  recipientRole: string | null;
  recipientUserId: number | null;
  patientId: number | null;
  patientName: string;
  isRead: boolean;
  createdAt: string;
  attachments: RoleMessageAttachmentOut[];
};

const VARIANT_CONFIG: Record<
  StaffMailboxVariant,
  {
    invalidatePrefix: readonly [string, string];
    messagesQueryKey: readonly [string, string, string];
    patientsQueryKey: readonly [string, string, string];
    recipientsQueryKey: readonly [string, string, string];
    defaultFilterRole: RecipientFilterRole;
    titleKey: TranslationKey;
    subtitleKey: TranslationKey;
  }
> = {
  head_nurse: {
    invalidatePrefix: ["head-nurse", "messages"],
    messagesQueryKey: ["head-nurse", "messages", "list"],
    patientsQueryKey: ["head-nurse", "messages", "patients"],
    recipientsQueryKey: ["head-nurse", "messages", "recipients"],
    defaultFilterRole: "supervisor",
    titleKey: "headNurse.messages.pageTitle",
    subtitleKey: "headNurse.messages.pageSubtitle",
  },
  supervisor: {
    invalidatePrefix: ["supervisor", "messages"],
    messagesQueryKey: ["supervisor", "messages", "list"],
    patientsQueryKey: ["supervisor", "messages", "patients"],
    recipientsQueryKey: ["supervisor", "messages", "recipients"],
    defaultFilterRole: "head_nurse",
    titleKey: "supervisor.messages.pageTitle",
    subtitleKey: "supervisor.messages.pageSubtitle",
  },
  observer: {
    invalidatePrefix: ["observer", "messages"],
    messagesQueryKey: ["observer", "messages", "list"],
    patientsQueryKey: ["observer", "messages", "patients"],
    recipientsQueryKey: ["observer", "messages", "recipients"],
    defaultFilterRole: "head_nurse",
    titleKey: "observer.messages.pageTitle",
    subtitleKey: "observer.messages.pageSubtitle",
  },
};

function parseError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

/** Shared compose copy (EN/TH) lives under supervisor.messages.* */
function fk(key: string): TranslationKey {
  return `supervisor.messages.${key}` as TranslationKey;
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

export function StaffWorkflowMailbox({ variant }: { variant: StaffMailboxVariant }) {
  const cfg = VARIANT_CONFIG[variant];
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"inbox" | "sent">("inbox");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentChip[]>([]);
  const [pendingReadId, setPendingReadId] = useState<number | null>(null);

  const messagesQuery = useQuery({
    queryKey: [...cfg.messagesQueryKey],
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 200 }),
    refetchInterval: 20_000,
  });

  const patientsQuery = useQuery({
    queryKey: [...cfg.patientsQueryKey],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const recipientsQuery = useQuery({
    queryKey: [...cfg.recipientsQueryKey],
    queryFn: () => api.listWorkflowMessagingRecipients(),
    staleTime: 60_000,
    enabled: composeOpen,
  });

  const form = useForm<ComposeValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      filterRole: cfg.defaultFilterRole,
      recipientUserId: "",
      patientId: EMPTY_SELECT,
      subject: "",
      body: "",
    },
  });

  const filterRole = useWatch({ control: form.control, name: "filterRole" });

  const workspaceRecipients = useMemo(
    () => (recipientsQuery.data ?? []) as MessagingRecipientRow[],
    [recipientsQuery.data],
  );

  const recipientBaseForRole = useMemo(
    () =>
      workspaceRecipients.filter(
        (r) => matchesRecipientRoleFilter(r, filterRole) && r.id !== user?.id,
      ),
    [workspaceRecipients, filterRole, user?.id],
  );

  const recipientCandidates = useMemo(() => {
    const sorted = [...recipientBaseForRole].sort(
      (a, b) =>
        a.display_name.localeCompare(b.display_name) || a.username.localeCompare(b.username),
    );
    return sorted.filter((r) => matchesRecipientSearch(r, recipientSearch));
  }, [recipientBaseForRole, recipientSearch]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      values,
      pending,
    }: {
      values: ComposeValues;
      pending: PendingAttachmentChip[];
    }) => {
      const uid = Number(values.recipientUserId);
      if (!Number.isFinite(uid) || uid <= 0) {
        throw new Error("Invalid recipient");
      }
      if (!values.body.trim() && !pending.length) {
        throw new Error("body");
      }
      const payload = {
        recipient_user_id: uid,
        recipient_role: null,
        patient_id: values.patientId === EMPTY_SELECT ? null : Number(values.patientId),
        subject: values.subject.trim(),
        body: values.body.trim(),
        pending_attachment_ids: pending.map((p) => p.pendingId),
      } satisfies SendWorkflowMessageRequest;

      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      form.reset({
        filterRole: cfg.defaultFilterRole,
        recipientUserId: "",
        patientId: EMPTY_SELECT,
        subject: "",
        body: "",
      });
      setPendingAttachments([]);
      setRecipientSearch("");
      setComposeOpen(false);
      setActiveTab("sent");
      await queryClient.invalidateQueries({ queryKey: [...cfg.invalidatePrefix] });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.deleteWorkflowMessage(messageId);
    },
    onSuccess: async () => {
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: [...cfg.invalidatePrefix] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.markWorkflowMessageRead(messageId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...cfg.invalidatePrefix] });
    },
    onSettled: () => {
      setPendingReadId(null);
    },
  });

  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );
  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const rows = useMemo<MessageRow[]>(() => {
    return messages
      .map((item) => {
        const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
        return {
          id: item.id,
          subject: item.subject || t("messaging.mailbox.noSubject"),
          body: item.body,
          senderUserId: item.sender_user_id,
          recipientRole: item.recipient_role,
          recipientUserId: item.recipient_user_id,
          patientId: item.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "-",
          isRead: item.is_read,
          createdAt: item.created_at,
          attachments: item.attachments ?? [],
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [messages, patientMap, t]);

  const inboxRows = useMemo(
    () => rows.filter((item) => item.senderUserId !== user?.id),
    [rows, user?.id],
  );

  const sentRows = useMemo(
    () => rows.filter((item) => item.senderUserId === user?.id),
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
        row.patientName.toLowerCase().includes(q),
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

  const fieldErr = (key: "subject" | "body" | "recipientUserId"): string | undefined => {
    const err = form.formState.errors[key]?.message;
    if (key === "recipientUserId" && err === "recipient") {
      return t("messaging.compose.recipientRequired");
    }
    if (err === "subject") return t(fk("errSubject"));
    if (err === "body") return t(fk("errBody"));
    return undefined;
  };

  const sendError = sendMessageMutation.error ? parseError(sendMessageMutation.error) : null;
  const loading = messagesQuery.isLoading || patientsQuery.isLoading;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t(cfg.titleKey)}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t(cfg.subtitleKey)}</p>
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
                {activeTab === "inbox"
                  ? t("supervisor.messages.emptyInbox")
                  : t("supervisor.messages.emptySent")}
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
                          {row.patientName} · {formatRelativeTime(row.createdAt)}
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
                    <h3 className="text-lg font-semibold leading-snug text-foreground">
                      {selected.subject}
                    </h3>
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
                        {t("headNurse.messages.markRead")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    {t("headNurse.messages.fromUserPrefix")}
                    {selected.senderUserId}
                  </p>
                  <p>
                    {selected.recipientRole
                      ? `${t("headNurse.messages.recipientRolePrefix")}${selected.recipientRole}`
                      : t("headNurse.messages.directMessage")}
                  </p>
                  {selected.recipientUserId ? (
                    <p>
                      {t("headNurse.messages.toUserPrefix")}
                      {selected.recipientUserId}
                    </p>
                  ) : null}
                  <p className="text-sm text-foreground">
                    {t("clinical.table.patient")}: {selected.patientName}
                  </p>
                </div>
                <Badge variant={selected.isRead ? "success" : "warning"}>
                  {selected.isRead
                    ? t("headNurse.messages.readBadge")
                    : t("headNurse.messages.unreadBadge")}
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
            <SheetTitle>{t(fk("composeTitle"))}</SheetTitle>
            <SheetDescription>{t("messaging.compose.sheetDescription")}</SheetDescription>
          </SheetHeader>
          <form
            className="flex flex-1 flex-col gap-4 px-2 pb-6 pt-2"
            onSubmit={form.handleSubmit((values) => {
              if (!values.body.trim() && !pendingAttachments.length) {
                form.setError("body", { type: "manual", message: "body" });
                return;
              }
              sendMessageMutation.mutate({ values, pending: pendingAttachments });
            })}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("messaging.compose.staffRoleLabel")}</Label>
                <Controller
                  control={form.control}
                  name="filterRole"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value as RecipientFilterRole);
                        form.setValue("recipientUserId", "");
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
                  )}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Controller
                  control={form.control}
                  name="recipientUserId"
                  render={({ field }) => (
                    <MessagingRecipientPicker
                      idPrefix={`staff-mail-${variant}`}
                      value={field.value}
                      onChange={field.onChange}
                      allRecipients={recipientBaseForRole}
                      candidates={recipientCandidates}
                      search={recipientSearch}
                      onSearchChange={setRecipientSearch}
                      loading={recipientsQuery.isLoading}
                      label={t("messaging.compose.recipientLabel")}
                      searchPlaceholderKey="messaging.compose.searchRecipients"
                      hintWhenHasMatchesKey="messaging.compose.pickRecipientHint"
                      emptyRoleKey="messaging.compose.noRecipientsInRole"
                      noMatchKey="messaging.compose.searchNoMatch"
                      t={t}
                    />
                  )}
                />
                {fieldErr("recipientUserId") ? (
                  <p className="text-xs text-destructive">{fieldErr("recipientUserId")}</p>
                ) : null}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>{t(fk("patientOptional"))}</Label>
                <Controller
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t(fk("selectPatient"))} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>{t(fk("noPatient"))}</SelectItem>
                        {patients.map((patient) => (
                          <SelectItem key={patient.id} value={String(patient.id)}>
                            {patient.first_name} {patient.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>{t("admin.workflowMessaging.subject")}</Label>
                <Input {...form.register("subject")} placeholder={t(fk("placeholderSubject"))} />
                {fieldErr("subject") ? (
                  <p className="text-xs text-destructive">{fieldErr("subject")}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t(fk("messageBody"))}</Label>
              <Textarea rows={6} {...form.register("body")} placeholder={t(fk("placeholderBody"))} />
              {fieldErr("body") ? <p className="text-xs text-destructive">{fieldErr("body")}</p> : null}
            </div>

            <WorkflowComposeAttachments
              idPrefix={`staff-mail-${variant}`}
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
              type="submit"
              disabled={
                sendMessageMutation.isPending ||
                recipientsQuery.isLoading ||
                (!form.watch("body")?.trim() && pendingAttachments.length === 0)
              }
              className="w-full gap-2 sm:w-auto"
            >
              <Send className="h-4 w-4" />
              {sendMessageMutation.isPending ? t(fk("sending")) : t(fk("send"))}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
