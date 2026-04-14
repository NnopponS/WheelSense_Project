"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Heart,
  Home,
  MessageCircle,
  Phone,
  Siren,
  Sparkles,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
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
  } | null;
};

const TABS: HubTab[] = [
  { key: "overview", label: "Overview", icon: Heart },
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "support", label: "Support", icon: MessageCircle },
];

export default function PatientDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const tab = useHubTab(TABS);
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
            <p className="mt-1 text-sm text-muted-foreground">
              {t("patient.page.roomPrefix")} {currentPatient.room_id ?? t("patient.page.roomUnassigned")} ·{" "}
              {t("patient.page.dashboardTagline")}
            </p>
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

      <Suspense>
        <HubTabBar tabs={TABS} />
      </Suspense>

      {tab === "overview" ? (
        <OverviewTab
          patientId={Number(effectivePatientId)}
          isPending={raiseAssistanceMutation.isPending}
          onRaise={(kind) => raiseAssistanceMutation.mutate(kind)}
          t={t}
        />
      ) : null}

      {tab === "profile" ? (
        <ProfileTab patient={currentPatient} profile={profile} nowMs={nowMs} />
      ) : null}

      {tab === "support" ? (
        <section className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Support and corrections</h3>
            <p className="text-sm text-muted-foreground">
              Report account issues, room mismatches, or health-record corrections for staff follow-up.
            </p>
          </div>
          <ReportIssueForm />
        </section>
      ) : null}
    </div>
  );
}

function OverviewTab({
  patientId,
  isPending,
  onRaise,
  t,
}: {
  patientId: number;
  isPending: boolean;
  onRaise: (kind: "assistance" | "sos") => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <PatientMySensors patientId={patientId} />
      <PatientCareRoadmap patientId={patientId} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer border-border/70 transition-all hover:border-primary/50 hover:shadow-md"
          onClick={() => !isPending && onRaise("assistance")}
        >
          <CardContent className="flex flex-col items-center justify-center gap-4 p-8 md:p-12">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-sky-500/12 text-sky-600">
              <Phone className="h-10 w-10" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground md:text-2xl">{t("patient.page.callNurse")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("patient.page.callNurseHint")}</p>
            </div>
            <Button size="lg" variant="outline" className="w-full max-w-xs" disabled={isPending}>
              <Phone className="mr-2 h-5 w-5" />
              {t("patient.page.requestAssistance")}
            </Button>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer border-red-500/30 bg-red-500/5 transition-all hover:border-red-500/60 hover:shadow-md"
          onClick={() => !isPending && onRaise("sos")}
        >
          <CardContent className="flex flex-col items-center justify-center gap-4 p-8 md:p-12">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/12 text-red-600">
              <Siren className="h-10 w-10 animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-red-600 md:text-2xl">{t("patient.page.emergencySos")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("patient.page.emergencySosHint")}</p>
            </div>
            <Button size="lg" variant="destructive" className="w-full max-w-xs" disabled={isPending}>
              <Siren className="mr-2 h-5 w-5" />
              {t("patient.page.emergencyAlert")}
            </Button>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/patient/room-controls"
          className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Home className="h-4 w-4 text-muted-foreground" />
          Room Controls
        </Link>
        <Link
          href="/patient/support"
          className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          Support
        </Link>
      </div>

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
    </>
  );
}

function ProfileTab({
  patient,
  profile,
  nowMs,
}: {
  patient: GetPatientResponse;
  profile: MeProfileResponse | null;
  nowMs: number;
}) {
  const linkedPatientName = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
  const age = ageYears(patient.date_of_birth, nowMs);

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
              username={(profile?.user.username ?? linkedPatientName) || "Patient"}
              profileImageUrl={profile?.user.profile_image_url ?? null}
              sizePx={88}
            />
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold text-foreground">
                {linkedPatientName || profile?.user.username || "Patient"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(profile?.user.role?.replace(/_/g, " ") || "patient")} · Room {patient.room_id ?? "unassigned"}
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
            If your room, identity, or health record looks wrong, open the Support tab and submit a correction request for staff.
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
