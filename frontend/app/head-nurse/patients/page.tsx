"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Search, Users } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ListPatientsResponse } from "@/lib/api/task-scope-types";

type PatientRow = {
  id: number;
  fullName: string;
  careLevel: string;
  roomId: number | null;
  status: "active" | "inactive";
};

export default function HeadNursePatientsPage() {
  const [search, setSearch] = useState("");

  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "patients", "list"],
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
        header: "Patient",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground">ID #{row.original.id}</p>
          </div>
        ),
      },
      {
        accessorKey: "careLevel",
        header: "Care level",
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
        header: "Room",
        cell: ({ row }) => (row.original.roomId != null ? `Room #${row.original.roomId}` : "Unassigned"),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "success" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/head-nurse/patients/${row.original.id}`}>Open detail</Link>
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Patients</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ward roster with care-level visibility and quick access to patient detail.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search patients by name or ID"
          className="pl-9"
        />
      </div>

      <DataTableCard
        title="Patient Roster"
        description="All patients in current workspace scope."
        data={rows}
        columns={columns}
        isLoading={patientsQuery.isLoading}
        emptyText="No patients found."
        rightSlot={<Users className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
