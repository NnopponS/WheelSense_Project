/**
 * WheelSense Monitoring Dashboard
 * หน้าจอแสดงผลหลักสำหรับติดตามรถเข็นแบบ Real-time
 * 
 * แนวคิดใหม่: Node = Room (ไม่แยก)
 * เมื่อ Node online แสดง Room ทันทีบนแผนที่
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Activity, Radio, Users, AlertCircle, RefreshCw, Wifi, MapPin } from 'lucide-react';
import { useSensorData, useSystemStats } from '../hooks/useApi';
import type { SensorData } from '../services/api';
import { NodeDetailModal } from './node-detail-modal';
import { SystemMap } from './system-map';
import { toast } from 'sonner';

export function MonitoringDashboard() {
  // ดึงข้อมูลจาก API
  const { data: sensorData, loading, error, isConnected, isUpdating, refetch } = useSensorData();
  const { stats, loading: statsLoading } = useSystemStats();
  
  // State สำหรับ UI
  const [selectedSensor, setSelectedSensor] = useState(null as SensorData | null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [mqttLogs, setMqttLogs] = useState([] as any[]);
  const [statsAnimating, setStatsAnimating] = useState(false);
  
  // Refs
  const previousSensorData = useRef(new Map() as Map<string, string>);
  const mqttLogsRef = useRef(null as HTMLDivElement | null);
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

  // คำนวณจำนวน rooms จาก active nodes
  const activeNodes = Array.from(new Set(sensorData.filter(s => !s.stale).map(s => s.node)));
  const roomsCount = activeNodes.length;

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
                {roomsCount}
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

        {/* System Map */}
        <SystemMap compact={true} />

        {/* รายการอุปกรณ์และ MQTT Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* รายการอุปกรณ์ */}
          <Card className="lg:col-span-2 border border-gray-200">
            <CardHeader className="border-b border-gray-100">
              <CardTitle className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-gray-400" />
                <div>
                  <span className="text-base font-medium text-gray-900">Active Devices</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {sensorData.filter(s => !s.stale).length} online
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {sensorData.length === 0 ? (
                <div className="bg-gray-50 rounded-lg border p-20 text-center">
                  <Activity className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                  <p className="text-muted-foreground">ไม่มีอุปกรณ์ออนไลน์</p>
                  <p className="text-sm text-muted-foreground">รอการเชื่อมต่อจากอุปกรณ์</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sensorData
                    .filter(s => !s.stale)
                    .map(sensor => (
                      <div
                        key={`${sensor.node}-${sensor.wheel}`}
                        onClick={() => {
                          setSelectedSensor(sensor);
                          setDetailOpen(true);
                        }}
                        className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-3 w-3 rounded-full ${sensor.motion === 1 ? 'bg-green-500 animate-pulse' : 'bg-blue-500'}`} />
                            <div>
                              <p className="font-medium text-gray-900">
                                {sensor.node_label || `Node ${sensor.node}`}
                              </p>
                              <p className="text-sm text-gray-500">
                                {sensor.wheel_label || `Wheel ${sensor.wheel}`}
                              </p>
                            </div>
                          </div>
                          <Badge variant={sensor.motion === 1 ? 'default' : 'secondary'}>
                            {sensor.motion === 1 ? 'Moving' : 'Idle'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-gray-500">Distance</p>
                            <p className="font-medium text-gray-900">
                              {sensor.distance?.toFixed(2) || '-'} m
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">RSSI</p>
                            <p className="font-medium text-gray-900">
                              {sensor.rssi || '-'} dBm
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Status</p>
                            <p className="font-medium text-gray-900">
                              {sensor.status || '-'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
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
