/**
 * WheelSense Monitoring Dashboard
 * หน้าจอแสดงผลหลักสำหรับติดตามรถเข็นแบบ Real-time
 * 
 * แนวคิดใหม่: Node = Room (ไม่แยก)
 * เมื่อ Node online แสดง Room ทันทีบนแผนที่
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Activity, Radio, Users, AlertCircle, RefreshCw, Wifi, MapPin, Flame } from 'lucide-react';
import { useSensorData, useMapLayout, useSystemStats } from '../hooks/useApi';
import type { SensorData } from '../services/api';
import { NodeDetailModal } from './node-detail-modal';
import { SimpleMapViewer } from './simple-map-viewer';
import { toast } from 'sonner';

export function MonitoringDashboard() {
  // ดึงข้อมูลจาก API
  const { data: sensorData, loading, error, isConnected, isUpdating, refetch } = useSensorData();
  const { layout: mapLayout, refetch: refetchMap } = useMapLayout();
  const { stats, loading: statsLoading } = useSystemStats();
  
  // State สำหรับ UI
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [mqttLogs, setMqttLogs] = useState<any[]>([]);
  const [statsAnimating, setStatsAnimating] = useState<boolean>(false);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  
  // Refs
  const previousSensorData = useRef(new Map<string, string>());
  const mqttLogsRef = useRef<HTMLDivElement | null>(null);
  const MAX_LOGS = 50;

  // แสดง notification เมื่อเชื่อมต่อ
  useEffect(() => {
    if (isConnected) {
      toast.success('เชื่อมต่อ Real-time สำเร็จ', {
        description: 'ข้อมูลจะอัพเดทอัตโนมัติ',
        duration: 2000,
      });
    }
  }, [isConnected]);

  // Listen for map layout updates from Map Editor
  useEffect(() => {
    const handleMapUpdate = () => {
      refetchMap();
    };
    
    window.addEventListener('map-layout-updated', handleMapUpdate);
    return () => window.removeEventListener('map-layout-updated', handleMapUpdate);
  }, [refetchMap]);

  // สร้าง MQTT logs จากข้อมูล sensor (แบบ real-time)
  useEffect(() => {
    if (sensorData.length === 0) return;

    const newLogsToAdd: any[] = [];
    const currentTime = new Date();

    sensorData.forEach(sensor => {
      const sensorKey = `${sensor.node}-${sensor.wheel}`;
      const currentValue = JSON.stringify({
        rssi: sensor.rssi,
        distance: sensor.distance,
        motion: sensor.motion,
        direction: sensor.direction,
        status: sensor.status,
        ts: sensor.ts,
      });

      const previousValue = previousSensorData.current.get(sensorKey);

      // ถ้าข้อมูลเปลี่ยน ให้เพิ่ม log ใหม่
      if (previousValue !== currentValue) {
        previousSensorData.current.set(sensorKey, currentValue);

        newLogsToAdd.push({
          id: `${sensorKey}-${Date.now()}-${Math.random()}`,
          topic: `WheelSense/${sensor.node_label || `Node ${sensor.node}`}/${sensor.wheel_label || `Wheel ${sensor.wheel}`}`,
          payload: {
            rssi: sensor.rssi,
            direction: sensor.direction,
            motion: sensor.motion === 1,
            distance: sensor.distance,
            status: sensor.status,
            stale: sensor.stale,
            ts: sensor.ts,
          },
          timestamp: currentTime.toLocaleTimeString('th-TH', { hour12: false }),
          receivedAt: currentTime.toISOString(),
        });
      }
    });

    // เพิ่ม logs ใหม่ไปด้านบน
    if (newLogsToAdd.length > 0) {
      setMqttLogs(prevLogs => {
        const updatedLogs = [...newLogsToAdd, ...prevLogs];
        return updatedLogs.slice(0, MAX_LOGS);
      });
      
      // Animate stats
      setStatsAnimating(true);
      setTimeout(() => setStatsAnimating(false), 1000);
    }
  }, [sensorData]);

  // Auto-scroll MQTT logs
  useEffect(() => {
    if (mqttLogs.length > 0 && mqttLogsRef.current) {
      const scrollContainer = mqttLogsRef.current.closest('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [mqttLogs.length]);

  // **แนวคิดใหม่: Node = Room**
  // สร้าง rooms จาก nodes ที่ online โดยตรง (ไม่ต้องมี map_layout)
  const activeNodes = Array.from(new Set(sensorData.filter(s => !s.stale).map(s => s.node)));
  
  const rooms = activeNodes.map((nodeNum, index) => {
    const sensor = sensorData.find(s => s.node === nodeNum);
    const savedLayout = mapLayout.find(m => m.node === nodeNum);
    
    // ใช้ตำแหน่งจาก layout ถ้ามี ไม่งั้นสร้างอัตโนมัติ
    const col = index % 3;
    const row = Math.floor(index / 3);
    
    return {
      id: `room-${nodeNum}`,
      node: nodeNum,
      name: sensor?.node_label || `Node ${nodeNum}`,
      x: savedLayout?.x_pos ?? (100 + col * 250),
      y: savedLayout?.y_pos ?? (100 + row * 200),
      width: 200,
      height: 150,
      color: ['#e8f4ff', '#f0fdf4', '#fef3c7', '#ede9fe', '#fee2e2'][index % 5],
      online: true,
    };
  });

  // Wheelchairs ในแต่ละ room
  const wheelchairs = sensorData.filter(s => !s.stale).map(sensor => {
    const room = rooms.find(r => r.node === sensor.node);
    
    // วาง wheelchair ตรงกลาง room
    let x: number;
    let y: number;
    
    if (room) {
      // หาจำนวน wheels ใน room นี้
      const wheelsInRoom = sensorData.filter(s => s.node === sensor.node && !s.stale);
      const totalWheels = wheelsInRoom.length;
      const wheelIndex = wheelsInRoom.findIndex(w => w.wheel === sensor.wheel);
      
      if (totalWheels === 1) {
        // ถ้ามี wheel เดียว วางตรงกลางพอดี
        x = room.x + room.width / 2;
        y = room.y + room.height / 2;
      } else {
        // ถ้ามีหลาย wheels จัดเรียงแบบวงกลมรอบจุดกลาง
        const centerX = room.x + room.width / 2;
        const centerY = room.y + room.height / 2;
        const radius = 40; // รัศมีวงกลม
        const angle = (wheelIndex / totalWheels) * 2 * Math.PI - Math.PI / 2; // เริ่มจากด้านบน
        
        x = centerX + radius * Math.cos(angle);
        y = centerY + radius * Math.sin(angle);
      }
    } else {
      // ถ้าไม่มี room ให้วางตามตำแหน่งคงที่
      x = 200 + (sensor.node * 150) + (sensor.wheel * 50);
      y = 150 + (sensor.wheel * 80);
    }

    return {
      id: `${sensor.node}-${sensor.wheel}`,
      x,
      y,
      node: sensor.node,
      wheel: sensor.wheel,
      nodeLabel: sensor.node_label || `Node ${sensor.node}`,
      wheelLabel: sensor.wheel_label || `Wheel ${sensor.wheel}`,
      rssi: sensor.rssi || 0,
      motion: sensor.motion === 1,
      direction: sensor.direction || 0,
      distance: sensor.distance,
      stale: sensor.stale,
      sensorData: sensor,
    };
  });

  // คำนวณสีตาม RSSI
  const getRssiColor = (rssi: number) => {
    if (rssi >= -60) return '#00ff00'; // เขียว - สัญญาณดี
    if (rssi >= -75) return '#ffaa00'; // เหลือง - สัญญาณปานกลาง
    return '#ff0000'; // แดง - สัญญาณอ่อน
  };

  if (loading && sensorData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
          <p className="english-text text-xl">Loading Dashboard...</p>
          <p className="thai-text text-muted-foreground">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-center english-text text-xl mb-2">Connection Error</p>
            <p className="text-center thai-text text-muted-foreground mb-4">{error}</p>
            <button
              onClick={() => refetch()}
              className="mx-auto block px-4 py-2 bg-[#0056B3] text-white rounded hover:bg-[#004494]"
            >
              ลองใหม่
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#fafafa] overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* หัวเรื่องและสถานะการเชื่อมต่อ */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="english-text text-[#0056B3] flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Real-time Monitoring
              {isUpdating && <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />}
            </h2>
            <p className="thai-text text-muted-foreground">การติดตามแบบเรียลไทม์</p>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge className="bg-green-500 text-white animate-pulse">
                <Wifi className="h-3 w-3 mr-1" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="destructive">
                <Wifi className="h-3 w-3 mr-1" />
                OFFLINE
              </Badge>
            )}
          </div>
        </div>

        {/* Statistics Cards - Modern Minimal */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Online Rooms */}
          <Card className={`border border-gray-200 hover:border-gray-300 transition-all ${statsAnimating ? 'border-blue-400' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <MapPin className="h-5 w-5 text-gray-400" />
                {isConnected && <div className="h-2 w-2 bg-blue-500 rounded-full" />}
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {rooms.length}
              </div>
              <p className="text-sm text-gray-500">Active Rooms</p>
            </CardContent>
          </Card>

          {/* Active Wheelchairs */}
          <Card className={`border border-gray-200 hover:border-gray-300 transition-all ${statsAnimating ? 'border-green-400' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <Users className="h-5 w-5 text-gray-400" />
                {stats && stats.devices.moving > 0 && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <Activity className="h-3 w-3 animate-pulse" />
                    {stats.devices.moving}
                  </div>
                )}
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {statsLoading ? '-' : stats?.devices.online || 0}
              </div>
              <p className="text-sm text-gray-500">Online Devices</p>
            </CardContent>
          </Card>

          {/* Average Signal */}
          <Card className={`border border-gray-200 hover:border-gray-300 transition-all ${statsAnimating ? 'border-yellow-400' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <Wifi className="h-5 w-5 text-gray-400" />
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {statsLoading ? '-' : `${stats?.signal.average_rssi || '0'}`}
              </div>
              <p className="text-sm text-gray-500">Avg Signal (dBm)</p>
            </CardContent>
          </Card>

          {/* Weak Signals */}
          <Card className={`border border-gray-200 hover:border-gray-300 transition-all ${statsAnimating ? 'border-red-400' : ''}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <AlertCircle className="h-5 w-5 text-gray-400" />
                {stats && stats.signal.weak_signals > 0 && (
                  <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
              <div className="text-3xl font-light text-gray-900 mb-1">
                {statsLoading ? '-' : stats?.signal.weak_signals || 0}
              </div>
              <p className="text-sm text-gray-500">Signal Alerts</p>
            </CardContent>
          </Card>
        </div>

        {/* แผนที่และ MQTT Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* แผนที่ */}
          <Card className="lg:col-span-2 border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-gray-400" />
                  <div>
                    <span className="text-base font-medium text-gray-900">Floor Map</span>
                    {mapLayout.length > 0 && (
                      <span className="ml-2 text-xs text-gray-400">• Custom</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className={`text-xs px-3 py-1.5 border rounded transition-colors flex items-center gap-1.5 ${
                      showHeatmap
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Flame className="h-3 w-3" />
                    Heatmap
                  </button>
                  <span className="text-sm text-gray-500">{rooms.length} Rooms</span>
                  <button
                    onClick={() => {
                      const event = new CustomEvent('navigate', { detail: 'map-layout' });
                      window.dispatchEvent(event);
                    }}
                    className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rooms.length === 0 ? (
                <div className="bg-gray-50 rounded-lg border p-20 text-center">
                  <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <p className="text-muted-foreground">ไม่มี Node ออนไลน์</p>
                  <p className="text-sm text-muted-foreground">รอการเชื่อมต่อจากอุปกรณ์</p>
                </div>
              ) : (
                <SimpleMapViewer width={800} height={500} showControls={true}>
                  <defs>
                    {/* Grid Pattern - Minimal */}
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  
                  {/* Background */}
                  <rect width="800" height="500" fill="#fafafa" />
                  <rect width="800" height="500" fill="url(#grid)" />

                    {/* Rooms (= Nodes ที่ออนไลน์) */}
                    {rooms.map((room) => {
                      const roomSensors = sensorData.filter(s => s.node === room.node && !s.stale);
                      const avgRssi = roomSensors.length > 0
                        ? roomSensors.reduce((sum, s) => sum + (s.rssi || 0), 0) / roomSensors.length
                        : -60;
                      
                      // คำนวณ heatmap intensity ตามจำนวน devices และ motion
                      const movingCount = roomSensors.filter(s => s.motion === 1).length;
                      const heatIntensity = roomSensors.length === 0 ? 0 :
                        Math.min((roomSensors.length * 30 + movingCount * 40), 100);
                      
                      const getHeatmapColor = (intensity: number) => {
                        if (intensity === 0) return 'rgba(229, 231, 235, 0.3)'; // gray-200
                        if (intensity < 30) return 'rgba(134, 239, 172, 0.5)'; // green-300
                        if (intensity < 60) return 'rgba(253, 224, 71, 0.6)'; // yellow-300
                        if (intensity < 85) return 'rgba(251, 146, 60, 0.7)'; // orange-400
                        return 'rgba(239, 68, 68, 0.8)'; // red-500
                      };
                      
                      return (
                        <g key={room.id} className="room-group">
                          {/* Room Rectangle - Minimal with Heatmap */}
                          <rect
                            x={room.x}
                            y={room.y}
                            width={room.width}
                            height={room.height}
                            fill={showHeatmap ? getHeatmapColor(heatIntensity) : "white"}
                            stroke="#e5e7eb"
                            strokeWidth="1.5"
                            rx="8"
                            className="cursor-pointer hover:stroke-gray-400 transition-all"
                          />
                          
                          {/* Room Name */}
                          <text
                            x={room.x + room.width / 2}
                            y={room.y + 24}
                            textAnchor="middle"
                            className="text-sm font-medium fill-gray-700"
                            style={{ fontSize: '13px' }}
                          >
                            {room.name}
                          </text>
                          
                          {/* Device Count */}
                          <text
                            x={room.x + room.width / 2}
                            y={room.y + 42}
                            textAnchor="middle"
                            className="text-xs fill-gray-400"
                          >
                            {roomSensors.length} device{roomSensors.length !== 1 ? 's' : ''}
                          </text>

                          {/* Signal Indicator */}
                          <circle
                            cx={room.x + room.width - 15}
                            cy={room.y + 15}
                            r="3"
                            fill={getRssiColor(avgRssi)}
                            className="opacity-80"
                          />
                        </g>
                      );
                    })}

                    {/* Wheelchairs - Minimal */}
                    {wheelchairs.map((wc) => (
                      <g
                        key={wc.id}
                        onClick={() => {
                          setSelectedSensor(wc.sensorData);
                          setDetailOpen(true);
                        }}
                        className="wheelchair-icon cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        {/* Motion Ring */}
                        {wc.motion && (
                          <circle
                            cx={wc.x}
                            cy={wc.y}
                            r="14"
                            fill="none"
                            stroke="#22c55e"
                            strokeWidth="1.5"
                            opacity="0.5"
                            className="animate-ping"
                          />
                        )}
                        
                        {/* Wheelchair Circle */}
                        <circle
                          cx={wc.x}
                          cy={wc.y}
                          r="10"
                          fill={wc.motion ? '#22c55e' : '#3b82f6'}
                          stroke="white"
                          strokeWidth="2"
                        />
                        
                        {/* Label */}
                        <text
                          x={wc.x}
                          y={wc.y - 16}
                          textAnchor="middle"
                          className="text-xs font-medium fill-gray-700"
                          style={{ fontSize: '11px' }}
                        >
                          {wc.wheelLabel}
                        </text>
                        
                        {/* Distance */}
                        {wc.distance !== null && wc.distance !== undefined && (
                          <text
                            x={wc.x}
                            y={wc.y + 24}
                            textAnchor="middle"
                            className="text-[10px] fill-gray-500"
                          >
                            {wc.distance.toFixed(1)}m
                          </text>
                        )}
                      </g>
                    ))}
                </SimpleMapViewer>
              )}
            </CardContent>
          </Card>

          {/* MQTT Logs */}
          <Card className="border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Radio className="h-5 w-5 text-gray-400" />
                  <div>
                    <span className="text-base font-medium text-gray-900">Telemetry</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {mqttLogs.length} events
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isConnected && (
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  )}
                  <button
                    onClick={() => {
                      setMqttLogs([]);
                      previousSensorData.current.clear();
                      toast.info('ล้าง MQTT logs แล้ว');
                    }}
                    className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div ref={mqttLogsRef} className="space-y-2">
                  {mqttLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                      <Activity className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">Waiting for telemetry data...</p>
                      <p className="text-xs">รอข้อมูล telemetry</p>
                    </div>
                  ) : (
                    mqttLogs.map((log, idx) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded border transition-all ${
                          idx === 0 ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-500 font-mono">{log.timestamp}</span>
                          {idx === 0 && (
                            <div className="h-1.5 w-1.5 bg-blue-500 rounded-full animate-pulse" />
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mb-1 font-medium">
                          {log.topic}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">RSSI:</span>
                            <span className="ml-1 text-gray-700">{log.payload.rssi} dBm</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Distance:</span>
                            <span className="ml-1 text-gray-700">{log.payload.distance}m</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Motion:</span>
                            <span className="ml-1 text-gray-700">{log.payload.motion ? 'Yes' : 'No'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Status:</span>
                            <span className="ml-1 text-gray-700">{log.payload.status}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedSensor && (
        <NodeDetailModal
          sensor={selectedSensor}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}
