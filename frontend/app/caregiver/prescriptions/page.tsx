"use client";
"use no memo";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { AppPage } from "@/components/layout/AppPage";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListPrescriptionsResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

type PrescriptionRow = {
  id: number;
  medicationName: string;
  dosage: string;
  frequency: string;
  patientName: string;
  status: string;
  route: string;
  createdAt: string;
};

export default function ObserverPrescriptionsPage() {
  const { t } = useTranslation();
  const prescriptionsQuery = useQuery({
    queryKey: ["caregiver", "prescriptions", "list"],
    queryFn: () => api.listPrescriptions(),
  });

  const patientsQuery = useQuery({
    queryKey: ["caregiver", "prescriptions", "patients"],
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const prescriptions = useMemo(
    () => (prescriptionsQuery.data ?? []) as ListPrescriptionsResponse,
    [prescriptionsQuery.data],
  );

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const rows = useMemo<PrescriptionRow[]>(() => {
    return prescriptions
      .map((item) => {
        const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
        return {
          id: item.id,
          medicationName: item.medication_name,
          dosage: item.dosage,
          frequency: item.frequency,
          patientName: patient
            ? `${patient.first_name} ${patient.last_name}`.trim()
            : "No linked patient",
          status: item.status,
          route: item.route,
          createdAt: item.created_at,
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [patientMap, prescriptions]);

  const columns = useMemo<ColumnDef<PrescriptionRow>[]>(
    () => [
      {
        accessorKey: "medicationName",
        header: "Medication",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.medicationName}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.dosage} • {row.original.frequency}
            </p>
          </div>
        ),
      },
      { accessorKey: "patientName", header: t("observer.prescriptions.patient") },
      { accessorKey: "route", header: t("observer.prescriptions.route") },
      {
        accessorKey: "status",
        header: t("observer.prescriptions.status"),
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "createdAt",
        header: t("observer.prescriptions.created"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [t],
  );

  return (
    <AppPage
      title={t("observer.prescriptions.title")}
      description={t("observer.prescriptions.subtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/caregiver" },
        { label: t("nav.prescriptions") },
      ]}
    >

      <DataTableCard
        title={t("observer.prescriptions.board")}
        mobileMode="cards"
        description={t("observer.prescriptions.boardDesc")}
        data={rows}
        columns={columns}
        isLoading={prescriptionsQuery.isLoading || patientsQuery.isLoading}
        emptyText={t("observer.prescriptions.noItems")}
        rightSlot={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
      />
    </AppPage>
  );
}
