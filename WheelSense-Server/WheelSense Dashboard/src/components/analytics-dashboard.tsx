/**
 * Advanced Analytics Dashboard
 * วิเคราะห์ข้อมูลเชิงลึก
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useSensorData } from '../hooks/useApi';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Activity,
  MapPin,
  RefreshCw,
} from 'lucide-react';

interface AnalyticsData {
  totalDistance: number;
  activeTime: number;
  idleTime: number;
  peakHours: { hour: number; count: number }[];
  distanceByRoom: { room: string; distance: number }[];
  movementStats: {
    moving: number;
    idle: number;
    percentage: number;
  };
}

export function AnalyticsDashboard() {
  const { data: sensorData, loading } = useSensorData();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    if (!sensorData || sensorData.length === 0) return;

    // คำนวณ analytics
    const totalDistance = sensorData.reduce((sum, s) => sum + (s.distance || 0), 0);
    const movingDevices = sensorData.filter(s => s.motion === 1 && !s.stale);
    const idleDevices = sensorData.filter(s => s.motion === 0 && !s.stale);
    
    // Distance by room
    const roomDistance = new Map<string, number>();
    sensorData.forEach(s => {
      if (s.stale) return;
      const room = s.node_label || `Node ${s.node}`;
      roomDistance.set(room, (roomDistance.get(room) || 0) + (s.distance || 0));
    });

    // Peak hours (จำลอง)
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: Math.floor(Math.random() * 10),
    }));
    const currentHour = new Date().getHours();
    hours[currentHour].count += movingDevices.length;

    setAnalytics({
      totalDistance,
      activeTime: movingDevices.length * 5, // ประมาณ
      idleTime: idleDevices.length * 5,
      peakHours: hours.sort((a, b) => b.count - a.count).slice(0, 5),
      distanceByRoom: Array.from(roomDistance.entries())
        .map(([room, distance]) => ({ room, distance }))
        .sort((a, b) => b.distance - a.distance),
      movementStats: {
        moving: movingDevices.length,
        idle: idleDevices.length,
        percentage: sensorData.length > 0 
          ? Math.round((movingDevices.length / sensorData.length) * 100)
          : 0,
      },
    });
  }, [sensorData, timeRange]);

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
          <p className="text-xl">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#fafafa] overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
              <BarChart3 className="h-6 w-6 text-gray-400" />
              Analytics
            </h2>
            <p className="text-sm text-gray-500 mt-1">Advanced usage analytics</p>
          </div>

          {/* Time Range Selector */}
          <div className="flex gap-2">
            {['24h', '7d', '30d'].map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range as any)}
                className={`px-4 py-2 text-sm rounded border transition-colors ${
                  timeRange === range
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {range === '24h' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
              </button>
            ))}
          </div>
        </div>

        {analytics && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <TrendingUp className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {analytics.totalDistance.toFixed(1)}m
                  </div>
                  <p className="text-sm text-gray-500">Total Distance</p>
                </CardContent>
              </Card>

              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <Clock className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {analytics.activeTime}
                  </div>
                  <p className="text-sm text-gray-500">Active Minutes</p>
                </CardContent>
              </Card>

              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <Activity className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {analytics.movementStats.percentage}%
                  </div>
                  <p className="text-sm text-gray-500">Activity Rate</p>
                </CardContent>
              </Card>

              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <Clock className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {analytics.idleTime}
                  </div>
                  <p className="text-sm text-gray-500">Idle Minutes</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Distance by Room */}
              <Card className="border border-gray-200">
                <CardHeader className="border-b border-gray-100">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    Distance by Room
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {analytics.distanceByRoom.map((item, idx) => {
                      const maxDistance = Math.max(...analytics.distanceByRoom.map(d => d.distance));
                      const percentage = (item.distance / maxDistance) * 100;

                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{item.room}</span>
                            <span className="font-medium text-gray-900">
                              {item.distance.toFixed(1)}m
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gray-900 transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Peak Hours */}
              <Card className="border border-gray-200">
                <CardHeader className="border-b border-gray-100">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    Peak Usage Hours
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {analytics.peakHours.map((item, idx) => {
                      const maxCount = Math.max(...analytics.peakHours.map(h => h.count));
                      const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">
                              {String(item.hour).padStart(2, '0')}:00 - {String(item.hour + 1).padStart(2, '0')}:00
                            </span>
                            <span className="font-medium text-gray-900">
                              {item.count} events
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Movement Stats */}
            <Card className="border border-gray-200">
              <CardHeader className="border-b border-gray-100">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-gray-400" />
                  Movement Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-light text-green-600 mb-2">
                      {analytics.movementStats.moving}
                    </div>
                    <p className="text-sm text-gray-600">Moving</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-light text-gray-400 mb-2">
                      {analytics.movementStats.idle}
                    </div>
                    <p className="text-sm text-gray-600">Idle</p>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-light text-blue-600 mb-2">
                      {analytics.movementStats.percentage}%
                    </div>
                    <p className="text-sm text-gray-600">Activity Rate</p>
                  </div>
                </div>

                {/* Visual representation */}
                <div className="mt-6">
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                    <div
                      className="bg-green-600"
                      style={{ 
                        width: `${analytics.movementStats.percentage}%` 
                      }}
                    />
                    <div
                      className="bg-gray-300"
                      style={{ 
                        width: `${100 - analytics.movementStats.percentage}%` 
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Moving: {analytics.movementStats.percentage}%</span>
                    <span>Idle: {100 - analytics.movementStats.percentage}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

