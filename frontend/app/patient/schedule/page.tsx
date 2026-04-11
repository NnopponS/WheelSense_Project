"use client";

import { Suspense, useMemo, useState } from "react";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CalendarCheck2, CalendarClock, Pill, Stethoscope, User } from "lucide-react";
import PatientServicesPage from "@/app/patient/services/page";
import PatientPharmacyPage from "@/app/patient/pharmacy/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type {
  ListPatientsResponse,
  ListWorkflowSchedulesResponse,
} from "@/lib/api/task-scope-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/lib/i18n";
import { AgendaView } from "@/components/calendar/AgendaView";
import { CalendarView, type CalendarViewMode } from "@/components/calendar/CalendarView";
import {
  buildPatientNameMap,
  schedulesToCalendarEvents,
} from "@/components/calendar/scheduleEventMapper";

const TABS: HubTab[] = [
  { key: "schedule", label: "Schedule", icon: Calendar },
  { key: "services", label: "Services", icon: Stethoscope },
  { key: "pharmacy", label: "Pharmacy", icon: Pill },
];

export default function PatientSchedulePage() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <Suspense><HubTabBar tabs={TABS} /></Suspense>
      {tab === "schedule" && <ScheduleContent />}
      {tab === "services" && <PatientServicesPage />}
      {tab === "pharmacy" && <PatientPharmacyPage />}
    </div>
  );
}

function ScheduleContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const previewRaw = searchParams.get("previewAs");
  const previewNum = previewRaw != null && previewRaw !== "" ? Number(previewRaw) : NaN;
  const previewPatientId =
    Number.isFinite(previewNum) && previewNum > 0 ? Math.floor(previewNum) : null;
  const isAdminPreview = user?.role === "admin" && previewPatientId != null;
  const showAdminPatientPicker =
    user?.role === "admin" && user.patient_id == null && previewPatientId == null;
  const effectivePatientId = isAdminPreview ? previewPatientId : (user?.patient_id ?? null);

  const adminPatientsQuery = useQuery({
    queryKey: ["patient", "schedule", "admin-picker", "patients"],
    enabled: showAdminPatientPicker,
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const schedulesQuery = useQuery({
    queryKey: ["patient", "schedule", "schedules", effectivePatientId],
    enabled: effectivePatientId != null,
    queryFn: () =>
      api.listWorkflowSchedules({
        patient_id: Number(effectivePatientId),
        limit: 240,
      }),
  });

  const patientQuery = useQuery({
    queryKey: ["patient", "schedule", "profile", effectivePatientId],
    enabled: effectivePatientId != null,
    queryFn: () => api.getPatient(Number(effectivePatientId)),
  });

  const schedules = useMemo(
    () => (schedulesQuery.data ?? []) as ListWorkflowSchedulesResponse,
    [schedulesQuery.data],
  );
  const adminPatients = useMemo(
    () => (adminPatientsQuery.data ?? []) as ListPatientsResponse,
    [adminPatientsQuery.data],
  );
  const patient = patientQuery.data ?? null;

  const patientNameById = useMemo(() => {
    if (!patient || effectivePatientId == null) return new Map<number, string>();
    return buildPatientNameMap([
      {
        ...patient,
        id: Number(effectivePatientId),
      },
    ]);
  }, [patient, effectivePatientId]);

  const events = useMemo(
    () => schedulesToCalendarEvents(schedules, patientNameById),
    [schedules, patientNameById],
  );

  const stats = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayEvents = events.filter(
      (event) => format(event.startTime, "yyyy-MM-dd") === today,
    );
    return {
      total: events.length,
      today: todayEvents.length,
      completed: events.filter((event) => event.status === "completed").length,
    };
  }, [events]);

  if (showAdminPatientPicker) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{t("patient.schedule.adminChooseTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("patient.schedule.adminChooseDesc")}
              </p>
            </div>
          </div>
          <Select onValueChange={(value) => router.push(`/patient/schedule?previewAs=${value}`)}>
            <SelectTrigger>
              <SelectValue placeholder={t("patient.schedule.selectPatientPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {adminPatients.map((patientOption) => (
                <SelectItem key={patientOption.id} value={String(patientOption.id)}>
                  {patientOption.first_name} {patientOption.last_name} (#{patientOption.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    );
  }

  if (effectivePatientId == null) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="text-xl font-semibold text-foreground">{t("patient.schedule.noLinkedTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("patient.schedule.noLinkedBody")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">{t("patient.schedule.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("patient.schedule.subtitle")}
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("patient.schedule.statAllEvents")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("calendar.today")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-primary">{stats.today}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("patient.schedule.statCompleted")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.completed}</p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <CalendarView
          events={events}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          showCreateButton={false}
          readOnly
        />

        <div className="space-y-4">
          <AgendaView
            events={events}
            maxDays={10}
            title={t("patient.schedule.agendaTitle")}
            emptyMessage={t("patient.schedule.agendaEmpty")}
          />

          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4" />
                {t("patient.schedule.readOnlyTimeline")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("patient.schedule.readOnlyHelp")}
              </p>
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarCheck2 className="h-4 w-4" />
                {t("patient.schedule.statusAutoNote")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {isAdminPreview ? (
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={() => router.push("/patient/schedule")}>
            {t("patient.schedule.clearPreview")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
