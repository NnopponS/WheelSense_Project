"use client";
"use no memo";

import { Suspense } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Pill, Users } from "lucide-react";
import SupervisorPrescriptionsPage from "@/app/supervisor/prescriptions/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import UserAvatar from "@/components/shared/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/shared/FilterBar";
import { api } from "@/lib/api";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { AppPage } from "@/components/layout/AppPage";
import {
  buildPatientListHref,
  rememberPatientListScroll,
  restorePatientListScroll,
  withPatientListReturnTo,
} from "@/lib/patientListContext";

const TAB_CONFIG: Array<Omit<HubTab, "label"> & { labelKey: TranslationKey }> = [
  { key: "patients", labelKey: "nav.patients", icon: Users },
  { key: "prescriptions", labelKey: "nav.prescriptions", icon: Pill },
];

export default function SupervisorPatientsPage() {
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
      {tab === "prescriptions" && <SupervisorPrescriptionsPage />}
    </div>
  );
}

type PatientRow = {
  id: number;
  fullName: string;
  photoUrl: string | null;
  careLevel: string;
  roomId: number | null;
  status: "active" | "inactive";
};

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
    queryKey: ["supervisor", "patients", "list"],
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const rows = useMemo<PatientRow[]>(() => {
    const source = (patientsQuery.data ?? []) as ListPatientsResponse;
    const q = search.trim().toLowerCase();

    return source
      .filter((patient) => {
        if (!q) return true;
        const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
        return fullName.includes(q) || String(patient.id).includes(q);
      })
      .map((patient) => ({
        id: patient.id,
        fullName: `${patient.first_name} ${patient.last_name}`.trim() || `${t("admin.support.patientNumber").replace("{id}", String(patient.id))}`,
        photoUrl: patient.photo_url?.trim() || null,
        careLevel: patient.care_level,
        roomId: patient.room_id,
        status: patient.is_active ? "active" : "inactive",
      }));
  }, [patientsQuery.data, search, t]);

  const columns = useMemo<ColumnDef<PatientRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("clinical.table.patient"),
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <UserAvatar
              username={row.original.fullName}
              profileImageUrl={row.original.photoUrl}
              sizePx={38}
              fallbackClassName="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200"
            />
            <div className="space-y-1">
              <p className="font-medium text-foreground">{row.original.fullName}</p>
              <p className="text-sm text-muted-foreground">
                {t("patients.recordId")} #{row.original.id}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "careLevel",
        header: t("clinical.table.careLevel"),
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
            {row.original.careLevel === "critical"
              ? t("patients.careLevelCritical")
              : row.original.careLevel === "special"
                ? t("patients.careLevelSpecial")
                : t("patients.careLevelStandard")}
          </Badge>
        ),
      },
      {
        accessorKey: "roomId",
        header: t("clinical.table.room"),
        cell: ({ row }) =>
          row.original.roomId != null
            ? `${t("clinical.patient.roomPrefix")}${row.original.roomId}`
            : t("clinical.patient.unassignedRoom"),
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "success" : "outline"}>
            {row.original.status === "active"
              ? t("clinical.recordStatus.activeBadge")
              : t("clinical.recordStatus.inactiveBadge")}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: t("clinical.table.actions"),
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link
              href={withPatientListReturnTo(
                `/supervisor/personnel/${row.original.id}`,
                currentPatientListHref,
              )}
              onClick={() => rememberPatientListScroll(currentPatientListHref)}
            >
              {t("clinical.table.openDetail")}
            </Link>
          </Button>
        ),
      },
    ],
    [currentPatientListHref, t],
  );

  return (
    <AppPage
      title={t("nav.patients")}
      description={t("supervisor.patientsList.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/supervisor" },
        { label: t("nav.patients") },
      ]}
    >

      <FilterBar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          replaceSearch(value);
        }}
        searchPlaceholder={t("clinical.patientsRoster.searchPlaceholder")}
        resultLabel={`${rows.length} ${rows.length === 1 ? t("table.row") : t("table.rows")}`}
        hasActiveFilters={search.trim().length > 0}
        onReset={() => {
          setSearch("");
          replaceSearch("");
        }}
      />

      <DataTableCard
        title={t("clinical.patientsRoster.title")}
        mobileMode="cards"
        description={t("clinical.patientsRoster.description")}
        data={rows}
        columns={columns}
        isLoading={patientsQuery.isLoading}
        emptyText={t("clinical.patientsRoster.empty")}
        rightSlot={<Users className="h-4 w-4 text-muted-foreground" />}
        csvExport={{
          fileNameBase: "wheelsense-supervisor-personnel",
          headers: [
            t("patients.recordId"),
            t("clinical.table.patient"),
            t("clinical.table.careLevel"),
            t("clinical.table.room"),
            t("clinical.table.status"),
          ],
          getRowValues: (row) => [
            row.id,
            row.fullName,
            row.careLevel,
            row.roomId,
            row.status,
          ],
        }}
      />
    </AppPage>
  );
}
