"use client";
"use no memo";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Bell } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { AppPage } from "@/components/layout/AppPage";
import { FilterBar } from "@/components/shared/FilterBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import { useTranslation } from "@/lib/i18n";
import { useAlertRowHighlight } from "@/hooks/useAlertRowHighlight";
import { buildRoomByIdMap, formatPatientRoomLine } from "@/lib/alertPatientLocation";
import type { Room } from "@/lib/types";
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
  patientRoomLine: string;
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
  const { t } = useTranslation();
  const searchParams = useSearchParams();
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

  const roomsQuery = useQuery({
    queryKey: ["head-nurse", "alerts", "rooms"],
    queryFn: () => api.listRooms(),
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

  const roomById = useMemo(() => buildRoomByIdMap((roomsQuery.data ?? []) as Room[]), [roomsQuery.data]);

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
        const patientName = patient
          ? `${patient.first_name} ${patient.last_name}`.trim()
          : t("admin.unlinkedPatient");
        const patientRoomLine = formatPatientRoomLine(patient ?? null, roomById, t);
        return {
          id: item.id,
          title: item.title,
          alertType: item.alert_type,
          description: item.description,
          severity: item.severity,
          status: item.status,
          patientId: item.patient_id,
          patientName,
          patientRoomLine,
          timestamp: item.timestamp,
        };
      })
      .filter((item) => {
        if (!normalizedSearch) return true;
        const corpus =
          `${item.title} ${item.alertType} ${item.description} ${item.patientName} ${item.patientRoomLine}`.toLowerCase();
        return corpus.includes(normalizedSearch);
      })
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  }, [alerts, patientMap, roomById, search, severity, status, t]);

  const columns = useMemo<ColumnDef<AlertRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: t("clinical.table.alert"),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">{row.original.alertType}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
            {row.original.patientId != null ? (
              <p className="pt-1 text-xs text-foreground">
                <span className="font-medium">{row.original.patientName}</span>
                {row.original.patientRoomLine ? (
                  <span className="text-muted-foreground"> · {row.original.patientRoomLine}</span>
                ) : null}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "patientName",
        header: t("clinical.table.patient"),
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{row.original.patientName}</p>
            <p className="text-xs text-muted-foreground">{row.original.patientRoomLine}</p>
          </div>
        ),
      },
      {
        accessorKey: "severity",
        header: t("clinical.table.severity"),
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
        header: t("clinical.table.status"),
        cell: ({ row }) => (
          <Badge variant={row.original.status === "active" ? "destructive" : "outline"}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "timestamp",
        header: t("clinical.table.time"),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.timestamp)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.timestamp)}</p>
          </div>
        ),
      },
      {
        id: "actions",
        header: t("clinical.table.actions"),
        cell: ({ row }) => {
          const href = row.original.patientId
            ? `/head-nurse/personnel/${row.original.patientId}`
            : "/head-nurse/personnel";
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
                  {t("supervisor.page.acknowledge")}
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
                  {t("clinical.action.resolve")}
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link href={href}>{t("headNurse.alerts.openPatient")}</Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [pendingAlertId, t, updateAlertMutation],
  );

  const highlightAlertId = useMemo(() => {
    const raw = searchParams.get("alert");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const alertsTableLoading = alertsQuery.isLoading || patientsQuery.isLoading || roomsQuery.isLoading;
  const highlightReady =
    !alertsTableLoading &&
    highlightAlertId != null &&
    rows.some((r) => r.id === highlightAlertId);

  const flashAlertId = useAlertRowHighlight(highlightAlertId, highlightReady);

  return (
    <AppPage
      title={t("nav.alerts")}
      description={t("headNurse.alerts.pageSubtitle")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/head-nurse" },
        { label: t("nav.alerts") },
      ]}
    >
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchLabel={t("common.search")}
        searchPlaceholder={t("headNurse.alerts.searchPlaceholder")}
        resultLabel={`${rows.length} ${rows.length === 1 ? t("table.row") : t("table.rows")}`}
        resetLabel={t("common.reset")}
        hasActiveFilters={search.trim().length > 0 || status !== "all" || severity !== "all"}
        onReset={() => {
          setSearch("");
          setStatus("all");
          setSeverity("all");
        }}
      >
          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="alert-status-filter">
              {t("headNurse.alerts.filterStatusPlaceholder")}
            </label>
            <Select value={status} onValueChange={(value) => setStatus(value as AlertStatusFilter)}>
            <SelectTrigger id="alert-status-filter">
              <SelectValue placeholder={t("headNurse.alerts.filterStatusPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("headNurse.alerts.filterStatusAll")}</SelectItem>
              <SelectItem value="active">{t("headNurse.alerts.statusActive")}</SelectItem>
              <SelectItem value="acknowledged">{t("headNurse.alerts.statusAcknowledged")}</SelectItem>
              <SelectItem value="resolved">{t("headNurse.alerts.statusResolved")}</SelectItem>
            </SelectContent>
          </Select>
          </div>

          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="alert-severity-filter">
              {t("headNurse.alerts.filterSeverityPlaceholder")}
            </label>
            <Select value={severity} onValueChange={(value) => setSeverity(value as AlertSeverityFilter)}>
            <SelectTrigger id="alert-severity-filter">
              <SelectValue placeholder={t("headNurse.alerts.filterSeverityPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("headNurse.alerts.filterSeverityAll")}</SelectItem>
              <SelectItem value="critical">{t("headNurse.alerts.severityCritical")}</SelectItem>
              <SelectItem value="warning">{t("headNurse.alerts.severityWarning")}</SelectItem>
              <SelectItem value="info">{t("headNurse.alerts.severityInfo")}</SelectItem>
            </SelectContent>
          </Select>
          </div>
      </FilterBar>

      <DataTableCard
        title={t("headNurse.alerts.streamTitle")}
        description={t("headNurse.alerts.streamDesc")}
        data={rows}
        columns={columns}
        isLoading={alertsTableLoading}
        emptyText={t("headNurse.alerts.empty")}
        rightSlot={<Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
        mobileMode="cards"
        pageSize={200}
        getRowDomId={(row) => `ws-alert-${row.id}`}
        getRowClassName={(row) =>
          flashAlertId != null && flashAlertId === row.id
            ? "bg-primary/10 ring-2 ring-primary/30 transition-colors"
            : undefined
        }
        csvExport={{
          fileNameBase: "wheelsense-head-nurse-alerts",
          headers: ["Alert ID", "Title", "Type", "Severity", "Status", "Patient", "Room", "Timestamp"],
          getRowValues: (row) => [
            row.id,
            row.title,
            row.alertType,
            row.severity,
            row.status,
            row.patientName,
            row.patientRoomLine,
            row.timestamp,
          ],
        }}
      />

      {actionError ? (
        <div className="rounded-xl border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical-foreground" role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
        <div className="inline-flex items-center gap-2">
          <Bell className="h-4 w-4" />
          {rows.filter((item) => item.status === "active").length} {t("headNurse.alerts.footerActivePrefix")}
        </div>
      </div>
    </AppPage>
  );
}
