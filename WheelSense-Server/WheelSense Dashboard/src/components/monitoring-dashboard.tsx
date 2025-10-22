import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Activity, Radio, Users, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { useSensorData, useMapLayout, useDeviceStats } from '../hooks/useApi';
import { SensorData } from '../services/api';
import { NodeDetailModal } from './node-detail-modal';

interface WheelchairPosition {
  id: string;
  x: number;
  y: number;
  room: string;
  rssi: number;
  direction: number;
  motion: boolean;
  nodeLabel: string;
  wheelLabel: string;
}

interface RoomNode {
  id: string;
  room: string;
  x: number;
  y: number;
  rssi: number;
  nodeLabel: string;
}

export function MonitoringDashboard() {
  const { data: sensorData, loading, error, lastUpdate, refetch } = useSensorData();
  const { layout: mapLayout, loading: layoutLoading } = useMapLayout();
  const stats = useDeviceStats(sensorData);
  
  const [mqttLogs, setMqttLogs] = useState<any[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null);

  // Make sensor data globally accessible for Map Import action
  useEffect(() => {
    const globalAny: any = window as any;
    globalAny.__SENSOR_DATA = sensorData;
  }, [sensorData]);

  const rooms = mapLayout.map(room => ({
    id: `room-${room.room_id}`,
    name: room.room_name,
    x: room.x_pos,
    y: room.y_pos,
    width: 200,
    height: 150,
    color: '#e8f4ff'
  }));

  // Convert sensor data to wheelchair positions
  const wheelchairs: WheelchairPosition[] = sensorData.map((sensor: SensorData) => {
    const room = rooms.find(r => r.name === sensor.node_label);
    const x = room ? room.x + Math.random() * room.width : 200 + (sensor.node_id * 150);
    const y = room ? room.y + Math.random() * room.height : 150 + (sensor.wheel_id * 100);

    return {
      id: `${sensor.node_label || `Room ${sensor.node_id}`}-${sensor.wheel_label || `Wheel ${sensor.wheel_id}`}`,
      x,
      y,
      room: sensor.node_label || `Room ${sensor.node_id}`,
      rssi: sensor.rssi,
      direction: sensor.direction,
      motion: sensor.motion === 1,
      nodeLabel: sensor.node_label || `Room ${sensor.node_id}`,
      wheelLabel: sensor.wheel_label || `Wheel ${sensor.wheel_id}`,
    };
  });

  // Convert sensor data to room nodes
  const nodes: RoomNode[] = Array.from(new Set(sensorData.map(s => s.node_id))).map(nodeId => {
    const sensor = sensorData.find(s => s.node_id === nodeId);
    const room = rooms.find(r => r.name === sensor?.node_label);
    const x = room ? room.x + room.width / 2 : 150 + (nodeId * 150);
    const y = room ? room.y + 20 : 140;

    return {
      id: `N-${nodeId}`,
      room: sensor?.node_label || `Room ${nodeId}`,
      x,
      y,
      rssi: sensor?.rssi || -60,
      nodeLabel: sensor?.node_label || `Room ${nodeId}`,
    };
  });

  // Generate MQTT logs from real sensor data
  useEffect(() => {
    if (sensorData.length > 0) {
      const newLogs = sensorData.slice(0, 5).map(sensor => ({
        topic: `wheelsense/wheelchair/${sensor.node_label || `Room-${sensor.node_id}`}-${sensor.wheel_label || `Wheel-${sensor.wheel_id}`}/telemetry`,
        payload: {
          rssi: sensor.rssi,
          direction: sensor.direction,
          motion: sensor.motion === 1,
          distance: sensor.distance,
          status: sensor.status,
          stale: sensor.stale,
          ts: sensor.ts,
        },
        timestamp: new Date(sensor.received_at).toLocaleTimeString('en-US', { hour12: false }),
      }));
      setMqttLogs(newLogs);
    }
  }, [sensorData]);

  const getRSSIColor = (rssi: number) => {
    if (rssi >= -60) return '#00945E';
    if (rssi >= -75) return '#fbbf24';
    return '#dc2626';
  };

  const getRSSILabel = (rssi: number) => {
    if (rssi >= -60) return 'Good';
    if (rssi >= -75) return 'Medium';
    return 'Poor';
  };

  return (
    <div className="h-full bg-[#fafafa]">
      <div className="container mx-auto p-6 space-y-6">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-[#0056B3]" />
              <span className="text-[#0056B3]">Loading sensor data...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <span className="text-red-700">Error: {error}</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!loading && !error && (
          <>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="english-text text-[#0056B3]">WheelSense Monitoring Dashboard</h2>
            <p className="thai-text text-muted-foreground">แดชบอร์ดติดตามระบบ WheelSense</p>
            {lastUpdate && (
              <p className="text-xs text-muted-foreground mt-1">
                Last update: {lastUpdate.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refetch}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Badge className={`h-10 px-4 ${error ? 'bg-red-500' : 'bg-[#00945E]'} text-white`}>
              <Activity className="mr-2 h-4 w-4" />
              {error ? 'Connection Error' : 'MQTT Broker: Connected ✅'}
            </Badge>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-[#0056B3]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Radio className="h-4 w-4" />
                <span className="english-text">Connected Nodes</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-[#0056B3]">{stats.totalNodes}</div>
              <p className="text-xs text-muted-foreground mt-1 thai-text">โหนดที่เชื่อมต่อ</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-[#00945E]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span className="english-text">Active Wheelchairs</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-[#00945E]">{stats.activeWheelchairs}</div>
              <p className="text-xs text-muted-foreground mt-1 thai-text">รถเข็นที่ใช้งาน</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-[#3b82f6]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="english-text">Online Devices</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-[#3b82f6]">{stats.onlineDevices}</div>
              <p className="text-xs text-muted-foreground mt-1 thai-text">อุปกรณ์ออนไลน์</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-[#fbbf24]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span className="english-text">Signal Alerts</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl text-[#fbbf24]">{stats.alerts}</div>
              <p className="text-xs text-muted-foreground mt-1 thai-text">สัญญาณอ่อน</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Floor Map */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div>
                  <span className="english-text">Real-time Floor Map</span>
                  <p className="thai-text text-sm text-muted-foreground">แผนที่ชั้นแบบเรียลไทม์</p>
                </div>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#00945E]" />
                    <span>Good (≥-60)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#fbbf24]" />
                    <span>Medium (-60 to -75)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#dc2626]" />
                    <span>Poor {"(<-75)"}</span>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full h-[600px] bg-white border-2 border-border rounded-lg overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 900 650">
                  {/* Rooms */}
                  {rooms.map((room) => (
                    <g key={room.id}>
                      <rect
                        x={room.x}
                        y={room.y}
                        width={room.width}
                        height={room.height}
                        fill={room.color}
                        stroke="#0056B3"
                        strokeWidth="2"
                        rx="8"
                      />
                      <text
                        x={room.x + room.width / 2}
                        y={room.y + room.height / 2}
                        textAnchor="middle"
                        className="english-text"
                        fill="#1a1a1a"
                        fontSize="14"
                      >
                        {room.name}
                      </text>
                    </g>
                  ))}

                  {/* Nodes */}
                  {nodes.map((node) => (
                    <g key={node.id} onClick={() => {
                      const s = sensorData.find(x => (x.node_label || `Room ${x.node_id}`) === node.nodeLabel);
                      if (s) {
                        setSelectedSensor(s);
                        setDetailOpen(true);
                      }
                    }} style={{ cursor: 'pointer' }}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="12"
                        fill={getRSSIColor(node.rssi)}
                        stroke="white"
                        strokeWidth="2"
                      />
                      <text
                        x={node.x}
                        y={node.y + 25}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#666"
                        className="english-text"
                      >
                        {node.nodeLabel}
                      </text>
                      <text
                        x={node.x}
                        y={node.y + 38}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#999"
                      >
                        {node.rssi} dBm
                      </text>
                    </g>
                  ))}

                  {/* Wheelchairs */}
                  {wheelchairs.map((wc) => (
                    <g key={wc.id}>
                      <circle cx={wc.x} cy={wc.y} r="20" fill="#0056B3" opacity="0.2" />
                      <circle cx={wc.x} cy={wc.y} r="15" fill="#0056B3" />
                      <text
                        x={wc.x}
                        y={wc.y + 4}
                        textAnchor="middle"
                        fill="white"
                        fontSize="10"
                        className="english-text"
                      >
                        ♿
                      </text>
                      <text
                        x={wc.x}
                        y={wc.y - 25}
                        textAnchor="middle"
                        fontSize="11"
                        className="english-text"
                        fill="#0056B3"
                      >
                        {wc.wheelLabel}
                      </text>
                      <text
                        x={wc.x}
                        y={wc.y - 35}
                        textAnchor="middle"
                        fontSize="9"
                        className="english-text"
                        fill="#666"
                      >
                        {wc.nodeLabel}
                      </text>
                      {/* Direction arrow */}
                      <line
                        x1={wc.x}
                        y1={wc.y}
                        x2={wc.x + Math.cos((wc.direction * Math.PI) / 180) * 25}
                        y2={wc.y + Math.sin((wc.direction * Math.PI) / 180) * 25}
                        stroke="#00945E"
                        strokeWidth="3"
                        markerEnd="url(#arrowhead)"
                      />
                      {/* Route latency badge */}
                      <text
                        x={wc.x + 20}
                        y={wc.y - 20}
                        fontSize="9"
                        fill="#3b82f6"
                      >
                        {`${sensorData.find(s => (s.node_label || `Room ${s.node_id}`) === wc.nodeLabel && (s.wheel_label || `Wheel ${s.wheel_id}`) === wc.wheelLabel)?.route_latency_ms ?? 0} ms`}
                      </text>
                    </g>
                  ))}

                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="10"
                      refX="9"
                      refY="3"
                      orient="auto"
                    >
                      <polygon points="0 0, 10 3, 0 6" fill="#00945E" />
                    </marker>
                  </defs>
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* MQTT Logs */}
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="english-text">MQTT Telemetry Logs</span>
                <p className="thai-text text-sm text-muted-foreground">บันทึก Telemetry</p>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {mqttLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className="bg-[#1a1a1a] text-[#00ff00] p-3 rounded-lg text-xs font-mono"
                    >
                      <div className="text-[#fbbf24] mb-1">[{log.timestamp}]</div>
                      <div className="mb-1">
                        <span className="text-[#00945E]">topic:</span> "{log.topic}"
                      </div>
                      <div>
                        <span className="text-[#00945E]">payload:</span>{' '}
                        {JSON.stringify(log.payload, null, 2)}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
        <NodeDetailModal open={detailOpen} onOpenChange={setDetailOpen} sensor={selectedSensor} />
          </>
        )}
      </div>
    </div>
  );
}
