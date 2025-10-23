/**
 * Simple Map Editor
 * แค่ Drag Rooms + Save
 * ไม่มี: Zoom/Pan, Buildings, Floors, Pathways
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useSensorData, useMapLayout } from '../hooks/useApi';
import {
  Save,
  ArrowLeft,
  MapPin,
  RefreshCw,
  Download,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

interface Room {
  node: number;
  name: string;
  x: number;
  y: number;
}

export function MapEditor() {
  const { data: sensorData } = useSensorData();
  const { layout: mapLayout, updateLayout } = useMapLayout();
  const svgRef = useRef<SVGSVGElement>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [draggingRoom, setDraggingRoom] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  // Load rooms from sensor data and saved layout
  useEffect(() => {
    const activeNodes = Array.from(new Set(
      sensorData.filter(s => !s.stale).map(s => s.node)
    ));
    
    const roomsData = activeNodes.map((node, index) => {
      const sensor = sensorData.find(s => s.node === node);
      const saved = mapLayout.find(m => m.node === node);
      
      const col = index % 3;
      const row = Math.floor(index / 3);
      
      return {
        node,
        name: saved?.node_name || sensor?.node_label || `Node ${node}`,
        x: saved?.x_pos ?? (100 + col * 250),
        y: saved?.y_pos ?? (100 + row * 200),
      };
    });
    
    setRooms(roomsData);
  }, [sensorData, mapLayout]);

  const getSVGCoords = (e: React.MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const handleRoomMouseDown = (e: React.MouseEvent, node: number) => {
    e.stopPropagation();
    
    const room = rooms.find(r => r.node === node);
    if (!room) return;

    const coords = getSVGCoords(e);
    setDraggingRoom(node);
    setDragStart({ x: coords.x - room.x, y: coords.y - room.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingRoom === null) return;

    const coords = getSVGCoords(e);
    setRooms(rooms.map(room => 
      room.node === draggingRoom
        ? { ...room, x: coords.x - dragStart.x, y: coords.y - dragStart.y }
        : room
    ));
  };

  const handleMouseUp = () => {
    setDraggingRoom(null);
  };

  const handleAutoLayout = () => {
    const layoutRooms = rooms.map((room, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return {
        ...room,
        x: 100 + col * 250,
        y: 100 + row * 200,
      };
    });
    setRooms(layoutRooms);
    toast.info('Auto layout applied');
  };

  const handleSave = async () => {
    if (rooms.length === 0) {
      toast.error('No rooms to save');
      return;
    }

    try {
      setSaving(true);
      
      const layoutData = rooms.map(room => ({
        node: room.node,
        node_name: room.name,
        x_pos: Math.round(room.x),
        y_pos: Math.round(room.y),
      }));

      await updateLayout(layoutData);
      
      // Notify Dashboard
      window.dispatchEvent(new Event('map-layout-updated'));
      
      toast.success('Saved!', {
        description: `Saved ${rooms.length} rooms. Dashboard will update.`
      });
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleRenameRoom = (node: number) => {
    const room = rooms.find(r => r.node === node);
    if (!room) return;

    const newName = prompt('Enter room name:', room.name);
    if (newName && newName.trim()) {
      setRooms(rooms.map(r => 
        r.node === node ? { ...r, name: newName.trim() } : r
      ));
    }
  };

  return (
    <div className="h-full bg-[#fafafa] overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const event = new CustomEvent('navigate', { detail: 'dashboard' });
                window.dispatchEvent(event);
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="h-6 w-6 text-gray-400" />
                Map Layout Editor
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Drag rooms to arrange your floor plan
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAutoLayout} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Auto Layout
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-gray-900">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Room List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Rooms ({rooms.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rooms.map(room => (
                  <div
                    key={room.node}
                    className={`p-3 border rounded transition-colors ${
                      draggingRoom === room.node
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{room.name}</span>
                      <button
                        onClick={() => handleRenameRoom(room.node)}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        Rename
                      </button>
                    </div>
                    <div className="text-xs text-gray-500">
                      Node {room.node} • ({Math.round(room.x)}, {Math.round(room.y)})
                    </div>
                  </div>
                ))}
                {rooms.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <MapPin className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>No active nodes</p>
                    <p className="text-xs">Waiting for devices...</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Map Canvas */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base flex justify-between items-center">
                <span>Floor Plan</span>
                <span className="text-sm font-normal text-gray-500">
                  Drag rooms to position
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                className="bg-white rounded border border-gray-200"
                style={{ height: 600 }}
              >
                <svg
                  ref={svgRef}
                  width="100%"
                  height="600"
                  viewBox="0 0 800 600"
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ cursor: draggingRoom ? 'grabbing' : 'default' }}
                >
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  
                  <rect width="800" height="600" fill="#fafafa" />
                  <rect width="800" height="600" fill="url(#grid)" />

                  {/* Rooms */}
                  {rooms.map(room => (
                    <g 
                      key={room.node}
                      onMouseDown={(e) => handleRoomMouseDown(e, room.node)}
                      style={{ cursor: 'move' }}
                    >
                      <rect
                        x={room.x}
                        y={room.y}
                        width="200"
                        height="150"
                        fill="white"
                        stroke={draggingRoom === room.node ? '#3b82f6' : '#e5e7eb'}
                        strokeWidth={draggingRoom === room.node ? '3' : '2'}
                        rx="8"
                      />
                      <text
                        x={room.x + 100}
                        y={room.y + 70}
                        textAnchor="middle"
                        className="text-sm font-medium fill-gray-700"
                        pointerEvents="none"
                      >
                        {room.name}
                      </text>
                      <text
                        x={room.x + 100}
                        y={room.y + 90}
                        textAnchor="middle"
                        className="text-xs fill-gray-500"
                        pointerEvents="none"
                      >
                        Node {room.node}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
              <div className="mt-3 text-xs text-gray-500 text-center">
                🖱️ Drag rooms to reposition • Click 'Save' when done
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
