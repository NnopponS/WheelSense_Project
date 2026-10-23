"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatReportCell, type ReportColumn, type ReportRow } from "./report-utils";

type Props = {
  columns: ReportColumn[];
  rows: ReportRow[];
  emptyText: string;
  caption?: string;
  className?: string;
};

export default function ReportPreviewTable({
  columns,
  rows,
  emptyText,
  caption,
  className,
}: Props) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-x-auto rounded-2xl border border-border/70">
        <Table className="min-w-[840px]">
          <TableHeader className="bg-muted/55">
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <TableRow key={String((row as { id?: number | string }).id ?? rowIndex)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={cn("align-top", column.className)}>
                      {formatReportCell(row[column.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-28 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}
