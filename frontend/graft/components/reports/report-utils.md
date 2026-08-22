# components/reports/report-utils.ts

- ReportCell · type · L1-L1 — type ReportCell = string | number | boolean | null | undefined;
- ReportRow · type · L3-L3 — type ReportRow = Record<string, ReportCell>;
- ReportColumn · type · L5-L9 — type ReportColumn = { key: string; label: string; className?: string; };
- formatReportCell · function · L11-L15 — function formatReportCell(value: ReportCell): string
- escapeCsvCell · function · L17-L19 — function escapeCsvCell(value: string): string
- buildReportCsv · function · L21-L31 — function buildReportCsv(columns: ReportColumn[], rows: ReportRow[]): string
- downloadTextFile · function · L33-L44 — function downloadTextFile(filename: string, content: string, mimeType: string): void
- buildReportFilename · function · L46-L52 — function buildReportFilename(templateLabel: string, windowHours: number): string
