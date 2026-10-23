"use client";

import { Users, DoorOpen, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PatientOut } from "@/lib/api/task-scope-types";

interface RoomSubCardProps {
  room: {
    id: number;
    name: string;
    type?: string;
    capacity?: number;
  };
  patients: PatientOut[];
  alertCount?: number;
  onClick?: () => void;
  className?: string;
}

export function RoomSubCard({
  room,
  patients,
  alertCount = 0,
  onClick,
  className,
}: RoomSubCardProps) {
  const patientCount = patients.length;
  const capacity = room.capacity || 4;
  const occupancyRate = patientCount / capacity;

  const status =
    occupancyRate === 0
      ? "available"
      : occupancyRate >= 1
        ? "full"
        : "occupied";

  const statusConfig = {
    available: {
      label: "Available",
      color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      dotColor: "bg-emerald-500",
    },
    occupied: {
      label: "Occupied",
      color: "bg-primary/10 text-primary border-primary/20",
      dotColor: "bg-primary",
    },
    full: {
      label: "Full",
      color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      dotColor: "bg-amber-500",
    },
  };

  const config = statusConfig[status];

  // Get first 3 patient avatars or show count
  const displayPatients = patients.slice(0, 3);
  const remainingCount = Math.max(0, patientCount - 3);

  return (
    <Card
      className={cn(
        "transition-all duration-200 overflow-hidden",
        onClick && "cursor-pointer hover:shadow-md hover:border-primary/30",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <DoorOpen className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm text-foreground">{room.name}</p>
              {room.type && (
                <p className="text-[10px] text-muted-foreground capitalize">
                  {room.type}
                </p>
              )}
            </div>
          </div>
          <Badge
            variant="secondary"
            className={cn("text-[10px] px-1.5 py-0 h-5", config.color)}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full mr-1", config.dotColor)} />
            {config.label}
          </Badge>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>
                {patientCount}/{capacity}
              </span>
            </div>

            {/* Patient avatars or count badge */}
            {patientCount > 0 && (
              <div className="flex -space-x-1.5">
                {displayPatients.map((patient, idx) => (
                  <div
                    key={patient.id}
                    className="h-5 w-5 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[8px] font-medium text-primary"
                    title={`${patient.first_name} ${patient.last_name}`}
                    style={{ zIndex: 10 - idx }}
                  >
                    {patient.first_name?.[0]}
                    {patient.last_name?.[0]}
                  </div>
                ))}
                {remainingCount > 0 && (
                  <div className="h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[8px] font-medium text-muted-foreground">
                    +{remainingCount}
                  </div>
                )}
              </div>
            )}
          </div>

          {alertCount > 0 && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{alertCount}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
