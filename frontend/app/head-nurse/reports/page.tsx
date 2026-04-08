"use client";
"use no memo";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Activity, Bell, ClipboardCheck, FileText, ShieldAlert } from "lucide-react";
import { DataTableCard } from "@/components/supervisor/DataTableCard";
import { SummaryStatCard } from "@/components/supervisor/SummaryStatCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatDateTime, formatRelativeTime } from "@/lib/datetime";
import type {
  AuditTrailEventOut,
  GetAlertSummaryResponse,
  GetVitalsAveragesResponse,
  GetWardSummaryResponse,
  ListWorkflowHandoversResponse,
} from "@/lib/api/task-scope-types";

type AlertTypeRow = {
  alertType: string;
  activeCount: number;
};

type HandoverRow = {
  id: number;
  shiftLabel: string;
  priority: string;
  targetRole: string | null;
  patientId: number | null;
  note: string;
  createdAt: string;
};

type AuditRow = {
  id: number;
  domain: string;
  action: string;
  entityType: string;
  entityId: number | null;
  actorUserId: number | null;
  patientId: number | null;
  createdAt: string;
};

export default function HeadNurseReportsPage() {
  const [hours, setHours] = useState("24");
  const [auditDomain, setAuditDomain] = useState("all");

  const alertSummaryQuery = useQuery({
    queryKey: ["head-nurse", "reports", "alert-summary"],
    queryFn: () => api.getAlertSummary(),
  });

  const wardSummaryQuery = useQuery({
    queryKey: ["head-nurse", "reports", "ward-summary"],
    queryFn: () => api.getWardSummary(),
  });

  const vitalsAverageQuery = useQuery({
    queryKey: ["head-nurse", "reports", "vitals-average", hours],
    queryFn: () => api.getVitalsAverages(Number(hours)),
  });

  const handoversQuery = useQuery({
    queryKey: ["head-nurse", "reports", "handovers"],
    queryFn: () => api.listWorkflowHandovers({ limit: 80 }),
  });

  const auditQuery = useQuery({
    queryKey: ["head-nurse", "reports", "audit"],
    queryFn: () => api.listWorkflowAudit({ limit: 120 }),
  });

  const alertSummary = useMemo(
    () => (alertSummaryQuery.data ?? null) as GetAlertSummaryResponse | null,
    [alertSummaryQuery.data],
  );
  const wardSummary = useMemo(
    () => (wardSummaryQuery.data ?? null) as GetWardSummaryResponse | null,
    [wardSummaryQuery.data],
  );
  const vitalsAverage = useMemo(
    () => (vitalsAverageQuery.data ?? null) as GetVitalsAveragesResponse | null,
    [vitalsAverageQuery.data],
  );
  const handovers = useMemo(
    () => (handoversQuery.data ?? []) as ListWorkflowHandoversResponse,
    [handoversQuery.data],
  );
  const auditEvents = useMemo(
    () => (auditQuery.data ?? []) as AuditTrailEventOut[],
    [auditQuery.data],
  );

  const alertTypeRows = useMemo<AlertTypeRow[]>(() => {
    const byType = alertSummary?.by_type ?? {};
    return Object.entries(byType)
      .map(([alertType, activeCount]) => ({ alertType, activeCount }))
      .sort((left, right) => right.activeCount - left.activeCount);
  }, [alertSummary]);

  const handoverRows = useMemo<HandoverRow[]>(() => {
    return [...handovers]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((item) => ({
        id: item.id,
        shiftLabel: item.shift_label,
        priority: item.priority,
        targetRole: item.target_role,
        patientId: item.patient_id,
        note: item.note,
        createdAt: item.created_at,
      }));
  }, [handovers]);

  const availableDomains = useMemo(() => {
    return Array.from(new Set(auditEvents.map((event) => event.domain))).sort();
  }, [auditEvents]);

  const auditRows = useMemo<AuditRow[]>(() => {
    return auditEvents
      .filter((event) => (auditDomain === "all" ? true : event.domain === auditDomain))
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((event) => ({
        id: event.id,
        domain: event.domain,
        action: event.action,
        entityType: event.entity_type,
        entityId: event.entity_id,
        actorUserId: event.actor_user_id,
        patientId: event.patient_id,
        createdAt: event.created_at,
      }));
  }, [auditDomain, auditEvents]);

  const alertTypeColumns = useMemo<ColumnDef<AlertTypeRow>[]>(
    () => [
      { accessorKey: "alertType", header: "Alert type" },
      { accessorKey: "activeCount", header: "Active count" },
    ],
    [],
  );

  const handoverColumns = useMemo<ColumnDef<HandoverRow>[]>(
    () => [
      {
        accessorKey: "shiftLabel",
        header: "Shift",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.shiftLabel || "General"}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.note}</p>
          </div>
        ),
      },
      { accessorKey: "priority", header: "Priority" },
      {
        accessorKey: "targetRole",
        header: "Target role",
        cell: ({ row }) => row.original.targetRole || "All staff",
      },
      {
        accessorKey: "patientId",
        header: "Patient",
        cell: ({ row }) => (row.original.patientId ? `#${row.original.patientId}` : "-") ,
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const auditColumns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        accessorKey: "domain",
        header: "Domain",
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{row.original.domain}</p>
            <p className="text-xs text-muted-foreground">{row.original.action}</p>
          </div>
        ),
      },
      {
        accessorKey: "entityType",
        header: "Entity",
        cell: ({ row }) =>
          row.original.entityId != null
            ? `${row.original.entityType} #${row.original.entityId}`
            : row.original.entityType,
      },
      {
        accessorKey: "actorUserId",
        header: "Actor",
        cell: ({ row }) => (row.original.actorUserId != null ? `#${row.original.actorUserId}` : "system"),
      },
      {
        accessorKey: "patientId",
        header: "Patient",
        cell: ({ row }) => (row.original.patientId != null ? `#${row.original.patientId}` : "-"),
      },
      {
        accessorKey: "createdAt",
        header: "Time",
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="text-foreground">{formatDateTime(row.original.createdAt)}</p>
            <p className="text-xs text-muted-foreground">{formatRelativeTime(row.original.createdAt)}</p>
          </div>
        ),
      },
    ],
    [],
  );

  const isLoadingAny =
    alertSummaryQuery.isLoading ||
    wardSummaryQuery.isLoading ||
    vitalsAverageQuery.isLoading ||
    handoversQuery.isLoading ||
    auditQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Clinical Reports</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Operational analytics, handover context, and auditable workflow actions.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryStatCard icon={Bell} label="Active alerts" value={wardSummary?.active_alerts ?? alertSummary?.total_active ?? 0} tone="warning" />
        <SummaryStatCard icon={ShieldAlert} label="Critical patients" value={wardSummary?.critical_patients ?? 0} tone="critical" />
        <SummaryStatCard icon={FileText} label="Resolved alerts" value={alertSummary?.total_resolved ?? 0} tone="success" />
        <SummaryStatCard icon={ClipboardCheck} label="Audit events" value={auditEvents.length} tone="info" />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4 lg:col-span-1">
          <div className="mb-3">
            <p className="text-sm text-muted-foreground">Vitals average window</p>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 hours</SelectItem>
                <SelectItem value="12">12 hours</SelectItem>
                <SelectItem value="24">24 hours</SelectItem>
                <SelectItem value="72">72 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 text-sm">
            <MetricRow
              label="Heart rate"
              value={
                vitalsAverage?.heart_rate_bpm_avg != null
                  ? `${vitalsAverage.heart_rate_bpm_avg.toFixed(1)} bpm`
                  : "No data"
              }
            />
            <MetricRow
              label="SpO2"
              value={vitalsAverage?.spo2_avg != null ? `${vitalsAverage.spo2_avg.toFixed(1)} %` : "No data"}
            />
            <MetricRow
              label="RR interval"
              value={
                vitalsAverage?.rr_interval_ms_avg != null
                  ? `${vitalsAverage.rr_interval_ms_avg.toFixed(1)} ms`
                  : "No data"
              }
            />
            <MetricRow
              label="Skin temp"
              value={
                vitalsAverage?.skin_temperature_avg != null
                  ? `${vitalsAverage.skin_temperature_avg.toFixed(1)} C`
                  : "No data"
              }
            />
          </div>
        </div>

        <div className="lg:col-span-3">
          <DataTableCard
            title="Alert Distribution by Type"
            description="Active alert count by alert category."
            data={alertTypeRows}
            columns={alertTypeColumns}
            isLoading={isLoadingAny}
            emptyText="No alert type data available."
            rightSlot={<Activity className="h-4 w-4 text-muted-foreground" />}
            pageSize={8}
          />
        </div>
      </section>

      <DataTableCard
        title="Recent Handover Notes"
        description="Shift handover context shared across clinical roles."
        data={handoverRows}
        columns={handoverColumns}
        isLoading={isLoadingAny}
        emptyText="No handover notes available."
      />

      <DataTableCard
        title="Workflow Audit Trail"
        description="Recent audited workflow actions in this workspace."
        data={auditRows}
        columns={auditColumns}
        isLoading={isLoadingAny}
        emptyText="No audit events found for this filter."
        rightSlot={
          <Select value={auditDomain} onValueChange={setAuditDomain}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Filter domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domains</SelectItem>
              {availableDomains.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{value}</p>
    </div>
  );
}
