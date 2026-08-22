"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/lib/i18n";
import { AppPage } from "@/components/layout/AppPage";
import { withWorkspaceScope } from "@/lib/workspaceQuery";
import { 
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
  telemetry_strongest_node_id?: string | null;
  telemetry_predicted_room_id?: number | null;
  telemetry_predicted_room_name?: string | null;
  telemetry_rssi_preview?: Record<string, number>;
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

export default function MlCalibrationClient({ embedded = false }: { embedded?: boolean }) {
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
  const [locStrategyDirty, setLocStrategyDirty] = useState(false);
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
      setLocStrategyDirty(false);
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
      showMsg(t("admin.ml.msgSessionStarted"), "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgStartFailed"), "error");
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
          t("admin.ml.msgNoRssi"),
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
      showMsg(t("admin.ml.msgSampleRecorded"), "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgSampleFailed"), "error");
    }
  };

  const handleStopLocSession = async () => {
    if (!locSessionId) return;
    try {
      await api.post(`/localization/calibration/sessions/${locSessionId}/train`, {});
      setRecordingLoc(false);
      setLocSessionId(null);
      showMsg(t("admin.ml.msgSessionTrained"), "success");
      await refetchLoc();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgFinishFailed"), "error");
    }
  };

  const handleSaveLocalizationStrategy = async () => {
    try {
      await api.put("/localization/config", { strategy: locStrategy });
      setLocStrategyDirty(false);
      showMsg(
        locStrategy === "max_rssi"
          ? t("admin.ml.msgStrategyStrongestSaved")
          : t("admin.ml.msgStrategyKnnSaved"),
        "success",
      );
      await refetchLocConfig();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgStrategyFailed"), "error");
    }
  };

  const handleTrainLoc = async () => {
    try {
      setTrainingStatus("training_loc");
      await api.post("/localization/retrain", {});
      showMsg(t("admin.ml.msgLocalizationTrained"), "success");
      await refetchLoc();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgTrainFailed"), "error");
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
          ? t("admin.ml.msgBaselineRepaired")
          : t("admin.ml.msgRepairIncomplete"),
        repaired.ready ? "success" : "info",
      );
      await Promise.all([
        refetchLocReadiness(),
        refetchLocConfig(),
        refetchLoc(),
      ]);
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgRepairFailed"), "error");
    } finally {
      setRepairingReadiness(false);
    }
  };

  // Handlers for Motion
  const handleStartRecord = async () => {
    if (!selectedDevice) return showMsg(t("admin.ml.msgSelectDevice"), "error");
    try {
      await api.post("/motion/record/start", {
        device_id: selectedDevice,
        label: motionLabel,
        session_id: `session_${Date.now()}`
      });
      setIsRecording(true);
      showMsg(`${t("admin.ml.msgRecordingStarted")}: ${motionLabel}`, "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgRecordingStartFailed"), "error");
    }
  };

  const handleStopRecord = async () => {
    if (!selectedDevice) return;
    try {
      await api.post("/motion/record/stop", { device_id: selectedDevice });
      setIsRecording(false);
      showMsg(t("admin.ml.msgRecordingStopped"), "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgRecordingStopFailed"), "error");
    }
  };

  const handleTrainMotion = async () => {
    try {
      setTrainingStatus("training_motion");
      const res = await api.post<MotionTrainResponse>("/motion/train", {});
      showMsg(`${t("admin.ml.msgMotionTrained")} ${t("admin.ml.accuracy")}: ${(res.accuracy * 100).toFixed(1)}%`, "success");
      await refetchMotion();
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgTrainFailed"), "error");
    } finally {
      setTrainingStatus(null);
    }
  };

  const handleSaveMotion = async () => {
    try {
      await api.post("/motion/model/save", {});
      showMsg(t("admin.ml.msgMotionSaved"), "success");
    } catch (err) {
      showMsg(err instanceof ApiError ? err.message : t("admin.ml.msgSaveModelFailed"), "error");
    }
  };

  return (
    <AppPage
      showHeader={!embedded}
      width="content"
      title={t("admin.ml.calibrationTitle")}
      description={t("admin.ml.calibrationDescription")}
      breadcrumbs={[
        { label: t("nav.dashboard"), href: "/admin" },
        { label: t("nav.mlCalibration") },
      ]}
    >

      <div className="flex gap-2 border-b border-outline-variant pb-3" role="group" aria-label={t("admin.ml.modelAreaTabs")}>
        <Button 
          aria-pressed={activeTab === "localization"}
          variant={activeTab === "localization" ? "default" : "ghost"}
          onClick={() => setActiveTab("localization")}
          className="rounded-full"
        >
          <MapPin className="w-4 h-4 mr-2" />
          {t("admin.ml.localizationTab")}
        </Button>
        <Button 
          aria-pressed={activeTab === "motion"}
          variant={activeTab === "motion" ? "default" : "ghost"}
          onClick={() => setActiveTab("motion")}
          className="rounded-full"
        >
          <Activity className="w-4 h-4 mr-2" />
          {t("admin.ml.motionTab")}
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
                  {t("admin.ml.localizationCollectorTitle")}
                </CardTitle>
                <CardDescription>
                  {t("admin.ml.localizationCollectorDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("admin.ml.buildingLabel")}</Label>
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
                        <SelectValue placeholder={t("admin.ml.selectBuilding")} />
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
                    <Label>{t("admin.ml.floorLabel")}</Label>
                    <Select
                      value={selectedFloorId === "" ? "" : String(selectedFloorId)}
                      onValueChange={(v) => {
                        setSelectedFloorId(v ? Number(v) : "");
                        setSelectedRoomId("");
                      }}
                      disabled={recordingLoc || selectedFacilityId === ""}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("admin.ml.selectFloor")} />
                      </SelectTrigger>
                      <SelectContent>
                        {floors?.map((floor) => (
                          <SelectItem key={floor.id} value={String(floor.id)}>
                            {floor.name?.trim() || `${t("admin.ml.floorLabel")} ${floor.floor_number}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("admin.ml.roomLabel")}</Label>
                    <Select value={String(selectedRoomId)} onValueChange={v => setSelectedRoomId(Number(v))} disabled={recordingLoc}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("admin.ml.selectRoom")} />
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
                    <Label>{t("admin.ml.calibrationDeviceLabel")}</Label>
                    <Select value={selectedLocDevice} onValueChange={setSelectedLocDevice} disabled={recordingLoc}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("admin.ml.selectDevice")} />
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
                      <Play className="w-5 h-5 mr-2 fill-current" /> {t("admin.ml.startCalibration")}
                    </Button>
                  ) : (
                    <>
                      <Button 
                        className="flex-1 h-12 rounded-xl text-lg font-bold bg-success text-white hover:bg-success/90"
                        onClick={handleRecordLocSample}
                      >
                        <Camera className="w-5 h-5 mr-2" /> {t("admin.ml.recordSample")} ({locSamplesCount})
                      </Button>
                      <Button 
                        className="flex-1 h-12 rounded-xl text-lg font-bold bg-error text-white hover:bg-error/90"
                        onClick={handleStopLocSession}
                      >
                        <Square className="w-5 h-5 mr-2 fill-current" /> {t("admin.ml.finishTrain")}
                      </Button>
                    </>
                  )}
                </div>

                {recordingLoc && (
                  <div className="flex items-center justify-center gap-2 p-4 bg-info-container/20 rounded-xl animate-pulse">
                    <div className="w-3 h-3 rounded-full bg-info" />
                    <span className="text-sm font-bold text-info">{t("admin.ml.moveDeviceHint")}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  {t("admin.ml.roomsTrainingTitle")}
                </CardTitle>
                <CardDescription>
                  {t("admin.ml.roomsTrainingDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.ml.roomName")}</TableHead>
                      <TableHead>{t("admin.ml.nodeId")}</TableHead>
                      <TableHead>{t("clinical.table.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRooms.map((room) => (
                      <TableRow key={room.id}>
                        <TableCell className="font-medium">{room.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{room.node_device_id || t("admin.ml.noNode")}</Badge>
                        </TableCell>
                        <TableCell>
                          {locModel?.status === "ready" && (locModel?.rooms ?? 0) > 0 ? (
                            <div className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="w-3 h-3" />
                              <span className="text-sm">{t("patients.statusActive")}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-foreground-variant">{t("admin.ml.noData")}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!rooms || rooms.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-foreground-variant italic">
                          {t("admin.ml.noRooms")}
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
              <CardTitle className="text-lg">{t("admin.ml.modelControls")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="surface-container-low p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("admin.ml.workspaceReadiness")}</p>
                    <p className="text-xs text-foreground-variant">
                      {locReadiness?.telemetry_strongest_node_id
                        ? `${t("admin.ml.latestWheelchairRssi")}: ${locReadiness.telemetry_strongest_node_id} → ${t("admin.ml.predictedRoom")} ${
                            locReadiness.telemetry_predicted_room_name ||
                            (locReadiness.telemetry_predicted_room_id != null
                              ? `#${locReadiness.telemetry_predicted_room_id}`
                              : "?")
                          }. ${t("admin.ml.baselineChain")}: ${locReadiness.wheelchair_device_id || t("admin.ml.wheelchair")} → ${
                            locReadiness.node_device_id || t("admin.ml.node")
                          } → ${locReadiness.room_name || t("admin.ml.roomLabel")} → ${
                            locReadiness.patient_username || locReadiness.patient_name || t("admin.ml.patient")
                          }.`
                        : `${t("admin.ml.baselineChain")}: ${locReadiness?.wheelchair_device_id || t("admin.ml.wheelchair")} → ${
                            locReadiness?.node_display_name || locReadiness?.node_device_id || t("admin.ml.node")
                          } → ${locReadiness?.room_name || t("admin.ml.roomLabel")} → ${
                            locReadiness?.patient_username || locReadiness?.patient_name || t("admin.ml.patient")
                          }. ${t("admin.ml.publishRssiHint")}`}
                    </p>
                  </div>
                  <Badge variant={locReadiness?.ready ? "default" : "secondary"}>
                    {locReadiness?.ready ? t("admin.ml.ready") : t("admin.ml.needsRepair")}
                  </Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">{t("admin.ml.wheelchair")}</span>
                    <span className="font-medium">{locReadiness?.wheelchair_device_id || t("admin.ml.missing")}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">{t("admin.ml.strongestRssi")}</span>
                    <span className="font-medium">
                      {locReadiness?.telemetry_strongest_node_id || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">{t("admin.ml.nodeAlias")}</span>
                    <span className="font-medium">{locReadiness?.node_display_name || locReadiness?.node_device_id || t("admin.ml.missing")}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">{t("admin.ml.roomLabel")}</span>
                    <span className="font-medium">{locReadiness?.room_name || t("admin.ml.missing")}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-foreground-variant">{t("admin.ml.patient")}</span>
                    <span className="font-medium">{locReadiness?.patient_name || locReadiness?.patient_username || t("admin.ml.missing")}</span>
                  </div>
                </div>
                {locReadiness && locReadiness.missing.length > 0 && (
                  <p className="text-sm text-warning-foreground">
                    {t("admin.ml.missing")}: {locReadiness.missing.join(", ")}
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
                  {t("admin.ml.repairBaseline")}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t("admin.ml.localizationStrategy")}</Label>
                  <span className="text-xs text-muted-foreground">
                    {t("admin.ml.saved")}: <span className="font-semibold text-foreground">{locConfig?.strategy ?? "—"}</span>
                  </span>
                </div>
                <Select
                  value={locStrategy}
                  onValueChange={(v) => {
                    const next = v as "knn" | "max_rssi";
                    setLocStrategy(next);
                    setLocStrategyDirty(next !== locConfig?.strategy);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="knn">{t("admin.ml.strategyKnn")}</SelectItem>
                    <SelectItem value="max_rssi">{t("admin.ml.strategyStrongest")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-foreground-variant italic">
                  {locStrategy === "knn"
                    ? t("admin.ml.strategyKnnHint")
                    : t("admin.ml.strategyStrongestHint")}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={!locStrategyDirty}
                  onClick={() => void handleSaveLocalizationStrategy()}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {t("admin.ml.saveStrategy")}
                </Button>
              </div>

              <div className="surface-container-low p-4 rounded-xl space-y-2 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-variant">{t("clinical.table.status")}</span>
                  <Badge variant={locModel?.status === "ready" ? "default" : "secondary"}>
                    {locModel?.status === "ready" ? t("admin.ml.ready") : locModel?.status || t("admin.ml.unknown")}
                  </Badge>
                </div>
                {locModel?.status === "ready" && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">{t("admin.ml.trainedRooms")}</span>
                      <span className="font-bold">{locModel.rooms ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">{t("admin.ml.nodesBeacons")}</span>
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
                {t("admin.ml.retrainDatabase")}
              </Button>
              <p className="text-xs text-foreground-variant italic px-1 text-center">
                {t("admin.ml.retrainDatabaseHint")}
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
                {t("admin.ml.motionCollectorTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.ml.motionCollectorDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("admin.ml.targetWheelchair")}</Label>
                  <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("admin.ml.selectDevice")} />
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
                  <Label>{t("admin.ml.actionLabel")}</Label>
                  <Select value={motionLabel} onValueChange={setMotionLabel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="idle">{t("admin.ml.motionIdle")}</SelectItem>
                      <SelectItem value="straight">{t("admin.ml.motionStraight")}</SelectItem>
                      <SelectItem value="turn_left">{t("admin.ml.motionTurnLeft")}</SelectItem>
                      <SelectItem value="turn_right">{t("admin.ml.motionTurnRight")}</SelectItem>
                      <SelectItem value="reverse">{t("admin.ml.motionReverse")}</SelectItem>
                      <SelectItem value="fall">{t("admin.ml.motionFall")}</SelectItem>
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
                    <><Square className="w-5 h-5 mr-2 fill-current" /> {t("admin.ml.stopRecording")}</>
                  ) : (
                    <><Play className="w-5 h-5 mr-2 fill-current" /> {t("admin.ml.startRecording")}</>
                  )}
                </Button>
              </div>

              {isRecording && (
                <div className="flex items-center justify-center gap-2 p-4 bg-error-container/20 rounded-xl animate-pulse">
                  <div className="w-3 h-3 rounded-full bg-error" />
                  <span className="text-sm font-bold text-error">{t("admin.ml.liveRecording")}</span>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-sm font-bold">{t("admin.ml.modelLabelsStatus")}</h4>
                <div className="flex flex-wrap gap-2">
                  {motionModel?.labels?.map((l: string) => (
                    <Badge key={l} variant="default" className="bg-primary/20 text-primary border-primary/30">
                      {l}
                    </Badge>
                  ))}
                  {(!motionModel?.labels || motionModel?.labels.length === 0) && (
                    <span className="text-sm text-foreground-variant italic">{t("admin.ml.noLabels")}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("admin.ml.modelControl")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="surface-container-low p-4 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-foreground-variant">{t("admin.ml.trained")}</span>
                  <Badge variant={motionModel?.trained ? "default" : "secondary"}>
                    {motionModel?.trained ? t("admin.ml.ready") : t("admin.ml.notTrained")}
                  </Badge>
                </div>
                {motionModel?.trained && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">{t("admin.ml.accuracy")}</span>
                      <span className="font-bold">{((motionModel.accuracy ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground-variant">{t("admin.ml.samples")}</span>
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
                  {t("admin.ml.trainXgboost")}
                </Button>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" size="sm" onClick={handleSaveMotion} disabled={!motionModel?.trained}>
                    <Save className="w-4 h-4 mr-2" />
                    {t("common.save")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      await api.post("/motion/model/load", {});
                      showMsg(t("admin.ml.msgModelLoaded"), "success");
                      await refetchMotion();
                    } catch {
                      showMsg(t("admin.ml.msgNoSavedModel"), "error");
                    }
                  }}>
                    <Download className="w-4 h-4 mr-2" />
                    {t("admin.ml.load")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppPage>
  );
}
