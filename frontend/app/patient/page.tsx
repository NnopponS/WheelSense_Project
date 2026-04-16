"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bug,
  Calendar,
  Heart,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  Siren,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GetPatientResponse } from "@/lib/api/task-scope-types";
import { PatientMySensors } from "@/components/patient/PatientMySensors";
import { PatientCareRoadmap } from "@/components/patient/PatientCareRoadmap";
import { HubTabBar, useHubTab, type HubTab } from "@/components/shared/HubTabBar";
import ReportIssueForm from "@/components/support/ReportIssueForm";
import UserAvatar from "@/components/shared/UserAvatar";
import { withPatientPreview } from "@/lib/patientPortalPreview";

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
  const hubTabs = useMemo<HubTab[]>(
    () => [
      { key: "overview", label: t("patient.hub.overview"), icon: Heart },
      { key: "profile", label: t("patient.hub.profile"), icon: UserRound },
      { key: "support", label: t("patient.hub.support"), icon: Bug },
    ],
    [t],
  );
  const tab = useHubTab(hubTabs);
  const nowMs = useFixedNowMs();

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
          <div className="h-48 rounded-2xl border border-border/70 bg-card/60" />
          <div className="h-48 rounded-2xl border border-border/70 bg-card/60" />
        </div>
      </div>
    );
  }

  if (!effectivePatientId || !patient) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center animate-fade-in">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/12 text-red-600">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{t("patient.page.notLinkedTitle")}</h1>
        <p className="mt-3 max-w-lg text-base text-muted-foreground">{t("patient.page.notLinkedBody")}</p>
      </div>
    );
  }

  const currentPatient = patient as GetPatientResponse;
  const fullName = [currentPatient.first_name, currentPatient.last_name].filter(Boolean).join(" ").trim();

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Heart className="h-3.5 w-3.5" />
            {t("patient.page.portalBadge")}
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              {t("patient.page.helloPrefix")} {fullName || t("patient.page.guest")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("patient.page.dashboardTagline")}</p>
          </div>
        </div>
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

      <Card className="border-primary/25 bg-gradient-to-br from-primary/[0.07] via-transparent to-sky-500/[0.04]">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("patient.page.roomLocationTitle")}
              </p>
              <p className="text-lg font-semibold leading-snug text-foreground tracking-tight">{roomHeadline}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Suspense>
        <HubTabBar tabs={hubTabs} />
      </Suspense>

      {tab === "overview" ? (
        <OverviewTab
          patientId={Number(effectivePatientId)}
          previewPatientId={isAdminPreview ? previewPatientId : null}
          isPending={raiseAssistanceMutation.isPending}
          onRaise={onRaiseAlert}
          t={t}
        />
      ) : null}

      {tab === "profile" ? (
        <ProfileTab patient={currentPatient} profile={profile} nowMs={nowMs} roomDisplay={roomHeadline} />
      ) : null}

      {tab === "support" ? <SupportTab t={t} /> : null}
    </div>
  );
}

function SupportTab({ t }: { t: (key: string) => string }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">{t("patient.page.reportSectionTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("patient.page.reportSectionDesc")}</p>
      </div>
      <div className="rounded-2xl border border-border/70 bg-card/40 p-4 md:p-5">
        <ReportIssueForm />
      </div>
    </div>
  );
}

function OverviewTab({
  patientId,
  previewPatientId,
  isPending,
  onRaise,
  t,
}: {
  patientId: number;
  previewPatientId: number | null;
  isPending: boolean;
  onRaise: (kind: "assistance" | "sos") => void;
  t: (key: string) => string;
}) {
  const servicesHref = withPatientPreview("/patient/services", previewPatientId);

  return (
    <>
      <PatientCareRoadmap patientId={patientId} />
      <PatientMySensors patientId={patientId} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="border-border/70 transition-all hover:border-primary/50 hover:shadow-md">
          <CardContent className="flex flex-col items-center justify-center gap-4 p-8 md:p-12">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-600">
              <Phone className="h-10 w-10" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground md:text-2xl">{t("patient.page.callNurse")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("patient.page.callNurseHint")}</p>
            </div>
            <Button size="lg" variant="outline" className="w-full max-w-xs" asChild>
              <Link href={servicesHref}>
                <Phone className="mr-2 h-5 w-5" />
                {t("patient.page.requestAssistance")}
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full max-w-xs"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRaise("assistance");
              }}
            >
              {t("patient.page.notifyStaffUrgent")}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-red-500/30 bg-red-500/5 transition-all hover:border-red-500/60 hover:shadow-md">
          <CardContent className="flex flex-col items-center justify-center gap-4 p-8 md:p-12">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/12 text-red-600">
              <Siren className="h-10 w-10 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-red-600 md:text-2xl">{t("patient.page.emergencySos")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("patient.page.emergencySosHint")}</p>
            </div>
            <Button
              type="button"
              size="lg"
              variant="destructive"
              className="w-full max-w-xs"
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRaise("sos");
              }}
            >
              <Siren className="mr-2 h-5 w-5" />
              {t("patient.page.emergencyAlert")}
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="patient-quicklinks-heading">
        <h3 id="patient-quicklinks-heading" className="text-sm font-semibold text-foreground">
          {t("patient.page.quickLinksTitle")}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <Link key={href} href={withPatientPreview(href, previewPatientId)}>
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
  const linkedPatientName = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
  const age = ageYears(patient.date_of_birth, nowMs);
  const avatarUrl = useMemo(
    () => mergedPatientPortalAvatarUrl(patient, profile),
    [patient, profile],
  );
  const initialsLabel = linkedPatientName || profile?.user.username || "Patient";
  const { t } = useTranslation();

  return (
    <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>My profile</CardTitle>
          <CardDescription>Account and patient identity are shown together for self-check.</CardDescription>
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
                {linkedPatientName || profile?.user.username || "Patient"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(profile?.user.role?.replace(/_/g, " ") || "patient")} · {roomDisplay}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Patient record" value={linkedPatientName || "Not linked"} />
            <InfoCard label="Age" value={age != null ? `${age} years` : "—"} />
            <InfoCard label="Care level" value={patient.care_level || "standard"} />
            <InfoCard label="Record status" value={patient.is_active ? "active" : "inactive"} />
            <InfoCard label="Date of birth" value={patient.date_of_birth || "—"} />
            <InfoCard label="Mobility" value={patient.mobility_type || "—"} />
          </div>

          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            {t("patient.page.profileCorrectionHint")}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Account contact</CardTitle>
          <CardDescription>Your account mirrors the patient record for self-check. Editing stays staff-managed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Username" value={profile?.user.username || "—"} />
            <InfoCard label="Role" value={profile?.user.role?.replace(/_/g, " ") || "patient"} />
            <InfoCard label="Email" value={profile?.user.email || "—"} />
            <InfoCard label="Phone" value={profile?.user.phone || "—"} />
          </div>
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            Patients can review their own information here, but account and health-record edits must be requested from staff.
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-muted/15 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
