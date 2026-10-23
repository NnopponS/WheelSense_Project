"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";

type DashboardFloorplanPanelProps = {
  className?: string;
  compact?: boolean;
  showPresence?: boolean;
  initialFacilityId?: number | null;
  initialFloorId?: number | null;
  initialRoomName?: string | null;
};

export default function DashboardFloorplanPanel({
  className = "",
  compact = false,
  showPresence = true,
  initialFacilityId = null,
  initialFloorId = null,
  initialRoomName = null,
}: DashboardFloorplanPanelProps) {
  return (
    <FloorplanRoleViewer
      className={className}
      compact={compact}
      showPresence={showPresence}
      initialFacilityId={initialFacilityId}
      initialFloorId={initialFloorId}
      initialRoomName={initialRoomName}
    />
  );
}
