"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { TranslationKey } from "@/lib/i18n";
import type { DeviceAssignment, DeviceDetail, HardwareType } from "@/lib/types";
import { isDeviceOnline } from "@/lib/deviceOnline";
import {
  X,
  Camera,
  Radio,
  Save,
  RefreshCw,
  User,
  Smartphone,
  HeartPulse,
} from "lucide-react";
import PatientLinkSection from "@/components/admin/devices/PatientLinkSection";

type TFn = (key: TranslationKey) => string;

export interface DeviceDetailDrawerProps {
  deviceId: string | null;
  workspaceId: number | undefined;
  onClose: () => void;
  t: TFn;
  onMutate: () => void;
}

export default function DeviceDetailDrawer({
  deviceId,
  workspaceId,
  onClose,
  t,
  onMutate,
}: DeviceDetailDrawerProps) {
  const detailPath = deviceId
    ? withWorkspaceScope(
        `/devices/${encodeURIComponent(deviceId)}`,
        workspaceId,
      )
    : null;
  const { data: detail, isLoading, error, refetch } = useQuery<DeviceDetail>(
    detailPath,
  );

  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    setDisplayName(detail.display_name || "");
  }, [detail]);

  const patientAssignmentsEndpoint =
    detail?.hardware_type === "mobile_phone" && detail?.patient?.patient_id
      ? withWorkspaceScope(
          `/patients/${detail.patient.patient_id}/devices`,
          workspaceId,
        )
      : null;
  const { data: patientAssignments } = useQuery<DeviceAssignment[]>(
    patientAssignmentsEndpoint,
  );

  const linkedPolar = useMemo(() => {
    const rows = patientAssignments ?? [];
    return rows.find((r) => r.device_role === "polar_hr" && r.is_active);
  }, [patientAssignments]);

  const doSave = useCallback(async () => {
    if (!deviceId || workspaceId == null) return;
    setSaving(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const path = withWorkspaceScope(
        `/devices/${encodeURIComponent(deviceId)}`,
        workspaceId,
      );
      if (!path) return;
      await api.patch(path, {
        display_name: displayName,
      });
      setActionMsg(t("devicesDetail.saved"));
      await refetch();
      onMutate();
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [
    deviceId,
    workspaceId,
    displayName,
    refetch,
    onMutate,
    t,
  ]);

  const cameraCheck = useCallback(async () => {
    if (!deviceId || workspaceId == null) return;
    setActionErr(null);
    setActionMsg(null);
    try {
      const path = withWorkspaceScope(
        `/devices/${encodeURIComponent(deviceId)}/camera/check`,
        workspaceId,
      );
      if (!path) return;
      await api.post(path);
      setActionMsg(t("devicesDetail.cameraCheckSent"));
      setTimeout(() => void refetch(), 2500);
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : String(e));
    }
  }, [deviceId, workspaceId, refetch, t]);

  if (!deviceId) return null;

  const nowMs = Date.now();
  const online = detail ? isDeviceOnline(detail.last_seen, nowMs) : false;
  const hw = (detail?.hardware_type || "wheelchair") as HardwareType;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-detail-title"
    >
      <button
        type="button"
        className="flex-1 h-full cursor-default border-0 bg-transparent"
        aria-label="Close"
        onClick={onClose}
      />
      <aside className="surface-card h-full w-full max-w-md overflow-y-auto border-l border-outline-variant/30 shadow-xl animate-fade-in">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-outline-variant/25 bg-surface-container-low px-4 py-3">
          <h3
            id="device-detail-title"
            className="text-lg font-semibold text-on-surface truncate"
          >
            {detail?.display_name?.trim() || detail?.device_id || deviceId}
          </h3>
          <button
            type="button"
            className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-sm text-error">
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
          {detail && !isLoading && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    online ? "care-normal" : "severity-warning"
                  }`}
                >
                  {online ? t("devices.online") : t("devices.offline")}
                </span>
                <span className="text-xs text-on-surface-variant font-mono">
                  {detail.device_id}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                {t("devicesDetail.hardware")}:{" "}
                <span className="font-medium text-on-surface">{hw}</span>
                {" · "}
                {t("devicesDetail.legacyType")}: {detail.device_type}
              </p>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t("devicesDetail.identity")}
                </h4>
                <label className="text-xs text-on-surface-variant block">
                  {t("devicesDetail.displayName")}
                </label>
                <input
                  className="input-field text-sm w-full"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold gradient-cta disabled:opacity-50"
                    onClick={() => void doSave()}
                  >
                    <Save className="w-4 h-4" />
                    {t("devicesDetail.save")}
                  </button>
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <Radio className="w-4 h-4" />
                  {t("devicesDetail.realtime")}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-on-surface-variant">
                      {t("devicesDetail.battery")}
                    </span>
                    <p className="font-medium text-on-surface">
                      {detail.realtime?.battery_pct != null
                        ? `${detail.realtime.battery_pct}%`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">
                      {t("devices.lastSeen")}
                    </span>
                    <p className="font-medium text-on-surface text-[11px]">
                      {detail.last_seen
                        ? new Date(detail.last_seen).toLocaleString()
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">V</span>
                    <p className="font-medium text-on-surface">
                      {detail.realtime?.velocity_ms != null
                        ? `${detail.realtime.velocity_ms.toFixed(2)} m/s`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">d</span>
                    <p className="font-medium text-on-surface">
                      {detail.realtime?.distance_m != null
                        ? `${detail.realtime.distance_m.toFixed(2)} m`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">accel</span>
                    <p className="font-medium text-on-surface">
                      {detail.realtime?.accel_ms2 != null
                        ? `${detail.realtime.accel_ms2.toFixed(2)} m/s²`
                        : "—"}
                    </p>
                  </div>
                </div>
                {(hw === "wheelchair" || hw === "mobile_phone") && (
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-on-surface-variant">
                    <div>
                      IMU ax/ay/az:
                      <p className="text-on-surface">
                        {detail.realtime?.ax ?? "—"} / {detail.realtime?.ay ?? "—"} /{" "}
                        {detail.realtime?.az ?? "—"}
                      </p>
                    </div>
                    <div>
                      IMU gx/gy/gz:
                      <p className="text-on-surface">
                        {detail.realtime?.gx ?? "—"} / {detail.realtime?.gy ?? "—"} /{" "}
                        {detail.realtime?.gz ?? "—"}
                      </p>
                    </div>
                    <div>
                      {t("devicesDetail.battery")}:
                      <p className="text-on-surface">
                        {detail.realtime?.battery_v != null
                          ? `${detail.realtime.battery_v.toFixed(2)}V`
                          : "—"}
                      </p>
                    </div>
                  </div>
                )}
              </section>

              {(hw === "wheelchair" || hw === "polar_sense" || hw === "mobile_phone") && (
                <PatientLinkSection
                  deviceId={detail.device_id}
                  workspaceId={workspaceId}
                  linkedPatient={detail.patient}
                  defaultDeviceRole={
                    hw === "polar_sense"
                      ? "polar_hr"
                      : hw === "mobile_phone"
                        ? "mobile"
                        : "wheelchair_sensor"
                  }
                  t={t}
                  onMutate={async () => {
                    await refetch();
                    onMutate();
                  }}
                />
              )}

              {hw === "polar_sense" && (
                <section className="space-y-2 rounded-xl border border-outline-variant/20 p-3">
                  <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                    <HeartPulse className="w-4 h-4" />
                    Polar BLE
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-on-surface-variant">Battery (0x180F)</span>
                      <p className="font-medium text-on-surface">
                        {detail.polar_vitals?.sensor_battery != null
                          ? `${detail.polar_vitals.sensor_battery}%`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">Heart rate (0x180D)</span>
                      <p className="font-medium text-on-surface">
                        {detail.polar_vitals?.heart_rate_bpm != null
                          ? `${detail.polar_vitals.heart_rate_bpm} bpm`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">RR interval</span>
                      <p className="font-medium text-on-surface">
                        {detail.polar_vitals?.rr_interval_ms != null
                          ? `${detail.polar_vitals.rr_interval_ms} ms`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">Last reading</span>
                      <p className="font-medium text-on-surface">
                        {detail.polar_vitals?.timestamp
                          ? new Date(detail.polar_vitals.timestamp).toLocaleString()
                          : "—"}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {hw === "mobile_phone" && (
                <section className="space-y-2 rounded-xl border border-outline-variant/20 p-3">
                  <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    {t("devicesDetail.mobileWalk")}
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    {t("devicesDetail.mobileWalkHint")}
                  </p>
                  <p className="text-sm text-on-surface">
                    {detail.realtime?.velocity_ms != null
                      ? `${detail.realtime.velocity_ms.toFixed(2)} m/s · ${detail.realtime.distance_m?.toFixed(2) ?? "0.00"} m`
                      : "—"}
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {t("devicesDetail.linkedPolar")}:{" "}
                    <span className="text-on-surface">
                      {linkedPolar?.device_id ?? "—"}
                    </span>
                  </p>
                </section>
              )}

              {hw === "node" && (
                <section className="space-y-2 rounded-xl border border-outline-variant/20 p-3">
                  <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    {t("devicesDetail.camera")}
                  </h4>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-primary/40 text-primary"
                    onClick={() => void cameraCheck()}
                  >
                    <Camera className="w-4 h-4" />
                    {t("devicesDetail.cameraCheck")}
                  </button>
                  {detail.latest_photo?.url && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-on-surface-variant">
                        {t("devicesDetail.latestSnapshot")}
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.latest_photo.url}
                        alt="Camera snapshot"
                        className="w-full rounded-lg border border-outline-variant/30 max-h-48 object-contain bg-black/20"
                      />
                    </div>
                  )}
                </section>
              )}

              {(actionMsg || actionErr) && (
                <p
                  className={`text-sm ${actionErr ? "text-error" : "text-primary"}`}
                >
                  {actionErr || actionMsg}
                </p>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 bg-surface-container-low"
                  onClick={() => void refetch()}
                >
                  <RefreshCw className="w-4 h-4" />
                  {t("devicesDetail.refresh")}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
