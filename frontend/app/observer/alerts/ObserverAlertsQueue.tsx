"use client";
"use no memo";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { useAlertRowHighlight } from "@/hooks/useAlertRowHighlight";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type { ListAlertsResponse, ListPatientsResponse } from "@/lib/api/task-scope-types";

type AlertRow = {
  id: number;
  title: string;
  description: string;
  alertType: string;
  severity: string;
  status: string;
  patientId: number | null;
  patientName: string;
  timestamp: string;
};

export default function ObserverAlertsQueue() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  const { data: alertsData } = useSuspenseQuery({
    queryKey: ["observer", "alerts", "list"],
    queryFn: () => api.listAlerts({ status: "active", limit: 300 }),
    refetchInterval: 20_000,
  });

  const { data: patientsData } = useSuspenseQuery({
    queryKey: ["observer", "alerts", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const alerts = alertsData as ListAlertsResponse;
  const patients = patientsData as ListPatientsResponse;

  const patientMap = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients],
  );

  const rows = useMemo<AlertRow[]>(() => {
    return [...alerts]
      .sort((left, right) => {
        if (left.severity === right.severity) {
          return right.timestamp.localeCompare(left.timestamp);
        }
        if (left.severity === "critical") return -1;
        if (right.severity === "critical") return 1;
        if (left.severity === "warning") return -1;
        if (right.severity === "warning") return 1;
        return 0;
      })
      .map((alert) => {
        const patient = alert.patient_id ? patientMap.get(alert.patient_id) : null;
        return {
          id: alert.id,
          title: alert.title,
          description: alert.description,
          alertType: alert.alert_type,
          severity: alert.severity,
          status: alert.status,
          patientId: alert.patient_id,
          patientName: patient
            ? `${patient.first_name} ${patient.last_name}`.trim()
            : t("observer.alerts.unlinkedPatient"),
          timestamp: alert.timestamp,
        };
      });
  }, [alerts, patientMap, t]);

  const columns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("observer.alerts.colAlert"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.alertType}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        accessorKey: "patientName",
        header: t("observer.alerts.colPatient"),
      },
      {
        accessorKey: "severity",
        header: t("observer.alerts.colSeverity"),
        cell: ({ row }) => {
          const severity = row.original.severity;
          const variant =
            severity === "critical"
              ? "destructive"
              : severity === "warning"
                ? "warning"
                : "secondary";
          return <Badge variant={variant}>{severity}</Badge>;
        },
      },
      {
        accessorKey: "status",
        header: t("observer.alerts.colStatus"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "destructive" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: t("observer.alerts.colTime"),
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
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href={
                  row.original.patientId ? `/observer/patients/${row.original.patientId}` : "/observer/patients"
                }
              >
                {t("observer.alerts.openPatient")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  const highlightAlertId = useMemo(() => {
    const raw = searchParams.get("alert");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const highlightReady =
    highlightAlertId != null && rows.some((r) => r.id === highlightAlertId);

  const flashAlertId = useAlertRowHighlight(highlightAlertId, highlightReady);

  return (
    <DataTableCard
      title={t("observer.alerts.queueTitle")}
      description={t("observer.alerts.queueDesc")}
      data={rows}
      columns={columns}
      isLoading={false}
      emptyText={t("observer.alerts.empty")}
      rightSlot={<Bell className="h-4 w-4 text-muted-foreground" />}
      pageSize={200}
      getRowDomId={(row) => `ws-alert-${row.id}`}
      getRowClassName={(row) =>
        flashAlertId != null && flashAlertId === row.id
          ? "bg-primary/10 ring-2 ring-primary/30 transition-colors"
          : undefined
      }
    />
  );
}
