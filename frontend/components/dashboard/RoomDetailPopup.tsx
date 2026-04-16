"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DoorOpen,
  Users,
  Phone,
  MessageSquare,
  AlertCircle,
  Activity,
  Battery,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { getPatientDetailPath, getMonitoringPath, getAlertsPath } from "@/lib/routes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import type { PatientOut } from "@/lib/api/task-scope-types";

interface RoomDetailPopupProps {
  isOpen: boolean;
  onClose: () => void;
  room: {
    id: number;
    name: string;
    type?: string;
    floor?: string;
    facility?: string;
  } | null;
  patients: PatientOut[];
  devices?: Array<{
    id: string;
    name: string;
    type: string;
    status: "online" | "offline";
    battery?: number;
  }>;
  alertCount?: number;
}

export function RoomDetailPopup({
  isOpen,
  onClose,
  room,
  patients,
  devices = [],
  alertCount = 0,
}: RoomDetailPopupProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role || "head_nurse";

  if (!room) return null;

  const onlineDevices = devices.filter((d) => d.status === "online").length;
  const offlineDevices = devices.filter((d) => d.status === "offline").length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <DoorOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">{room.name}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  {room.type && <span className="capitalize">{room.type}</span>}
                  {(room.floor || room.facility) && (
                    <>
                      <span>·</span>
                      <span>
                        {room.floor}
                        {room.floor && room.facility && ", "}
                        {room.facility}
                      </span>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
            {alertCount > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {alertCount} {alertCount === 1 ? "Alert" : "Alerts"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-muted/50">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold">{patients.length}</p>
                <p className="text-xs text-muted-foreground">Patients</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-500/5">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-emerald-600">{onlineDevices}</p>
                <p className="text-xs text-muted-foreground">Online</p>
              </CardContent>
            </Card>
            <Card className={cn(offlineDevices > 0 ? "bg-destructive/5" : "bg-muted/50")}>
              <CardContent className="p-3 text-center">
                <p className={cn("text-xl font-bold", offlineDevices > 0 ? "text-destructive" : "text-muted-foreground")}>
                  {offlineDevices}
                </p>
                <p className="text-xs text-muted-foreground">Offline</p>
              </CardContent>
            </Card>
          </div>

          <Separator />

          {/* Patients Section */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Patients ({patients.length})
            </h4>
            {patients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No patients in this room
              </p>
            ) : (
              <div className="space-y-2">
                {patients.map((patient) => (
                  <Card
                    key={patient.id}
                    className="cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => router.push(getPatientDetailPath(role, patient.id))}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                            {patient.first_name?.[0]}
                            {patient.last_name?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {patient.first_name} {patient.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {patient.care_level || "Standard care"}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(getPatientDetailPath(role, patient.id));
                            }}
                          >
                            <Activity className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Open message dialog
                            }}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Devices Section */}
          {devices.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Devices ({devices.length})
                </h4>
                <div className="space-y-2">
                  {devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {device.status === "online" ? (
                          <Wifi className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{device.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {device.type}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {device.battery !== undefined && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Battery className="h-3 w-3" />
                            {device.battery}%
                          </div>
                        )}
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px]",
                            device.status === "online"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {device.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Quick Actions */}
          <Separator />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(getMonitoringPath(role, room.id))}
            >
              <Activity className="mr-2 h-4 w-4" />
              View Monitoring
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push(getAlertsPath(role, room.id))}
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              View Alerts
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
