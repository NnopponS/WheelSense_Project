"use client";
"use no memo";

import { Suspense } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Pill, Search, Users } from "lucide-react";
import SupervisorPrescriptionsPage from "@/app/supervisor/prescriptions/page";
import { useHubTab, HubTabBar, type HubTab } from "@/components/shared/HubTabBar";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";
import { useTranslation } from "@/lib/i18n";

const TABS: HubTab[] = [
  { key: "patients", label: "Patients", icon: Users },
  { key: "prescriptions", label: "Prescriptions", icon: Pill },
];

export default function SupervisorPatientsPage() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <Suspense><HubTabBar tabs={TABS} /></Suspense>
      {tab === "patients" && <PatientsContent />}
      {tab === "prescriptions" && <SupervisorPrescriptionsPage />}
    </div>
  );
}

type PatientRow = {
  id: number;
  fullName: string;
  careLevel: string;
  roomId: number | null;
  status: "active" | "inactive";
};

function PatientsContent() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

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
        fullName: `${patient.first_name} ${patient.last_name}`.trim() || `Patient #${patient.id}`,
        careLevel: patient.care_level,
        roomId: patient.room_id,
        status: patient.is_active ? "active" : "inactive",
      }));
  }, [patientsQuery.data, search]);

  const columns = useMemo<ColumnDef<PatientRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: t("clinical.table.patient"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">ID #{row.original.id}</p>
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
            {row.original.careLevel}
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
            <Link href={`/supervisor/patients/${row.original.id}`}>{t("clinical.table.openDetail")}</Link>
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("nav.patients")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("supervisor.patientsList.subtitle")}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("clinical.patientsRoster.searchPlaceholder")}
          className="pl-9"
        />
      </div>

      <DataTableCard
        title={t("clinical.patientsRoster.title")}
        description={t("clinical.patientsRoster.description")}
        data={rows}
        columns={columns}
        isLoading={patientsQuery.isLoading}
        emptyText={t("clinical.patientsRoster.empty")}
        rightSlot={<Users className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
