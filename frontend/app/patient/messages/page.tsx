"use client";
"use no memo";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Mail, Send } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListWorkflowMessagesResponse,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";

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
};

function toErrorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function PatientMessagesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [recipientUserId, setRecipientUserId] = useState<string>(NO_RECIPIENT_SELECTED);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const recipientsQuery = useQuery({
    queryKey: ["patient", "messages", "recipients"],
    queryFn: () => api.listWorkflowMessagingRecipients(),
    staleTime: 60_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["patient", "messages", "list"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: true, limit: 200 }),
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
      const payload = {
        recipient_user_id: rid,
        patient_id: user?.patient_id ?? null,
        subject: subject.trim() || "Patient message",
        body: body.trim(),
      } satisfies SendWorkflowMessageRequest;

      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      setSubject("");
      setBody("");
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
          subject: message.subject || "Care team message",
          body: message.body,
          isRead: message.is_read,
          recipientLabel,
          createdAt: message.created_at,
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [messages]);

  const unreadCount = rows.filter((message) => !message.isRead).length;

  const columns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      {
        accessorKey: "subject",
        header: t("patient.messages.colMessage"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.subject}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: "recipientLabel",
        header: t("patient.messages.colRecipient"),
        cell: ({ row }) => row.original.recipientLabel,
      },
      {
        accessorKey: "isRead",
        header: t("patient.messages.colRead"),
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "success" : "warning"}>
            {row.original.isRead ? t("patient.messages.read") : t("patient.messages.unread")}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: t("patient.messages.colCreated"),
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
          row.original.isRead ? null : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => markReadMutation.mutate(row.original.id)}
            >
              {t("patient.messages.markRead")}
            </Button>
          ),
      },
    ],
    [markReadMutation, t],
  );

  const sendError = sendMessageMutation.error
    ? toErrorText(sendMessageMutation.error, t("patient.messages.requestFailed"))
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("patient.messages.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("patient.messages.inboxIntro")} {rows.length} {t("patient.messages.messagesWord")},{" "}
          {unreadCount} {t("patient.messages.unreadLabel")}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("patient.messages.sendCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
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
              ) : (
                <p className="text-xs text-muted-foreground">{t("patient.messages.recipientUserHint")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("patient.messages.subject")}</Label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={t("patient.messages.subjectPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("patient.messages.body")}</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("patient.messages.bodyPlaceholder")}
            />
          </div>

          {sendError ? <p className="text-sm text-destructive">{sendError}</p> : null}

          <Button
            type="button"
            disabled={
              sendMessageMutation.isPending ||
              !body.trim() ||
              recipientUserId === NO_RECIPIENT_SELECTED
            }
            onClick={() => sendMessageMutation.mutate()}
          >
            <Send className="h-4 w-4" />
            {sendMessageMutation.isPending ? t("patient.messages.sending") : t("patient.messages.send")}
          </Button>
        </CardContent>
      </Card>

      <DataTableCard
        title={t("patient.messages.inboxTitle")}
        description={t("patient.messages.inboxDesc")}
        data={rows}
        columns={columns}
        isLoading={messagesQuery.isLoading}
        emptyText={t("patient.messages.empty")}
        rightSlot={<Mail className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
