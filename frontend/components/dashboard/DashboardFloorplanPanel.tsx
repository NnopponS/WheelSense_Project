"use client";

import FloorplanRoleViewer from "@/components/floorplan/FloorplanRoleViewer";

type DashboardFloorplanPanelProps = {
  className?: string;
  showPresence?: boolean;
  initialFacilityId?: number | null;
  initialFloorId?: number | null;
  initialRoomName?: string | null;
  openHref?: string | null;
};

export default function DashboardFloorplanPanel({
  className = "",
  showPresence = true,
  initialFacilityId = null,
  initialFloorId = null,
  initialRoomName = null,
  openHref = null,
}: DashboardFloorplanPanelProps) {
  return (
    <FloorplanRoleViewer
      className={className}
      compact
      showPresence={showPresence}
      initialFacilityId={initialFacilityId}
      initialFloorId={initialFloorId}
      initialRoomName={initialRoomName}
      openHref={openHref}
    />
  );
}
