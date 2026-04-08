"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Bell, Filter } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type { ListAlertsResponse, ListPatientsResponse } from "@/lib/api/task-scope-types";

type AlertRow = {
  id: number;
  title: string;
  alertType: string;
  description: string;
  severity: string;
  status: string;
  patientId: number | null;
  patientName: string;
  timestamp: string;
};

type AlertStatusFilter = "all" | "active" | "acknowledged" | "resolved";
type AlertSeverityFilter = "all" | "critical" | "warning" | "info";

function parseRequestError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

export default function HeadNurseAlertsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AlertStatusFilter>("all");
  const [severity, setSeverity] = useState<AlertSeverityFilter>("all");
  const [search, setSearch] = useState("");
  const [pendingAlertId, setPendingAlertId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const alertsQuery = useQuery({
    queryKey: ["head-nurse", "alerts", "list"],
    queryFn: () => api.listAlerts({ limit: 400 }),
    refetchInterval: 30_000,
  });

  const patientsQuery = useQuery({
    queryKey: ["head-nurse", "alerts", "patients"],
    queryFn: () => api.listPatients({ limit: 300 }),
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

  const updateAlertMutation = useMutation({
    mutationFn: async (variables: { id: number; status: "acknowledged" | "resolved" }) => {
      if (variables.status === "acknowledged") {
        await api.acknowledgeAlert(variables.id, { caregiver_id: null });
        return;
      }

      await api.post<void>(`/alerts/${encodeURIComponent(String(variables.id))}/resolve`, {
        resolution_note: "",
      });
    },
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["head-nurse", "alerts"] });
    },
    onError: (error) => {
      setActionError(parseRequestError(error));
    },
    onSettled: () => {
      setPendingAlertId(null);
    },
  });

  const rows = useMemo<AlertRow[]>(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return alerts
      .filter((item) => (status === "all" ? true : item.status === status))
      .filter((item) => (severity === "all" ? true : item.severity === severity))
      .map((item) => {
        const patient = item.patient_id ? patientMap.get(item.patient_id) : null;
        return {
          id: item.id,
          title: item.title,
          alertType: item.alert_type,
          description: item.description,
          severity: item.severity,
          status: item.status,
          patientId: item.patient_id,
          patientName: patient ? `${patient.first_name} ${patient.last_name}`.trim() : "Unlinked patient",
          timestamp: item.timestamp,
        };
      })
      .filter((item) => {
        if (!normalizedSearch) return true;
        const corpus = `${item.title} ${item.alertType} ${item.description} ${item.patientName}`.toLowerCase();
        return corpus.includes(normalizedSearch);
      })
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [alerts, patientMap, search, severity, status]);

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
      { accessorKey: "patientName", header: "Patient" },
      {
        accessorKey: "severity",
        header: "Severity",
        cell: ({ row }) => {
          const alertSeverity = row.original.severity;
          const variant =
            alertSeverity === "critical"
              ? "destructive"
              : alertSeverity === "warning"
                ? "warning"
                : "secondary";
          return <Badge variant={variant}>{alertSeverity}</Badge>;
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
        cell: ({ row }) => {
          const href = row.original.patientId
            ? `/head-nurse/patients/${row.original.patientId}`
            : "/head-nurse/patients";
          return (
            <div className="flex flex-wrap justify-end gap-2">
              {row.original.status === "active" || row.original.status === "acknowledged" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={updateAlertMutation.isPending && pendingAlertId === row.original.id}
                  onClick={() => {
                    setPendingAlertId(row.original.id);
                    setActionError(null);
                    updateAlertMutation.mutate({
                      id: row.original.id,
                      status: "acknowledged",
                    });
                  }}
                >
                  Acknowledge
                </Button>
              ) : null}
              {row.original.status !== "resolved" ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={updateAlertMutation.isPending && pendingAlertId === row.original.id}
                  onClick={() => {
                    setPendingAlertId(row.original.id);
                    setActionError(null);
                    updateAlertMutation.mutate({
                      id: row.original.id,
                      status: "resolved",
                    });
                  }}
                >
                  Resolve
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link href={href}>Open patient</Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [pendingAlertId, updateAlertMutation],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Alerts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Filter and triage ward alerts with severity and status controls.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, type, patient"
        />

        <Select value={status} onValueChange={(value) => setStatus(value as AlertStatusFilter)}>
          <SelectTrigger>
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severity} onValueChange={(value) => setSeverity(value as AlertSeverityFilter)}>
          <SelectTrigger>
            <SelectValue placeholder="Filter severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <DataTableCard
        title="Alert Stream"
        description="Active and historical alerts in descending time order."
        data={rows}
        columns={columns}
        isLoading={alertsQuery.isLoading || patientsQuery.isLoading}
        emptyText="No alerts match this filter."
        rightSlot={<Filter className="h-4 w-4 text-muted-foreground" />}
      />

      {actionError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <Bell className="h-4 w-4" />
          {rows.filter((item) => item.status === "active").length} active alerts in current result set
        </div>
      </div>
    </div>
  );
}
