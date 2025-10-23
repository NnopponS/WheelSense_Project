/**
 * WheelSense System Map
 * Read-only map view showing all rooms and their status
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Building2, MapPin, Users, Maximize2 } from 'lucide-react';
import { getRooms, getBuildings, getFloors, type Room, type Building, type Floor } from '../services/api';
import { useSensorData } from '../hooks/useApi';
import type { SensorData } from '../services/api';

// Helper function to determine which room each wheelchair is in based on strongest RSSI
function getWheelchairLocations(sensorData: SensorData[]): Map<number, { node: number; rssi: number; wheelLabel: string; nodeLabel: string; ts: string }> {
  const wheelchairLocations = new Map();
  
  // Group by wheelchair
  const wheelchairData = new Map<number, SensorData[]>();
  
  sensorData.forEach(sensor => {
    if (sensor.stale) return; // Skip stale data
    
    if (!wheelchairData.has(sensor.wheel)) {
      wheelchairData.set(sensor.wheel, []);
    }
    wheelchairData.get(sensor.wheel)!.push(sensor);
  });
  
  // For each wheelchair, find the node with strongest RSSI and most recent timestamp
  wheelchairData.forEach((sensors, wheel) => {
    if (sensors.length === 0) return;
    
    // Sort by RSSI (higher is better, closer to 0) and then by timestamp (most recent)
    const bestSensor = sensors.reduce((best, current) => {
      // RSSI comparison: higher value (closer to 0) is better
      // -50 dBm is better than -70 dBm
      if (current.rssi === null) return best;
      if (best.rssi === null) return current;
      
      if (current.rssi > best.rssi) return current;
      if (current.rssi === best.rssi) {
        // If same RSSI, prefer more recent timestamp
        return new Date(current.ts) > new Date(best.ts) ? current : best;
      }
      return best;
    });
    
    if (bestSensor.rssi !== null) {
      wheelchairLocations.set(wheel, {
        node: bestSensor.node,
        rssi: bestSensor.rssi,
        wheelLabel: bestSensor.wheel_label || `Wheel ${wheel}`,
        nodeLabel: bestSensor.node_label || `Room ${bestSensor.node}`,
        ts: bestSensor.ts,
      });
    }
  });
  
  return wheelchairLocations;
}

interface SystemMapProps {
  selectedFloorId?: number;
  selectedBuildingId?: number;
  onRoomClick?: (room: Room) => void;
  compact?: boolean;
}

export function SystemMap({ 
  selectedFloorId, 
  selectedBuildingId, 
  onRoomClick,
  compact = false 
}: SystemMapProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: sensorData } = useSensorData();

  useEffect(() => {
    loadMapData();
  }, []);

  const loadMapData = async () => {
    try {
      setLoading(true);
      const [roomsData, buildingsData] = await Promise.all([
        getRooms(),
        getBuildings(),
      ]);
      
      setRooms(roomsData);
      setBuildings(buildingsData);
      
      // Load floors for the first building or selected building
      if (buildingsData.length > 0) {
        const buildingId = selectedBuildingId || buildingsData[0].id;
        const floorsData = await getFloors(buildingId);
        setFloors(floorsData);
      }
    } catch (error) {
      console.error('Failed to load map data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get active nodes from sensor data
  const activeNodes = new Set(
    sensorData
      .filter(s => !s.stale)
      .map(s => s.node)
  );

  // Get nodes with motion
  const movingNodes = new Set(
    sensorData
      .filter(s => !s.stale && s.motion === 1)
      .map(s => s.node)
  );

  // Get wheelchair locations based on strongest RSSI
  const wheelchairLocations = getWheelchairLocations(sensorData);
  
  // Group wheelchairs by room
  const wheelchairsInRoom = new Map<number, Array<{ wheel: number; label: string; rssi: number }>>();
  wheelchairLocations.forEach((location, wheel) => {
    if (!wheelchairsInRoom.has(location.node)) {
      wheelchairsInRoom.set(location.node, []);
    }
    wheelchairsInRoom.get(location.node)!.push({
      wheel,
      label: location.wheelLabel,
      rssi: location.rssi,
    });
  });

  // Filter rooms by selected floor/building
  const filteredRooms = rooms.filter(room => {
    if (selectedFloorId && room.floor_id !== selectedFloorId) return false;
    if (selectedBuildingId && room.building_id !== selectedBuildingId) return false;
    return true;
  });

  if (loading) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardContent className={compact ? 'p-4' : 'p-6'}>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading map...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (filteredRooms.length === 0) {
    return (
      <Card className={compact ? 'border-0 shadow-none' : ''}>
        <CardContent className={compact ? 'p-4' : 'p-6'}>
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <MapPin className="h-16 w-16 text-muted-foreground opacity-30 mb-4" />
            <p className="text-muted-foreground">No rooms on this floor</p>
            <p className="text-sm text-muted-foreground">Rooms will appear automatically when nodes come online</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate canvas bounds
  const maxX = Math.max(...filteredRooms.map(r => r.x + r.width), 800);
  const maxY = Math.max(...filteredRooms.map(r => r.y + r.height), 600);

  return (
    <Card className={compact ? 'border-0 shadow-none' : ''}>
      {!compact && (
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-400" />
            <div>
              <span className="text-base font-medium text-gray-900">System Map</span>
              <p className="text-xs text-gray-500 mt-0.5">
                {filteredRooms.length} rooms · {Array.from(activeNodes).length} active
              </p>
            </div>
          </CardTitle>
        </CardHeader>
      )}
      
      <CardContent className={compact ? 'p-4' : 'p-6'}>
        {/* Map Canvas */}
        <div className="relative border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50">
          <svg 
            width="100%" 
            height={compact ? "400" : "600"} 
            viewBox={`0 0 ${maxX} ${maxY}`}
            className="w-full"
            style={{ maxHeight: compact ? '400px' : '600px' }}
          >
            {/* Grid */}
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Rooms */}
            {filteredRooms.map((room) => {
              const isActive = activeNodes.has(room.node);
              const hasMotion = movingNodes.has(room.node);
              const wheelchairs = wheelchairsInRoom.get(room.node) || [];
              const hasWheelchairs = wheelchairs.length > 0;

              return (
                <g 
                  key={room.node}
                  onClick={() => onRoomClick?.(room)}
                  className={onRoomClick ? 'cursor-pointer' : ''}
                >
                  {/* Room Rectangle */}
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.width}
                    height={room.height}
                    fill={isActive ? room.color : '#e5e7eb'}
                    stroke={hasMotion ? '#10b981' : '#9ca3af'}
                    strokeWidth={hasMotion ? '3' : '2'}
                    rx="4"
                    opacity={isActive ? 0.9 : 0.5}
                    className="transition-all duration-300"
                  />
                  
                  {/* Motion indicator */}
                  {hasMotion && (
                    <circle
                      cx={room.x + room.width - 12}
                      cy={room.y + 12}
                      r="6"
                      fill="#10b981"
                      className="animate-pulse"
                    />
                  )}

                  {/* Room Label */}
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + 20}
                    textAnchor="middle"
                    fill={isActive ? 'white' : '#6b7280'}
                    fontSize="14"
                    fontWeight="600"
                    className="pointer-events-none"
                  >
                    {room.name}
                  </text>
                  
                  {/* Node ID */}
                  <text
                    x={room.x + room.width / 2}
                    y={room.y + 35}
                    textAnchor="middle"
                    fill={isActive ? 'white' : '#9ca3af'}
                    fontSize="10"
                    opacity="0.8"
                    className="pointer-events-none"
                  >
                    Node {room.node}
                  </text>

                  {/* Wheelchairs in this room */}
                  {hasWheelchairs && (
                    <g>
                      {/* Wheelchair icon/badge */}
                      <rect
                        x={room.x + 5}
                        y={room.y + room.height - 25}
                        width={Math.min(room.width - 10, wheelchairs.length * 60 + 10)}
                        height="20"
                        fill="rgba(255, 255, 255, 0.95)"
                        stroke="#3b82f6"
                        strokeWidth="1.5"
                        rx="3"
                      />
                      
                      {/* Wheelchair labels */}
                      {wheelchairs.map((wc, index) => (
                        <g key={wc.wheel}>
                          {/* Wheelchair icon (♿) */}
                          <text
                            x={room.x + 15 + index * 60}
                            y={room.y + room.height - 10}
                            fontSize="12"
                            fill="#3b82f6"
                            className="pointer-events-none"
                          >
                            ♿
                          </text>
                          
                          {/* Wheelchair label */}
                          <text
                            x={room.x + 28 + index * 60}
                            y={room.y + room.height - 10}
                            fontSize="10"
                            fontWeight="600"
                            fill="#1e40af"
                            className="pointer-events-none"
                          >
                            W{wc.wheel}
                          </text>
                        </g>
                      ))}
                    </g>
                  )}

                  {/* Active indicator */}
                  {isActive && (
                    <circle
                      cx={room.x + 12}
                      cy={room.y + 12}
                      r="4"
                      fill="#10b981"
                      className="animate-pulse"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legend */}
        {!compact && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-[#0056B3]" />
                <span className="text-gray-600">Active Room</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-300" />
                <span className="text-gray-600">Inactive Room</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-green-500" />
                <span className="text-gray-600">Motion Detected</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">♿</span>
                <span className="text-gray-600">Wheelchair Location (by strongest RSSI)</span>
              </div>
            </div>
            
            {/* Wheelchair location summary */}
            {wheelchairLocations.size > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">
                  Current Wheelchair Locations
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {Array.from(wheelchairLocations.entries()).map(([wheel, location]) => (
                    <div key={wheel} className="flex items-center gap-2 text-blue-800">
                      <span className="text-base">♿</span>
                      <span className="font-medium">{location.wheelLabel}</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-blue-600 font-semibold">{location.nodeLabel}</span>
                      <span className="text-xs text-gray-500">({location.rssi} dBm)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

