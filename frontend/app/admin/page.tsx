"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Users, Tablet, Bell, Heart, ArrowRight, AlertTriangle, Clock } from "lucide-react";
import type { Patient, Alert, VitalReading } from "@/lib/types";
import Link from "next/link";
import { ageYears } from "@/lib/age";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";

export default function DashboardPage() {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const { data: patients } = useQuery<Patient[]>("/patients");
  const { data: alerts } = useQuery<Alert[]>("/alerts");
  const { data: devices } = useQuery<{ id: number }[]>("/devices");
  const { data: vitals } = useQuery<VitalReading[]>("/vitals/readings?limit=50");

  const activeAlerts = alerts?.filter((a) => a.status === "active") || [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Title */}
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("dash.title")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("dash.subtitle")}</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label={t("dash.totalPatients")}
          value={patients?.length ?? "—"}
          color="primary"
          href="/admin/patients"
        />
        <StatCard
          icon={Bell}
          label={t("dash.activeAlerts")}
          value={activeAlerts.length}
          color={activeAlerts.length > 0 ? "critical" : "success"}
          href="/admin/alerts"
        />
        <StatCard
          icon={Tablet}
          label={t("dash.totalDevices")}
          value={devices?.length ?? "—"}
          color="info"
          href="/admin/devices"
        />
        <StatCard
          icon={Heart}
          label={t("dash.latestVitals")}
          value={vitals?.length ?? "—"}
          color="warning"
          href="/admin/vitals"
        />
      </div>

      {/* Two-Column Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Alerts — 3/5 */}
        <section className="lg:col-span-3 surface-card p-6">
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
                  className="flex items-center gap-4 px-4 py-3 rounded-xl bg-surface-container-low transition-smooth hover:bg-surface-container"
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
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
                    <p className="text-sm font-medium text-on-surface truncate">
                      {alert.alert_type}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {alert.description}
                    </p>
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

        {/* Patient Overview — 2/5 */}
        <section className="lg:col-span-2 surface-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-on-surface uppercase tracking-wide">
              {t("dash.recentPatients")}
            </h3>
            <Link
              href="/admin/patients"
              className="text-xs font-medium text-primary flex items-center gap-1 hover:underline"
            >
              {t("dash.viewAll")} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {!patients || patients.length === 0 ? (
            <EmptyState icon={Users} message={t("dash.noPatients")} />
          ) : (
            <div className="space-y-2">
              {patients.slice(0, 6).map((patient) => (
                <Link
                  key={patient.id}
                  href={`/admin/patients/${patient.id}`}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-smooth hover:bg-surface-container-low"
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
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
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
        </section>
      </div>
    </div>
  );
}
