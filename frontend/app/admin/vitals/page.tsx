"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { Heart, Activity, Thermometer, Battery } from "lucide-react";
import type { VitalReading } from "@/lib/types";

export default function VitalsPage() {
  const { t } = useTranslation();
  const { data: vitals, isLoading } = useQuery<VitalReading[]>("/vitals/readings?limit=100");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("vitals.title")}</h2>
        <p className="text-sm text-on-surface-variant mt-1">{t("vitals.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !vitals || vitals.length === 0 ? (
        <EmptyState icon={Heart} message={t("vitals.empty")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/20">
                <th className="pb-3 px-4">{t("vitals.patient")}</th>
                <th className="pb-3 px-4">{t("vitals.device")}</th>
                <th className="pb-3 px-4">{t("vitals.hr")}</th>
                <th className="pb-3 px-4">{t("vitals.spo2")}</th>
                <th className="pb-3 px-4">{t("vitals.temp")}</th>
                <th className="pb-3 px-4">{t("vitals.battery")}</th>
                <th className="pb-3 px-4">{t("vitals.time")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {vitals.map((v, i) => (
                <tr key={i} className="hover:bg-surface-container-low transition-smooth">
                  <td className="py-3 px-4 text-sm font-medium text-on-surface">
                    {v.patient_id ?? "—"}
                  </td>
                  <td className="py-3 px-4 text-sm text-on-surface-variant">
                    {v.device_id ?? "—"}
                  </td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1 text-sm">
                      <Heart className="w-3.5 h-3.5 text-critical" />
                      {v.heart_rate_bpm ?? "—"} bpm
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1 text-sm">
                      <Activity className="w-3.5 h-3.5 text-info" />
                      {v.spo2 ?? "—"}%
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1 text-sm">
                      <Thermometer className="w-3.5 h-3.5 text-warning" />
                      {v.skin_temperature ?? "—"}&deg;C
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="flex items-center gap-1 text-sm">
                      <Battery className="w-3.5 h-3.5 text-success" />
                      {v.sensor_battery ?? "—"}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-outline">
                    {v.timestamp
                      ? new Date(v.timestamp).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
