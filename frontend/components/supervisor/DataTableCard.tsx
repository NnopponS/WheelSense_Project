"use client";
"use no memo";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildCsvFromRows, downloadCsvFile } from "@/lib/csv";
import { useTranslation } from "@/lib/i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DataTableCsvExport<TData> = {
  /** Filename stem without extension, ASCII recommended (date is appended). */
  fileNameBase: string;
  headers: string[];
  getRowValues: (row: TData) => (string | number | null | undefined)[];
};

function getMobileCellLabel<TData>(cell: Cell<TData, unknown>): string | null {
  const header = cell.column.columnDef.header;
  if (typeof header === "string") {
    const trimmed = header.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return cell.column.id;
}

function isMobileActionCell<TData>(cell: Cell<TData, unknown>): boolean {
  const label = getMobileCellLabel(cell);
  return label == null || /action/i.test(cell.column.id);
}

type Props<TData> = {
  title: string;
  data: TData[];
  columns: ColumnDef<TData>[];
  isLoading?: boolean;
  emptyText?: string;
  description?: string;
  rightSlot?: React.ReactNode;
  pageSize?: number;
  csvExport?: DataTableCsvExport<TData>;
  /** When set, each body row gets this `id` (e.g. deep-link targets `ws-alert-12`). */
  getRowDomId?: (row: TData) => string | undefined;
  getRowClassName?: (row: TData) => string | undefined;
  /** Mobile-first roles can render each row as a compact card instead of forcing a wide table. */
  mobileMode?: "table" | "cards";
  renderMobileCard?: (row: TData) => React.ReactNode;
};

export function DataTableCard<TData>({
  title,
  data,
  columns,
  isLoading = false,
  emptyText,
  description,
  rightSlot,
  pageSize = 10,
  csvExport,
  getRowDomId,
  getRowClassName,
  mobileMode = "table",
  renderMobileCard,
}: Props<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const { t } = useTranslation();

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is the standardized table engine for role surfaces.
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
        pageSize,
      },
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {rightSlot}
          {csvExport ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isLoading || data.length === 0}
              onClick={() => {
                const rows = data.map(csvExport.getRowValues);
                const csv = buildCsvFromRows(csvExport.headers, rows);
                const stamp = new Date().toISOString().slice(0, 10);
                downloadCsvFile(csv, `${csvExport.fileNameBase}-${stamp}.csv`);
              }}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {t("table.exportCsv")}
            </Button>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {data.length} {data.length === 1 ? t("table.row") : t("table.rows")}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            {mobileMode === "cards" ? (
              <div className="space-y-2 md:hidden">
                {table.getRowModel().rows.length ? (
                  table.getRowModel().rows.map((row) => (
                    <div
                      key={row.id}
                      id={getRowDomId?.(row.original)}
                      className={getRowClassName?.(row.original)}
                    >
                      {renderMobileCard
                        ? renderMobileCard(row.original)
                        : (() => {
                            const visibleCells = row.getVisibleCells();
                            const detailCells = visibleCells.filter((cell) => !isMobileActionCell(cell));
                            const actionCells = visibleCells.filter(isMobileActionCell);

                            return (
                              <div className="rounded-lg border border-border/70 bg-background p-3">
                                <div className="space-y-2">
                                  {detailCells.map((cell) => (
                                    <div key={cell.id} className="grid gap-0.5">
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        {getMobileCellLabel(cell)}
                                      </p>
                                      <div className="min-w-0 text-sm text-foreground">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {actionCells.length ? (
                                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                                    {actionCells.map((cell) => (
                                      <div key={cell.id} className="min-w-0">
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
                    {emptyText ?? t("table.noRows")}
                  </div>
                )}
              </div>
            ) : null}

            <div
              className={
                mobileMode === "cards"
                  ? "hidden overflow-x-auto rounded-lg border border-border/70 md:block"
                  : "overflow-x-auto rounded-lg border border-border/70"
              }
            >
              <Table className={mobileMode === "cards" ? "min-w-full" : "min-w-[640px]"}>
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
                      <TableRow
                        key={row.id}
                        id={getRowDomId?.(row.original)}
                        className={getRowClassName?.(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-28 text-center text-muted-foreground"
                      >
                        {emptyText ?? t("table.noRows")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t("table.page")} {table.getState().pagination.pageIndex + 1} {t("table.of")}{" "}
                {table.getPageCount() || 1}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  {t("table.previous")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  {t("table.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
