"use client";
"use no memo";

import { useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  Inbox,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { API_BASE } from "@/lib/constants";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useTranslation } from "@/lib/i18n";
import type {
  ListPatientsResponse,
  ListServiceRequestsResponse,
  ListSupportTicketsResponse,
  SupportTicketCommentCreateInput,
  UpdateServiceRequestRequest,
  UpdateSupportTicketRequest,
} from "@/lib/api/task-scope-types";

type SupportTab = "tickets" | "service-requests";
type ServiceRequestFilter = "all" | "open" | "in_progress" | "fulfilled" | "cancelled";
type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

function parseError(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "open":
      return "destructive";
    case "in_progress":
      return "warning";
    case "resolved":
    case "closed":
    case "fulfilled":
      return "success";
    default:
      return "secondary";
  }
}

function requestTypeLabelKey(type: string) {
  switch (type) {
    case "food":
      return "patient.services.foodTitle" as const;
    case "transport":
      return "patient.services.transportTitle" as const;
    case "housekeeping":
      return "patient.services.housekeepingTitle" as const;
    default:
      return "patient.services.formTitle" as const;
  }
}

function buildPatientLabel(patient: ListPatientsResponse[number] | undefined) {
  if (!patient) return null;
  const nickname = patient.nickname?.trim();
  return nickname || `${patient.first_name} ${patient.last_name}`.trim();
}

export default function AdminSupportPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SupportTab>("tickets");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [ticketComment, setTicketComment] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [serviceRequestFilter, setServiceRequestFilter] = useState<ServiceRequestFilter>("all");
  const [serviceResolutionNote, setServiceResolutionNote] = useState("");

  const ticketsQuery = useQuery({
    queryKey: ["admin", "support", "tickets"],
    queryFn: () => api.listSupportTickets({ limit: 200 }),
    refetchInterval: 20_000,
  });

  const requestsQuery = useQuery({
    queryKey: ["admin", "support", "service-requests", serviceRequestFilter],
    queryFn: () =>
      api.listServiceRequests({
        limit: 200,
        status: serviceRequestFilter === "all" ? undefined : serviceRequestFilter,
      }),
    refetchInterval: 20_000,
  });

  const patientsQuery = useQuery({
    queryKey: ["admin", "support", "patients"],
    queryFn: () => api.listPatients({ limit: 500 }),
    staleTime: 60_000,
  });

  const ticketRows = useMemo(
    () => (ticketsQuery.data ?? []) as ListSupportTicketsResponse,
    [ticketsQuery.data],
  );

  const requestRows = useMemo(
    () => (requestsQuery.data ?? []) as ListServiceRequestsResponse,
    [requestsQuery.data],
  );

  const patientLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    (patientsQuery.data ?? []).forEach((patient) => {
      const label = buildPatientLabel(patient);
      if (label) {
        map.set(patient.id, label);
      }
    });
    return map;
  }, [patientsQuery.data]);

  const selectedTicket = useMemo(
    () => ticketRows.find((ticket) => ticket.id === selectedTicketId) ?? null,
    [selectedTicketId, ticketRows],
  );

  const selectedRequest = useMemo(
    () => requestRows.find((request) => request.id === selectedRequestId) ?? null,
    [requestRows, selectedRequestId],
  );

  const ticketCommentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId) {
        throw new Error(t("admin.support.selectTicketEmpty"));
      }
      const body = ticketComment.trim();
      if (!body) {
        throw new Error(t("admin.support.noteRequired"));
      }
      const payload: SupportTicketCommentCreateInput = { body };
      await api.addSupportTicketComment(selectedTicketId, payload);
    },
    onSuccess: async () => {
      setTicketComment("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets"] });
    },
  });

  const ticketUpdateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId) {
        throw new Error(t("admin.support.selectTicketEmpty"));
      }
      const payload: UpdateSupportTicketRequest = { status: "resolved" };
      await api.updateSupportTicket(selectedTicketId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "support", "tickets"] });
    },
  });

  const requestUpdateMutation = useMutation({
    mutationFn: async (status: UpdateServiceRequestRequest["status"]) => {
      if (!selectedRequestId) {
        throw new Error(t("admin.support.selectRequestEmpty"));
      }
      const payload: UpdateServiceRequestRequest = {
        status,
        resolution_note: serviceResolutionNote.trim() || null,
      };
      await api.updateServiceRequest(selectedRequestId, payload);
    },
    onSuccess: async () => {
      setServiceResolutionNote("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "support", "service-requests"] });
    },
  });

  const ticketError =
    ticketCommentMutation.error || ticketUpdateMutation.error
      ? parseError(ticketCommentMutation.error ?? ticketUpdateMutation.error, t("admin.support.requestFailed"))
      : null;

  const requestError = requestUpdateMutation.error
    ? parseError(requestUpdateMutation.error, t("admin.support.requestFailed"))
    : null;

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("admin.support.badge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">{t("admin.support.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("admin.support.subtitle")}</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as SupportTab)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="tickets">
            <Inbox className="mr-2 h-4 w-4" />
            {t("admin.support.ticketsTab")}
          </TabsTrigger>
          <TabsTrigger value="service-requests">
            <Sparkles className="mr-2 h-4 w-4" />
            {t("admin.support.serviceRequestsTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="mt-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <Card className="flex h-[calc(100vh-220px)] flex-col border-border/70">
              <CardHeader className="border-b border-border/70 pb-3">
                <CardTitle className="text-base">{t("admin.support.allTickets")}</CardTitle>
                <CardDescription>{t("admin.support.selectTicketHint")}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-0">
                <div className="divide-y divide-border/70">
                  {ticketsQuery.isLoading ? (
                    <div className="flex min-h-64 items-center justify-center text-muted-foreground">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : ticketRows.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <HelpCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      <p>{t("admin.support.emptyList")}</p>
                    </div>
                  ) : (
                    ticketRows.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={`w-full p-4 text-left transition-colors hover:bg-muted/40 ${
                          selectedTicketId === ticket.id ? "bg-muted/60" : ""
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h4 className="truncate text-sm font-medium">{ticket.title}</h4>
                          <Badge variant={statusVariant(ticket.status)} className="shrink-0 capitalize">
                            {ticket.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{ticket.description}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted/60">
                            {ticket.priority}
                          </span>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(ticket.created_at)}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {selectedTicket ? (
              <Card className="flex h-[calc(100vh-220px)] flex-col border-border/70">
                <CardHeader className="shrink-0 border-b border-border/70 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                      <Badge variant={statusVariant(selectedTicket.status)} className="capitalize">
                          {selectedTicket.status.replace("_", " ")}
                        </Badge>
                        <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted/60">
                          {selectedTicket.priority}
                        </span>
                        <span className="text-xs text-muted-foreground">ID: #{selectedTicket.id}</span>
                      </div>
                      <CardTitle className="text-xl">{selectedTicket.title}</CardTitle>
                    </div>
                    {selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => ticketUpdateMutation.mutate()}
                        disabled={ticketUpdateMutation.isPending}
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" />
                        {t("admin.support.markResolved")}
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-6 overflow-y-auto p-6">
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">{t("admin.support.description")}</h4>
                    <div className="whitespace-pre-wrap rounded-xl bg-muted/30 p-4 text-sm">
                      {selectedTicket.description}
                    </div>
                  </div>

                  {selectedTicket.attachments?.length ? (
                    <div>
                      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                        <Paperclip className="h-4 w-4" />
                        {t("admin.support.attachments")}
                      </h4>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {selectedTicket.attachments.map((file) => (
                          <a
                            key={file.id}
                            href={`${API_BASE}${file.file_url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="group relative block aspect-video overflow-hidden rounded-lg border border-border/70 bg-muted/30"
                          >
                            {file.mime_type.startsWith("image/") ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`${API_BASE}${file.file_url}`}
                                alt={file.filename}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center p-2 text-center">
                                <Paperclip className="mb-1 h-6 w-6 text-muted-foreground" />
                                <span className="w-full truncate px-1 text-[10px] text-muted-foreground">
                                  {file.filename}
                                </span>
                              </div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                              <span className="text-xs font-medium text-white">{t("admin.support.view")}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <MessageSquare className="h-4 w-4" />
                      {t("admin.support.notesUpdates")}
                    </h4>
                    <div className="mb-4 space-y-4">
                      {selectedTicket.comments?.length ? (
                        selectedTicket.comments.map((comment) => (
                          <div key={comment.id} className="flex gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <ShieldCheck className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 rounded-xl bg-muted/40 p-3">
                              <div className="mb-1 flex items-start justify-between">
                                <span className="text-xs font-medium">
                                  {t("admin.support.userPrefix")} {comment.author_user_id ?? "?"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDateTime(comment.created_at)}
                                </span>
                              </div>
                              <p className="text-sm">{comment.body}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm italic text-muted-foreground">{t("admin.support.noNotes")}</p>
                      )}
                    </div>

                    {selectedTicket.status !== "closed" ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          ticketCommentMutation.mutate();
                        }}
                        className="mt-4 flex gap-2"
                      >
                        <input
                          type="text"
                          value={ticketComment}
                          onChange={(event) => setTicketComment(event.target.value)}
                          placeholder={t("admin.support.notePlaceholder")}
                          className="flex-1 rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          disabled={ticketCommentMutation.isPending}
                        />
                        <Button type="submit" size="icon" disabled={ticketCommentMutation.isPending || !ticketComment.trim()}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : null}
                  </div>

                  {ticketError ? <p className="text-sm text-destructive">{ticketError}</p> : null}
                </CardContent>
              </Card>
            ) : (
              <Card className="flex h-[calc(100vh-220px)] flex-col items-center justify-center border-border/70 text-muted-foreground">
                <HelpCircle className="mb-4 h-12 w-12 opacity-20" />
                <p>{t("admin.support.selectTicketEmpty")}</p>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="service-requests" className="mt-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <Card className="flex h-[calc(100vh-220px)] flex-col border-border/70">
              <CardHeader className="space-y-3 border-b border-border/70 pb-3">
                <div className="space-y-1">
                  <CardTitle className="text-base">{t("admin.support.serviceRequestsTitle")}</CardTitle>
                  <CardDescription>{t("admin.support.serviceRequestsHint")}</CardDescription>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t("admin.support.statusFilter")}
                    </Label>
                    <Select
                      value={serviceRequestFilter}
                      onValueChange={(value) => setServiceRequestFilter(value as ServiceRequestFilter)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("admin.support.statusFilter")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("admin.support.filterAll")}</SelectItem>
                        <SelectItem value="open">{t("admin.support.filterOpen")}</SelectItem>
                        <SelectItem value="in_progress">{t("admin.support.filterInProgress")}</SelectItem>
                        <SelectItem value="fulfilled">{t("admin.support.filterFulfilled")}</SelectItem>
                        <SelectItem value="cancelled">{t("admin.support.filterCancelled")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-0">
                <div className="divide-y divide-border/70">
                  {requestsQuery.isLoading ? (
                    <div className="flex min-h-64 items-center justify-center text-muted-foreground">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  ) : requestRows.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Sparkles className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      <p>{t("admin.support.emptyServiceRequests")}</p>
                    </div>
                  ) : (
                    requestRows.map((request) => (
                      <button
                        key={request.id}
                        type="button"
                        onClick={() => {
                          setSelectedRequestId(request.id);
                          setServiceResolutionNote(request.resolution_note ?? "");
                        }}
                        className={`w-full p-4 text-left transition-colors hover:bg-muted/40 ${
                          selectedRequestId === request.id ? "bg-muted/60" : ""
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <h4 className="truncate text-sm font-medium">
                              {patientLabelMap.get(request.patient_id ?? 0) ?? `Patient #${request.patient_id ?? "?"}`}
                            </h4>
                            <p className="text-xs text-muted-foreground">{t(requestTypeLabelKey(request.service_type))}</p>
                          </div>
                          <Badge variant={statusVariant(request.status)} className="shrink-0 capitalize">
                            {request.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{request.note}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-muted/60">
                            #{request.id}
                          </span>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(request.created_at)}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {selectedRequest ? (
              <Card className="flex h-[calc(100vh-220px)] flex-col border-border/70">
                <CardHeader className="shrink-0 border-b border-border/70 pb-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(selectedRequest.status)} className="capitalize">
                        {selectedRequest.status.replace("_", " ")}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {t(requestTypeLabelKey(selectedRequest.service_type))}
                      </Badge>
                      <span className="text-xs text-muted-foreground">ID: #{selectedRequest.id}</span>
                    </div>
                    <CardTitle className="text-xl">
                      {patientLabelMap.get(selectedRequest.patient_id ?? 0) ?? `Patient #${selectedRequest.patient_id ?? "?"}`}
                    </CardTitle>
                    <CardDescription>{formatDateTime(selectedRequest.created_at)}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-6 overflow-y-auto p-6">
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-muted-foreground">{t("admin.support.requestNote")}</h4>
                    <div className="whitespace-pre-wrap rounded-xl bg-muted/30 p-4 text-sm">
                      {selectedRequest.note}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("admin.support.resolutionNote")}</Label>
                      <Textarea
                        rows={4}
                        value={serviceResolutionNote}
                        onChange={(event) => setServiceResolutionNote(event.target.value)}
                        placeholder={t("admin.support.resolutionNotePlaceholder")}
                      />
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-muted-foreground">{t("admin.support.requestActions")}</p>
                      <div className="grid gap-2">
                        <Button
                          variant="outline"
                          onClick={() => requestUpdateMutation.mutate("in_progress")}
                          disabled={requestUpdateMutation.isPending}
                        >
                          {t("admin.support.markInProgress")}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => requestUpdateMutation.mutate("fulfilled")}
                          disabled={requestUpdateMutation.isPending}
                        >
                          {t("admin.support.markFulfilled")}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => requestUpdateMutation.mutate("cancelled")}
                          disabled={requestUpdateMutation.isPending}
                        >
                          {t("admin.support.markCancelled")}
                        </Button>
                      </div>
                      {selectedRequest.resolution_note ? (
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t("admin.support.resolutionNote")}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{selectedRequest.resolution_note}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {selectedRequest.resolved_at ? (
                    <p className="text-xs text-muted-foreground">
                      {t("admin.support.resolvedAt")}: {formatDateTime(selectedRequest.resolved_at)}
                    </p>
                  ) : null}

                  {requestError ? <p className="text-sm text-destructive">{requestError}</p> : null}
                </CardContent>
              </Card>
            ) : (
              <Card className="flex h-[calc(100vh-220px)] flex-col items-center justify-center border-border/70 text-muted-foreground">
                <HelpCircle className="mb-4 h-12 w-12 opacity-20" />
                <p>{t("admin.support.selectRequestEmpty")}</p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
