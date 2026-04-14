"use client";

import type { ReactNode } from "react";
import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";

type StaffMonitoringPageProps = {
  title: string;
  subtitle: string;
  actions?: ReactNode;
};

export default function StaffMonitoringPage({
  title,
  subtitle,
  actions,
}: StaffMonitoringPageProps) {
  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <FloorplanRoleViewer />
    </div>
  );
}
