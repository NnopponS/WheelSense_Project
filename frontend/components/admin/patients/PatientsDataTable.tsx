"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import type { Patient } from "@/lib/types";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { useTranslation } from "@/lib/i18n";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  patients: Patient[] | null | undefined;
  isLoading: boolean;
  search: string;
  careLevel: "all" | Patient["care_level"];
  activeStatus: "all" | "active" | "inactive";
  room: "all" | "assigned" | "unassigned";
};

function matchesSearch(patient: Patient, search: string) {
  const value = search.trim().toLowerCase();
  if (!value) return true;
  const name = `${patient.first_name} ${patient.last_name}`.toLowerCase();
  return (
    name.includes(value) ||
    patient.first_name.toLowerCase().includes(value) ||
    patient.last_name.toLowerCase().includes(value) ||
    String(patient.id).includes(value)
  );
}

function getCareVariant(level: Patient["care_level"]) {
  if (level === "critical") return "destructive" as const;
  if (level === "special") return "warning" as const;
  return "success" as const;
}

export function PatientsDataTable({
  patients,
  isLoading,
  search,
  careLevel,
  activeStatus,
  room,
}: Props) {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "admitted_at", desc: true },
  ]);

  const data = useMemo(() => {
    return (patients ?? []).filter((patient) => {
      if (!matchesSearch(patient, search)) return false;
      if (careLevel !== "all" && patient.care_level !== careLevel) return false;
      if (activeStatus === "active" && !patient.is_active) return false;
      if (activeStatus === "inactive" && patient.is_active) return false;
      if (room === "assigned" && patient.room_id == null) return false;
      if (room === "unassigned" && patient.room_id != null) return false;
      return true;
    });
  }, [patients, search, careLevel, activeStatus, room]);

  const columns = useMemo<ColumnDef<Patient>[]>(
    () => [
      {
        accessorKey: "first_name",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 h-auto px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("patients.title")}
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              {row.original.first_name} {row.original.last_name}
            </p>
            <p className="text-xs text-muted-foreground">
              ID #{row.original.id} · {t("patients.age")}:{" "}
              {ageYears(row.original.date_of_birth, nowMs) ?? "-"} {t("patients.years")}
            </p>
          </div>
        ),
        sortingFn: (left, right) => {
          const a = `${left.original.first_name} ${left.original.last_name}`.toLowerCase();
          const b = `${right.original.first_name} ${right.original.last_name}`.toLowerCase();
          return a.localeCompare(b);
        },
      },
      {
        accessorKey: "care_level",
        header: t("patients.careLevel"),
        cell: ({ row }) => (
          <Badge variant={getCareVariant(row.original.care_level)}>
            {row.original.care_level}
          </Badge>
        ),
      },
      {
        accessorKey: "room_id",
        header: t("patients.room"),
        cell: ({ row }) =>
          row.original.room_id != null ? (
            <span className="text-sm text-foreground">Room #{row.original.room_id}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{t("patients.noRoom")}</span>
          ),
      },
      {
        accessorKey: "is_active",
        header: t("patients.accountStatus"),
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? "success" : "outline"}>
            {row.original.is_active ? t("patients.statusActive") : t("patients.statusInactive")}
          </Badge>
        ),
      },
      {
        accessorKey: "admitted_at",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 h-auto px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Admitted
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.admitted_at)}</p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(row.original.admitted_at)}
            </p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button asChild size="sm" variant="outline">
            <Link href={`/head-nurse/patients/${row.original.id}`}>Open</Link>
          </Button>
        ),
      },
    ],
    [nowMs, t],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the selected table engine for this screen.
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-72 items-center justify-center">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>{t("patients.allPatients")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {data.length} {data.length === 1 ? "record" : "records"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <Table>
            <TableHeader className="bg-muted/55">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                    {t("patients.listNoMatches")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
