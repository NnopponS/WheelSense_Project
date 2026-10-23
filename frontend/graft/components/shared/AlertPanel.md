# components/shared/AlertPanel.tsx

- FilterStatus · type · L8-L8 — type FilterStatus = "all" | "active" | "acknowledged" | "resolved";
- Props · type · L10-L17 — type Props = { alerts: Alert[] | null | undefined; isLoading: boolean; filter: FilterStatus; onFilterChange: (f: FilterStatus) => void; onUpdateStatus: (id: number, status: string) => void; canAcknowledge: boolean; };
- AlertPanel · function · L19-L151 — function AlertPanel({ alerts, isLoading, filter, onFilterChange, onUpdateStatus, canAcknowledge, }: Props)
