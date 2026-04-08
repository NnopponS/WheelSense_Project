"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@/hooks/useQuery";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
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
  Terminal
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
  node_device_id: string | null;
}

interface Device {
  id: number;
  device_id: string;
  hardware_type: string;
  display_name: string;
}

interface LocalizationModelInfo {
  status?: string;
  rooms?: number;
  nodes?: string[];
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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("localization");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  
  // States for Motion
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [motionLabel, setMotionLabel] = useState<string>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<string | null>(null);

  // Queries
  const roomsEndpoint = useMemo(() => withWorkspaceScope("/rooms", user?.workspace_id), [user?.workspace_id]);
  const devicesEndpoint = useMemo(() => withWorkspaceScope("/devices?hardware_type=wheelchair", user?.workspace_id), [user?.workspace_id]);
  const locModelEndpoint = useMemo(() => withWorkspaceScope("/localization", user?.workspace_id), [user?.workspace_id]);
  const motionModelEndpoint = useMemo(() => withWorkspaceScope("/motion/model", user?.workspace_id), [user?.workspace_id]);

  const { data: rooms } = useQuery<Room[]>(roomsEndpoint);
  const { data: devices } = useQuery<Device[]>(devicesEndpoint);
  const { data: locModel, refetch: refetchLoc } = useQuery<LocalizationModelInfo>(locModelEndpoint);
  const { data: motionModel, refetch: refetchMotion } = useQuery<MotionModelInfo>(motionModelEndpoint);

  const showMsg = (text: string, type: "success" | "error" | "info" = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Handlers for Localization
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
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <Cpu className="w-6 h-6 text-primary" />
          ML Calibration
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
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
          Localization (KNN)
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
          <Card className="lg:col-span-2">
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
                  {rooms?.map((room) => (
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
                          <span className="text-xs text-on-surface-variant">No Data</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!rooms || rooms.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-on-surface-variant italic">
                        No rooms configured. Go to Facility Management to add rooms.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Model Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="surface-container-low p-4 rounded-xl space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Status</span>
                  <Badge variant={locModel?.status === "ready" ? "default" : "secondary"}>
                    {locModel?.status || "Unknown"}
                  </Badge>
                </div>
                {locModel?.status === "ready" && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Trained Rooms</span>
                      <span className="font-bold">{locModel.rooms ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Nodes (Beacons)</span>
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
              <p className="text-[10px] text-on-surface-variant italic px-1 text-center">
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
                    <span className="text-xs text-on-surface-variant italic">No labels trained yet.</span>
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
                  <span className="text-on-surface-variant">Trained</span>
                  <Badge variant={motionModel?.trained ? "default" : "secondary"}>
                    {motionModel?.trained ? "Ready" : "Not Trained"}
                  </Badge>
                </div>
                {motionModel?.trained && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Accuracy</span>
                      <span className="font-bold">{((motionModel.accuracy ?? 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant">Samples</span>
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
