"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@/hooks/useQuery";
import { api } from "@/lib/api";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import type { TranslationKey } from "@/lib/i18n";
import type { DeviceDetail, HardwareType } from "@/lib/types";
import { X, Camera, Radio, Save, Send, RefreshCw, MapPin, User, UserCog } from "lucide-react";

type TFn = (key: TranslationKey) => string;

const ONLINE_MS = 5 * 60 * 1000;

function isOnline(lastSeen: string | null, nowMs: number): boolean {
  if (!lastSeen) return false;
  return nowMs - new Date(lastSeen).getTime() <= ONLINE_MS;
}

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
  const [wifiSsid, setWifiSsid] = useState("");
  const [mqttBroker, setMqttBroker] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    setDisplayName(detail.display_name || "");
    setWifiSsid(
      typeof detail.wifi_ssid === "string" ? detail.wifi_ssid : "",
    );
    setMqttBroker(
      typeof detail.mqtt_broker === "string" ? detail.mqtt_broker : "",
    );
  }, [detail]);

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
        config: {
          wifi_ssid: wifiSsid || null,
          mqtt_broker: mqttBroker || null,
        },
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
    wifiSsid,
    mqttBroker,
    refetch,
    onMutate,
    t,
  ]);

  const pushConfig = useCallback(async () => {
    if (!deviceId || workspaceId == null) return;
    setActionErr(null);
    setActionMsg(null);
    try {
      const path = withWorkspaceScope(
        `/devices/${encodeURIComponent(deviceId)}/commands`,
        workspaceId,
      );
      if (!path) return;
      await api.post(path, {
        channel: "wheelchair",
        payload: {
          cmd: "apply_network_config",
          wifi_ssid: wifiSsid || undefined,
          mqtt_broker: mqttBroker || undefined,
        },
      });
      setActionMsg(t("devicesDetail.pushed"));
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : String(e));
    }
  }, [deviceId, workspaceId, wifiSsid, mqttBroker, t]);

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
  const online = detail ? isOnline(detail.last_seen, nowMs) : false;
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
              </section>

              <section className="space-y-2 rounded-xl border border-outline-variant/20 p-3 bg-surface-container-low/50">
                <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {t("devicesDetail.mapRoom")}
                </h4>
                {detail.location?.room_name ? (
                  <p className="text-sm text-on-surface">
                    {detail.location.room_name}
                    {detail.location.floor_id != null
                      ? ` · ${t("monitoring.floorPrefix")} ${detail.location.floor_id}`
                      : ""}
                  </p>
                ) : (
                  <p className="text-xs text-on-surface-variant">
                    {t("devicesDetail.noRoom")}
                  </p>
                )}
                {detail.location?.predicted_room_name && (
                  <p className="text-xs text-on-surface-variant">
                    {t("devicesDetail.predicted")}:{" "}
                    {detail.location.predicted_room_name}
                    {detail.location.prediction_confidence != null
                      ? ` (${Math.round(
                          (detail.location.prediction_confidence as number) *
                            100,
                        )}%)`
                      : ""}
                  </p>
                )}
                <Link
                  href="/admin/monitoring"
                  className="text-xs text-primary font-medium inline-flex items-center gap-1 hover:underline"
                >
                  {t("devicesDetail.openMonitoring")}
                </Link>
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
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t("devicesDetail.patient")}
                </h4>
                {detail.patient ? (
                  <p className="text-sm text-on-surface">
                    <Link
                      href={`/admin/patients/${detail.patient.patient_id}`}
                      className="text-primary font-medium hover:underline"
                    >
                      {detail.patient.patient_name}
                    </Link>
                    <span className="text-on-surface-variant text-xs ml-2">
                      ({detail.patient.device_role})
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-on-surface-variant">
                    {t("devicesDetail.noPatient")}
                  </p>
                )}
                <h4 className="text-sm font-semibold text-on-surface flex items-center gap-2 pt-2">
                  <UserCog className="w-4 h-4" />
                  {t("devicesDetail.caregiver")}
                </h4>
                {detail.caregiver ? (
                  <p className="text-sm text-on-surface">
                    {detail.caregiver.caregiver_name}
                    <span className="text-on-surface-variant text-xs ml-2">
                      ({detail.caregiver.device_role})
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-on-surface-variant">
                    {t("devicesDetail.noCaregiver")}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-on-surface">
                  {t("devicesDetail.networkConfig")}
                </h4>
                <label className="text-xs text-on-surface-variant block">
                  Wi‑Fi SSID
                </label>
                <input
                  className="input-field text-sm w-full"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                />
                <label className="text-xs text-on-surface-variant block">
                  MQTT broker
                </label>
                <input
                  className="input-field text-sm w-full font-mono"
                  placeholder="host:1883"
                  value={mqttBroker}
                  onChange={(e) => setMqttBroker(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold gradient-cta disabled:opacity-50"
                    onClick={() => void doSave()}
                  >
                    <Save className="w-4 h-4" />
                    {t("devicesDetail.save")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 bg-surface-container-low"
                    onClick={() => void pushConfig()}
                  >
                    <Send className="w-4 h-4" />
                    {t("devicesDetail.pushMqtt")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-outline-variant/30 bg-surface-container-low"
                    onClick={() => void refetch()}
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t("devicesDetail.refresh")}
                  </button>
                </div>
              </section>

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
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
