"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";

type StaffMonitoringPageProps = {
  title: string;
  subtitle: string;
};

export default function StaffMonitoringPage({
  title,
  subtitle,
}: StaffMonitoringPageProps) {
  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <FloorplanRoleViewer />
    </div>
  );
}
