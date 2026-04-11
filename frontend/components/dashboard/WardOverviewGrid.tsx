"use client";

import { useState, useMemo } from "react";
import { Building2, Filter, Grid3X3, LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoomSubCard } from "./RoomSubCard";
import { RoomDetailPopup } from "./RoomDetailPopup";
import type { PatientOut } from "@/lib/api/task-scope-types";

interface RoomWithPatients {
  id: number;
  name: string;
  type?: string;
  floor?: string;
  facility?: string;
  capacity?: number;
  patients: PatientOut[];
  alertCount: number;
  deviceCount: number;
}

interface WardOverviewGridProps {
  rooms: RoomWithPatients[];
  onRoomClick?: (room: RoomWithPatients) => void;
  className?: string;
  showFilters?: boolean;
}

type ViewMode = "grid" | "compact";
type FilterType = "all" | "available" | "occupied" | "full";

export function WardOverviewGrid({
  rooms,
  onRoomClick,
  className,
  showFilters = true,
}: WardOverviewGridProps) {
  const { t } = useTranslation();
  const [selectedRoom, setSelectedRoom] = useState<RoomWithPatients | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [selectedFloor, setSelectedFloor] = useState<string>("all");

  // Extract unique floors
  const floors = useMemo(() => {
    const floorSet = new Set<string>();
    rooms.forEach((room) => {
      if (room.floor) floorSet.add(room.floor);
    });
    return Array.from(floorSet).sort();
  }, [rooms]);

  // Filter and sort rooms
  const filteredRooms = useMemo(() => {
    let result = [...rooms];

    // Apply floor filter
    if (selectedFloor !== "all") {
      result = result.filter((r) => r.floor === selectedFloor);
    }

    // Apply occupancy filter
    switch (activeFilter) {
      case "available":
        result = result.filter((r) => r.patients.length === 0);
        break;
      case "occupied":
        result = result.filter(
          (r) => r.patients.length > 0 && r.patients.length < (r.capacity || 4)
        );
        break;
      case "full":
        result = result.filter(
          (r) => r.patients.length >= (r.capacity || 4)
        );
        break;
    }

    // Sort by floor and name
    return result.sort((a, b) => {
      if (a.floor && b.floor && a.floor !== b.floor) {
        return a.floor.localeCompare(b.floor);
      }
      return a.name.localeCompare(b.name);
    });
  }, [rooms, activeFilter, selectedFloor]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalPatients = rooms.reduce((sum, r) => sum + r.patients.length, 0);
    const totalCapacity = rooms.reduce(
      (sum, r) => sum + (r.capacity || 4),
      0
    );
    const totalAlerts = rooms.reduce((sum, r) => sum + r.alertCount, 0);
    const availableRooms = rooms.filter((r) => r.patients.length === 0).length;

    return {
      totalPatients,
      totalCapacity,
      occupancyRate:
        totalCapacity > 0 ? Math.round((totalPatients / totalCapacity) * 100) : 0,
      totalAlerts,
      availableRooms,
      totalRooms: rooms.length,
    };
  }, [rooms]);

  const handleRoomClick = (room: RoomWithPatients) => {
    setSelectedRoom(room);
    onRoomClick?.(room);
  };

  return (
    <div className={className}>
      {/* Header Stats */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.totalPatients}</p>
              <p className="text-xs text-muted-foreground">Patients</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{stats.totalRooms}</p>
              <p className="text-xs text-muted-foreground">Total Rooms</p>
            </div>
            <div className="text-center">
              <p className={cn(
                "text-2xl font-bold",
                stats.occupancyRate > 90 ? "text-amber-600" : "text-emerald-600"
              )}>
                {stats.occupancyRate}%
              </p>
              <p className="text-xs text-muted-foreground">Occupancy</p>
            </div>
            <div className="text-center">
              <p className={cn(
                "text-2xl font-bold",
                stats.totalAlerts > 0 ? "text-destructive" : "text-emerald-600"
              )}>
                {stats.totalAlerts}
              </p>
              <p className="text-xs text-muted-foreground">Active Alerts</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* View Toggle */}
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
            className="w-auto"
          >
            <TabsList className="h-8">
              <TabsTrigger value="grid" className="px-2 h-6 text-xs">
                <Grid3X3 className="h-3.5 w-3.5" />
              </TabsTrigger>
              <TabsTrigger value="compact" className="px-2 h-6 text-xs">
                <LayoutGrid className="h-3.5 w-3.5" />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Floor Filter */}
          {floors.length > 0 && (
            <Tabs
              value={selectedFloor}
              onValueChange={setSelectedFloor}
              className="w-auto"
            >
              <TabsList className="h-8">
                <TabsTrigger value="all" className="px-2 h-6 text-xs">
                  <Building2 className="h-3.5 w-3.5 mr-1" />
                  All Floors
                </TabsTrigger>
                {floors.map((floor) => (
                  <TabsTrigger
                    key={floor}
                    value={floor}
                    className="px-2 h-6 text-xs"
                  >
                    {floor}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {/* Occupancy Filter */}
          <div className="flex items-center gap-1">
            {(["all", "available", "occupied", "full"] as const).map(
              (filter) => (
                <Button
                  key={filter}
                  variant={activeFilter === filter ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveFilter(filter)}
                  className={cn(
                    "h-7 text-xs capitalize",
                    activeFilter === filter && "bg-primary/10 text-primary"
                  )}
                >
                  {filter}
                </Button>
              )
            )}
          </div>
        </div>
      )}

      {/* Room Grid */}
      {filteredRooms.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Filter className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No rooms match the selected filters
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "grid gap-3",
            viewMode === "grid"
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          )}
        >
          {filteredRooms.map((room) => (
            <RoomSubCard
              key={room.id}
              room={{
                id: room.id,
                name: room.name,
                type: room.type,
                capacity: room.capacity,
              }}
              patients={room.patients}
              alertCount={room.alertCount}
              onClick={() => handleRoomClick(room)}
            />
          ))}
        </div>
      )}

      {/* Room Detail Popup */}
      <RoomDetailPopup
        isOpen={!!selectedRoom}
        onClose={() => setSelectedRoom(null)}
        room={selectedRoom}
        patients={selectedRoom?.patients || []}
        devices={[]}
        alertCount={selectedRoom?.alertCount}
      />
    </div>
  );
}
