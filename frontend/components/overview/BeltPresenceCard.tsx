"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { BeltIcon } from "@/components/icons/BeltIcon";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/datetime";
import { isDeviceOnline } from "@/lib/deviceOnline";
import { useFixedNowMs } from "@/hooks/useFixedNowMs";
import { useTranslation } from "@/lib/i18n";
import type { Device, DeviceDetail } from "@/lib/types";
import styles from "@/app/admin/overview-workspace.module.css";

type BeltMetricSnapshot = { battery_pct?: number | null };
type BeltDeviceDetail = DeviceDetail & {
  mobile_metrics?: BeltMetricSnapshot | null;
};

/**
 * Fall-detection belt presence strip for the overview attention column.
 * Shows each registered belt's live status: online state, wearer, battery,
 * and last-seen time.
 */
export function BeltPresenceCard({ devices }: { devices?: Device[] }) {
  const { t } = useTranslation();
  const nowMs = useFixedNowMs();
  const belts = (devices ?? []).filter(
    (device) =>
      device.hardware_type === "belt" ||
      device.hardware_type === "companion_m5",
  );
  const detailQueries = useQueries({
    queries: belts.map((belt) => ({
      queryKey: ["admin", "overview", "belt-detail", belt.device_id],
      queryFn: () =>
        api.getDeviceDetailRaw(belt.device_id) as Promise<BeltDeviceDetail>,
      staleTime: 15_000,
      refetchInterval: 8_000,
    })),
  });

  if (!devices || belts.length === 0) return null;

  return (
    <div
      className={styles.beltCard}
      role="region"
      aria-label={t("overview.beltStatus.title")}
    >
      <div className={styles.sectionHeader}>
        <h2>{t("overview.beltStatus.title")}</h2>
        <Link href="/admin/devices">
          {t("overview.visual.review")}
          <ArrowUpRight aria-hidden className="size-4" />
        </Link>
      </div>
      <ul className={styles.beltList}>
        {belts.map((belt, index) => {
          const detail = detailQueries[index]?.data;
          const online = isDeviceOnline(belt.last_seen, nowMs);
          const battery =
            detail?.mobile_metrics?.battery_pct ??
            detail?.realtime?.battery_pct ??
            null;
          const wearer = detail?.patient?.patient_name ?? null;
          return (
            <li
              key={belt.device_id}
              className={styles.beltRow}
              data-state={online ? "online" : "offline"}
            >
              <BeltIcon aria-hidden />
              <div className={styles.beltMeta}>
                <strong>{belt.display_name || belt.device_id}</strong>
                <span>
                  {wearer
                    ? t("overview.beltStatus.wornBy").replace("{name}", wearer)
                    : t("overview.beltStatus.unassigned")}
                </span>
              </div>
              <span className={styles.beltState}>
                <i aria-hidden />
                {online ? t("devices.online") : t("devices.offline")}
              </span>
              <span className={styles.beltReading}>
                {battery !== null ? <b>{Math.round(battery)}%</b> : null}
                <time
                  dateTime={belt.last_seen ?? undefined}
                  title={
                    belt.last_seen
                      ? `${t("overview.beltStatus.lastSeen")}: ${belt.last_seen}`
                      : undefined
                  }
                >
                  {belt.last_seen ? formatRelativeTime(belt.last_seen) : "—"}
                </time>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
