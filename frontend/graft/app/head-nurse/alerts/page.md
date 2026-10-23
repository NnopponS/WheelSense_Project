# app/head-caregiver/alerts/page.tsx

- AlertRow · type · L31-L42 — type AlertRow = { id: number; title: string; alertType: string; description: string; severity: string; status: string; patientId: number | null; patientName: string; patientRoomLine: string; timestamp: string; };
- AlertStatusFilter · type · L44-L44 — type AlertStatusFilter = "all" | "active" | "acknowledged" | "resolved";
- AlertSeverityFilter · type · L45-L45 — type AlertSeverityFilter = "all" | "critical" | "warning" | "info";
- parseRequestError · function · L47-L51 — function parseRequestError(error: unknown): string
- HeadNurseAlertsPage · function · L53-L382 — function HeadNurseAlertsPage()
