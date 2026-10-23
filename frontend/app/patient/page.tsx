"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  Sparkles,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { patientRoomQuickInfoValue } from "@/lib/patientRoomQuickInfo";
import type { Room } from "@/lib/types";
import { ageYears } from "@/lib/age";
import { useAuth } from "@/hooks/useAuth";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { useTranslation } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GetPatientResponse } from "@/lib/api/task-scope-types";
import { PatientMySensors } from "@/components/patient/PatientMySensors";
import { PatientCareRoadmap } from "@/components/patient/PatientCareRoadmap";
import { PatientSosHero } from "@/components/patient/PatientSosHero";
import { PatientHealthAnalysisPanel } from "@/components/patients/PatientHealthAnalysisPanel";
import UserAvatar from "@/components/shared/UserAvatar";
import { withPatientPreview } from "@/lib/patientPortalPreview";
import { CsvExportButton } from "@/components/shared/CsvExportButton";
import { HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import ReportIssueForm from "@/components/support/ReportIssueForm";

type MeProfileResponse = {
  user: {
    id: number;
    username: string;
    role: string;
    email?: string | null;
    phone?: string | null;
    profile_image_url?: string | null;
  };
  linked_patient?: {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    /** Same hosted path as `GET /patients/{id}` when staff set a patient portrait. */
    photo_url?: string | null;
  } | null;
};

/** Prefer facility patient portrait, then `/auth/me/profile` copies, then account-only user image. */
function mergedPatientPortalAvatarUrl(
  patient: GetPatientResponse,
  profile: MeProfileResponse | null,
): string | null {
  const row = patient as { photo_url?: string | null };
  const a = row.photo_url?.trim();
  const b = profile?.linked_patient?.photo_url?.trim();
  const c = profile?.user.profile_image_url?.trim();
  return a || b || c || null;
}

export default function PatientDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const nowMs = useFixedNowMs();
  const [raiseResult, setRaiseResult] = useState<{
    kind: "assistance" | "sos";
    status: "sending" | "sent" | "error";
  } | null>(null);

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

  const profileQuery = useQuery({
    queryKey: ["patient", "dashboard", "me-profile"],
    enabled: user?.role === "patient",
    queryFn: () => api.get<MeProfileResponse>("/auth/me/profile"),
  });

  const patient = patientQuery.data as GetPatientResponse | null;
  const profile = (profileQuery.data ?? null) as MeProfileResponse | null;
  const patientTabs = useMemo<HubTab[]>(
    () => [
      { key: "overview", label: t("patient.hub.overview"), icon: Home },
      { key: "profile", label: t("patient.hub.profile"), icon: UserRound },
      { key: "support", label: t("patient.hub.support"), icon: MessageCircle },
    ],
    [t],
  );
  const activeTab = useMemo(() => {
    const raw = searchParams.get("tab") ?? "overview";
    return patientTabs.some((tab) => tab.key === raw) ? raw : "overview";
  }, [patientTabs, searchParams]);

  const patientRoomQuery = useQuery({
    queryKey: ["patient", "dashboard", "room", effectivePatientId, patient?.room_id],
    queryFn: () => api.get<Room>(`/rooms/${patient!.room_id}`),
    enabled: effectivePatientId != null && patient?.room_id != null,
  });

  const roomHeadline = useMemo(() => {
    if (patientQuery.isLoading || patientQuery.isPending) return t("common.loading");
    if (!patient) return "";
    return patientRoomQuickInfoValue({
      roomId: patient.room_id ?? null,
      room: patientRoomQuery.data,
      isLoading: patientRoomQuery.isLoading,
      t,
    });
  }, [
    patientQuery.isLoading,
    patientQuery.isPending,
    patient,
    patientRoomQuery.data,
    patientRoomQuery.isLoading,
    t,
  ]);

  const raiseAssistanceMutation = useMutation({
    mutationFn: async (kind: "assistance" | "sos") => {
      if (!effectivePatientId) throw new Error("Patient record is not available");
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
      return kind;
    },
    onMutate: (kind) => setRaiseResult({ kind, status: "sending" }),
    onSuccess: (_data, kind) => setRaiseResult({ kind, status: "sent" }),
    onError: (_error, kind) => setRaiseResult({ kind, status: "error" }),
  });

  const lastRaiseRef = useRef<{ at: number; kind: "assistance" | "sos" } | null>(null);
  const onRaiseAlert = useCallback(
    (kind: "assistance" | "sos") => {
      if (raiseAssistanceMutation.isPending) return;
      const now = Date.now();
      const prev = lastRaiseRef.current;
      if (prev && prev.kind === kind && now - prev.at < 2500) return;
      lastRaiseRef.current = { at: now, kind };
      raiseAssistanceMutation.mutate(kind);
    },
    [raiseAssistanceMutation],
  );

  if (effectivePatientId && (patientQuery.isLoading || patientQuery.isPending) && !patient) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-6 animate-fade-in">
        <div className="space-y-3">
          <div className="h-5 w-28 rounded-full bg-muted/60" />
          <div className="h-10 w-72 rounded-xl bg-muted/60" />
          <div className="h-4 w-64 rounded-lg bg-muted/40" />
        </div>
        <div className="h-10 w-80 rounded-full bg-muted/40" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-48 rounded-lg border border-border/70 bg-card/60" />
          <div className="h-48 rounded-lg border border-border/70 bg-card/60" />
        </div>
      </div>
    );
  }

  if (!effectivePatientId || !patient) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-lg bg-critical-bg text-critical">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{t("patient.page.notLinkedTitle")}</h1>
        <p className="mt-3 max-w-lg text-base text-muted-foreground">{t("patient.page.notLinkedBody")}</p>
      </div>
    );
  }

  const currentPatient = patient as GetPatientResponse;
  const fullName = [currentPatient.first_name, currentPatient.last_name].filter(Boolean).join(" ").trim();
  const patientExportRows = [
    ["patient_id", currentPatient.id],
    ["name", fullName],
    ["room", roomHeadline],
    ["care_level", currentPatient.care_level ?? ""],
    ["date_of_birth", currentPatient.date_of_birth ?? ""],
    ["age_years", ageYears(currentPatient.date_of_birth, nowMs) ?? ""],
    ["active", String(currentPatient.is_active ?? "")],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-sm font-medium text-muted-foreground">
            <Heart className="h-5 w-5" aria-hidden="true" />
            {t("patient.page.portalBadge")}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">
              {t("patient.page.helloPrefix")} {fullName || t("patient.page.guest")}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">{t("patient.page.dashboardTagline")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CsvExportButton
            fileNameBase={`wheelsense-patient-${currentPatient.id}`}
            headers={["Field", "Value"]}
            rows={patientExportRows}
          />
          {currentPatient.care_level ? (
            <Badge
              variant={
                currentPatient.care_level === "critical"
                  ? "destructive"
                  : currentPatient.care_level === "special"
                    ? "warning"
                    : "outline"
              }
              className="text-sm"
            >
              {currentPatient.care_level} {t("patient.page.careSuffix")}
            </Badge>
          ) : null}
        </div>
      </div>

      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-muted-foreground">
                {t("patient.page.roomLocationTitle")}
              </p>
              <p className="text-lg font-semibold leading-snug text-foreground tracking-tight">{roomHeadline}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Suspense>
        <HubTabBar tabs={patientTabs} currentTab={activeTab} />
      </Suspense>

      {activeTab === "overview" ? (
        <PatientHomeContent
          patientId={Number(effectivePatientId)}
          previewPatientId={isAdminPreview ? previewPatientId : null}
          isPending={raiseAssistanceMutation.isPending}
          raiseResult={raiseResult}
          onRaise={onRaiseAlert}
          t={t}
        />
      ) : null}
      {activeTab === "profile" ? (
        <ProfileTab
          patient={currentPatient}
          profile={profile}
          nowMs={nowMs}
          roomDisplay={roomHeadline}
        />
      ) : null}
      {activeTab === "support" ? <ReportIssueForm audience="patient" /> : null}
    </div>
  );
}

function PatientHomeContent({
  patientId,
  previewPatientId,
  isPending,
  raiseResult,
  onRaise,
  t,
}: {
  patientId: number;
  previewPatientId: number | null;
  isPending: boolean;
  raiseResult: {
    kind: "assistance" | "sos";
    status: "sending" | "sent" | "error";
  } | null;
  onRaise: (kind: "assistance" | "sos") => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <PatientSosHero isPending={isPending} result={raiseResult} onRaise={onRaise} />
      <PatientCareRoadmap patientId={patientId} />
      <PatientMySensors patientId={patientId} />

      <section className="space-y-3" aria-labelledby="patient-quicklinks-heading">
        <h2 id="patient-quicklinks-heading" className="text-lg font-semibold text-foreground">
          {t("patient.page.quickLinksTitle")}
        </h2>
        <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            href: "/patient/schedule",
            icon: Calendar,
            labelKey: "patient.page.navSchedule" as const,
            color: "bg-success-bg text-success",
          },
          {
            href: "/patient/room-controls",
            icon: Home,
            labelKey: "patient.page.navRoom" as const,
            color: "bg-warning-bg text-warning",
          },
          {
            href: "/patient/messages",
            icon: MessageCircle,
            labelKey: "patient.page.navMessages" as const,
            color: "bg-info-bg text-info",
          },
          {
            href: "/patient/services",
            icon: Sparkles,
            labelKey: "patient.page.navServices" as const,
            color: "bg-primary/10 text-primary",
          },
        ].map(({ href, icon: Icon, labelKey, color }) => (
          <Link key={href} href={withPatientPreview(href, previewPatientId)} className="h-full">
            <Card className="h-full border-border/70 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm">
              <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-4 sm:p-5">
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-foreground">{t(labelKey)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        </div>
      </section>
    </>
  );
}

function ProfileTab({
  patient,
  profile,
  nowMs,
  roomDisplay,
}: {
  patient: GetPatientResponse;
  profile: MeProfileResponse | null;
  nowMs: number;
  roomDisplay: string;
}) {
  const { t } = useTranslation();
  const linkedPatientName = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
  const age = ageYears(patient.date_of_birth, nowMs);
  const avatarUrl = useMemo(
    () => mergedPatientPortalAvatarUrl(patient, profile),
    [patient, profile],
  );
  const initialsLabel = linkedPatientName || profile?.user.username || t("patient.profilePatientFallback");
  const careLevelLabel = patient.care_level === "critical"
    ? t("patients.careLevelCritical")
    : patient.care_level === "special"
      ? t("patients.careLevelSpecial")
      : t("patients.careLevelStandard");
  const mobilityLabel = patient.mobility_type === "wheelchair"
    ? t("patients.mobilityWheelchair")
    : patient.mobility_type === "walker"
      ? t("patients.mobilityWalker")
      : patient.mobility_type === "independent"
        ? t("patients.mobilityIndependent")
        : "—";

  return (
    <section className="space-y-4">
      <PatientHealthAnalysisPanel patientId={patient.id} />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>{t("patient.profileTitle")}</CardTitle>
          <CardDescription>{t("patient.profileDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar
              username={initialsLabel}
              profileImageUrl={avatarUrl}
              sizePx={88}
            />
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold text-foreground">
                {linkedPatientName || profile?.user.username || t("patient.profilePatientFallback")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("shell.rolePatient")} · {roomDisplay}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label={t("patient.profilePatientRecord")} value={linkedPatientName || t("patient.profileNotLinked")} />
            <InfoCard label={t("patients.age")} value={age != null ? `${age} ${t("patients.years")}` : "—"} />
            <InfoCard label={t("patients.careLevel")} value={careLevelLabel} />
            <InfoCard label={t("patient.profileRecordStatus")} value={patient.is_active ? t("patients.statusActive") : t("patients.statusInactive")} />
            <InfoCard label={t("patients.dateOfBirth")} value={patient.date_of_birth || "—"} />
            <InfoCard label={t("patients.mobilityType")} value={mobilityLabel} />
          </div>

          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            {t("patient.page.profileCorrectionHint")}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>{t("patient.contactTitle")}</CardTitle>
          <CardDescription>{t("patient.contactDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label={t("admin.users.username")} value={profile?.user.username || "—"} />
            <InfoCard label={t("common.role")} value={t("shell.rolePatient")} />
            <InfoCard label={t("clinical.table.email")} value={profile?.user.email || "—"} />
            <InfoCard label={t("clinical.table.phone")} value={profile?.user.phone || "—"} />
          </div>
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            {t("patient.profileReadOnlyHint")}
          </div>
        </CardContent>
      </Card>
      </div>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
