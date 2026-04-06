"use client";

import { useMemo } from "react";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import { useAuth } from "@/hooks/useAuth";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import EmptyState from "@/components/EmptyState";
import {
  Users,
  Tablet,
  Bell,
  ArrowRight,
  AlertTriangle,
  Clock,
  History,
} from "lucide-react";
import type { Patient, Alert, Device, HardwareType, SmartDevice, DeviceActivityEvent } from "@/lib/types";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { isSmartDeviceOnline } from "@/lib/smartDeviceOnline";
import Link from "next/link";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { fleetTabToQuery, type DeviceFleetTab } from "@/lib/deviceHardwareTabs";

const FLEET_ROWS: Array<{ hardware: HardwareType; labelKey: TranslationKey }> = [
  { hardware: "wheelchair", labelKey: "devicesDetail.tabWheelchair" },
  { hardware: "node", labelKey: "devicesDetail.tabNode" },
  { hardware: "polar_sense", labelKey: "devicesDetail.tabPolar" },
  { hardware: "mobile_phone", labelKey: "devicesDetail.tabMobile" },
];

function devicesFleetHref(tab: DeviceFleetTab): string {
  const q = fleetTabToQuery(tab);
  return q === "all" ? "/admin/devices" : `/admin/devices?tab=${q}`;
}

const ACTIVITY_TYPE_LABELS: Partial<Record<string, TranslationKey>> = {
  registry_created: "dash.activity.registry_created",
  registry_updated: "dash.activity.registry_updated",
  command_dispatched: "dash.activity.command_dispatched",
  smart_created: "dash.activity.smart_created",
  smart_updated: "dash.activity.smart_updated",
  smart_deleted: "dash.activity.smart_deleted",
  device_paired: "dash.activity.device_paired",
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nowMs = useFixedNowMs();

  const patientsEndpoint = useMemo(
    () => withWorkspaceScope("/patients", user?.workspace_id),
    [user?.workspace_id],
  );
  const alertsEndpoint = useMemo(
    () => withWorkspaceScope("/alerts", user?.workspace_id),
    [user?.workspace_id],
  );
  const devicesEndpoint = useMemo(
    () => withWorkspaceScope("/devices", user?.workspace_id),
    [user?.workspace_id],
  );
  const smartEndpoint = useMemo(
    () => withWorkspaceScope("/ha/devices", user?.workspace_id),
    [user?.workspace_id],
  );
  const activityEndpoint = useMemo(
    () => withWorkspaceScope("/devices/activity?limit=28", user?.workspace_id),
    [user?.workspace_id],
  );

  const { data: patients } = useQuery<Patient[]>(patientsEndpoint);
  const { data: alerts } = useQuery<Alert[]>(alertsEndpoint);
  const { data: devices } = useQuery<Device[]>(devicesEndpoint);
  const { data: smartDevices } = useQuery<SmartDevice[]>(smartEndpoint);
  const { data: activity } = useQuery<DeviceActivityEvent[]>(activityEndpoint);

  const activeAlerts = alerts?.filter((a) => a.status === "active") || [];

  const fleetByHardware = useMemo(() => {
    if (!devices) return null;
    return FLEET_ROWS.map(({ hardware }) => {
      const list = devices.filter((d) => d.hardware_type === hardware);
      const online = list.filter((d) => isDeviceOnline(d.last_seen, nowMs)).length;
      const total = list.length;
      return { hardware, total, online, offline: total - online };
    });
  }, [devices, nowMs]);

  const smartStats = useMemo(() => {
    const list = smartDevices ?? [];
    const online = list.filter((d) => isSmartDeviceOnline(d)).length;
    return { total: list.length, online, offline: list.length - online };
  }, [smartDevices]);

  function activityTypeLabel(eventType: string): string {
    const key = ACTIVITY_TYPE_LABELS[eventType];
    return key ? t(key) : t("dash.activity.other");
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("dash.title")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("dash.subtitle")}</p>
      </div>

      {/* Merged Patients | Devices + fleet + smart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <section className="surface-card p-6 flex flex-col min-h-[320px]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/15 pb-5 mb-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary-fixed text-primary shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface-variant">
                  {t("dash.totalPatients")}
                </p>
                <p className="text-3xl font-bold text-on-surface tabular-nums mt-1">
                  {patients?.length ?? "—"}
                </p>
                <p className="text-xs text-outline mt-2 max-w-xs leading-relaxed">
                  {t("dash.patientsCardHint")}
                </p>
              </div>
            </div>
            <Link
              href="/admin/patients"
              className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline shrink-0"
            >
              {t("dash.viewAll")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex-1 min-h-0">
            <p className="text-[11px] font-semibold text-outline uppercase tracking-widest mb-3">
              {t("dash.recentPatients")}
            </p>
            {!patients || patients.length === 0 ? (
              <EmptyState icon={Users} message={t("dash.noPatients")} />
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
                {patients.slice(0, 6).map((patient) => (
                  <Link
                    key={patient.id}
                    href={`/admin/patients/${patient.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-smooth hover:bg-surface-container-low"
                  >
                    <div className="w-9 h-9 rounded-full gradient-cta flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {(patient.first_name?.[0] || "P").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {patient.first_name} {patient.last_name}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        {t("patients.age")}:{" "}
                        {ageYears(patient.date_of_birth, nowMs) ?? "—"} {t("patients.years")}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                        patient.care_level === "critical"
                          ? "care-critical"
                          : patient.care_level === "special"
                            ? "care-special"
                            : "care-normal"
                      }`}
                    >
                      {patient.care_level || "normal"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="surface-card p-6 flex flex-col">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/15 pb-5 mb-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-info-bg text-info shrink-0">
                <Tablet className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-on-surface-variant">
                  {t("dash.totalDevices")}
                </p>
                <p className="text-3xl font-bold text-on-surface tabular-nums mt-1">
                  {devices?.length ?? "—"}
                </p>
                {smartStats.total > 0 ? (
                  <p className="text-xs text-on-surface-variant mt-1.5 tabular-nums">
                    + {smartStats.total}{" "}
                    <Link
                      href={devicesFleetHref("smart_ha")}
                      className="text-primary font-medium hover:underline"
                    >
                      {t("devicesDetail.tabSmartDevice")}
                    </Link>
                  </p>
                ) : null}
                <p className="text-xs text-outline mt-2 max-w-sm leading-relaxed">
                  {t("dash.devicesCardHint")}
                </p>
              </div>
            </div>
            <Link
              href="/admin/devices"
              className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline shrink-0"
            >
              {t("dash.viewAll")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <p className="text-[11px] font-semibold text-outline uppercase tracking-widest mb-3">
            {t("dash.deviceFleetByType")}
          </p>
          <div className="rounded-xl border border-outline-variant/15 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider bg-surface-container-low/25 border-b border-outline-variant/10">
                    <th className="px-3 py-2.5 pr-4">{t("devicesDetail.hardware")}</th>
                    <th className="px-3 py-2.5 px-2 text-right tabular-nums">{t("dash.fleetTotal")}</th>
                    <th className="px-3 py-2.5 px-2 text-right tabular-nums">{t("devices.online")}</th>
                    <th className="px-3 py-2.5 pl-2 text-right tabular-nums">{t("devices.offline")}</th>
                  </tr>
                </thead>
                <tbody>
                  {FLEET_ROWS.map(({ hardware, labelKey }) => {
                    const row = fleetByHardware?.find((r) => r.hardware === hardware);
                    const href = devicesFleetHref(hardware);
                    return (
                      <tr
                        key={hardware}
                        className="border-b border-outline-variant/10 last:border-b-0 hover:bg-surface-container-low/50 transition-smooth"
                      >
                        <td className="p-0">
                          <Link
                            href={href}
                            className="block px-3 py-2.5 pr-4 font-medium text-on-surface hover:underline"
                          >
                            {t(labelKey)}
                          </Link>
                        </td>
                        <td className="p-0 text-right tabular-nums">
                          <Link href={href} className="block px-3 py-2.5 text-on-surface">
                            {row ? row.total : "—"}
                          </Link>
                        </td>
                        <td className="p-0 text-right tabular-nums">
                          <Link href={href} className="block px-3 py-2.5 text-success">
                            {row ? row.online : "—"}
                          </Link>
                        </td>
                        <td className="p-0 text-right tabular-nums">
                          <Link href={href} className="block px-3 py-2.5 text-on-surface-variant">
                            {row ? row.offline : "—"}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="hover:bg-surface-container-low/50 transition-smooth bg-surface-container-low/10">
                    <td className="p-0">
                      <Link
                        href={devicesFleetHref("smart_ha")}
                        className="block px-3 py-2.5 pr-4 font-medium text-on-surface hover:underline"
                      >
                        {t("devicesDetail.tabSmartDevice")}
                      </Link>
                    </td>
                    <td className="p-0 text-right tabular-nums">
                      <Link
                        href={devicesFleetHref("smart_ha")}
                        className="block px-3 py-2.5 text-on-surface"
                      >
                        {smartDevices ? smartStats.total : "—"}
                      </Link>
                    </td>
                    <td className="p-0 text-right tabular-nums">
                      <Link
                        href={devicesFleetHref("smart_ha")}
                        className="block px-3 py-2.5 text-success"
                      >
                        {smartDevices ? smartStats.online : "—"}
                      </Link>
                    </td>
                    <td className="p-0 text-right tabular-nums">
                      <Link
                        href={devicesFleetHref("smart_ha")}
                        className="block px-3 py-2.5 text-on-surface-variant"
                      >
                        {smartDevices ? smartStats.offline : "—"}
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* Activity + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-3 surface-card p-6">
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
                {t("dash.deviceActivity")}
              </h3>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-xl">
                {t("dash.deviceActivityHint")}
              </p>
            </div>
          </div>
          {!activity || activity.length === 0 ? (
            <EmptyState icon={History} message={t("dash.deviceActivityEmpty")} />
          ) : (
            <ul className="space-y-0 border-l-2 border-primary/25 ml-2 pl-5">
              {activity.map((ev) => {
                const when = new Date(ev.occurred_at);
                return (
                  <li key={ev.id} className="relative pb-6 last:pb-0">
                    <span
                      className="absolute -left-[1.4rem] top-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-surface-container-lowest"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
                      <time
                        className="text-sm font-semibold text-on-surface tabular-nums"
                        dateTime={ev.occurred_at}
                      >
                        {when.toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                      <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-primary-fixed/40 text-primary">
                        {activityTypeLabel(ev.event_type)}
                      </span>
                    </div>
                    <p className="text-base text-on-surface mt-2 leading-snug">{ev.summary}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2 surface-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
              {t("dash.recentAlerts")}
            </h3>
            <Link
              href="/admin/alerts"
              className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
            >
              {t("dash.viewAll")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {activeAlerts.length === 0 ? (
            <EmptyState icon={Bell} message={t("dash.noAlerts")} />
          ) : (
            <div className="space-y-2">
              {activeAlerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-container-low transition-smooth hover:bg-surface-container"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      alert.severity === "critical"
                        ? "bg-critical-bg text-critical"
                        : alert.severity === "warning"
                          ? "bg-warning-bg text-warning"
                          : "bg-info-bg text-info"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{alert.alert_type}</p>
                    <p className="text-xs text-on-surface-variant truncate">{alert.description}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-outline shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(alert.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
