"use client";
"use no memo";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Inbox, Mail, Send, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListWorkflowMessagesResponse,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";
import { HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import AdminSupportPage from "@/app/admin/support/page";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

type RecipientTarget = "role" | "user";
type MessageTab = "all" | "inbox" | "sent";

type WorkflowRecipient = {
  id: number;
  username: string;
  role: string;
  display_name: string;
  kind: "staff" | "patient" | "unlinked";
  is_active?: boolean;
  linked_name?: string | null;
  employee_code?: string | null;
};

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
};

const ROLE_OPTIONS = ["admin", "head_nurse", "supervisor", "observer", "patient"] as const;
const TARGET_USER_NONE = "__none__";

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

function AdminMessagesHub() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "messages";

  const hubTabs = useMemo<HubTab[]>(
    () => [
      { key: "messages", label: t("nav.messages"), icon: Inbox },
      { key: "support", label: t("nav.support"), icon: ShieldCheck },
    ],
    [t],
  );

  return (
    <div className="space-y-0">
      <HubTabBar tabs={hubTabs} />
      {tab === "support" ? <AdminSupportPage /> : <MessagesContent />}
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense>
      <AdminMessagesHub />
    </Suspense>
  );
}

function MessagesContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MessageTab>("inbox");
  const [recipientTarget, setRecipientTarget] = useState<RecipientTarget>("role");
  const [recipientRole, setRecipientRole] = useState<(typeof ROLE_OPTIONS)[number]>("supervisor");
  const [recipientUserId, setRecipientUserId] = useState<string>(TARGET_USER_NONE);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
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
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (recipientTarget === "user") {
        const rid = Number(recipientUserId);
        if (recipientUserId === TARGET_USER_NONE || !Number.isFinite(rid) || rid <= 0) {
          throw new Error(t("admin.workflowMessaging.selectRecipientUser"));
        }
      }

      const payload = {
        recipient_role: recipientTarget === "role" ? recipientRole : null,
        recipient_user_id: recipientTarget === "user" ? Number(recipientUserId) : null,
        subject: subject.trim() || t("admin.workflowMessaging.defaultSubject"),
        body: body.trim(),
      } satisfies SendWorkflowMessageRequest;

      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      setSubject("");
      setBody("");
      setRecipientTarget("role");
      setRecipientRole("supervisor");
      setRecipientUserId(TARGET_USER_NONE);
      setActiveTab("sent");
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
    () => [...((recipientsQuery.data ?? []) as WorkflowRecipient[])].sort((left, right) =>
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

  const filteredRows = activeTab === "all" ? rows : activeTab === "inbox" ? inboxRows : sentRows;
  const unreadCount = inboxRows.filter((message) => !message.isRead).length;

  const columns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      {
        accessorKey: "subject",
        header: t("admin.workflowMessaging.colMessage"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.subject}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: "recipientLabel",
        header: t("admin.workflowMessaging.colRouting"),
        cell: ({ row }) => (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              {t("admin.workflowMessaging.fromUser").replace("{id}", String(row.original.senderUserId))}
            </p>
            <p>{row.original.recipientLabel}</p>
            <p>
              {row.original.recipientRole
                ? t("admin.workflowMessaging.roleLine").replace(
                    "{role}",
                    workflowRoleDisplay(row.original.recipientRole, t),
                  )
                : t("admin.workflowMessaging.directMessage")}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "isRead",
        header: t("admin.workflowMessaging.colStatus"),
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "success" : "warning"}>
            {row.original.isRead ? t("admin.workflowMessaging.statusRead") : t("admin.workflowMessaging.statusUnread")}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: t("admin.workflowMessaging.colCreated"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          activeTab !== "inbox" || row.original.isRead ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={markReadMutation.isPending && pendingReadId === row.original.id}
              onClick={() => {
                setPendingReadId(row.original.id);
                markReadMutation.mutate(row.original.id);
              }}
            >
              <UserRoundCheck className="h-4 w-4" />
              {t("admin.workflowMessaging.markRead")}
            </Button>
          ),
      },
    ],
    [activeTab, markReadMutation, pendingReadId, t],
  );

  const sendError = sendMessageMutation.error ? parseError(sendMessageMutation.error, t) : null;
  const recipientError =
    recipientTarget === "user" && recipientsQuery.isSuccess && !recipients.length
      ? t("admin.workflowMessaging.noRecipientsFromApi")
      : null;

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            {t("admin.workflowMessaging.badge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">{t("admin.workflowMessaging.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("admin.workflowMessaging.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t("admin.workflowMessaging.countTotal").replace("{count}", String(rows.length))}</Badge>
          <Badge variant="warning">{t("admin.workflowMessaging.countUnread").replace("{count}", String(unreadCount))}</Badge>
          <Badge variant="success">{t("admin.workflowMessaging.countSent").replace("{count}", String(sentRows.length))}</Badge>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("admin.workflowMessaging.composeTitle")}</CardTitle>
            <CardDescription>{t("admin.workflowMessaging.composeDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="targetMode">{t("admin.workflowMessaging.targetType")}</Label>
              <Select
                value={recipientTarget}
                onValueChange={(value) => setRecipientTarget(value as RecipientTarget)}
              >
                <SelectTrigger id="targetMode">
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
                <Label htmlFor="recipientRole">{t("admin.workflowMessaging.recipientRole")}</Label>
                <Select
                  value={recipientRole}
                  onValueChange={(value) => setRecipientRole(value as (typeof ROLE_OPTIONS)[number])}
                >
                  <SelectTrigger id="recipientRole">
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
              <div className="space-y-2">
                <Label htmlFor="recipientUser">{t("admin.workflowMessaging.recipientUser")}</Label>
                <Select value={recipientUserId} onValueChange={setRecipientUserId} disabled={!recipients.length}>
                  <SelectTrigger id="recipientUser">
                    <SelectValue
                      placeholder={
                        recipientsQuery.isLoading
                          ? t("admin.workflowMessaging.loadingRecipients")
                          : t("admin.workflowMessaging.chooseUserPlaceholder")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TARGET_USER_NONE} className="text-muted-foreground">
                      {t("admin.workflowMessaging.chooseUserPlaceholder")}
                    </SelectItem>
                    {recipients.map((recipient) => (
                      <SelectItem key={recipient.id} value={String(recipient.id)}>
                        {recipient.display_name} (@{recipient.username}) | {workflowRoleDisplay(recipient.role, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recipientsQuery.isError ? (
                  <p className="text-xs text-destructive">{t("admin.workflowMessaging.recipientsLoadError")}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {recipients.length
                      ? t("admin.workflowMessaging.recipientsHint")
                      : t("admin.workflowMessaging.noRecipientsYet")}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="subject">{t("admin.workflowMessaging.subject")}</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={t("admin.workflowMessaging.subjectPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">{t("admin.workflowMessaging.body")}</Label>
              <Textarea
                id="body"
                rows={6}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("admin.workflowMessaging.bodyPlaceholder")}
              />
            </div>

            {recipientError || sendError ? (
              <p className="text-sm text-destructive">{recipientError ?? sendError}</p>
            ) : null}

            <Button
              type="button"
              disabled={
                sendMessageMutation.isPending ||
                !body.trim() ||
                (recipientTarget === "user" && recipientUserId === TARGET_USER_NONE)
              }
              onClick={() => sendMessageMutation.mutate()}
            >
              <Send className="h-4 w-4" />
              {sendMessageMutation.isPending ? t("admin.workflowMessaging.sending") : t("admin.workflowMessaging.send")}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/70">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">{t("admin.workflowMessaging.inboxCardTitle")}</CardTitle>
                <CardDescription>{t("admin.workflowMessaging.inboxCardDescription")}</CardDescription>
              </div>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MessageTab)}>
                <TabsList>
                  <TabsTrigger value="inbox">
                    <Inbox className="mr-1.5 h-3.5 w-3.5" />
                    {t("admin.workflowMessaging.tabInbox")}
                  </TabsTrigger>
                  <TabsTrigger value="sent">
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {t("admin.workflowMessaging.tabSent")}
                  </TabsTrigger>
                  <TabsTrigger value="all">
                    <Users className="mr-1.5 h-3.5 w-3.5" />
                    {t("admin.workflowMessaging.tabAll")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant={activeTab === "inbox" ? "default" : "outline"}>
                  {t("admin.workflowMessaging.badgeInboxCount").replace("{count}", String(inboxRows.length))}
                </Badge>
                <Badge variant={activeTab === "sent" ? "default" : "outline"}>
                  {t("admin.workflowMessaging.badgeSentCount").replace("{count}", String(sentRows.length))}
                </Badge>
                <Badge variant={activeTab === "all" ? "default" : "outline"}>
                  {t("admin.workflowMessaging.badgeTotalCount").replace("{count}", String(rows.length))}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {activeTab === "inbox"
                  ? t("admin.workflowMessaging.filterHelpInbox")
                  : activeTab === "sent"
                    ? t("admin.workflowMessaging.filterHelpSent")
                    : t("admin.workflowMessaging.filterHelpAll")}
              </p>
            </CardContent>
          </Card>

          <DataTableCard
            title={t("admin.workflowMessaging.tableTitle")}
            description={t("admin.workflowMessaging.tableDescription")}
            data={filteredRows}
            columns={columns}
            isLoading={messagesQuery.isLoading || messagesQuery.isFetching}
            emptyText={t("admin.workflowMessaging.tableEmpty")}
            pageSize={8}
            rightSlot={<Badge variant="outline">{filteredRows.length}</Badge>}
          />
        </div>
      </div>
    </div>
  );
}
