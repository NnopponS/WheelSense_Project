"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { 
  Cpu, 
  MapPin, 
  Activity, 
  Play, 
  Square, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Save,
  Download,
  Terminal,
  Camera
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type TabKey = "localization" | "motion";

interface Room {
  id: number;
  name: string;
  floor_id: number;
  node_device_id: string | null;
}

interface Device {
  id: number;
  device_id: string;
  hardware_type: string;
  display_name: string;
}

interface Facility {
  id: number;
  name: string;
}

interface Floor {
  id: number;
  facility_id: number;
  floor_number: number;
  name?: string | null;
}

interface LocalizationModelInfo {
  status?: string;
  rooms?: number;
  nodes?: string[];
}

interface LocalizationReadiness {
  workspace_id: number;
  ready: boolean;
  missing: string[];
  strategy: "knn" | "max_rssi";
  facility_id: number | null;
  facility_name: string | null;
  floor_id: number | null;
  floor_name: string | null;
  floor_number: number | null;
  room_id: number | null;
  room_name: string | null;
  room_node_device_id: string | null;
  node_device_id: string | null;
  node_display_name: string | null;
  wheelchair_device_id: string | null;
  patient_name: string | null;
  patient_username: string | null;
  patient_room_id: number | null;
  assignment_patient_id: number | null;
  floorplan_has_room: boolean;
  telemetry_detected: boolean;
  changed: string[];
}

interface MotionModelInfo {
  trained?: boolean;
  accuracy?: number;
  n_samples?: number;
  labels?: string[];
}

interface MotionTrainResponse {
  accuracy: number;
}

export default function MlCalibrationClient() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("localization");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  
  // States for Motion
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [motionLabel, setMotionLabel] = useState<string>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<string | null>(null);

  // States for Localization config & recording
  const [locStrategy, setLocStrategy] = useState<"knn" | "max_rssi">("max_rssi");
  const [selectedRoomId, setSelectedRoomId] = useState<number | "">("");
  const [selectedLocDevice, setSelectedLocDevice] = useState<string>("");
  const [locSessionId, setLocSessionId] = useState<number | null>(null);
  const [recordingLoc, setRecordingLoc] = useState(false);
  const [locSamplesCount, setLocSamplesCount] = useState(0);
  const [repairingReadiness, setRepairingReadiness] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<number | "">("");
  const [selectedFloorId, setSelectedFloorId] = useState<number | "">("");

  // Queries
  const facilitiesEndpoint = useMemo(() => withWorkspaceScope("/facilities", user?.workspace_id), [user?.workspace_id]);
  const roomsEndpoint = useMemo(() => withWorkspaceScope("/rooms", user?.workspace_id), [user?.workspace_id]);
  const devicesEndpoint = useMemo(() => withWorkspaceScope("/devices", user?.workspace_id), [user?.workspace_id]);
  const locModelEndpoint = useMemo(() => withWorkspaceScope("/localization", user?.workspace_id), [user?.workspace_id]);
  const locConfigEndpoint = useMemo(() => withWorkspaceScope("/localization/config", user?.workspace_id), [user?.workspace_id]);
  const locReadinessEndpoint = useMemo(() => withWorkspaceScope("/localization/readiness", user?.workspace_id), [user?.workspace_id]);
  const motionModelEndpoint = useMemo(() => withWorkspaceScope("/motion/model", user?.workspace_id), [user?.workspace_id]);

  const { data: facilities } = useQuery({
    queryKey: ["admin", "ml-calibration", "facilities", facilitiesEndpoint],
    queryFn: () => api.get<Facility[]>(facilitiesEndpoint!),
    enabled: Boolean(facilitiesEndpoint),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: rooms } = useQuery({
    queryKey: ["admin", "ml-calibration", "rooms", roomsEndpoint],
    queryFn: () => api.get<Room[]>(roomsEndpoint!),
    enabled: Boolean(roomsEndpoint),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: devices } = useQuery({
    queryKey: ["admin", "ml-calibration", "devices", devicesEndpoint],
    queryFn: () => api.get<Device[]>(devicesEndpoint!),
    enabled: Boolean(devicesEndpoint),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: locModel, refetch: refetchLoc } = useQuery({
    queryKey: ["admin", "ml-calibration", "localization", locModelEndpoint],
    queryFn: () => api.get<LocalizationModelInfo>(locModelEndpoint!),
    enabled: Boolean(locModelEndpoint),
    staleTime: 30_000,
  });
  const { data: locConfig, refetch: refetchLocConfig } = useQuery({
    queryKey: ["admin", "ml-calibration", "localization-config", locConfigEndpoint],
    queryFn: () => api.get<{ strategy: "knn" | "max_rssi" }>(locConfigEndpoint!),
    enabled: Boolean(locConfigEndpoint),
    staleTime: 30_000,
  });
  const { data: locReadiness, refetch: refetchLocReadiness } = useQuery({
    queryKey: ["admin", "ml-calibration", "localization-readiness", locReadinessEndpoint],
    queryFn: () => api.get<LocalizationReadiness>(locReadinessEndpoint!),
    enabled: Boolean(locReadinessEndpoint),
    staleTime: 15_000,
  });
  const { data: motionModel, refetch: refetchMotion } = useQuery({
    queryKey: ["admin", "ml-calibration", "motion-model", motionModelEndpoint],
    queryFn: () => api.get<MotionModelInfo>(motionModelEndpoint!),
    enabled: Boolean(motionModelEndpoint),
    staleTime: 30_000,
  });
  const floorsEndpoint = useMemo(
    () =>
      selectedFacilityId === ""
        ? null
        : withWorkspaceScope(`/facilities/${selectedFacilityId}/floors`, user?.workspace_id),
    [selectedFacilityId, user?.workspace_id],
  );
  const { data: floors } = useQuery({
    queryKey: ["admin", "ml-calibration", "floors", floorsEndpoint],
    queryFn: () => api.get<Floor[]>(floorsEndpoint!),
    enabled: Boolean(floorsEndpoint),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (locConfig?.strategy) {
      setLocStrategy(locConfig.strategy);
    }
  }, [locConfig?.strategy]);

  useEffect(() => {
    if (!facilities?.length) {
      setSelectedFacilityId("");
      return;
    }
    if (selectedFacilityId !== "" && facilities.some((facility) => facility.id === selectedFacilityId)) {
      return;
    }
    const readinessFacility = locReadiness?.facility_id ?? null;
    if (readinessFacility && facilities.some((facility) => facility.id === readinessFacility)) {
      setSelectedFacilityId(readinessFacility);
      return;
    }
    setSelectedFacilityId(facilities[0].id);
  }, [facilities, locReadiness?.facility_id, selectedFacilityId]);

  useEffect(() => {
    if (!floors?.length) {
      setSelectedFloorId("");
      return;
    }
    if (selectedFloorId !== "" && floors.some((floor) => floor.id === selectedFloorId)) {
      return;
    }
    const readinessFloor = locReadiness?.floor_id ?? null;
    if (readinessFloor && floors.some((floor) => floor.id === readinessFloor)) {
      setSelectedFloorId(readinessFloor);
      return;
    }
    setSelectedFloorId(floors[0].id);
  }, [floors, locReadiness?.floor_id, selectedFloorId]);

  const filteredRooms = useMemo(() => {
    if (!rooms?.length) return [];
    if (selectedFloorId === "") return rooms;
    return rooms.filter((room) => room.floor_id === selectedFloorId);
  }, [rooms, selectedFloorId]);

  useEffect(() => {
    if (!filteredRooms.length) {
      setSelectedRoomId("");
      return;
    }
    if (selectedRoomId !== "" && filteredRooms.some((room) => room.id === Number(selectedRoomId))) {
      return;
    }
    const readinessRoom = locReadiness?.room_id ?? null;
    if (readinessRoom && filteredRooms.some((room) => room.id === readinessRoom)) {
      setSelectedRoomId(readinessRoom);
      return;
    }
    setSelectedRoomId(filteredRooms[0].id);
  }, [filteredRooms, locReadiness?.room_id, selectedRoomId]);

  const showMsg = (text: string, type: "success" | "error" | "info" = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Handlers for Localization
  // Handlers for Localization
  const handleStartLocSession = async () => {
    if (!selectedLocDevice || !selectedRoomId) return;
    try {
      const res = await api.post<{ id: number }>("/localization/calibration/sessions", {
        device_id: selectedLocDevice,
        notes: `room_id:${selectedRoomId}`,
      });
      setLocSessionId(res.id);
      setRecordingLoc(true);
      setLocSamplesCount(0);
      showMsg("Calibration session started. Move around and record samples.", "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to start session", "error");
    }
  };

  const handleRecordLocSample = async () => {
    if (!locSessionId || !selectedRoomId || !selectedLocDevice) return;
    try {
      const readings = await api.get<
        { node_id: string | null; rssi: number; timestamp?: string | null }[]
      >(`/telemetry/rssi?device_id=${encodeURIComponent(selectedLocDevice)}&limit=500`);
      const byNode: Record<string, number> = {};
      const sorted = [...(readings ?? [])].sort((a, b) => {
        const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
        const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
        return tb - ta;
      });
      for (const row of sorted) {
        if (!row.node_id) continue;
        if (byNode[row.node_id] !== undefined) continue;
        byNode[row.node_id] = Math.round(Number(row.rssi));
      }
      if (Object.keys(byNode).length === 0) {
        showMsg(
          "No RSSI readings found for this device yet. Ensure the device is online and publishing RSSI.",
          "error",
        );
        return;
      }
      const roomName = rooms?.find((r) => r.id === Number(selectedRoomId))?.name;
      await api.post(`/localization/calibration/sessions/${locSessionId}/samples`, {
        room_id: Number(selectedRoomId),
        room_name: roomName,
        rssi_vector: byNode,
      });
      setLocSamplesCount((prev) => prev + 1);
      showMsg("Sample recorded", "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to record sample", "error");
    }
  };

  const handleStopLocSession = async () => {
    if (!locSessionId) return;
    try {
      await api.post(`/localization/calibration/sessions/${locSessionId}/train`, {});
      setRecordingLoc(false);
      setLocSessionId(null);
      showMsg("Session trained and samples saved to the training set.", "success");
      await refetchLoc();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to finish session", "error");
    }
  };

  const handleStrategyChange = async (strategy: "knn" | "max_rssi") => {
    try {
      await api.put("/localization/config", { strategy });
      setLocStrategy(strategy);
      showMsg(`Localization strategy changed to ${strategy}`, "success");
      await refetchLocConfig();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to change strategy", "error");
    }
  };

  const handleTrainLoc = async () => {
    try {
      setTrainingStatus("training_loc");
      await api.post("/localization/retrain", {});
      showMsg("Localization model trained successfully", "success");
      await refetchLoc();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to train model", "error");
    } finally {
      setTrainingStatus(null);
    }
  };

  const handleRepairReadiness = async () => {
    try {
      setRepairingReadiness(true);
      const repaired = await api.post<LocalizationReadiness>("/localization/readiness/repair", {
        facility_id: selectedFacilityId === "" ? null : selectedFacilityId,
        floor_id: selectedFloorId === "" ? null : selectedFloorId,
        room_id: selectedRoomId === "" ? null : Number(selectedRoomId),
      });
      showMsg(
        repaired.ready
          ? "Localization baseline repaired and connected."
          : "Repair ran, but some required links are still missing.",
        repaired.ready ? "success" : "info",
      );
      await Promise.all([
        refetchLocReadiness(),
        refetchLocConfig(),
        refetchLoc(),
      ]);
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to repair localization readiness", "error");
    } finally {
      setRepairingReadiness(false);
    }
  };

  // Handlers for Motion
  const handleStartRecord = async () => {
    if (!selectedDevice) return showMsg("Please select a device first", "error");
    try {
      await api.post("/motion/record/start", {
        device_id: selectedDevice,
        label: motionLabel,
        session_id: `session_${Date.now()}`
      });
      setIsRecording(true);
      showMsg(`Recording started for label: ${motionLabel}`, "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to start recording", "error");
    }
  };

  const handleStopRecord = async () => {
    if (!selectedDevice) return;
    try {
      await api.post("/motion/record/stop", { device_id: selectedDevice });
      setIsRecording(false);
      showMsg("Recording stopped", "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to stop recording", "error");
    }
  };

  const handleTrainMotion = async () => {
    try {
      setTrainingStatus("training_motion");
      const res = await api.post<MotionTrainResponse>("/motion/train", {});
      showMsg(`Motion model trained. Accuracy: ${(res.accuracy * 100).toFixed(1)}%`, "success");
      await refetchMotion();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to train model", "error");
    } finally {
      setTrainingStatus(null);
    }
  };

  const handleSaveMotion = async () => {
    try {
      await api.post("/motion/model/save", {});
      showMsg("Motion model saved to disk", "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : "Failed to save model", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary" />
          ML Calibration
        </h2>
        <p className="text-sm text-foreground-variant mt-1">
          Manage and calibrate machine learning models for room localization and motion detection.
        </p>
      </div>

      <div className="flex gap-2 border-b border-outline-variant pb-3">
        <Button 
          variant={activeTab === "localization" ? "default" : "ghost"}
          onClick={() => setActiveTab("localization")}
          className="rounded-full"
        >
          <MapPin className="w-4 h-4 mr-2" />
          Localization
        </Button>
        <Button 
          variant={activeTab === "motion" ? "default" : "ghost"}
          onClick={() => setActiveTab("motion")}
          className="rounded-full"
        >
          <Activity className="w-4 h-4 mr-2" />
          Motion (XGBoost)
        </Button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === "error" ? "bg-error-container text-error" : 
          message.type === "success" ? "bg-success-container text-success" : 
          "bg-info-container text-info"
        }`}>
          {message.type === "error" ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {activeTab === "localization" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Localization Data Collector
                </CardTitle>
                <CardDescription>
                  Record RSSI fingerprints for a selected room to train the model.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Building</Label>
                    <Select
                      value={selectedFacilityId === "" ? "" : String(selectedFacilityId)}
                      onValueChange={(v) => {
                        setSelectedFacilityId(v ? Number(v) : "");
                        setSelectedFloorId("");
                        setSelectedRoomId("");
                      }}
                      disabled={recordingLoc}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select building..." />
                      </SelectTrigger>
                      <SelectContent>
                        {facilities?.map((facility) => (
                          <SelectItem key={facility.id} value={String(facility.id)}>
                            {facility.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Floor</Label>
                    <Select
                      value={selectedFloorId === "" ? "" : String(selectedFloorId)}
                      onValueChange={(v) => {
                        setSelectedFloorId(v ? Number(v) : "");
                        setSelectedRoomId("");
                      }}
                      disabled={recordingLoc || selectedFacilityId === ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select floor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {floors?.map((floor) => (
                          <SelectItem key={floor.id} value={String(floor.id)}>
                            {floor.name?.trim() || `Floor ${floor.floor_number}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Room</Label>
                    <Select value={String(selectedRoomId)} onValueChange={v => setSelectedRoomId(Number(v))} disabled={recordingLoc}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select room..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredRooms.map(r => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Calibration Device (M5/Mobile)</Label>
                    <Select value={selectedLocDevice} onValueChange={setSelectedLocDevice} disabled={recordingLoc}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select device..." />
                      </SelectTrigger>
                      <SelectContent>
                        {devices?.map(d => (
                          <SelectItem key={d.device_id} value={d.device_id}>
                            {d.display_name} ({d.device_id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground border-l-4 border-primary/30 pl-3 leading-relaxed">
                  {t("admin.ml.sessionHardwareNote")}
                </p>

                <div className="flex gap-3">
                  {!recordingLoc ? (
                    <Button 
                      className="flex-1 h-12 rounded-xl text-lg font-bold bg-primary text-white hover:bg-primary/90"
                      onClick={handleStartLocSession}
                      disabled={!selectedLocDevice || !selectedRoomId || selectedFacilityId === "" || selectedFloorId === ""}
                    >
                      <Play className="w-5 h-5 mr-2 fill-current" /> Start Calibration Session
                    </Button>
                  ) : (
                    <>
                      <Button 
                        className="flex-1 h-12 rounded-xl text-lg font-bold bg-success text-white hover:bg-success/90"
                        onClick={handleRecordLocSample}
                      >
                        <Camera className="w-5 h-5 mr-2" /> Record Sample ({locSamplesCount})
                      </Button>
                      <Button 
                        className="flex-1 h-12 rounded-xl text-lg font-bold bg-error text-white hover:bg-error/90"
                        onClick={handleStopLocSession}
                      >
                        <Square className="w-5 h-5 mr-2 fill-current" /> Finish & Train
                      </Button>
                    </>
                  )}
                </div>

                {recordingLoc && (
                  <div className="flex items-center justify-center gap-2 p-4 bg-info-container/20 rounded-xl animate-pulse">
                    <div className="w-3 h-3 rounded-full bg-info" />
                    <span className="text-sm font-bold text-info uppercase tracking-widest">Move device around the room and record samples</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Rooms & Training Status
                </CardTitle>
                <CardDescription>
                  RSSI fingerprints are mapped to these rooms.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Room Name</TableHead>
                      <TableHead>Node ID</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRooms.map((room) => (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">{room.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{room.node_device_id || "No Node"}</Badge>
                        </TableCell>
                        <TableCell>
                          {locModel?.status === "ready" && (locModel?.rooms ?? 0) > 0 ? (
                            <div className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="text-xs">Active</span>
                            </div>
                          ) : (
                            <span className="text-xs text-foreground-variant">No Data</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!rooms || rooms.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-foreground-variant italic">
                          No rooms configured. Go to Facility Management to add rooms.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Model Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="surface-container-low p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Workspace Readiness</p>
                    <p className="text-xs text-foreground-variant">
                      {`Checks ${locReadiness?.wheelchair_device_id || "wheelchair"} -> ${
                        locReadiness?.node_display_name || locReadiness?.node_device_id || "node"
                      } -> ${locReadiness?.room_name || "room"} -> ${
                        locReadiness?.patient_username || locReadiness?.patient_name || "patient"
                      } and keeps strongest RSSI as default.`}
                    </p>
                  </div>
                  <Badge variant={locReadiness?.ready ? "default" : "secondary"}>
                    {locReadiness?.ready ? "Ready" : "Needs repair"}
                  </Badge>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">Wheelchair</span>
                    <span className="font-medium">{locReadiness?.wheelchair_device_id || "Missing"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">Node alias</span>
                    <span className="font-medium">{locReadiness?.node_display_name || locReadiness?.node_device_id || "Missing"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">Room</span>
                    <span className="font-medium">{locReadiness?.room_name || "Missing"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">Patient</span>
                    <span className="font-medium">{locReadiness?.patient_name || locReadiness?.patient_username || "Missing"}</span>
                  </div>
                </div>
                {locReadiness && locReadiness.missing.length > 0 && (
                  <p className="text-[11px] text-amber-700">
                    Missing: {locReadiness.missing.join(", ")}
                  </p>
                )}
                <Button
                  className="w-full"
                  variant={locReadiness?.ready ? "outline" : "default"}
                  disabled={repairingReadiness}
                  onClick={handleRepairReadiness}
                >
                  {repairingReadiness ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Repair and connect baseline
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Localization Strategy</Label>
                <Select value={locStrategy} onValueChange={(v) => handleStrategyChange(v as "knn" | "max_rssi")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="knn">KNN (Fingerprinting)</SelectItem>
                    <SelectItem value="max_rssi">Strongest RSSI Node</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-foreground-variant italic">
                  {locStrategy === "knn"
                    ? "Uses machine learning on RSSI fingerprints."
                    : "Uses the strongest visible RSSI node as the default room signal."}
                </p>
              </div>

              <div className="surface-container-low p-4 rounded-xl space-y-2 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-variant">Status</span>
                  <Badge variant={locModel?.status === "ready" ? "default" : "secondary"}>
                    {locModel?.status || "Unknown"}
                  </Badge>
                </div>
                {locModel?.status === "ready" && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">Trained Rooms</span>
                      <span className="font-bold">{locModel.rooms ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">Nodes (Beacons)</span>
                      <span className="font-bold">{locModel.nodes?.length || 0}</span>
                    </div>
                  </>
                )}
              </div>

              <Button 
                className="w-full gradient-cta h-11"
                disabled={trainingStatus !== null}
                onClick={handleTrainLoc}
              >
                {trainingStatus === "training_loc" ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Retrain from Database
              </Button>
              <p className="text-[10px] text-foreground-variant italic px-1 text-center">
                Uses existing RSSI fingerprint data in the database.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "motion" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Terminal className="w-5 h-5" />
                Training Data Collector
              </CardTitle>
              <CardDescription>
                Record IMU windows from an M5StickC to train the motion classifier.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Wheelchair (M5StickC)</Label>
                  <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select device..." />
                    </SelectTrigger>
                    <SelectContent>
                      {devices?.map(d => (
                        <SelectItem key={d.device_id} value={d.device_id}>
                          {d.display_name} ({d.device_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Action Label</Label>
                  <Select value={motionLabel} onValueChange={setMotionLabel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="idle">Idle (หยุดนิ่ง)</SelectItem>
                      <SelectItem value="straight">Straight (เดินหน้า)</SelectItem>
                      <SelectItem value="turn_left">Turn Left (เลี้ยวซ้าย)</SelectItem>
                      <SelectItem value="turn_right">Turn Right (เลี้ยวขวา)</SelectItem>
                      <SelectItem value="reverse">Reverse (ถอยหลัง)</SelectItem>
                      <SelectItem value="fall">Fall (หกล้ม)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground border-l-4 border-primary/30 pl-3 leading-relaxed">
                {t("admin.ml.sessionHardwareNote")}
              </p>

              <div className="flex gap-3">
                <Button 
                  className={`flex-1 h-12 rounded-xl text-lg font-bold ${isRecording ? 'bg-error text-white hover:bg-error/90' : 'bg-success text-white hover:bg-success/90'}`}
                  onClick={isRecording ? handleStopRecord : handleStartRecord}
                  disabled={!selectedDevice}
                >
                  {isRecording ? (
                    <><Square className="w-5 h-5 mr-2 fill-current" /> Stop Recording</>
                  ) : (
                    <><Play className="w-5 h-5 mr-2 fill-current" /> Start Recording</>
                  )}
                </Button>
              </div>

              {isRecording && (
                <div className="flex items-center justify-center gap-2 p-4 bg-error-container/20 rounded-xl animate-pulse">
                  <div className="w-3 h-3 rounded-full bg-error" />
                  <span className="text-sm font-bold text-error uppercase tracking-widest">Live Recording Session</span>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-bold">Model Labels Status</h4>
                <div className="flex flex-wrap gap-2">
                  {motionModel?.labels?.map((l: string) => (
                    <Badge key={l} variant="default" className="bg-primary/20 text-primary border-primary/30">
                      {l}
                    </Badge>
                  ))}
                  {(!motionModel?.labels || motionModel?.labels.length === 0) && (
                    <span className="text-xs text-foreground-variant italic">No labels trained yet.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Model Control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="surface-container-low p-4 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-variant">Trained</span>
                  <Badge variant={motionModel?.trained ? "default" : "secondary"}>
                    {motionModel?.trained ? "Ready" : "Not Trained"}
                  </Badge>
                </div>
                {motionModel?.trained && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">Accuracy</span>
                      <span className="font-bold">{((motionModel.accuracy ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">Samples</span>
                      <span className="font-bold">{motionModel.n_samples ?? 0}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Button 
                  className="w-full gradient-cta"
                  disabled={trainingStatus !== null}
                  onClick={handleTrainMotion}
                >
                  {trainingStatus === "training_motion" ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Train XGBoost Model
                </Button>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" size="sm" onClick={handleSaveMotion} disabled={!motionModel?.trained}>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      await api.post("/motion/model/load", {});
                      showMsg("Model loaded from disk", "success");
                      await refetchMotion();
                    } catch {
                      showMsg("No saved model found", "error");
                    }
                  }}>
                    <Download className="w-4 h-4 mr-2" />
                    Load
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
