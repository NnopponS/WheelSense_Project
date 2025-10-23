/**
 * Node Detail Modal
 * แสดงรายละเอียดของ Node/Wheelchair แบบครบถ้วน
 * Supports two view modes:
 * - 'wheelchair': Show all wheelchair sensor data in detail
 * - 'node': Show node summary with wheelchair count and brief info
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Wifi, Activity, Navigation, Gauge, AlertCircle, CheckCircle, Users, MapPin } from 'lucide-react';
import type { SensorData } from '../services/api';
import { getDirectionLabel, getDirectionText, getDirectionEmoji } from '../utils/direction';

interface NodeDetailModalProps {
  sensor: SensorData;
  open: boolean;
  onClose: () => void;
  viewType?: 'wheelchair' | 'node'; // Default to 'wheelchair' for detailed view
  allSensors?: SensorData[]; // All sensors for the node (used in node view)
}

// Helper functions สำหรับแปลความหมาย
const getStatusText = (status: number | null) => {
  if (status === null || status === undefined) return 'Unknown';
  switch (status) {
    case 0: return 'Normal';
    case 1: return 'Warning';
    case 2: return 'Error';
    case 3: return 'Critical';
    default: return `Status ${status}`;
  }
};

const getStatusColor = (status: number | null) => {
  if (status === null || status === undefined) return 'bg-gray-500';
  switch (status) {
    case 0: return 'bg-green-500';
    case 1: return 'bg-yellow-500';
    case 2: return 'bg-orange-500';
    case 3: return 'bg-red-500';
    default: return 'bg-gray-500';
  }
};

const getMotionText = (motion: number | null) => {
  if (motion === null || motion === undefined) return 'Unknown';
  return motion === 1 ? 'Moving' : 'Idle';
};

const getMotionIcon = (motion: number | null) => {
  if (motion === null || motion === undefined) return null;
  return motion === 1 ? Activity : CheckCircle;
};

export function NodeDetailModal({ sensor, open, onClose, viewType = 'wheelchair', allSensors = [] }: NodeDetailModalProps) {
  // คำนวณสีตาม RSSI
  const getRssiColor = (rssi: number | null) => {
    if (!rssi) return 'text-gray-500';
    if (rssi >= -60) return 'text-green-600';
    if (rssi >= -75) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRssiLabel = (rssi: number | null) => {
    if (!rssi) return 'Unknown';
    if (rssi >= -60) return 'Excellent';
    if (rssi >= -75) return 'Good';
    return 'Weak';
  };

  const MotionIcon = getMotionIcon(sensor.motion);

  // For Node View: Calculate wheelchair statistics
  const wheelchairCount = viewType === 'node' && allSensors.length > 0 
    ? new Set(allSensors.filter(s => !s.stale).map(s => s.wheel)).size
    : 0;
  
  const activeWheelchairs = viewType === 'node' && allSensors.length > 0
    ? allSensors.filter(s => !s.stale)
    : [];

  const movingWheelchairs = activeWheelchairs.filter(s => s.motion === 1);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {viewType === 'wheelchair' ? (
              // Wheelchair View Header
              <div className="flex items-center gap-2">
                <span className="text-lg">♿</span>
                <span className="text-lg font-semibold">{sensor.wheel_label || `Wheel ${sensor.wheel}`}</span>
                <span className="text-gray-400">•</span>
                <span className="text-base text-gray-600">{sensor.node_label || `Node ${sensor.node}`}</span>
              </div>
            ) : (
              // Node View Header
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-600" />
                <span className="text-lg font-semibold">{sensor.node_label || `Node ${sensor.node}`}</span>
                <Badge variant="outline" className="ml-2">
                  <Users className="h-3 w-3 mr-1" />
                  {wheelchairCount} Wheelchair{wheelchairCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(sensor.status)}>
                {getStatusText(sensor.status)}
              </Badge>
              {!sensor.stale && (
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" title="Online" />
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {viewType === 'wheelchair' ? (
            // WHEELCHAIR VIEW - Show all detailed sensor data
            <>
              {/* Identifiers */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-gray-50 rounded">
                  <p className="text-xs text-gray-500">Wheelchair ID</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{sensor.wheel}</p>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <p className="text-xs text-gray-500">Node ID</p>
                  <p className="text-sm font-mono font-semibold text-gray-900">{sensor.node}</p>
                </div>
              </div>
              
              {/* Wheelchair Label */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-600 font-semibold mb-1">Wheelchair Label</p>
                <p className="text-base font-medium text-blue-900">{sensor.wheel_label || 'Not Set'}</p>
              </div>

          {/* Primary Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-gray-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">Distance</p>
                  <Gauge className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <p className="text-xl font-semibold text-gray-900">
                  {sensor.distance !== null && sensor.distance !== undefined
                    ? `${sensor.distance.toFixed(2)} m`
                    : '-'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">Signal (RSSI)</p>
                  <Wifi className={`h-3.5 w-3.5 ${getRssiColor(sensor.rssi)}`} />
                </div>
                <p className={`text-xl font-semibold ${getRssiColor(sensor.rssi)}`}>
                  {sensor.rssi !== null && sensor.rssi !== undefined ? `${sensor.rssi} dBm` : '-'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{getRssiLabel(sensor.rssi)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Status Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-gray-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">Motion</p>
                  {MotionIcon && <MotionIcon className="h-3.5 w-3.5 text-gray-400" />}
                </div>
                <p className="text-xl font-semibold text-gray-900">
                  {getMotionText(sensor.motion)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {sensor.motion !== null && sensor.motion !== undefined ? `Code: ${sensor.motion}` : '-'}
                </p>
              </CardContent>
            </Card>

            <Card className="border-gray-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">Direction</p>
                  <Navigation className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <p className="text-xl font-semibold text-gray-900">
                  {sensor.direction !== null && sensor.direction !== undefined 
                    ? getDirectionEmoji(sensor.direction)
                    : '-'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {sensor.direction !== null && sensor.direction !== undefined 
                    ? `${getDirectionText(sensor.direction)} (${sensor.direction})`
                    : '-'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Network Route */}
          {sensor.route_path && sensor.route_path.length > 0 && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-semibold text-blue-900 mb-2">Network Route</p>
                <div className="flex items-center gap-1.5 text-sm text-blue-800 flex-wrap">
                  {sensor.route_path.map((hop, idx) => (
                    <span key={idx} className="flex items-center gap-1.5">
                      <span className="font-mono font-medium">{hop}</span>
                      {idx < sensor.route_path.length - 1 && (
                        <span className="text-blue-400">→</span>
                      )}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div>
                    <span className="text-blue-600">Latency:</span>
                    <span className="ml-1.5 font-mono font-semibold text-blue-900">
                      {sensor.route_latency_ms !== null && sensor.route_latency_ms !== undefined 
                        ? `${sensor.route_latency_ms} ms`
                        : '-'}
                    </span>
                  </div>
                  {sensor.route_recovered && sensor.route_recovery_ms !== null && (
                    <div>
                      <span className="text-blue-600">Recovery:</span>
                      <span className="ml-1.5 font-mono font-semibold text-blue-900">
                        {sensor.route_recovery_ms} ms
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional Wheelchair Data Fields */}
          <div className="grid grid-cols-2 gap-3">
            {/* Position Data */}
            {(sensor.x_pos !== null && sensor.x_pos !== undefined) && (
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">X Position</p>
                <p className="text-sm font-mono font-semibold text-gray-900">{sensor.x_pos.toFixed(2)}</p>
              </div>
            )}
            {(sensor.y_pos !== null && sensor.y_pos !== undefined) && (
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">Y Position</p>
                <p className="text-sm font-mono font-semibold text-gray-900">{sensor.y_pos.toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* Map Location */}
          {sensor.map_node_name && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-green-600 font-semibold mb-1">Current Location</p>
              <p className="text-base font-medium text-green-900">{sensor.map_node_name}</p>
            </div>
          )}

          {/* Timestamp & Data Age */}
          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Data Timestamp</span>
              <span className="font-mono font-medium text-gray-900">
                {sensor.ts ? new Date(sensor.ts).toLocaleString('en-GB', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                }) : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Received At</span>
              <span className="font-mono font-medium text-gray-900">
                {sensor.received_at ? new Date(sensor.received_at).toLocaleString('en-GB', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                }) : '-'}
              </span>
            </div>
            {sensor.age_seconds !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Data Age</span>
                <span className={`font-mono font-medium ${sensor.age_seconds > 30 ? 'text-red-600' : 'text-green-600'}`}>
                  {sensor.age_seconds.toFixed(1)} seconds
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Connection Status</span>
              <span className={`font-semibold ${sensor.stale ? 'text-red-600' : 'text-green-600'}`}>
                {sensor.stale ? 'Offline (Stale)' : 'Online (Active)'}
              </span>
            </div>
          </div>
          </>
          ) : (
            // NODE VIEW - Show summary and wheelchair list
            <>
              {/* Node Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <Users className="h-6 w-6 mx-auto mb-1 text-blue-600" />
                  <p className="text-2xl font-bold text-blue-900">{wheelchairCount}</p>
                  <p className="text-xs text-blue-600">Total</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <Activity className="h-6 w-6 mx-auto mb-1 text-green-600" />
                  <p className="text-2xl font-bold text-green-900">{movingWheelchairs.length}</p>
                  <p className="text-xs text-green-600">Moving</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <CheckCircle className="h-6 w-6 mx-auto mb-1 text-gray-600" />
                  <p className="text-2xl font-bold text-gray-900">{activeWheelchairs.length - movingWheelchairs.length}</p>
                  <p className="text-xs text-gray-600">Idle</p>
                </div>
              </div>

              {/* Node Information */}
              <Card className="border-gray-200">
                <CardContent className="pt-4 pb-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Node ID</span>
                      <span className="font-mono font-semibold text-gray-900">{sensor.node}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Node Label</span>
                      <span className="font-medium text-gray-900">{sensor.node_label || 'Not Set'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <Badge className={getStatusColor(sensor.status)}>
                        {getStatusText(sensor.status)}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Wheelchair List */}
              {activeWheelchairs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Connected Wheelchairs
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {activeWheelchairs.map((wc) => (
                      <Card key={`${wc.node}-${wc.wheel}`} className="border-gray-200 hover:border-blue-300 transition-colors">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">♿</span>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {wc.wheel_label || `Wheel ${wc.wheel}`}
                                </p>
                                <p className="text-xs text-gray-500">ID: {wc.wheel}</p>
                              </div>
                            </div>
                            <div className="text-right space-y-1">
                              {wc.motion === 1 && (
                                <Badge className="bg-green-500 text-xs">Moving</Badge>
                              )}
                              <div className="flex items-center gap-1 text-xs">
                                <Wifi className={`h-3 w-3 ${getRssiColor(wc.rssi)}`} />
                                <span className={`font-mono ${getRssiColor(wc.rssi)}`}>
                                  {wc.rssi !== null ? `${wc.rssi} dBm` : '-'}
                                </span>
                              </div>
                              {wc.distance !== null && wc.distance !== undefined && (
                                <p className="text-xs text-gray-600 font-mono">
                                  {wc.distance.toFixed(2)}m
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Last Update */}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Last Updated</span>
                  <span className="font-mono font-medium text-gray-900">
                    {sensor.ts ? new Date(sensor.ts).toLocaleString('en-GB', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false
                    }) : '-'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2 border-t border-gray-200">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
