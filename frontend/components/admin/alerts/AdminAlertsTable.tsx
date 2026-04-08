"use client";
"use no memo";

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
import { ArrowUpDown, Bell, CheckCheck, Siren, TriangleAlert } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { Alert } from "@/lib/types";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type AdminAlertFilterStatus = "all" | "active" | "acknowledged" | "resolved";

type Props = {
  alerts: Alert[] | null | undefined;
  isLoading: boolean;
  filter: AdminAlertFilterStatus;
  search: string;
  onUpdateStatus: (id: number, status: string) => void;
  canAcknowledge: boolean;
};

function getSeverityVariant(severity: Alert["severity"]) {
  if (severity === "critical") return "destructive" as const;
  if (severity === "warning") return "warning" as const;
  return "default" as const;
}

function getStatusVariant(status: Alert["status"]) {
  if (status === "active") return "destructive" as const;
  if (status === "acknowledged") return "warning" as const;
  return "success" as const;
}

export function AdminAlertsTable({
  alerts,
  isLoading,
  filter,
  search,
  onUpdateStatus,
  canAcknowledge,
}: Props) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp", desc: true },
  ]);

  const filteredAlerts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (alerts ?? []).filter((alert) => {
      if (filter !== "all" && alert.status !== filter) return false;
      if (!query) return true;
      return (
        alert.title.toLowerCase().includes(query) ||
        alert.alert_type.toLowerCase().includes(query) ||
        alert.description.toLowerCase().includes(query) ||
        String(alert.id).includes(query)
      );
    });
  }, [alerts, filter, search]);

  const columns = useMemo<ColumnDef<Alert>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 h-auto px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Alert
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              {row.original.title || row.original.alert_type}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.description || row.original.alert_type}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => (
          <Badge variant={getSeverityVariant(row.original.severity)}>
            {row.original.severity}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={getStatusVariant(row.original.status)}>{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 h-auto px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Time
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(row.original.timestamp)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "patient_id",
        header: "Patient",
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.patient_id != null ? `#${row.original.patient_id}` : "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-2">
            {row.original.status === "active" && canAcknowledge ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onUpdateStatus(row.original.id, "acknowledged")}
                >
                  {t("alerts.acknowledge")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onUpdateStatus(row.original.id, "resolved")}
                >
                  {t("alerts.resolve")}
                </Button>
              </>
            ) : null}
            {row.original.status === "acknowledged" && canAcknowledge ? (
              <Button
                type="button"
                size="sm"
                onClick={() => onUpdateStatus(row.original.id, "resolved")}
              >
                {t("alerts.resolve")}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canAcknowledge, onUpdateStatus, t],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the chosen admin grid engine.
  const table = useReactTable({
    data: filteredAlerts,
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

  const counts = useMemo(() => {
    const source = alerts ?? [];
    return {
      total: source.length,
      active: source.filter((alert) => alert.status === "active").length,
      acknowledged: source.filter((alert) => alert.status === "acknowledged").length,
      critical: source.filter((alert) => alert.severity === "critical").length,
    };
  }, [alerts]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total alerts" value={counts.total} icon={Bell} />
        <SummaryCard label={t("alerts.active")} value={counts.active} icon={Siren} />
        <SummaryCard
          label={t("alerts.acknowledged")}
          value={counts.acknowledged}
          icon={CheckCheck}
        />
        <SummaryCard label="Critical" value={counts.critical} icon={TriangleAlert} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{t("alerts.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {filteredAlerts.length} {filteredAlerts.length === 1 ? "match" : "matches"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
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
                          {t("alerts.empty")}
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Bell;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
