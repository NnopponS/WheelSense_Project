"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConciergeBell, Sparkles, Truck, Utensils } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useTranslation } from "@/lib/i18n";

const SERVICE_TYPES = [
  {
    value: "food" as const,
    icon: Utensils,
    titleKey: "patient.services.foodTitle" as const,
    descKey: "patient.services.foodDesc" as const,
    bodyKey: "patient.services.foodBody" as const,
  },
  {
    value: "transport" as const,
    icon: Truck,
    titleKey: "patient.services.transportTitle" as const,
    descKey: "patient.services.transportDesc" as const,
    bodyKey: "patient.services.transportBody" as const,
  },
  {
    value: "housekeeping" as const,
    icon: Sparkles,
    titleKey: "patient.services.housekeepingTitle" as const,
    descKey: "patient.services.housekeepingDesc" as const,
    bodyKey: "patient.services.housekeepingBody" as const,
  },
];

type ServiceRequestType = (typeof SERVICE_TYPES)[number]["value"];
type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

function serviceTypeLabelKey(type: ServiceRequestType) {
  switch (type) {
    case "food":
      return "patient.services.foodTitle" as const;
    case "transport":
      return "patient.services.transportTitle" as const;
    case "housekeeping":
      return "patient.services.housekeepingTitle" as const;
  }
}

function requestStatusTone(status: string): BadgeVariant {
  switch (status) {
    case "open":
      return "destructive";
    case "in_progress":
      return "warning";
    case "fulfilled":
      return "success";
    case "cancelled":
      return "secondary";
    default:
      return "secondary";
  }
}

export default function PatientServicesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [serviceType, setServiceType] = useState<ServiceRequestType>("food");
  const [note, setNote] = useState("");

  const patientId = user?.patient_id ?? undefined;
  const hasPatientProfile = typeof patientId === "number";

  const requestsQuery = useQuery({
    queryKey: ["patient", "services", patientId],
    enabled: hasPatientProfile,
    queryFn: () => api.listServiceRequests({ limit: 100 }),
    refetchInterval: 20_000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!hasPatientProfile) {
        throw new Error(t("patient.services.noProfileLinked"));
      }
      await api.createServiceRequest({
        service_type: serviceType,
        note: note.trim(),
      });
    },
    onSuccess: async () => {
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["patient", "services"] });
    },
  });

  const requests = useMemo(
    () => [...(requestsQuery.data ?? [])].sort((left, right) => right.created_at.localeCompare(left.created_at)),
    [requestsQuery.data],
  );

  const submitError =
    submitMutation.error instanceof ApiError
      ? submitMutation.error.message
      : submitMutation.error instanceof Error
        ? submitMutation.error.message
        : null;

  const selectedService = SERVICE_TYPES.find((item) => item.value === serviceType) ?? SERVICE_TYPES[0];

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ConciergeBell className="h-3.5 w-3.5" />
            {t("patient.services.badge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">{t("patient.services.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("patient.services.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICE_TYPES.map((service) => {
          const Icon = service.icon;
          return (
            <Card key={service.value} className="border-border/70">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t(service.titleKey)}</CardTitle>
                    <CardDescription>{t(service.descKey)}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{t(service.bodyKey)}</p>
                <Button
                  variant={serviceType === service.value ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => setServiceType(service.value)}
                >
                  {serviceType === service.value ? t("patient.services.selectedCta") : t("patient.services.requestCta")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="border-border/70">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">{t("patient.services.formTitle")}</CardTitle>
            <CardDescription>{t("patient.services.formDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("patient.services.serviceTypeLabel")}</Label>
              <Select value={serviceType} onValueChange={(value) => setServiceType(value as ServiceRequestType)} disabled={!hasPatientProfile}>
                <SelectTrigger>
                  <SelectValue placeholder={t("patient.services.serviceTypePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((service) => (
                    <SelectItem key={service.value} value={service.value}>
                      {t(service.titleKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("patient.services.noteLabel")}</Label>
              <Textarea
                rows={4}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={!hasPatientProfile}
                placeholder={t("patient.services.notePlaceholder")}
              />
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t(selectedService.titleKey)}</p>
              <p className="mt-1">{t("patient.services.formHint")}</p>
            </div>

            {!hasPatientProfile ? (
              <p className="text-sm text-muted-foreground">{t("patient.services.noProfileLinked")}</p>
            ) : null}

            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

            <Button
              type="button"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || !hasPatientProfile || !note.trim()}
            >
              {submitMutation.isPending ? t("patient.services.submitting") : t("patient.services.submitRequest")}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">{t("patient.services.historyTitle")}</CardTitle>
            <CardDescription>{t("patient.services.historyDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {requestsQuery.isLoading ? (
              <div className="flex min-h-56 items-center justify-center">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : requests.length > 0 ? (
              <div className="space-y-3">
                {requests.map((request) => (
                  <div key={request.id} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={requestStatusTone(request.status)} className="capitalize">
                            {request.status.replace("_", " ")}
                          </Badge>
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t(serviceTypeLabelKey(request.service_type))}
                          </span>
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{request.note}</p>
                        {request.resolution_note ? (
                          <p className="text-xs text-muted-foreground">
                            {t("patient.services.resolutionLabel")}: {request.resolution_note}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{formatDateTime(request.created_at)}</p>
                        <p>{formatRelativeTime(request.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-10 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">{t("patient.services.emptyHistoryTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("patient.services.emptyHistoryBody")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
