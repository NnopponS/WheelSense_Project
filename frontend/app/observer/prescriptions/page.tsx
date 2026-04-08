"use client";
"use no memo";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ClipboardList } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListFuturePrescriptionsResponse,
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
  const prescriptionsQuery = useQuery({
    queryKey: ["observer", "prescriptions", "list"],
    queryFn: () => api.listFuturePrescriptions(),
  });

  const patientsQuery = useQuery({
    queryKey: ["observer", "prescriptions", "patients"],
    queryFn: () => api.listPatients({ limit: 500 }),
  });

  const prescriptions = useMemo(
    () => (prescriptionsQuery.data ?? []) as ListFuturePrescriptionsResponse,
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
      { accessorKey: "patientName", header: "Patient" },
      { accessorKey: "route", header: "Route" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Prescription Board</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review active medication plans while handling routine care tasks.
        </p>
      </div>

      <DataTableCard
        title="Prescriptions"
        description="Current prescriptions linked to patients in this workspace."
        data={rows}
        columns={columns}
        isLoading={prescriptionsQuery.isLoading || patientsQuery.isLoading}
        emptyText="No prescriptions assigned."
        rightSlot={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
