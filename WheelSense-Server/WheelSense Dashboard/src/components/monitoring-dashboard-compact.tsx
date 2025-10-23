/**
 * Monitoring Dashboard - Compact Version
 * แสดงข้อมูลแบบกระชับ พร้อม 2 โหมดการดู: Node-View และ Wheel-View
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Activity, Radio, Users, AlertCircle, RefreshCw, Wifi, MapPin, Building2, Layers } from 'lucide-react';
import { useSensorData, useSystemStats } from '../hooks/useApi';
import type { SensorData, Building, Floor } from '../services/api';
import { getBuildings, getFloors } from '../services/api';
import { NodeDetailModal } from './node-detail-modal';
import { SystemMap } from './system-map';
import { toast } from 'sonner';

export function MonitoringDashboardCompact() {
  const { data: sensorData, loading, error, isConnected, isUpdating, refetch } = useSensorData();
  const { stats, loading: statsLoading } = useSystemStats();
  
  const [selectedSensor, setSelectedSensor] = useState(null as SensorData | null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'node' | 'wheel'>('node');
  
  // Building and Floor selection
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);

  // Load buildings on mount
  useEffect(() => {
    const loadBuildings = async () => {
      try {
        const buildingsData = await getBuildings();
        setBuildings(buildingsData);
        
        // Auto-select first building
        if (buildingsData.length > 0) {
          setSelectedBuilding(buildingsData[0].id);
        }
      } catch (error) {
        console.error('Failed to load buildings:', error);
      }
    };
    loadBuildings();
  }, []);

  // Load floors when building changes
  useEffect(() => {
    const loadFloors = async () => {
      if (!selectedBuilding) {
        setFloors([]);
        setSelectedFloor(null);
        return;
      }
      
      try {
        const floorsData = await getFloors(selectedBuilding);
        setFloors(floorsData);
        
        // Auto-select first floor
        if (floorsData.length > 0) {
          setSelectedFloor(floorsData[0].id);
        } else {
          setSelectedFloor(null);
        }
      } catch (error) {
        console.error('Failed to load floors:', error);
      }
    };
    loadFloors();
  }, [selectedBuilding]);

  // Group data by node
  const nodeGroups = new Map<number, SensorData[]>();
  sensorData.forEach(sensor => {
    if (!nodeGroups.has(sensor.node)) {
      nodeGroups.set(sensor.node, []);
    }
    nodeGroups.get(sensor.node)!.push(sensor);
  });

  // Group active data by wheel
  const wheelGroups = new Map<number, SensorData[]>();
  sensorData.filter(s => !s.stale).forEach(sensor => {
    if (!wheelGroups.has(sensor.wheel)) {
      wheelGroups.set(sensor.wheel, []);
    }
    wheelGroups.get(sensor.wheel)!.push(sensor);
  });

  // Get best location for each wheelchair (highest RSSI)
  const wheelchairLocations = new Map<number, SensorData>();
  wheelGroups.forEach((sensors, wheel) => {
    if (sensors.length > 0) {
      const best = sensors.reduce((best, current) => {
        if (current.rssi === null) return best;
        if (best.rssi === null) return current;
        return current.rssi > best.rssi ? current : best;
      });
      wheelchairLocations.set(wheel, best);
    }
  });

  if (loading && sensorData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
          <p className="text-xl">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="border-red-500 max-w-md">
          <CardContent className="pt-6">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-center text-xl mb-2">Connection Error</p>
            <p className="text-center text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => refetch()} className="w-full">
              ลองใหม่
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#fafafa] overflow-auto">
      <div className="container mx-auto p-4 space-y-4">
        {/* Header - Compact */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0056B3] to-[#00945E] flex items-center justify-center">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0056B3] flex items-center gap-2">
                Real-time Monitoring
                {isUpdating && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge className="bg-green-500 text-white">
                <Wifi className="h-3 w-3 mr-1" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="destructive">OFFLINE</Badge>
            )}
          </div>
        </div>

        {/* Compact Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-gray-200">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Active Rooms</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {Array.from(new Set(sensorData.filter(s => !s.stale).map(s => s.node))).length}
                  </p>
                </div>
                <MapPin className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Wheelchairs</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {statsLoading ? '-' : stats?.devices.online || 0}
                  </p>
                </div>
                <Users className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Avg Signal</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {statsLoading ? '-' : stats?.signal.average_rssi || '0'}
                  </p>
                </div>
                <Wifi className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Alerts</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {statsLoading ? '-' : stats?.signal.weak_signals || 0}
                  </p>
                </div>
                <AlertCircle className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Map */}
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                System Map
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Building and Floor Selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Building</Label>
                <Select
                  value={selectedBuilding?.toString() || ''}
                  onValueChange={(value) => setSelectedBuilding(parseInt(value))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select building" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildings.map(building => (
                      <SelectItem key={building.id} value={building.id.toString()}>
                        {building.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Floor</Label>
                <Select
                  value={selectedFloor?.toString() || ''}
                  onValueChange={(value) => setSelectedFloor(parseInt(value))}
                  disabled={!selectedBuilding || floors.length === 0}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select floor" />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map(floor => (
                      <SelectItem key={floor.id} value={floor.id.toString()}>
                        {floor.name} (Floor {floor.floor_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Map Component */}
            <SystemMap 
              compact={true} 
              selectedFloorId={selectedFloor || undefined}
              selectedBuildingId={selectedBuilding || undefined}
            />
          </CardContent>
        </Card>

        {/* 2 View Modes: Node-View & Wheel-View */}
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Device Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'node' | 'wheel')}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="node" className="text-sm">
                  <Building2 className="h-4 w-4 mr-2" />
                  Node View
                </TabsTrigger>
                <TabsTrigger value="wheel" className="text-sm">
                  <Users className="h-4 w-4 mr-2" />
                  Wheelchair View
                </TabsTrigger>
              </TabsList>

              {/* Node View: แสดงว่า Node นั้นเจอ Wheel ไหนบ้าง */}
              <TabsContent value="node" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {Array.from(nodeGroups.entries())
                      .filter(([_, sensors]) => sensors.some(s => !s.stale))
                      .map(([nodeId, sensors]) => {
                        const activeSensors = sensors.filter(s => !s.stale);
                        const nodeLabel = activeSensors[0]?.node_label || `Node ${nodeId}`;
                        
                        return (
                          <Card key={nodeId} className="border-gray-200 hover:border-blue-300 transition-colors">
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-blue-600" />
                                  <span className="font-semibold text-gray-900">{nodeLabel}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {activeSensors.length} wheel(s)
                                  </Badge>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {activeSensors.map(sensor => (
                                  <button
                                    key={`${sensor.node}-${sensor.wheel}`}
                                    onClick={() => {
                                      setSelectedSensor(sensor);
                                      setDetailOpen(true);
                                    }}
                                    className="p-2 bg-gray-50 hover:bg-blue-50 rounded border border-gray-200 hover:border-blue-300 text-left transition-colors"
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs">♿</span>
                                      <span className="text-xs font-medium text-gray-900">
                                        {sensor.wheel_label || `Wheel ${sensor.wheel}`}
                                      </span>
                                      {sensor.motion === 1 && (
                                        <Activity className="h-3 w-3 text-green-600" />
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      {sensor.rssi} dBm
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Wheel View: แสดงว่า Wheel นั้นอยู่ห้องไหน และสถานะเป็นยังไง */}
              <TabsContent value="wheel" className="mt-0">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {Array.from(wheelchairLocations.entries()).map(([wheelId, sensor]) => {
                      const allSensors = wheelGroups.get(wheelId) || [];
                      
                      return (
                        <Card key={wheelId} className="border-gray-200 hover:border-green-300 transition-colors">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">♿</span>
                                <span className="font-semibold text-gray-900">
                                  {sensor.wheel_label || `Wheel ${wheelId}`}
                                </span>
                                {sensor.motion === 1 && (
                                  <Badge className="bg-green-500 text-xs">Moving</Badge>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedSensor(sensor);
                                  setDetailOpen(true);
                                }}
                                className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                              >
                                Details
                              </button>
                            </div>
                            
                            {/* Current Location */}
                            <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4 text-blue-600" />
                                  <span className="text-sm font-medium text-blue-900">
                                    {sensor.node_label || `Room ${sensor.node}`}
                                  </span>
                                </div>
                                <Badge variant="outline" className="text-xs bg-white">
                                  RSSI: {sensor.rssi} dBm
                                </Badge>
                              </div>
                            </div>

                            {/* All detected nodes */}
                            {allSensors.length > 1 && (
                              <div className="text-xs text-gray-600">
                                <p className="mb-1">Detected by {allSensors.length} nodes:</p>
                                <div className="flex flex-wrap gap-1">
                                  {allSensors.map(s => (
                                    <span
                                      key={s.node}
                                      className={`px-1.5 py-0.5 rounded ${
                                        s.node === sensor.node
                                          ? 'bg-blue-100 text-blue-700 font-medium'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {s.node_label || `N${s.node}`} ({s.rssi})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}

                    {wheelchairLocations.size === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
                        <p>No active wheelchairs</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
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

