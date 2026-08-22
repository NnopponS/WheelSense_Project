# components/support/ReportIssueForm.tsx

- CreatedTicket · type · L25-L28 — type CreatedTicket = { id: number; title: string; };
- ReportIssueFormValues · type · L30-L35 — type ReportIssueFormValues = { title: string; description: string; category: "bug" | "general" | "device"; priority: "low" | "normal" | "high" | "critical"; };
- ReportIssueForm · function · L37-L230 — function ReportIssueForm({ audience = "staff" }: { audience?: "staff" | "patient" })
- copy · function · L43-L43 — copy = (staffKey: string, patientKey: string)
