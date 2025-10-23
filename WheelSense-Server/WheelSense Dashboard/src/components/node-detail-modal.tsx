/**
 * Node Detail Modal
 * แสดงรายละเอียดของ Node/Wheelchair
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Wifi, Activity, Navigation, Gauge } from 'lucide-react';
import type { SensorData } from '../services/api';
import { getDirectionLabel, getDirectionText, getDirectionEmoji } from '../utils/direction';

interface NodeDetailModalProps {
  sensor: SensorData;
  open: boolean;
  onClose: () => void;
}

export function NodeDetailModal({ sensor, open, onClose }: NodeDetailModalProps) {
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{sensor.node_label || `Node ${sensor.node}`}</span>
              <span className="text-gray-400">•</span>
              <span>{sensor.wheel_label || `Wheel ${sensor.wheel}`}</span>
            </div>
            {sensor.motion === 1 && (
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Main Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-500 mb-1">Distance</p>
              <p className="text-lg font-light text-gray-900">
                {sensor.distance !== null && sensor.distance !== undefined
                  ? `${sensor.distance.toFixed(1)}m`
                  : '-'}
              </p>
            </div>

            <div className="border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-500 mb-1">Signal</p>
              <p className={`text-lg font-light ${getRssiColor(sensor.rssi)}`}>
                {sensor.rssi ? `${sensor.rssi} dBm` : '-'}
              </p>
            </div>

            <div className="border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-500 mb-1">Motion</p>
              <p className="text-lg font-light text-gray-900">
                {sensor.motion === 1 ? 'Moving' : 'Idle'}
              </p>
            </div>

            <div className="border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-500 mb-1">Direction</p>
              <p className="text-lg font-light text-gray-900">
                {sensor.direction !== null && sensor.direction !== undefined 
                  ? `${getDirectionEmoji(sensor.direction)} ${getDirectionText(sensor.direction)}`
                  : '-'}
              </p>
            </div>
          </div>

          {/* Network Info */}
          {sensor.route_path && sensor.route_path.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500 mb-2">Route</p>
              <div className="flex items-center gap-1 text-xs text-gray-700">
                {sensor.route_path.map((hop, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span>{hop}</span>
                    {idx < sensor.route_path.length - 1 && <span>→</span>}
                  </span>
                ))}
              </div>
              {sensor.route_latency_ms !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  Latency: {sensor.route_latency_ms}ms
                </p>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500">
              {sensor.ts ? new Date(sensor.ts).toLocaleString('th-TH', {
                dateStyle: 'short',
                timeStyle: 'short'
              }) : '-'}
            </p>
          </div>
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
