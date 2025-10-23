/**
 * Timeline Screen
 * แสดงกราฟและประวัติข้อมูล sensor
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useSensorData } from '../hooks/useApi';
import { getSensorHistory } from '../services/api';
import type { HistoryDataPoint } from '../services/api';
import { LineChart, Clock, TrendingUp, Activity, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function TimelineScreen() {
  const { data: sensorData, loading: sensorsLoading } = useSensorData();
  
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [selectedWheel, setSelectedWheel] = useState<number | null>(null);
  const [historyData, setHistoryData] = useState<HistoryDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(100);

  // เมื่อเลือก sensor
  useEffect(() => {
    if (selectedNode !== null && selectedWheel !== null) {
      loadHistory(selectedNode, selectedWheel, limit);
    }
  }, [selectedNode, selectedWheel, limit]);

  // โหลดข้อมูลประวัติ
  const loadHistory = async (node: number, wheel: number, limitNum: number) => {
    try {
      setLoading(true);
      const data = await getSensorHistory(node, wheel, limitNum);
      setHistoryData(data);
    } catch (error) {
      console.error('Error loading history:', error);
      toast.error('โหลดข้อมูลประวัติไม่สำเร็จ');
      setHistoryData([]);
    } finally {
      setLoading(false);
    }
  };

  // หา unique nodes และ wheels
  const uniqueNodes = Array.from(new Set(sensorData.map(s => s.node))).sort((a, b) => a - b);
  const availableWheels = selectedNode
    ? sensorData.filter(s => s.node === selectedNode).map(s => s.wheel).sort((a, b) => a - b)
    : [];

  // เลือก node แรกโดยอัตโนมัติ
  useEffect(() => {
    if (uniqueNodes.length > 0 && selectedNode === null) {
      setSelectedNode(uniqueNodes[0]);
    }
  }, [uniqueNodes.length]);

  // เลือก wheel แรกโดยอัตโนมัติ
  useEffect(() => {
    if (availableWheels.length > 0 && selectedWheel === null && selectedNode !== null) {
      setSelectedWheel(availableWheels[0]);
    }
  }, [availableWheels.length, selectedNode]);

  // คำนวณค่าสถิติ
  const stats = historyData.length > 0 ? {
    avgDistance: (historyData.reduce((sum, d) => sum + (d.distance || 0), 0) / historyData.length).toFixed(2),
    avgRssi: (historyData.reduce((sum, d) => sum + (d.rssi || 0), 0) / historyData.length).toFixed(1),
    maxDistance: Math.max(...historyData.map(d => d.distance || 0)).toFixed(2),
    minDistance: Math.min(...historyData.filter(d => d.distance !== null && d.distance > 0).map(d => d.distance || 0)).toFixed(2),
    maxRssi: Math.max(...historyData.map(d => d.rssi || -100)),
    minRssi: Math.min(...historyData.filter(d => d.rssi !== null).map(d => d.rssi || 0)),
    totalMovement: historyData.filter(d => d.motion === 1).length,
  } : null;

  // สร้าง SVG path สำหรับกราฟ
  const createPath = (dataPoints: number[], maxValue: number, height: number) => {
    if (dataPoints.length === 0 || maxValue === 0) return '';
    
    const width = 800;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const xStep = chartWidth / Math.max(dataPoints.length - 1, 1);
    const yScale = chartHeight / maxValue;
    
    const points = dataPoints.map((value, index) => {
      const x = padding + index * xStep;
      const y = height - padding - value * yScale;
      return `${x},${y}`;
    }).join(' L ');
    
    return `M ${points}`;
  };

  if (sensorsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
          <p className="english-text text-xl">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#fafafa] overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="english-text text-[#0056B3] flex items-center gap-2">
            <LineChart className="h-6 w-6" />
            Historical Data Timeline
          </h2>
          <p className="thai-text text-muted-foreground">ประวัติข้อมูลและกราฟ</p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Device</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Node</label>
                <Select
                  value={selectedNode?.toString() || ''}
                  onValueChange={(value) => {
                    setSelectedNode(parseInt(value));
                    setSelectedWheel(null);
                    setHistoryData([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Node" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueNodes.map((node) => {
                      const sensor = sensorData.find(s => s.node === node);
                      return (
                        <SelectItem key={node} value={node.toString()}>
                          {sensor?.node_label || `Node ${node}`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Wheelchair</label>
                <Select
                  value={selectedWheel?.toString() || ''}
                  onValueChange={(value) => setSelectedWheel(parseInt(value))}
                  disabled={!selectedNode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Wheelchair" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWheels.map((wheel) => {
                      const sensor = sensorData.find(s => s.node === selectedNode && s.wheel === wheel);
                      return (
                        <SelectItem key={wheel} value={wheel.toString()}>
                          {sensor?.wheel_label || `Wheel ${wheel}`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Data Points</label>
                <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50 points</SelectItem>
                    <SelectItem value="100">100 points</SelectItem>
                    <SelectItem value="200">200 points</SelectItem>
                    <SelectItem value="500">500 points</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Distance</p>
                    <p className="text-2xl font-bold text-blue-600">{stats.avgDistance} m</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg RSSI</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.avgRssi} dBm</p>
                  </div>
                  <Activity className="h-8 w-8 text-yellow-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Movement Events</p>
                    <p className="text-2xl font-bold text-green-600">{stats.totalMovement}</p>
                  </div>
                  <Activity className="h-8 w-8 text-green-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Data Points</p>
                    <p className="text-2xl font-bold text-purple-600">{historyData.length}</p>
                  </div>
                  <Clock className="h-8 w-8 text-purple-600 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Charts */}
        {loading ? (
          <Card>
            <CardContent className="py-20 text-center">
              <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
              <p className="text-muted-foreground">กำลังโหลดข้อมูล...</p>
            </CardContent>
          </Card>
        ) : historyData.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <LineChart className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">ไม่มีข้อมูลประวัติ</p>
              <p className="text-sm text-muted-foreground">เลือก Node และ Wheelchair เพื่อดูข้อมูล</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Distance Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="english-text text-base">Distance Over Time</CardTitle>
                <p className="text-sm text-muted-foreground">ระยะทางตามเวลา (เมตร)</p>
              </CardHeader>
              <CardContent>
                <svg width="100%" height="300" viewBox="0 0 800 300" className="bg-white rounded">
                  {/* Grid */}
                  <defs>
                    <pattern id="gridPattern" width="40" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 30" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="800" height="300" fill="url(#gridPattern)" />
                  
                  {/* Axes */}
                  <line x1="40" y1="260" x2="760" y2="260" stroke="#666" strokeWidth="2" />
                  <line x1="40" y1="40" x2="40" y2="260" stroke="#666" strokeWidth="2" />
                  
                  {/* Y-axis labels */}
                  {stats && (
                    <>
                      <text x="30" y="45" textAnchor="end" className="text-xs fill-gray-600">
                        {stats.maxDistance}m
                      </text>
                      <text x="30" y="155" textAnchor="end" className="text-xs fill-gray-600">
                        {((parseFloat(stats.maxDistance) + parseFloat(stats.minDistance)) / 2).toFixed(1)}m
                      </text>
                      <text x="30" y="265" textAnchor="end" className="text-xs fill-gray-600">
                        {stats.minDistance}m
                      </text>
                    </>
                  )}
                  
                  {/* Line */}
                  {stats && (
                    <path
                      d={createPath(
                        historyData.map(d => d.distance || 0),
                        parseFloat(stats.maxDistance) || 1,
                        300
                      )}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                    />
                  )}
                  
                  {/* Points */}
                  {stats && historyData.map((d, i) => {
                    const x = 40 + (i * (720 / Math.max(historyData.length - 1, 1)));
                    const y = 260 - ((d.distance || 0) / parseFloat(stats.maxDistance)) * 220;
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="3"
                        fill="#3b82f6"
                      />
                    );
                  })}
                </svg>
              </CardContent>
            </Card>

            {/* RSSI Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="english-text text-base">Signal Strength Over Time</CardTitle>
                <p className="text-sm text-muted-foreground">ความแรงสัญญาณตามเวลา (dBm)</p>
              </CardHeader>
              <CardContent>
                <svg width="100%" height="300" viewBox="0 0 800 300" className="bg-white rounded">
                  <rect width="800" height="300" fill="url(#gridPattern)" />
                  
                  {/* Axes */}
                  <line x1="40" y1="260" x2="760" y2="260" stroke="#666" strokeWidth="2" />
                  <line x1="40" y1="40" x2="40" y2="260" stroke="#666" strokeWidth="2" />
                  
                  {/* Y-axis labels */}
                  {stats && (
                    <>
                      <text x="30" y="45" textAnchor="end" className="text-xs fill-gray-600">
                        {stats.maxRssi}
                      </text>
                      <text x="30" y="155" textAnchor="end" className="text-xs fill-gray-600">
                        {Math.round(((stats.maxRssi || 0) + (stats.minRssi || 0)) / 2)}
                      </text>
                      <text x="30" y="265" textAnchor="end" className="text-xs fill-gray-600">
                        {stats.minRssi}
                      </text>
                    </>
                  )}
                  
                  {/* Line */}
                  {stats && (
                    <path
                      d={createPath(
                        historyData.map(d => Math.abs(d.rssi || 0)),
                        Math.abs(stats.minRssi) || 1,
                        300
                      )}
                      fill="none"
                      stroke="#eab308"
                      strokeWidth="2"
                    />
                  )}
                  
                  {/* Points */}
                  {stats && historyData.map((d, i) => {
                    const x = 40 + (i * (720 / Math.max(historyData.length - 1, 1)));
                    const y = 260 - (Math.abs(d.rssi || 0) / Math.abs(stats.minRssi || 1)) * 220;
                    return (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r="3"
                        fill="#eab308"
                      />
                    );
                  })}
                </svg>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
