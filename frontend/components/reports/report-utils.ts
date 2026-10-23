export type ReportCell = string | number | boolean | null | undefined;

export type ReportRow = Record<string, ReportCell>;

export type ReportColumn = {
  key: string;
  label: string;
  className?: string;
};

export function formatReportCell(value: ReportCell): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

export function buildReportCsv(columns: ReportColumn[], rows: ReportRow[]): string {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((column) => escapeCsvCell(formatReportCell(row[column.key])))
        .join(","),
    )
    .join("\n");
  return [header, body].filter(Boolean).join("\n");
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildReportFilename(templateLabel: string, windowHours: number): string {
  const slug = templateLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `wheelsense-${slug || "report"}-${windowHours}h.csv`;
}
