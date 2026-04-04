"use client";

import { useQuery } from "@/hooks/useQuery";
import EmptyState from "@/components/EmptyState";
import { Bell } from "lucide-react";
import type { Alert } from "@/lib/types";

export default function HeadNurseAlertsPage() {
  const { data: alerts, isLoading } = useQuery<Alert[]>("/alerts");

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!alerts?.length) {
    return <EmptyState icon={Bell} message="No alerts." />;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-on-surface">Alerts</h2>
      {alerts.map((a) => (
        <div key={a.id} className="surface-card p-4 text-sm">
          <p className="font-medium">{a.alert_type}</p>
          <p className="text-on-surface-variant">{a.description}</p>
        </div>
      ))}
    </div>
  );
}
