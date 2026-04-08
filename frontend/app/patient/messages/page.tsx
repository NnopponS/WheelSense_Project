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
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListWorkflowMessagesResponse,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";

type RecipientRole = "observer" | "supervisor" | "head_nurse";

type MessageRow = {
  id: number;
  subject: string;
  body: string;
  isRead: boolean;
  recipientRole: string | null;
  createdAt: string;
};

function toErrorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

export default function PatientMessagesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [recipientRole, setRecipientRole] = useState<RecipientRole>("observer");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const messagesQuery = useQuery({
    queryKey: ["patient", "messages", "list"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: true, limit: 200 }),
    refetchInterval: 20_000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        recipient_role: recipientRole,
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

  const rows = useMemo<MessageRow[]>(() => {
    return messages
      .map((message) => ({
        id: message.id,
        subject: message.subject || "Care team message",
        body: message.body,
        isRead: message.is_read,
        recipientRole: message.recipient_role,
        createdAt: message.created_at,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [messages]);

  const unreadCount = rows.filter((message) => !message.isRead).length;

  const columns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Message",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.subject}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: "recipientRole",
        header: "Recipient role",
        cell: ({ row }) => row.original.recipientRole || "-",
      },
      {
        accessorKey: "isRead",
        header: "Read",
        cell: ({ row }) => (
          <Badge variant={row.original.isRead ? "success" : "warning"}>
            {row.original.isRead ? "read" : "unread"}
          </Badge>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
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
              Mark read
            </Button>
          ),
      },
    ],
    [markReadMutation],
  );

  const sendError = sendMessageMutation.error ? toErrorText(sendMessageMutation.error) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Inbox: {rows.length} messages, {unreadCount} unread.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send Message to Care Team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Recipient role</Label>
              <Select value={recipientRole} onValueChange={(value) => setRecipientRole(value as RecipientRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="observer">Observer</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="head_nurse">Head Nurse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Medication question"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message for the care team."
            />
          </div>

          {sendError ? <p className="text-sm text-destructive">{sendError}</p> : null}

          <Button
            type="button"
            disabled={sendMessageMutation.isPending || !body.trim()}
            onClick={() => sendMessageMutation.mutate()}
          >
            <Send className="h-4 w-4" />
            {sendMessageMutation.isPending ? "Sending..." : "Send message"}
          </Button>
        </CardContent>
      </Card>

      <DataTableCard
        title="Inbox"
        description="Recent messages from and to care-team roles."
        data={rows}
        columns={columns}
        isLoading={messagesQuery.isLoading}
        emptyText="No messages in your inbox."
        rightSlot={<Mail className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
