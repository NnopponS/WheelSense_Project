"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCsvFromRows, downloadCsvFile } from "@/lib/csv";

type CsvExportButtonProps = {
  headers: string[];
  rows: (string | number | null | undefined)[][];
  fileNameBase: string;
  label?: string;
  disabled?: boolean;
};

export function CsvExportButton({
  headers,
  rows,
  fileNameBase,
  label = "Export CSV",
  disabled = false,
}: CsvExportButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || rows.length === 0}
      onClick={() => {
        const csv = buildCsvFromRows(headers, rows);
        const stamp = new Date().toISOString().slice(0, 10);
        downloadCsvFile(csv, `${fileNameBase}-${stamp}.csv`);
      }}
    >
      <Download className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">CSV</span>
    </Button>
  );
}

