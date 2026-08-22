# components/admin/alerts/AdminAlertsTable.tsx

- AdminAlertFilterStatus · type · L31-L31 — type AdminAlertFilterStatus = "all" | "active" | "acknowledged" | "resolved";
- Props · type · L33-L40 — type Props = { alerts: Alert[] | null | undefined; isLoading: boolean; filter: AdminAlertFilterStatus; search: string; onUpdateStatus: (id: number, status: string) => void; canAcknowledge: boolean; };
- getSeverityVariant · function · L42-L46 — function getSeverityVariant(severity: Alert["severity"])
- getStatusVariant · function · L48-L52 — function getStatusVariant(status: Alert["status"])
- AdminAlertsTable · function · L54-L330 — function AdminAlertsTable({ alerts, isLoading, filter, search, onUpdateStatus, canAcknowledge, }: Props)
- SummaryCard · function · L332-L354 — function SummaryCard({ label, value, icon: Icon, }: { label: string; value: number; icon: typeof Bell; })
