"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { getQueryPollingMs, getQueryStaleTimeMs } from "@/lib/queryEndpointDefaults";
import { refetchOrThrow } from "@/lib/refetchOrThrow";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { Workspace } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Server, Database, Trash2, Skull, RotateCcw, Beaker } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RetentionConfig = {
  retention_enabled: boolean;
  retention_imu_days: number;
  retention_rssi_days: number;
  retention_predictions_days: number;
  retention_interval_hours: number;
};

type TableStat = {
  table_name: string;
  row_count: number;
  oldest_record: string | null;
  newest_record: string | null;
};

type RetentionStats = {
  tables: TableStat[];
  total_rows: number;
};

type SimulatorStatus = {
  env_mode: string;
  is_simulator: boolean;
  workspace_exists: boolean;
  workspace_id?: number;
  workspace_name?: string;
  statistics?: {
    patients: number;
    caregivers: number;
    devices: number;
    alerts: number;
    tasks: number;
    vitals: number;
  };
};

type SimulatorResetResult = {
  action: string;
  workspace_id: number;
  workspace_name: string;
  cleared_counts?: Record<string, number>;
  message: string;
};

export default function ServerSettingsPanel() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [clearPassword, setClearPassword] = useState("");
  const [clearBusy, setClearBusy] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);
  const [simResetBusy, setSimResetBusy] = useState(false);
  const [simResetMessage, setSimResetMessage] = useState<string | null>(null);

  const backendDocs = `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"}/docs`;
  const proxyNote = typeof window !== "undefined" ? `${window.location.origin}/api → backend` : "/api → backend";

  const { data: retentionConfig } = useQuery({
    queryKey: ["admin", "settings", "server", "retention-config"],
    queryFn: () => api.get<RetentionConfig>("/retention/config"),
    staleTime: getQueryStaleTimeMs("/retention/config"),
    refetchInterval: getQueryPollingMs("/retention/config"),
    retry: 3,
  });
  const statsEndpoint = useMemo(
    () => withWorkspaceScope("/retention/stats", user?.workspace_id),
    [user?.workspace_id],
  );
  const { data: retentionStats } = useQuery({
    queryKey: ["admin", "settings", "server", "retention-stats", statsEndpoint],
    queryFn: () => api.get<RetentionStats>(statsEndpoint!),
    enabled: Boolean(statsEndpoint),
    staleTime: statsEndpoint ? getQueryStaleTimeMs(statsEndpoint) : 0,
    refetchInterval: statsEndpoint ? getQueryPollingMs(statsEndpoint) : false,
    retry: 3,
  });
  const { data: workspaces } = useQuery({
    queryKey: ["admin", "settings", "server", "workspaces"],
    queryFn: () => api.get<Workspace[]>("/workspaces"),
    staleTime: getQueryStaleTimeMs("/workspaces"),
    refetchInterval: getQueryPollingMs("/workspaces"),
    retry: 3,
  });
  const { data: simulatorStatus, refetch: refetchSimStatusBase } = useQuery({
    queryKey: ["admin", "settings", "server", "demo-simulator-status"],
    queryFn: () => api.get<SimulatorStatus>("/demo/simulator/status"),
    staleTime: getQueryStaleTimeMs("/demo/simulator/status"),
    refetchInterval: getQueryPollingMs("/demo/simulator/status"),
    retry: 3,
  });
  const refetchSimStatus = useCallback(() => refetchOrThrow(refetchSimStatusBase), [refetchSimStatusBase]);

  const currentWorkspace = useMemo(
    () => (workspaces ?? []).find((w) => w.id === user?.workspace_id) ?? null,
    [workspaces, user?.workspace_id],
  );

  const handleClearDatabase = async () => {
    if (!clearPassword.trim()) {
      setClearMessage(t("settings.server.clearDbPasswordRequired"));
      return;
    }
    if (!window.confirm(t("settings.server.clearDbConfirm"))) return;
    setClearBusy(true);
    setClearMessage(null);
    try {
      await api.post("/admin/database/clear", { password: clearPassword });
      setClearPassword("");
      setClearMessage(t("settings.server.clearDbDone"));
      await refreshUser();
    } catch (e) {
      setClearMessage(e instanceof ApiError ? e.message : t("settings.server.clearDbFailed"));
    } finally {
      setClearBusy(false);
    }
  };

  const handleRunRetention = async () => {
    if (!window.confirm(t("settings.server.retentionRunConfirm"))) return;
    setRunning(true);
    setRunMessage(null);
    try {
      const runUrl = withWorkspaceScope("/retention/run", user?.workspace_id) ?? "/retention/run";
      const report = await api.post<{ total_deleted: number; duration_seconds: number }>(runUrl);
      setRunMessage(
        t("settings.server.retentionRunDone").replace("{n}", String(report.total_deleted)),
      );
    } catch (e) {
      setRunMessage(e instanceof ApiError ? e.message : t("settings.server.retentionRunFailed"));
    } finally {
      setRunning(false);
    }
  };

  const handleSimulatorReset = async () => {
    if (!window.confirm(t("settings.server.simResetConfirm"))) return;
    setSimResetBusy(true);
    setSimResetMessage(null);
    try {
      const result = await api.post<SimulatorResetResult>("/demo/simulator/reset");
      const count = Object.keys(result.cleared_counts || {}).length;
      setSimResetMessage(
        t("settings.server.simResetDone")
          .replace("{message}", result.message)
          .replace("{count}", String(count)),
      );
      await refetchSimStatus();
      await refreshUser();
    } catch (e) {
      setSimResetMessage(e instanceof ApiError ? e.message : t("settings.server.simResetFailed"));
    } finally {
      setSimResetBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5 text-primary" />
            {t("settings.server.connectionTitle")}
          </CardTitle>
          <CardDescription>{t("settings.server.connectionBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {t("settings.server.workspaceLabel")}
              </p>
              <p className="font-medium text-foreground">
                {currentWorkspace?.name ?? "—"}{" "}
                <span className="text-muted-foreground">(id {user?.workspace_id ?? "—"})</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {t("settings.server.apiProxyLabel")}
              </p>
              <p className="font-mono text-xs text-muted-foreground break-all">{proxyNote}</p>
            </div>
          </div>
          <a
            href={backendDocs}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4 text-primary" />
            {t("profile.apiDocs")}
          </a>
        </CardContent>
      </Card>

      {/* Simulator Section - Only shown when in simulator mode */}
      {simulatorStatus?.is_simulator ? (
        <Card className="border-orange-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-orange-600">
              <Beaker className="h-5 w-5" />
              {t("settings.server.simulatorSectionTitle")}
              <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                {t("settings.server.simModeBadge")}
              </Badge>
            </CardTitle>
            <CardDescription>{t("settings.server.simulatorDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {simulatorStatus.statistics ? (
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-xs text-muted-foreground">{t("settings.server.simStatPatients")}</p>
                  <p className="font-medium">{simulatorStatus.statistics.patients}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-xs text-muted-foreground">{t("settings.server.simStatCaregivers")}</p>
                  <p className="font-medium">{simulatorStatus.statistics.caregivers}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-xs text-muted-foreground">{t("settings.server.simStatDevices")}</p>
                  <p className="font-medium">{simulatorStatus.statistics.devices}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-xs text-muted-foreground">{t("settings.server.simStatAlerts")}</p>
                  <p className="font-medium">{simulatorStatus.statistics.alerts}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-xs text-muted-foreground">{t("settings.server.simStatTasks")}</p>
                  <p className="font-medium">{simulatorStatus.statistics.tasks}</p>
                </div>
                <div className="rounded-lg border border-border/60 p-2">
                  <p className="text-xs text-muted-foreground">{t("settings.server.simStatVitals")}</p>
                  <p className="font-medium">{simulatorStatus.statistics.vitals}</p>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={simResetBusy}
                onClick={() => void handleSimulatorReset()}
                className="border-orange-500/50 text-orange-700 hover:bg-orange-50"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {simResetBusy ? t("settings.server.simResetting") : t("settings.server.simResetButton")}
              </Button>
              {simResetMessage ? <p className="text-sm text-muted-foreground">{simResetMessage}</p> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-primary" />
            {t("settings.server.retentionTitle")}
          </CardTitle>
          <CardDescription>{t("settings.server.retentionBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {retentionConfig ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">{t("settings.server.retentionEnabled")}</dt>
                <dd>
                  <Badge variant={retentionConfig.retention_enabled ? "default" : "secondary"}>
                    {retentionConfig.retention_enabled ? t("common.active") : t("common.inactive")}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">IMU {t("settings.server.retentionDays")}</dt>
                <dd className="font-medium">{retentionConfig.retention_imu_days}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">RSSI {t("settings.server.retentionDays")}</dt>
                <dd className="font-medium">{retentionConfig.retention_rssi_days}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">{t("settings.server.retentionPredictions")}</dt>
                <dd className="font-medium">{retentionConfig.retention_predictions_days}</dd>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2">
                <dt className="text-muted-foreground">{t("settings.server.retentionInterval")}</dt>
                <dd className="font-medium">
                  {retentionConfig.retention_interval_hours} {t("settings.server.retentionHoursSuffix")}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}

          {retentionStats?.tables?.length ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.server.tableName")}</TableHead>
                    <TableHead className="text-right">{t("settings.server.rowCount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retentionStats.tables.map((row) => (
                    <TableRow key={row.table_name}>
                      <TableCell className="font-mono text-xs">{row.table_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.row_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                {t("settings.server.totalRows")}: {retentionStats.total_rows}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={running || !user?.workspace_id}
              onClick={() => void handleRunRetention()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {running ? t("common.loading") : t("settings.server.retentionRunNow")}
            </Button>
            {runMessage ? <p className="text-sm text-muted-foreground">{runMessage}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.server.mlTitle")}</CardTitle>
          <CardDescription>{t("settings.server.mlBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" asChild>
            <a href="/admin/ml-calibration">{t("admin.ml.openCalibrationPage")}</a>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <Skull className="h-5 w-5" />
            {t("settings.server.clearDbTitle")}
          </CardTitle>
          <CardDescription>{t("settings.server.clearDbBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-clear-db-password">{t("settings.server.clearDbPasswordLabel")}</Label>
            <Input
              id="ws-clear-db-password"
              type="password"
              autoComplete="current-password"
              placeholder={t("settings.server.clearDbPasswordPlaceholder")}
              value={clearPassword}
              onChange={(ev) => setClearPassword(ev.target.value)}
              disabled={clearBusy}
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={clearBusy || !clearPassword.trim()}
            onClick={() => void handleClearDatabase()}
          >
            {clearBusy ? t("common.loading") : t("settings.server.clearDbSubmit")}
          </Button>
          {clearMessage ? <p className="text-sm text-muted-foreground">{clearMessage}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
