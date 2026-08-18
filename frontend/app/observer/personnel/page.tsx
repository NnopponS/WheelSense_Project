"use client";
"use no memo";

import { Suspense } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Activity, ClipboardList, MessageSquare, NotebookPen, Pill, Users } from "lucide-react";
import ObserverPrescriptionsPage from "@/app/observer/prescriptions/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/shared/FilterBar";
import { api } from "@/lib/api";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { AppPage } from "@/components/layout/AppPage";
import {
  buildPatientListHref,
  rememberPatientListScroll,
  restorePatientListScroll,
  withPatientListReturnTo,
} from "@/lib/patientListContext";
import type {
  CareTaskOut,
  ListPatientsResponse,
  ListWorkflowHandoversResponse,
  ListWorkflowMessagesResponse,
} from "@/lib/api/task-scope-types";

const TAB_CONFIG: Array<Omit<HubTab, "label"> & { labelKey: TranslationKey }> = [
  { key: "patients", labelKey: "nav.patients", icon: Users },
  { key: "prescriptions", labelKey: "nav.prescriptions", icon: Pill },
];

export default function ObserverPatientsPage() {
  const { t } = useTranslation();
  const tabs = useMemo<HubTab[]>(
    () => TAB_CONFIG.map(({ labelKey, ...item }) => ({ ...item, label: t(labelKey) })),
    [t],
  );
  const tab = useHubTab(tabs);
  return (
    <div>
      <Suspense><HubTabBar tabs={tabs} /></Suspense>
      {tab === "patients" && <PatientsContent />}
      {tab === "prescriptions" && <ObserverPrescriptionsPage />}
    </div>
  );
}

type PatientRow = {
  id: number;
  fullName: string;
  nickname: string;
  careLevel: string;
  roomId: number | null;
  openTaskCount: number;
  unreadMessageCount: number;
  handoverCount: number;
};

function observerCareLevelKey(level: string): TranslationKey {
  switch (level) {
    case "critical":
      return "patients.careLevelCritical";
    case "special":
      return "patients.careLevelSpecial";
    case "standard":
      return "patients.careLevelStandard";
    default:
      return "patients.careLevelStandard";
  }
}

function PatientsContent() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");

  const replaceSearch = useCallback(
    (nextSearch: string) => {
      router.replace(buildPatientListHref(pathname, searchParams, nextSearch, "all"), { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const currentPatientListHref = useMemo(
    () => buildPatientListHref(pathname, searchParams, search, "all"),
    [pathname, search, searchParams],
  );

  useEffect(() => {
    restorePatientListScroll(currentPatientListHref);
  }, [currentPatientListHref]);

  const patientsQuery = useQuery({
    queryKey: ["observer", "patients", "list"],
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const tasksQuery = useQuery({
    queryKey: ["observer", "patients", "tasks"],
    queryFn: () => api.listWorkflowTasks({ limit: 300 }),
  });

  const messagesQuery = useQuery({
    queryKey: ["observer", "patients", "messages"],
    queryFn: () => api.listWorkflowMessages({ inbox_only: false, limit: 300 }),
  });

  const handoversQuery = useQuery({
    queryKey: ["observer", "patients", "handovers"],
    queryFn: () => api.listWorkflowHandovers({ limit: 300 }),
  });

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );
  const tasks = useMemo(
    () => (tasksQuery.data ?? []) as CareTaskOut[],
    [tasksQuery.data],
  );
  const messages = useMemo(
    () => (messagesQuery.data ?? []) as ListWorkflowMessagesResponse,
    [messagesQuery.data],
  );
  const handovers = useMemo(
    () => (handoversQuery.data ?? []) as ListWorkflowHandoversResponse,
    [handoversQuery.data],
  );

  const rows = useMemo<PatientRow[]>(() => {
    const q = search.trim().toLowerCase();

    return patients
      .filter((patient) => {
        if (!q) return true;
        const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
        return (
          fullName.includes(q) ||
          patient.nickname.toLowerCase().includes(q) ||
          String(patient.id).includes(q)
        );
      })
      .map((patient) => {
        const openTaskCount = tasks.filter(
          (task) =>
            task.patient_id === patient.id &&
            task.status !== "completed" &&
            task.status !== "cancelled",
        ).length;
        const unreadMessageCount = messages.filter(
          (message) => message.patient_id === patient.id && !message.is_read,
        ).length;
        const handoverCount = handovers.filter(
          (handover) => handover.patient_id === patient.id,
        ).length;

        return {
          id: patient.id,
          fullName: `${patient.first_name} ${patient.last_name}`.trim(),
          nickname: patient.nickname,
          careLevel: patient.care_level,
          roomId: patient.room_id,
          openTaskCount,
          unreadMessageCount,
          handoverCount,
        };
      });
  }, [handovers, messages, patients, search, tasks]);

  const columns = useMemo<ColumnDef<PatientRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("patients.colPatient"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.nickname || t("observer.patients.noNickname")} • {t("patients.recordId")} #
              {row.original.id}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "careLevel",
        header: t("observer.patients.careLevel"),
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.careLevel === "critical"
                ? "destructive"
                : row.original.careLevel === "special"
                  ? "warning"
                  : "success"
            }
          >
            {t(observerCareLevelKey(row.original.careLevel))}
          </Badge>
        ),
      },
      {
        accessorKey: "roomId",
        header: t("observer.patients.room"),
        cell: ({ row }) =>
          row.original.roomId != null
            ? `${t("patients.roomPrefix")} #${row.original.roomId}`
            : t("observer.patients.unassigned"),
      },
      {
        accessorKey: "openTaskCount",
        header: t("observer.patients.openTasks"),
      },
      {
        accessorKey: "unreadMessageCount",
        header: t("observer.patients.unreadMessages"),
      },
      {
        accessorKey: "handoverCount",
        header: t("observer.patients.handovers"),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href={withPatientListReturnTo(
                  `/observer/personnel/${row.original.id}`,
                  currentPatientListHref,
                )}
                onClick={() => rememberPatientListScroll(currentPatientListHref)}
              >
                {t("observer.patients.openDetail")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link
                href={withPatientListReturnTo(
                  `/observer/personnel/${row.original.id}#timeline`,
                  currentPatientListHref,
                )}
                onClick={() => rememberPatientListScroll(currentPatientListHref)}
              >
                <Activity className="h-4 w-4" />
                {t("nav.timeline")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [currentPatientListHref, t],
  );

  const openTaskTotal = tasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  ).length;
  const unreadTotal = messages.filter((message) => !message.is_read).length;

  const isLoadingAny =
    patientsQuery.isLoading ||
    tasksQuery.isLoading ||
    messagesQuery.isLoading ||
    handoversQuery.isLoading;

  return (
    <AppPage
      title={t("observer.patients.title")}
      description={t("observer.patients.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/observer" },
        { label: t("nav.patients") },
      ]}
    >

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStatCard icon={Users} label={t("observer.patients.assignedPatients")} value={patients.length} tone="info" />
        <SummaryStatCard icon={ClipboardList} label={t("observer.patients.openTasks")} value={openTaskTotal} tone="warning" />
        <SummaryStatCard icon={MessageSquare} label={t("observer.patients.unreadMessages")} value={unreadTotal} tone="warning" />
        <SummaryStatCard icon={NotebookPen} label={t("observer.patients.recentHandovers")} value={handovers.length} tone="info" />
      </section>

      <FilterBar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          replaceSearch(value);
        }}
        searchPlaceholder={t("observer.patients.searchPlaceholder")}
        resultLabel={`${rows.length} ${rows.length === 1 ? t("table.row") : t("table.rows")}`}
        hasActiveFilters={search.trim().length > 0}
        onReset={() => {
          setSearch("");
          replaceSearch("");
        }}
      />

      <DataTableCard
        title={t("observer.patients.coverageTitle")}
        mobileMode="cards"
        description={t("observer.patients.coverageDesc")}
        data={rows}
        columns={columns}
        isLoading={isLoadingAny}
        emptyText={t("observer.patients.noMatch")}
        csvExport={{
          fileNameBase: "wheelsense-observer-personnel",
          headers: [
            t("patients.recordId"),
            t("clinical.table.patient"),
            t("patients.nickname"),
            t("clinical.table.careLevel"),
            t("clinical.table.room"),
            t("observer.patients.openTasks"),
            t("observer.patients.unreadMessages"),
            t("observer.patients.handovers"),
          ],
          getRowValues: (row) => [
            row.id,
            row.fullName,
            row.nickname,
            row.careLevel,
            row.roomId,
            row.openTaskCount,
            row.unreadMessageCount,
            row.handoverCount,
          ],
        }}
      />
    </AppPage>
  );
}
