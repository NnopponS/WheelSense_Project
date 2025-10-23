/**
 * System Map - Simple Version
 * แค่แสดงแผนที่ ไม่มี Zoom/Pan
 */

import React from 'react';
import type { SensorData } from '../services/api';

interface Room {
  id: string;
  node: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  deviceCount: number;
}

interface Wheelchair {
  id: string;
  x: number;
  y: number;
  node: number;
  wheel: number;
  label: string;
  distance: number | null;
  rssi: number;
  motion: boolean;
  sensorData: SensorData;
}

interface SystemMapProps {
  sensorData: SensorData[];
  mapLayout: any[];
  onWheelchairClick?: (sensor: SensorData) => void;
  onEditClick?: () => void;
}

export function SystemMap({ 
  sensorData, 
  mapLayout, 
  onWheelchairClick,
  onEditClick 
}: SystemMapProps) {
  
  // สร้าง Rooms จาก nodes ที่ออนไลน์
  const activeNodes = Array.from(new Set(
    sensorData.filter(s => !s.stale).map(s => s.node)
  ));
  
  const rooms: Room[] = activeNodes.map((nodeNum, index) => {
    const sensor = sensorData.find(s => s.node === nodeNum);
    const savedLayout = mapLayout.find(m => m.node === nodeNum);
    const devicesInNode = sensorData.filter(s => s.node === nodeNum && !s.stale);
    
    const col = index % 3;
    const row = Math.floor(index / 3);
    
    return {
      id: `room-${nodeNum}`,
      node: nodeNum,
      name: savedLayout?.node_name || sensor?.node_label || `Node ${nodeNum}`,
      x: savedLayout?.x_pos ?? (100 + col * 250),
      y: savedLayout?.y_pos ?? (100 + row * 200),
      width: 200,
      height: 150,
      deviceCount: devicesInNode.length,
    };
  });

  // วาง Wheelchairs ในแต่ละ room
  const wheelchairs: Wheelchair[] = sensorData
    .filter(s => !s.stale)
    .map(sensor => {
      const room = rooms.find(r => r.node === sensor.node);
      
      let x: number;
      let y: number;
      
      if (room) {
        const wheelsInRoom = sensorData.filter(s => s.node === sensor.node && !s.stale);
        const totalWheels = wheelsInRoom.length;
        const wheelIndex = wheelsInRoom.findIndex(w => w.wheel === sensor.wheel);
        
        if (totalWheels === 1) {
          x = room.x + room.width / 2;
          y = room.y + room.height / 2;
        } else {
          const centerX = room.x + room.width / 2;
          const centerY = room.y + room.height / 2;
          const radius = 40;
          const angle = (wheelIndex / totalWheels) * 2 * Math.PI - Math.PI / 2;
          
          x = centerX + radius * Math.cos(angle);
          y = centerY + radius * Math.sin(angle);
        }
      } else {
        x = 200;
        y = 150;
      }

      return {
        id: `${sensor.node}-${sensor.wheel}`,
        x,
        y,
        node: sensor.node,
        wheel: sensor.wheel,
        label: sensor.wheel_label || `Wheel ${sensor.wheel}`,
        distance: sensor.distance,
        rssi: sensor.rssi || 0,
        motion: sensor.motion === 1,
        sensorData: sensor,
      };
    });

  if (rooms.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg border p-20 text-center">
        <div className="text-gray-400">
          <svg className="h-16 w-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="font-medium">ไม่มี Node ออนไลน์</p>
          <p className="text-sm">รอการเชื่อมต่อจากอุปกรณ์</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{rooms.length} Rooms</span>
          <span className="text-gray-300">•</span>
          <span className="text-sm text-gray-500">{wheelchairs.length} Devices</span>
        </div>
        {onEditClick && (
          <button
            onClick={onEditClick}
            className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            Edit Layout
          </button>
        )}
      </div>

      {/* Simple Map */}
      <div className="bg-white rounded border border-gray-100">
        <svg width="100%" height="500" viewBox="0 0 800 500">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5"/>
            </pattern>
          </defs>
          
          <rect width="800" height="500" fill="#fafafa" />
          <rect width="800" height="500" fill="url(#grid)" />

          {/* Rooms */}
          {rooms.map(room => (
            <g key={room.id}>
              <rect
                x={room.x}
                y={room.y}
                width={room.width}
                height={room.height}
                fill="white"
                stroke="#e5e7eb"
                strokeWidth="1.5"
                rx="8"
              />
              <text
                x={room.x + room.width / 2}
                y={room.y + 24}
                textAnchor="middle"
                className="text-sm font-medium fill-gray-700"
                style={{ fontSize: '13px' }}
              >
                {room.name}
              </text>
              <text
                x={room.x + room.width / 2}
                y={room.y + 42}
                textAnchor="middle"
                className="text-xs fill-gray-400"
              >
                {room.deviceCount} device{room.deviceCount !== 1 ? 's' : ''}
              </text>
            </g>
          ))}

          {/* Wheelchairs */}
          {wheelchairs.map(wc => (
            <g
              key={wc.id}
              onClick={() => onWheelchairClick?.(wc.sensorData)}
              className="cursor-pointer hover:opacity-80 transition-opacity"
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
                {wc.label}
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
        </svg>
      </div>

      <div className="mt-2 text-xs text-gray-500 text-center">
        🖱️ Click on wheelchair to view details
      </div>
    </div>
  );
}
