"use client";

import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { Heart, Activity, Thermometer, Battery } from "lucide-react";
import type { VitalReading } from "@/lib/types";

/** Legacy compatibility page kept for bookmarked admin vitals routes. */
export default function VitalsPage() {
  const { t } = useTranslation();
  const { data: vitals, isLoading } = useQuery<VitalReading[]>("/vitals/readings?limit=100");

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-on-surface">{t("vitals.title")}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{t("vitals.subtitle")}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
      ) : !vitals || vitals.length === 0 ? (
        <EmptyState icon={Heart} message={t("vitals.empty")} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-outline-variant/20 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                <th className="px-4 pb-3">{t("vitals.patient")}</th>
                <th className="px-4 pb-3">{t("vitals.device")}</th>
                <th className="px-4 pb-3">{t("vitals.hr")}</th>
                <th className="px-4 pb-3">{t("vitals.spo2")}</th>
                <th className="px-4 pb-3">{t("vitals.temp")}</th>
                <th className="px-4 pb-3">{t("vitals.battery")}</th>
                <th className="px-4 pb-3">{t("vitals.time")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {vitals.map((vital, index) => (
                <tr key={`${vital.id}-${index}`} className="transition-smooth hover:bg-surface-container-low">
                  <td className="px-4 py-3 text-sm font-medium text-on-surface">
                    {vital.patient_id ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {vital.device_id ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-sm">
                      <Heart className="h-3.5 w-3.5 text-critical" />
                      {vital.heart_rate_bpm ?? "-"} bpm
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-sm">
                      <Activity className="h-3.5 w-3.5 text-info" />
                      {vital.spo2 ?? "-"}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-sm">
                      <Thermometer className="h-3.5 w-3.5 text-warning" />
                      {vital.skin_temperature ?? "-"}&deg;C
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-sm">
                      <Battery className="h-3.5 w-3.5 text-success" />
                      {vital.sensor_battery ?? "-"}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-outline">
                    {vital.timestamp ? new Date(vital.timestamp).toLocaleString() : "-"}
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
