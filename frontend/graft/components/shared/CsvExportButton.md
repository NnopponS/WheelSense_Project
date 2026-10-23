# components/shared/CsvExportButton.tsx

- CsvExportButtonProps · type · L7-L13 — type CsvExportButtonProps = { headers: string[]; rows: (string | number | null | undefined)[][]; fileNameBase: string; label?: string; disabled?: boolean; };
- CsvExportButton · function · L15-L39 — function CsvExportButton({ headers, rows, fileNameBase, label = "Export CSV", disabled = false, }: CsvExportButtonProps)
