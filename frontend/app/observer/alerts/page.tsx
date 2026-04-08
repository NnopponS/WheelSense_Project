"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  ListAlertsResponse,
  ListPatientsResponse,
} from "@/lib/api/task-scope-types";

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

function toErrorText(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return "Your current role is not allowed to acknowledge alerts.";
  }
  if (error instanceof Error) return error.message;
  return "Failed to acknowledge alert.";
}

export default function ObserverAlertsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingAlertId, setPendingAlertId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const alertsQuery = useQuery({
    queryKey: ["observer", "alerts", "list"],
    queryFn: () => api.listAlerts({ status: "active", limit: 300 }),
    refetchInterval: 20_000,
  });

  const patientsQuery = useQuery({
    queryKey: ["observer", "alerts", "patients"],
    queryFn: () => api.listPatients({ limit: 400 }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertId: number) => {
      await api.acknowledgeAlert(alertId, {
        caregiver_id: user?.caregiver_id ?? null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["observer", "alerts"] });
      await queryClient.invalidateQueries({ queryKey: ["observer", "dashboard"] });
      setActionError(null);
    },
    onError: (error) => {
      setActionError(toErrorText(error));
    },
    onSettled: () => {
      setPendingAlertId(null);
    },
  });

  const alerts = useMemo(
    () => (alertsQuery.data ?? []) as ListAlertsResponse,
    [alertsQuery.data],
  );

  const patients = useMemo(
    () => (patientsQuery.data ?? []) as ListPatientsResponse,
    [patientsQuery.data],
  );

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
            : "Unlinked patient",
          timestamp: alert.timestamp,
        };
      });
  }, [alerts, patientMap]);

  const columns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Alert",
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
        header: "Patient",
      },
      {
        accessorKey: "severity",
        header: "Severity",
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
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "destructive" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: "Time",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={row.original.patientId ? `/observer/patients/${row.original.patientId}` : "/observer/patients"}>
                Open patient
              </Link>
            </Button>
            {row.original.status === "active" ? (
              <Button
                type="button"
                size="sm"
                disabled={acknowledgeMutation.isPending && pendingAlertId === row.original.id}
                onClick={() => {
                  setPendingAlertId(row.original.id);
                  acknowledgeMutation.mutate(row.original.id);
                }}
              >
                Acknowledge
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [acknowledgeMutation, pendingAlertId],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Active Alerts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor and acknowledge active alerts when role permissions allow.
        </p>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <DataTableCard
        title="Alert Queue"
        description="Current active alerts with severity and patient context."
        data={rows}
        columns={columns}
        isLoading={alertsQuery.isLoading || patientsQuery.isLoading}
        emptyText="No active alerts right now."
        rightSlot={<Bell className="h-4 w-4 text-muted-foreground" />}
      />
    </div>
  );
}
