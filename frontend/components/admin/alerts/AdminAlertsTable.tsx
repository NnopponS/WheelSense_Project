"use client";
"use no memo";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Bell, CheckCheck, Siren, TriangleAlert } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { Alert, Room } from "@/lib/types";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { ResolveAlertButton } from "@/components/shared/ResolveAlertButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableCard } from "@/components/supervisor/DataTableCard";

export type AdminAlertFilterStatus = "all" | "active" | "acknowledged" | "resolved";

type Props = {
  alerts: Alert[] | null | undefined;
  isLoading: boolean;
  filter: AdminAlertFilterStatus;
  search: string;
  onUpdateStatus: (id: number, status: string) => void;
  canAcknowledge: boolean;
};

function getSeverityVariant(severity: Alert["severity"]) {
  if (severity === "critical") return "destructive" as const;
  if (severity === "warning") return "warning" as const;
  return "default" as const;
}

function getStatusVariant(status: Alert["status"]) {
  if (status === "active") return "destructive" as const;
  if (status === "acknowledged") return "warning" as const;
  return "success" as const;
}

export function AdminAlertsTable({
  alerts,
  isLoading,
  filter,
  search,
  onUpdateStatus,
  canAcknowledge,
}: Props) {
  const { t } = useTranslation();
  const { data: patients } = useQuery({ queryKey: ["admin", "alerts", "patients"], queryFn: () => api.listPatients({ limit: 1000 }), staleTime: 30_000 });
  const { data: rooms } = useQuery({ queryKey: ["admin", "alerts", "rooms"], queryFn: () => api.get<Room[]>("/rooms"), staleTime: 30_000 });
  const patientMap = useMemo(() => new Map((patients ?? []).map(patient => [patient.id, patient])), [patients]);
  const roomMap = useMemo(() => new Map((rooms ?? []).map(room => [room.id, room])), [rooms]);

  const filteredAlerts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (alerts ?? []).filter((alert) => {
      if (filter !== "all" && alert.status !== filter) return false;
      if (!query) return true;
      return (
        alert.title.toLowerCase().includes(query) ||
        alert.alert_type.toLowerCase().includes(query) ||
        alert.description.toLowerCase().includes(query) ||
        String(alert.id).includes(query) ||
        `${patientMap.get(alert.patient_id ?? -1)?.first_name ?? ""} ${patientMap.get(alert.patient_id ?? -1)?.last_name ?? ""}`.toLowerCase().includes(query)
      );
    }).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || Number(b.severity === "critical") - Number(a.severity === "critical") || b.timestamp.localeCompare(a.timestamp));
  }, [alerts, filter, search, patientMap]);

  const renderActions = useCallback((alert: Alert) => (
    <div className="flex flex-wrap gap-2">
      {alert.status === "active" && canAcknowledge ? <Button type="button" variant="outline" size="sm" onClick={() => onUpdateStatus(alert.id, "acknowledged")}>{t("alerts.acknowledge")}</Button> : null}
      {alert.status !== "resolved" && canAcknowledge ? <ResolveAlertButton alertTitle={alert.title} onConfirm={() => onUpdateStatus(alert.id, "resolved")} /> : null}
    </div>
  ), [canAcknowledge, onUpdateStatus, t]);

  const columns = useMemo<ColumnDef<Alert>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 h-auto px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("alerts.title")}
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">
              {row.original.title || row.original.alert_type}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.original.description || row.original.alert_type}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "severity",
        header: t("clinical.table.severity"),
        cell: ({ row }) => (
          <Badge variant={getSeverityVariant(row.original.severity)}>
            {row.original.severity}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={getStatusVariant(row.original.status)}>{row.original.status}</Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: ({ column }) => (
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 h-auto px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("patient.health.updated")}
            <ArrowUpDown className="h-3.5 w-3.5" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(row.original.timestamp)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "patient_id",
        header: t("redesign.nav.residents"),
        cell: ({ row }) => {
          const patient = patientMap.get(row.original.patient_id ?? -1);
          return row.original.patient_id != null ? <Link href={`/admin/patients/${row.original.patient_id}`} className="flex min-h-11 flex-col justify-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline">
            <span>{patient ? `${patient.first_name} ${patient.last_name}` : `#${row.original.patient_id}`}</span>
            <span className="text-xs font-normal text-muted-foreground">{patient?.room_id != null ? roomMap.get(patient.room_id)?.name ?? `#${patient.room_id}` : "—"}</span>
          </Link> : <span>—</span>;
        },
      },
      {
        id: "responder",
        header: t("redesign.responder"),
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.acknowledged_by != null ? `#${row.original.acknowledged_by}` : t("redesign.unassigned")}</span>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => renderActions(row.original),
      },
    ],
    [renderActions, t, patientMap, roomMap],
  );

  const counts = useMemo(() => {
    const source = alerts ?? [];
    return {
      total: source.length,
      active: source.filter((alert) => alert.status === "active").length,
      acknowledged: source.filter((alert) => alert.status === "acknowledged").length,
      critical: source.filter((alert) => alert.severity === "critical" && alert.status !== "resolved").length,
    };
  }, [alerts]);

  return (
    <div className="space-y-4">
      <div className="ws-stat-strip hidden grid-cols-4 lg:grid">
        <SummaryCard label={t("alerts.total")} value={counts.total} icon={Bell} />
        <SummaryCard label={t("alerts.active")} value={counts.active} icon={Siren} />
        <SummaryCard
          label={t("alerts.acknowledged")}
          value={counts.acknowledged}
          icon={CheckCheck}
        />
        <SummaryCard label={t("alerts.critical")} value={counts.critical} icon={TriangleAlert} />
      </div>

      <DataTableCard
        title={t("alerts.title")}
        data={filteredAlerts}
        columns={columns}
        isLoading={isLoading}
        emptyText={t("alerts.empty")}
        getRowDomId={(alert) => `ws-alert-${alert.id}`}
        getRowClassName={(alert) => alert.severity === "critical" && alert.status !== "resolved" ? "bg-critical-bg/40" : undefined}
        mobileMode="cards"
        renderMobileCard={(alert) => {
          const patient = patientMap.get(alert.patient_id ?? -1);
          return <article className="flex flex-col gap-3 border-b border-border px-1 py-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold">{alert.title || alert.alert_type}</h3>
              <Badge variant={getSeverityVariant(alert.severity)}>{alert.severity}</Badge>
            </div>
            {patient ? <Link href={`/admin/patients/${patient.id}`} className="inline-flex min-h-11 items-center gap-2 self-start rounded-md text-sm font-medium text-primary">{patient.first_name} {patient.last_name}<span className="font-normal text-muted-foreground">{patient.room_id != null ? roomMap.get(patient.room_id)?.name ?? `#${patient.room_id}` : "—"}</span></Link> : null}
            <p className="text-sm leading-relaxed text-muted-foreground">{alert.description}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <time dateTime={alert.timestamp} title={formatDateTime(alert.timestamp)}>{formatRelativeTime(alert.timestamp)}</time>
              <Badge variant={getStatusVariant(alert.status)}>{alert.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t("redesign.responder")}: {alert.acknowledged_by != null ? `#${alert.acknowledged_by}` : "—"}</p>
            {renderActions(alert)}
          </article>;
        }}
        csvExport={{
          fileNameBase: "wheelsense-admin-alerts",
          headers: ["Alert ID", "Title", "Type", "Severity", "Status", "Patient ID", "Timestamp"],
          getRowValues: (alert) => [
            alert.id,
            alert.title,
            alert.alert_type,
            alert.severity,
            alert.status,
            alert.patient_id,
            alert.timestamp,
          ],
        }}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Bell;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
