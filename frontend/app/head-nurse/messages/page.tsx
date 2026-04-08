"use client";
"use no memo";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { z } from "zod";
import { Mail, Send, UserRoundCheck } from "lucide-react";
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
  ListPatientsResponse,
  ListWorkflowMessagesResponse,
  SendWorkflowMessageRequest,
} from "@/lib/api/task-scope-types";

const EMPTY_SELECT = "__empty__";
const ROLE_OPTIONS = ["admin", "head_nurse", "supervisor", "observer", "patient"] as const;

const composeSchema = z.object({
  recipientRole: z.string(),
  patientId: z.string(),
  subject: z.string().trim().min(1, "Subject is required"),
  body: z.string().trim().min(1, "Message body is required"),
});

type ComposeValues = z.infer<typeof composeSchema>;

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
};

function parseError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

export default function HeadNurseMessagesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"inbox" | "sent">("inbox");
  const [pendingReadId, setPendingReadId] = useState<number | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["head-nurse", "messages", "list"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 200 }),
    refetchInterval: 20_000,
  });

  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "messages", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
  });

  const form = useForm<ComposeValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      recipientRole: "supervisor",
      patientId: EMPTY_SELECT,
      subject: "",
      body: "",
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (values: ComposeValues) => {
      const payload = {
        recipient_role: values.recipientRole === EMPTY_SELECT ? null : values.recipientRole,
        patient_id: values.patientId === EMPTY_SELECT ? null : Number(values.patientId),
        subject: values.subject.trim(),
        body: values.body.trim(),
      } satisfies SendWorkflowMessageRequest;

      await api.sendWorkflowMessage(payload);
    },
    onSuccess: async () => {
      form.reset({
        recipientRole: "supervisor",
        patientId: EMPTY_SELECT,
        subject: "",
        body: "",
      });
      setActiveTab("sent");
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "messages"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      await api.markWorkflowMessageRead(messageId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "messages"] });
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
          subject: item.subject || "(No subject)",
          body: item.body,
          senderUserId: item.sender_user_id,
          recipientRole: item.recipient_role,
          recipientUserId: item.recipient_user_id,
          patientId: item.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "-",
          isRead: item.is_read,
          createdAt: item.created_at,
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [messages, patientMap]);

  const inboxRows = useMemo(
    () => rows.filter((item) => item.senderUserId !== user?.id),
    [rows, user?.id],
  );

  const sentRows = useMemo(
    () => rows.filter((item) => item.senderUserId === user?.id),
    [rows, user?.id],
  );

  const tableRows = activeTab === "inbox" ? inboxRows : sentRows;

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
        header: "Routing",
        cell: ({ row }) => (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>From user #{row.original.senderUserId}</p>
            <p>{row.original.recipientRole ? `Role: ${row.original.recipientRole}` : "Direct message"}</p>
            {row.original.recipientUserId ? <p>User #{row.original.recipientUserId}</p> : null}
          </div>
        ),
      },
      {
        accessorKey: "patientName",
        header: "Patient",
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
        cell: ({ row }) => {
          if (activeTab !== "inbox" || row.original.isRead) return null;
          return (
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
              Mark read
            </Button>
          );
        },
      },
    ],
    [activeTab, markReadMutation, pendingReadId],
  );

  const sendError = sendMessageMutation.error ? parseError(sendMessageMutation.error) : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Clinical Messages</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Coordinate with role-based messaging and track acknowledgement state.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose Message</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => sendMessageMutation.mutate(values))}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Recipient role</Label>
                <Controller
                  control={form.control}
                  name="recipientRole"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>No role target</SelectItem>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Patient (optional)</Label>
                <Controller
                  control={form.control}
                  name="patientId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_SELECT}>No patient</SelectItem>
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

              <div className="space-y-2 md:col-span-2">
                <Label>Subject</Label>
                <Input {...form.register("subject")} placeholder="Shift coordination update" />
                {form.formState.errors.subject ? (
                  <p className="text-xs text-destructive">{form.formState.errors.subject.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea rows={5} {...form.register("body")} placeholder="Operational update for next handoff" />
              {form.formState.errors.body ? (
                <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
              ) : null}
            </div>

            {sendError ? <p className="text-sm text-destructive">{sendError}</p> : null}

            <Button type="submit" disabled={sendMessageMutation.isPending}>
              <Send className="h-4 w-4" />
              {sendMessageMutation.isPending ? "Sending..." : "Send message"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={activeTab === "inbox" ? "default" : "outline"}
          onClick={() => setActiveTab("inbox")}
        >
          Inbox ({inboxRows.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeTab === "sent" ? "default" : "outline"}
          onClick={() => setActiveTab("sent")}
        >
          Sent ({sentRows.length})
        </Button>
      </div>

      <DataTableCard
        title={activeTab === "inbox" ? "Inbox" : "Sent Messages"}
        description="Role-based communication stream for current workspace."
        data={tableRows}
        columns={columns}
        isLoading={messagesQuery.isLoading || patientsQuery.isLoading}
        emptyText={activeTab === "inbox" ? "No inbox messages." : "No sent messages."}
        rightSlot={<Mail className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
