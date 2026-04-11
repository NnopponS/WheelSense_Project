"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Heart,
  HelpCircle,
  Home,
  MessageCircle,
  Phone,
  Siren,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GetPatientResponse } from "@/lib/api/task-scope-types";
import { PatientMySensors } from "@/components/patient/PatientMySensors";
import { PatientCareRoadmap } from "@/components/patient/PatientCareRoadmap";

export default function PatientDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const previewRaw = searchParams.get("previewAs");
  const previewNum = previewRaw != null && previewRaw !== "" ? Number(previewRaw) : NaN;
  const previewPatientId = Number.isFinite(previewNum) && previewNum > 0 ? Math.floor(previewNum) : null;
  const isAdminPreview = user?.role === "admin" && previewPatientId != null;

  const effectivePatientId = useMemo(() => {
    if (isAdminPreview) return previewPatientId;
    return user?.patient_id ?? null;
  }, [isAdminPreview, previewPatientId, user?.patient_id]);

  const patientQuery = useQuery({
    queryKey: ["patient", "dashboard", "patient", effectivePatientId],
    enabled: effectivePatientId != null,
    queryFn: () => api.getPatient(Number(effectivePatientId)),
  });

  const patient = patientQuery.data as GetPatientResponse | null;

  const raiseAssistanceMutation = useMutation({
    mutationFn: async (kind: "assistance" | "sos") => {
      if (!effectivePatientId) return;
      await api.createAlert({
        patient_id: Number(effectivePatientId),
        alert_type: kind === "sos" ? "emergency_sos" : "patient_assistance",
        severity: kind === "sos" ? "critical" : "warning",
        title: kind === "sos" ? "Emergency SOS from patient" : "Patient assistance request",
        description:
          kind === "sos"
            ? "Patient pressed emergency SOS from patient dashboard."
            : "Patient requested non-emergency assistance from patient dashboard.",
        data: { source: "patient_dashboard", kind },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["patient", "dashboard", "alerts"] });
    },
  });

  if (!effectivePatientId || (!patientQuery.isLoading && !patient)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/12 text-red-600 mb-6">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{t("patient.page.notLinkedTitle")}</h1>
        <p className="mt-3 text-base text-muted-foreground max-w-lg">{t("patient.page.notLinkedBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 animate-fade-in max-w-5xl mx-auto">
      {/* Greeting Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Heart className="h-3.5 w-3.5" />
            {t("patient.page.portalBadge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("patient.page.helloPrefix")}{" "}
              {patient?.nickname || patient?.first_name || t("patient.page.guest")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("patient.page.roomPrefix")} {patient?.room_id ?? t("patient.page.roomUnassigned")} ·{" "}
              {t("patient.page.dashboardTagline")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {patient?.care_level && (
            <Badge
              variant={
                patient.care_level === "critical"
                  ? "destructive"
                  : patient.care_level === "special"
                    ? "warning"
                    : "outline"
              }
              className="text-sm"
            >
              {patient.care_level} {t("patient.page.careSuffix")}
            </Badge>
          )}
        </div>
      </div>

      {effectivePatientId != null ? <PatientMySensors patientId={Number(effectivePatientId)} /> : null}

      {effectivePatientId != null ? (
        <PatientCareRoadmap patientId={Number(effectivePatientId)} />
      ) : null}

      {/* Quick Actions */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="cursor-pointer border-border/70 transition-all hover:border-primary/50 hover:shadow-md"
          onClick={() => !raiseAssistanceMutation.isPending && raiseAssistanceMutation.mutate("assistance")}
        >
          <CardContent className="flex flex-col items-center justify-center gap-4 p-8 md:p-12">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-600">
              <Phone className="h-10 w-10" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground md:text-2xl">{t("patient.page.callNurse")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("patient.page.callNurseHint")}</p>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="w-full max-w-xs"
              disabled={raiseAssistanceMutation.isPending}
            >
              <Phone className="mr-2 h-5 w-5" />
              {t("patient.page.requestAssistance")}
            </Button>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer border-red-500/30 bg-red-500/5 transition-all hover:border-red-500/60 hover:shadow-md"
          onClick={() => !raiseAssistanceMutation.isPending && raiseAssistanceMutation.mutate("sos")}
        >
          <CardContent className="flex flex-col items-center justify-center gap-4 p-8 md:p-12">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/12 text-red-600">
              <Siren className="h-10 w-10 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-red-600 md:text-2xl">{t("patient.page.emergencySos")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("patient.page.emergencySosHint")}</p>
            </div>
            <Button
              size="lg"
              variant="destructive"
              className="w-full max-w-xs"
              disabled={raiseAssistanceMutation.isPending}
            >
              <Siren className="mr-2 h-5 w-5" />
              {t("patient.page.emergencyAlert")}
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/patient/room-controls" className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
          <Home className="h-4 w-4 text-muted-foreground" />
          Room Controls
        </Link>
        <Link href="/patient/support" className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-muted">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Report Issue
        </Link>
      </div>

      {/* Navigation */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            href: "/patient/schedule",
            icon: Calendar,
            labelKey: "patient.page.navSchedule" as const,
            color: "bg-emerald-500/12 text-emerald-600",
          },
          {
            href: "/patient/room-controls",
            icon: Home,
            labelKey: "patient.page.navRoom" as const,
            color: "bg-amber-500/12 text-amber-600",
          },
          {
            href: "/patient/messages",
            icon: MessageCircle,
            labelKey: "patient.page.navMessages" as const,
            color: "bg-sky-500/12 text-sky-600",
          },
          {
            href: "/patient/services",
            icon: Sparkles,
            labelKey: "patient.page.navServices" as const,
            color: "bg-violet-500/12 text-violet-600",
          },
        ].map(({ href, icon: Icon, labelKey, color }) => (
          <Link key={href} href={href}>
            <Card className="border-border/70 transition-all hover:border-primary/40 hover:shadow-sm">
              <CardContent className="flex flex-col items-center justify-center gap-3 p-6">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-foreground">{t(labelKey)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
