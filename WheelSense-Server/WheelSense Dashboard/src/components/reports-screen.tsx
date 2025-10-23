/**
 * Reporting System
 * สร้างและส่งออกรายงาน
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useSensorData, useSystemStats } from '../hooks/useApi';
import {
  FileText,
  Download,
  Calendar,
  Activity,
  MapPin,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface ReportData {
  period: string;
  totalDevices: number;
  activeDevices: number;
  totalDistance: number;
  activeTime: number;
  avgSignal: number;
  roomUsage: { room: string; count: number }[];
  alerts: number;
}

export function ReportsScreen() {
  const { data: sensorData, loading } = useSensorData();
  const { stats } = useSystemStats();
  const [reportPeriod, setReportPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [reportData, setReportData] = useState<ReportData | null>(null);

  useEffect(() => {
    if (!sensorData || !stats) return;

    // คำนวณรายงาน (ตัวอย่าง - ควรดึงจาก API จริง)
    const report: ReportData = {
      period: reportPeriod,
      totalDevices: sensorData.length,
      activeDevices: sensorData.filter(s => !s.stale).length,
      totalDistance: sensorData.reduce((sum, s) => sum + (s.distance || 0), 0),
      activeTime: sensorData.filter(s => s.motion === 1).length * 5, // ประมาณ
      avgSignal: stats.signal.average_rssi || 0,
      roomUsage: getRoomUsage(),
      alerts: stats.signal.weak_signals || 0,
    };

    setReportData(report);
  }, [sensorData, stats, reportPeriod]);

  const getRoomUsage = () => {
    const usage = new Map<string, number>();
    
    sensorData.forEach(s => {
      const room = s.node_label || `Node ${s.node}`;
      usage.set(room, (usage.get(room) || 0) + 1);
    });

    return Array.from(usage.entries())
      .map(([room, count]) => ({ room, count }))
      .sort((a, b) => b.count - a.count);
  };

  const exportToPDF = () => {
    // จำลองการ export
    const reportText = `
WheelSense Report - ${reportPeriod.toUpperCase()}
Generated: ${new Date().toLocaleString('th-TH')}

Summary:
- Total Devices: ${reportData?.totalDevices}
- Active Devices: ${reportData?.activeDevices}
- Total Distance: ${reportData?.totalDistance.toFixed(2)} m
- Active Time: ${reportData?.activeTime} min
- Avg Signal: ${reportData?.avgSignal} dBm
- Alerts: ${reportData?.alerts}

Room Usage:
${reportData?.roomUsage.map(r => `- ${r.room}: ${r.count} devices`).join('\n')}
    `;

    const blob = new Blob([reportText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wheelsense-report-${reportPeriod}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    const csv = [
      ['Node', 'Wheel', 'Distance (m)', 'RSSI (dBm)', 'Motion', 'Status'],
      ...sensorData.map(s => [
        s.node_label || `Node ${s.node}`,
        s.wheel_label || `Wheel ${s.wheel}`,
        s.distance?.toFixed(2) || '-',
        s.rssi || '-',
        s.motion === 1 ? 'Moving' : 'Idle',
        s.stale ? 'Offline' : 'Online',
      ]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wheelsense-data-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !reportData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
          <p className="text-xl">Generating Report...</p>
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
              <FileText className="h-6 w-6 text-gray-400" />
              Reports
            </h2>
            <p className="text-sm text-gray-500 mt-1">Generate and export usage reports</p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={exportToCSV}
              variant="outline"
              className="border-gray-300"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={exportToPDF}
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Period Selector */}
        <Card className="border border-gray-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-600">Report Period:</span>
              <div className="flex gap-2">
                {['today', 'week', 'month'].map(period => (
                  <button
                    key={period}
                    onClick={() => setReportPeriod(period as any)}
                    className={`px-4 py-2 text-sm rounded border transition-colors ${
                      reportPeriod === period
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {period === 'today' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Report Summary */}
        {reportData && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <Activity className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {reportData.activeDevices}/{reportData.totalDevices}
                  </div>
                  <p className="text-sm text-gray-500">Active Devices</p>
                </CardContent>
              </Card>

              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <TrendingUp className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {reportData.totalDistance.toFixed(1)}m
                  </div>
                  <p className="text-sm text-gray-500">Total Distance</p>
                </CardContent>
              </Card>

              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {reportData.activeTime}
                  </div>
                  <p className="text-sm text-gray-500">Active Minutes</p>
                </CardContent>
              </Card>

              <Card className="border border-gray-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <Activity className="h-5 w-5 text-gray-400" />
                    {reportData.alerts > 0 && (
                      <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="text-3xl font-light text-gray-900 mb-1">
                    {reportData.alerts}
                  </div>
                  <p className="text-sm text-gray-500">Alerts</p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Room Usage */}
              <Card className="border border-gray-200">
                <CardHeader className="border-b border-gray-100">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    Room Usage
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    {reportData.roomUsage.map((room, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded bg-gray-100 text-sm font-medium text-gray-600">
                            {idx + 1}
                          </div>
                          <span className="text-sm text-gray-700">{room.room}</span>
                        </div>
                        <Badge variant="outline">{room.count} devices</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Report Details */}
              <Card className="border border-gray-200">
                <CardHeader className="border-b border-gray-100">
                  <CardTitle className="text-base font-medium">Report Details</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Report Period</span>
                      <span className="text-sm font-medium text-gray-900">
                        {reportPeriod.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Generated At</span>
                      <span className="text-sm font-medium text-gray-900">
                        {new Date().toLocaleString('th-TH', { 
                          dateStyle: 'short', 
                          timeStyle: 'short' 
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-600">Avg Signal Strength</span>
                      <span className="text-sm font-medium text-gray-900">
                        {reportData.avgSignal} dBm
                      </span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-sm text-gray-600">Data Points</span>
                      <span className="text-sm font-medium text-gray-900">
                        {reportData.totalDevices}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Report Preview */}
            <Card className="border border-gray-200">
              <CardHeader className="border-b border-gray-100">
                <CardTitle className="text-base font-medium">Report Preview</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="bg-gray-50 rounded p-4 font-mono text-xs space-y-2">
                  <div>WHEELSENSE USAGE REPORT - {reportPeriod.toUpperCase()}</div>
                  <div>Generated: {new Date().toLocaleString('th-TH')}</div>
                  <div>{'='.repeat(60)}</div>
                  <div></div>
                  <div>SUMMARY:</div>
                  <div>  Total Devices: {reportData.totalDevices}</div>
                  <div>  Active Devices: {reportData.activeDevices}</div>
                  <div>  Total Distance: {reportData.totalDistance.toFixed(2)} m</div>
                  <div>  Active Time: {reportData.activeTime} min</div>
                  <div>  Avg Signal: {reportData.avgSignal} dBm</div>
                  <div>  Alerts: {reportData.alerts}</div>
                  <div></div>
                  <div>ROOM USAGE:</div>
                  {reportData.roomUsage.map((r, idx) => (
                    <div key={idx}>  {idx + 1}. {r.room}: {r.count} devices</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

