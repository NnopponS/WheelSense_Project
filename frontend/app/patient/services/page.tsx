"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ConciergeBell, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useTranslation, type TranslationKey } from "@/lib/i18n";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

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

function serviceTypeLabelKey(type: string): TranslationKey {
  switch (type) {
    case "food":
      return "patient.services.foodTitle";
    case "transport":
      return "patient.services.transportTitle";
    case "housekeeping":
      return "patient.services.housekeepingTitle";
    case "support":
      return "patient.services.typeSupport";
    default:
      return "patient.services.typeOther";
  }
}

function PatientServicesContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const previewRaw = searchParams.get("previewAs");
  const previewNum = previewRaw != null && previewRaw !== "" ? Number(previewRaw) : NaN;
  const previewPatientId =
    Number.isFinite(previewNum) && previewNum > 0 ? Math.floor(previewNum) : null;
  const isAdminPreview = user?.role === "admin" && previewPatientId != null;
  const adminWithoutPatientPreview = user?.role === "admin" && previewPatientId == null;

  const effectivePatientId = useMemo(() => {
    if (isAdminPreview) return previewPatientId;
    return user?.patient_id ?? null;
  }, [isAdminPreview, previewPatientId, user?.patient_id]);

  const canListRequests =
    effectivePatientId != null && (user?.role === "patient" || isAdminPreview);
  const isPatientAccount = user?.role === "patient";
  const hasPatientProfileForSubmit =
    isPatientAccount && typeof user.patient_id === "number";

  const requestsQuery = useQuery({
    queryKey: ["patient", "services", user?.role, effectivePatientId],
    enabled: canListRequests,
    queryFn: () => api.listServiceRequests({ limit: 200 }),
    refetchInterval: 20_000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!hasPatientProfileForSubmit) {
        throw new Error(t("patient.services.noProfileLinked"));
      }
      await api.createServiceRequest({
        service_type: "support",
        title: title.trim(),
        note: note.trim(),
      });
    },
    onSuccess: async () => {
      setTitle("");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["patient", "services"] });
    },
  });

  const requests = useMemo(() => {
    const raw = [...(requestsQuery.data ?? [])];
    const scoped =
      isAdminPreview && effectivePatientId != null
        ? raw.filter((r) => r.patient_id === effectivePatientId)
        : raw;
    return scoped.sort((left, right) => right.created_at.localeCompare(left.created_at));
  }, [requestsQuery.data, isAdminPreview, effectivePatientId]);

  const submitError =
    submitMutation.error instanceof ApiError
      ? submitMutation.error.message
      : submitMutation.error instanceof Error
        ? submitMutation.error.message
        : null;

  const canSubmit =
    hasPatientProfileForSubmit && title.trim().length > 0 && note.trim().length > 0;

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            <ConciergeBell className="h-3.5 w-3.5" />
            {t("patient.services.badge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">{t("patient.services.title")}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("patient.services.subtitleFreeform")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="border-border/70">
          <CardHeader className="space-y-2">
            <CardTitle className="text-base">{t("patient.services.freeformFormTitle")}</CardTitle>
            <CardDescription>{t("patient.services.freeformFormDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdminPreview ? (
              <p className="text-sm text-muted-foreground">{t("patient.services.adminPreviewSubmitHint")}</p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="support-title">{t("patient.services.requestTitleLabel")}</Label>
              <Input
                id="support-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!hasPatientProfileForSubmit}
                placeholder={t("patient.services.requestTitlePlaceholder")}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-note">{t("patient.services.requestDetailLabel")}</Label>
              <Textarea
                id="support-note"
                rows={5}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!hasPatientProfileForSubmit}
                placeholder={t("patient.services.requestDetailPlaceholder")}
              />
            </div>

            {!hasPatientProfileForSubmit ? (
              <p className="text-sm text-muted-foreground">{t("patient.services.noProfileLinked")}</p>
            ) : null}

            {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

            <Button
              type="button"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || !canSubmit}
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
            {!canListRequests ? (
              <div className="rounded-xl border border-dashed border-border/70 px-3 py-10 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  {adminWithoutPatientPreview
                    ? t("patient.services.adminPreviewRequiredTitle")
                    : t("patient.page.notLinkedTitle")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {adminWithoutPatientPreview
                    ? t("patient.services.adminPreviewRequiredBody")
                    : t("patient.page.notLinkedBody")}
                </p>
              </div>
            ) : requestsQuery.isLoading ? (
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
                          <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                            {t(serviceTypeLabelKey(request.service_type))}
                          </span>
                        </div>
                        {request.title ? <p className="text-sm font-medium text-foreground">{request.title}</p> : null}
                        <p className="text-sm text-foreground whitespace-pre-wrap">{request.note}</p>
                        {request.claimed_by_user_id != null ? (
                          <p className="text-sm text-muted-foreground">{t("patient.services.claimedHint")}</p>
                        ) : null}
                        {request.resolution_note ? (
                          <p className="text-sm text-muted-foreground">
                            {t("patient.services.resolutionLabel")}: {request.resolution_note}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
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
                <p className="mt-1 text-sm text-muted-foreground">{t("patient.services.emptyHistoryBody")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PatientServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center pb-6">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <PatientServicesContent />
    </Suspense>
  );
}
