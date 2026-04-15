"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";

type DashboardFloorplanPanelProps = {
  className?: string;
  showPresence?: boolean;
  initialFacilityId?: number | null;
  initialFloorId?: number | null;
  initialRoomName?: string | null;
};

export default function DashboardFloorplanPanel({
  className = "",
  showPresence = true,
  initialFacilityId = null,
  initialFloorId = null,
  initialRoomName = null,
}: DashboardFloorplanPanelProps) {
  return (
    <FloorplanRoleViewer
      className={className}
      showPresence={showPresence}
      initialFacilityId={initialFacilityId}
      initialFloorId={initialFloorId}
      initialRoomName={initialRoomName}
    />
  );
}
