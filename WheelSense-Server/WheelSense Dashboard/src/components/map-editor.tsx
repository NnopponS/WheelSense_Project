/**
 * WheelSense Map Editor
 * Full-featured map editor with drag-and-drop room positioning
 * Auto-creates rooms from online nodes
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { 
  Building2, 
  Plus, 
  Save, 
  Trash2, 
  Edit2, 
  Move,
  Grid3x3,
  Maximize2,
  RefreshCw,
  MapPin,
  Layers,
  Activity,
  ZoomIn,
  ZoomOut,
  Minimize2
} from 'lucide-react';
import { 
  getRooms, 
  updateRoom, 
  deleteRoom, 
  getBuildings, 
  getFloors,
  createBuilding,
  createFloor,
  type Room, 
  type Building, 
  type Floor,
  type SensorData
} from '../services/api';
import { useSensorData } from '../hooks/useApi';
import { toast } from 'sonner';

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

interface RoomEditState {
  node: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  border_color?: string;
  floor_id?: number;
  building_id?: number;
}

export function MapEditor() {
  const [rooms, setRooms] = useState([] as Room[]);
  const [buildings, setBuildings] = useState([] as Building[]);
  const [floors, setFloors] = useState([] as Floor[]);
  const [selectedBuilding, setSelectedBuilding] = useState(null as number | null);
  const [selectedFloor, setSelectedFloor] = useState(null as number | null);
  const [selectedRoom, setSelectedRoom] = useState(null as number | null);
  const [editingRoom, setEditingRoom] = useState(null as RoomEditState | null);
  const [draggingRoom, setDraggingRoom] = useState(null as number | null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showBuildingDialog, setShowBuildingDialog] = useState(false);
  const [showFloorDialog, setShowFloorDialog] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState('');
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorNumber, setNewFloorNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [editingBuilding, setEditingBuilding] = useState(null as Building | null);
  const [editingFloor, setEditingFloor] = useState(null as Floor | null);
  const svgRef = useRef(null as SVGSVGElement | null);
  const containerRef = useRef(null as HTMLDivElement | null);

  const { data: sensorData } = useSensorData();

  useEffect(() => {
    loadMapData();
  }, []);

  useEffect(() => {
    // Auto-create rooms from online nodes
    autoCreateRooms();
  }, [sensorData, rooms, selectedFloor, selectedBuilding]);

  const loadMapData = async () => {
    try {
      setLoading(true);
      const [roomsData, buildingsData] = await Promise.all([
        getRooms(),
        getBuildings(),
      ]);
      
      setRooms(roomsData);
      setBuildings(buildingsData);
      
      // Select first building and floor by default
      if (buildingsData.length > 0) {
        const firstBuilding = buildingsData[0];
        setSelectedBuilding(firstBuilding.id);
        
        const floorsData = await getFloors(firstBuilding.id);
        setFloors(floorsData);
        
        if (floorsData.length > 0) {
          setSelectedFloor(floorsData[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load map data:', error);
      toast.error('Failed to load map data');
    } finally {
      setLoading(false);
    }
  };

  const autoCreateRooms = async () => {
    if (!selectedFloor || !selectedBuilding) return;

    // Get unique active nodes from sensor data
    const activeNodes = Array.from(new Set(
      sensorData
        .filter(s => !s.stale)
        .map(s => s.node)
    ));

    // Find nodes that don't have rooms yet
    const existingRoomNodes = new Set(rooms.map(r => r.node));
    const newNodes = activeNodes.filter(node => !existingRoomNodes.has(node));

    if (newNodes.length === 0) return;

    // Create rooms for new nodes
    const newRooms: Room[] = newNodes.map((node, index) => {
      // Calculate position in a grid layout
      const gridSize = Math.ceil(Math.sqrt(rooms.length + newNodes.length));
      const row = Math.floor((rooms.length + index) / gridSize);
      const col = (rooms.length + index) % gridSize;
      
      return {
        node,
        name: `Room ${node}`,
        x: 50 + col * 150,
        y: 50 + row * 120,
        width: 120,
        height: 80,
        color: '#0056B3',
        floor_id: selectedFloor,
        building_id: selectedBuilding,
      };
    });

    if (newRooms.length > 0) {
      try {
        // Save new rooms to backend
        for (const room of newRooms) {
          await updateRoom(room);
        }
        
        setRooms(prev => [...prev, ...newRooms]);
        toast.success(`Auto-created ${newRooms.length} room(s) from online nodes`);
      } catch (error) {
        console.error('Failed to auto-create rooms:', error);
      }
    }
  };

  const handleBuildingChange = async (buildingId: number) => {
    setSelectedBuilding(buildingId);
    try {
      const floorsData = await getFloors(buildingId);
      setFloors(floorsData);
      
      if (floorsData.length > 0) {
        setSelectedFloor(floorsData[0].id);
      } else {
        setSelectedFloor(null);
      }
    } catch (error) {
      console.error('Failed to load floors:', error);
      toast.error('Failed to load floors');
    }
  };

  const handleCreateBuilding = async () => {
    if (!newBuildingName.trim()) {
      toast.error('Please enter a building name');
      return;
    }

    try {
      const building = await createBuilding({ name: newBuildingName });
      setBuildings(prev => [...prev, building]);
      setSelectedBuilding(building.id);
      setNewBuildingName('');
      setShowBuildingDialog(false);
      toast.success('Building created successfully');
    } catch (error) {
      console.error('Failed to create building:', error);
      toast.error('Failed to create building');
    }
  };

  const handleCreateFloor = async () => {
    if (!selectedBuilding) {
      toast.error('Please select a building first');
      return;
    }

    if (!newFloorName.trim()) {
      toast.error('Please enter a floor name');
      return;
    }

    try {
      const floor = await createFloor({
        building_id: selectedBuilding,
        floor_number: newFloorNumber,
        name: newFloorName,
      });
      
      setFloors(prev => [...prev, floor]);
      setSelectedFloor(floor.id);
      setNewFloorName('');
      setNewFloorNumber(floors.length + 1);
      setShowFloorDialog(false);
      toast.success('Floor created successfully');
    } catch (error) {
      console.error('Failed to create floor:', error);
      toast.error('Failed to create floor');
    }
  };

  const handleMouseDown = (e: any, room: Room) => {
    if (!svgRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;
    
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    
    const point = svgPoint.matrixTransform(ctm.inverse());
    
    setDraggingRoom(room.node);
    setDragOffset({
      x: point.x - room.x,
      y: point.y - room.y,
    });
  };

  const handleMouseMove = (e: any) => {
    if (draggingRoom === null || !svgRef.current) return;

    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = e.clientX;
    svgPoint.y = e.clientY;
    
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    
    const point = svgPoint.matrixTransform(ctm.inverse());
    
    const newX = Math.max(0, point.x - dragOffset.x);
    const newY = Math.max(0, point.y - dragOffset.y);

    setRooms(prev => prev.map(room => 
      room.node === draggingRoom
        ? { ...room, x: newX, y: newY }
        : room
    ));
  };

  const handleMouseUp = async () => {
    if (draggingRoom !== null) {
      const room = rooms.find(r => r.node === draggingRoom);
      if (room) {
        try {
          await updateRoom(room);
          toast.success('Room position updated');
        } catch (error) {
          console.error('Failed to update room:', error);
          toast.error('Failed to update room position');
        }
      }
      setDraggingRoom(null);
    }
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoom({
      node: room.node,
      name: room.name,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      color: room.color,
      border_color: room.border_color,
      floor_id: room.floor_id,
      building_id: room.building_id,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRoom) return;

    try {
      setSaving(true);
      await updateRoom(editingRoom);
      
      setRooms(prev => prev.map(room =>
        room.node === editingRoom.node
          ? { ...room, ...editingRoom }
          : room
      ));
      
      setEditingRoom(null);
      toast.success('Room saved successfully! Changes will appear in Dashboard.');
      
      // Reload data to ensure sync
      await loadMapData();
    } catch (error) {
      console.error('Failed to update room:', error);
      toast.error('Failed to save room changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingRoom(null);
    setSelectedRoom(null);
  };

  const handleDeleteRoom = async (node: number) => {
    if (!confirm('Are you sure you want to delete this room?')) return;

    try {
      await deleteRoom(node);
      setRooms(prev => prev.filter(room => room.node !== node));
      toast.success('Room deleted successfully');
    } catch (error) {
      console.error('Failed to delete room:', error);
      toast.error('Failed to delete room');
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.2, 3)); // Max zoom 3x
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.2, 0.5)); // Min zoom 0.5x
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start panning if clicking on the container (not on SVG elements)
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'svg') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setPanX(e.clientX - panStart.x);
      setPanY(e.clientY - panStart.y);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
  };

  // Get active and moving nodes
  const activeNodes = new Set(sensorData.filter(s => !s.stale).map(s => s.node));
  const movingNodes = new Set(sensorData.filter(s => !s.stale && s.motion === 1).map(s => s.node));

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

  // Filter rooms by selected floor
  const filteredRooms = rooms.filter(room => {
    if (selectedFloor && room.floor_id !== selectedFloor) return false;
    if (selectedBuilding && room.building_id !== selectedBuilding) return false;
    return true;
  });

  // Calculate canvas bounds
  const maxX = Math.max(...filteredRooms.map(r => r.x + r.width), 1000);
  const maxY = Math.max(...filteredRooms.map(r => r.y + r.height), 800);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-[#0056B3]" />
          <p className="text-xl">Loading Map Editor...</p>
        </div>
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
              <Edit2 className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#0056B3]">Map Editor</h2>
              <p className="text-xs text-muted-foreground">Drag, edit & manage</p>
            </div>
          </div>
          <Button onClick={loadMapData} variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* Building and Floor Selection - Compact */}
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Building & Floor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Building Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Building</Label>
                <div className="flex gap-1.5">
                  <Select
                    value={selectedBuilding?.toString()}
                    onValueChange={(value) => handleBuildingChange(parseInt(value))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings.map(building => (
                        <SelectItem key={building.id} value={building.id.toString()}>
                          {building.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => setShowBuildingDialog(true)} size="sm" className="h-9 w-9 p-0">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Floor Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Floor</Label>
                <div className="flex gap-1.5">
                  <Select
                    value={selectedFloor?.toString()}
                    onValueChange={(value) => setSelectedFloor(parseInt(value))}
                    disabled={!selectedBuilding}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {floors.map(floor => (
                        <SelectItem key={floor.id} value={floor.id.toString()}>
                          {floor.name} (F{floor.floor_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={() => setShowFloorDialog(true)} 
                    size="sm"
                    className="h-9 w-9 p-0"
                    disabled={!selectedBuilding}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {selectedFloor && (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" />
                  {filteredRooms.length} rooms
                </Badge>
                <Badge variant="outline" className="bg-green-50 text-xs">
                  <Activity className="h-3 w-3 mr-1" />
                  {Array.from(activeNodes).length} active
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Map Canvas */}
          <Card className="lg:col-span-2 border-gray-200">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Grid3x3 className="h-4 w-4" />
                Map Canvas
                <Badge variant="outline" className="ml-auto text-xs">
                  {filteredRooms.length} rooms
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 relative">
              {!selectedFloor ? (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <Layers className="h-16 w-16 text-muted-foreground opacity-30 mb-4" />
                  <p className="text-muted-foreground">Please select a building and floor</p>
                  <p className="text-sm text-muted-foreground">or create a new one to start editing</p>
                </div>
              ) : filteredRooms.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 text-center">
                  <MapPin className="h-16 w-16 text-muted-foreground opacity-30 mb-4" />
                  <p className="text-muted-foreground">No rooms on this floor yet</p>
                  <p className="text-sm text-muted-foreground">
                    Rooms will be created automatically when nodes come online
                  </p>
                </div>
              ) : (
                <>
                  {/* Zoom Controls */}
                  <div className="absolute top-2 right-2 z-10 flex flex-col gap-2 bg-white rounded-lg shadow-lg p-2 border border-gray-200">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleZoomIn}
                      title="Zoom In"
                      className="h-8 w-8 p-0"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResetZoom}
                      title="Reset Zoom"
                      className="h-8 w-8 p-0"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleZoomOut}
                      title="Zoom Out"
                      className="h-8 w-8 p-0"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <div className="text-xs text-center text-gray-600 mt-1 px-1">
                      {(zoom * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div 
                    ref={containerRef}
                    className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={(e) => {
                      handleCanvasMouseMove(e);
                      handleMouseMove(e);
                    }}
                    onMouseUp={() => {
                      handleCanvasMouseUp();
                      handleMouseUp();
                    }}
                    onMouseLeave={() => {
                      handleCanvasMouseUp();
                      handleMouseUp();
                    }}
                    style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                  >
                    <svg
                      ref={svgRef}
                      width="100%"
                      height="500"
                      viewBox={`0 0 ${maxX} ${maxY}`}
                      className="w-full"
                      onWheel={handleWheel}
                      style={{
                        transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                      }}
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
                      const isSelected = selectedRoom === room.node;

                      return (
                        <g
                          key={room.node}
                          onMouseDown={(e) => handleMouseDown(e, room)}
                          onClick={() => setSelectedRoom(room.node)}
                          className="cursor-move"
                        >
                          {/* Room Rectangle */}
                          <rect
                            x={room.x}
                            y={room.y}
                            width={room.width}
                            height={room.height}
                            fill={isActive ? room.color : '#e5e7eb'}
                            stroke={isSelected ? '#ef4444' : hasMotion ? '#10b981' : (room.border_color || '#9ca3af')}
                            strokeWidth={isSelected ? '4' : hasMotion ? '3' : '2'}
                            rx="4"
                            opacity={isActive ? 0.9 : 0.5}
                            className="transition-all"
                          />

                          {/* Motion indicator */}
                          {hasMotion && (
                            <circle
                              cx={room.x + room.width - 12}
                              cy={room.y + 12}
                              r="6"
                              fill="#10b981"
                              className="animate-pulse pointer-events-none"
                            />
                          )}

                          {/* Room Label */}
                          <text
                            x={room.x + room.width / 2}
                            y={room.y + room.height / 2 - 5}
                            textAnchor="middle"
                            fill={isActive ? 'white' : '#6b7280'}
                            fontSize="14"
                            fontWeight="600"
                            className="pointer-events-none select-none"
                          >
                            {room.name}
                          </text>

                          {/* Node ID */}
                          <text
                            x={room.x + room.width / 2}
                            y={room.y + room.height / 2 + 12}
                            textAnchor="middle"
                            fill={isActive ? 'white' : '#9ca3af'}
                            fontSize="11"
                            opacity="0.8"
                            className="pointer-events-none select-none"
                          >
                            Node {room.node}
                          </text>

                          {/* Wheelchairs in this room */}
                          {wheelchairsInRoom.get(room.node) && wheelchairsInRoom.get(room.node)!.length > 0 && (
                            <g>
                              {/* Wheelchair icon/badge */}
                              <rect
                                x={room.x + 5}
                                y={room.y + room.height - 25}
                                width={Math.min(room.width - 10, wheelchairsInRoom.get(room.node)!.length * 60 + 10)}
                                height="20"
                                fill="rgba(255, 255, 255, 0.95)"
                                stroke="#3b82f6"
                                strokeWidth="1.5"
                                rx="3"
                                className="pointer-events-none"
                              />
                              
                              {/* Wheelchair labels */}
                              {wheelchairsInRoom.get(room.node)!.map((wc, index) => (
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
                              className="animate-pulse pointer-events-none"
                            />
                          )}
                        </g>
                      );
                    })}
                  </svg>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Room Properties Panel */}
          <Card className="border-gray-200">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Edit2 className="h-4 w-4" />
                Room Properties
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {selectedRoom === null ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Move className="h-10 w-10 text-muted-foreground opacity-30 mb-3" />
                  <p className="text-sm text-muted-foreground">Select a room to edit</p>
                  <p className="text-xs text-muted-foreground">Click on a room in the map</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  {(() => {
                    const room = filteredRooms.find(r => r.node === selectedRoom);
                    if (!room) return null;

                    const isActive = activeNodes.has(room.node);

                    return (
                      <div className="space-y-3">
                        {/* Status Badge */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={isActive ? 'default' : 'secondary'}>
                            {isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          {movingNodes.has(room.node) && (
                            <Badge className="bg-green-500">Motion</Badge>
                          )}
                          {wheelchairsInRoom.get(room.node) && wheelchairsInRoom.get(room.node)!.length > 0 && (
                            <Badge className="bg-blue-500">
                              ♿ {wheelchairsInRoom.get(room.node)!.length} Wheelchair(s)
                            </Badge>
                          )}
                        </div>

                        {/* Wheelchair Details */}
                        {wheelchairsInRoom.get(room.node) && wheelchairsInRoom.get(room.node)!.length > 0 && (
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="text-sm font-semibold text-blue-900 mb-2">
                              Wheelchairs in this Room
                            </h4>
                            <div className="space-y-2">
                              {wheelchairsInRoom.get(room.node)!.map((wc) => (
                                <div key={wc.wheel} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">♿</span>
                                    <span className="font-medium text-blue-900">{wc.label}</span>
                                  </div>
                                  <span className="text-xs text-gray-600 font-mono">
                                    RSSI: {wc.rssi} dBm
                                  </span>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              * Location determined by strongest RSSI signal
                            </p>
                          </div>
                        )}

                        {/* Node ID */}
                        <div>
                          <Label className="text-xs text-gray-600">Node ID</Label>
                          <Input value={room.node} disabled className="h-9" />
                        </div>

                        {/* Room Name */}
                        <div>
                          <Label className="text-xs text-gray-600">Room Name</Label>
                          <Input
                            className="h-9"
                            value={editingRoom?.node === room.node ? editingRoom.name : room.name}
                            onChange={(e) => {
                              if (editingRoom?.node === room.node) {
                                setEditingRoom({ ...editingRoom, name: e.target.value });
                              } else {
                                handleEditRoom(room);
                                setEditingRoom(prev => prev ? { ...prev, name: e.target.value } : null);
                              }
                            }}
                            placeholder="Enter room name"
                          />
                        </div>

                        {/* Position */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-gray-600">X Position</Label>
                            <Input
                              type="number"
                              className="h-9"
                              value={editingRoom?.node === room.node ? editingRoom.x : room.x}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, x: value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, x: value } : null);
                                }
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Y Position</Label>
                            <Input
                              type="number"
                              className="h-9"
                              value={editingRoom?.node === room.node ? editingRoom.y : room.y}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, y: value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, y: value } : null);
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* Size */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-gray-600">Width</Label>
                            <Input
                              type="number"
                              className="h-9"
                              value={editingRoom?.node === room.node ? editingRoom.width : room.width}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 80;
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, width: value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, width: value } : null);
                                }
                              }}
                              min={50}
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Height</Label>
                            <Input
                              type="number"
                              className="h-9"
                              value={editingRoom?.node === room.node ? editingRoom.height : room.height}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 60;
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, height: value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, height: value } : null);
                                }
                              }}
                              min={40}
                            />
                          </div>
                        </div>

                        {/* Building and Floor */}
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs text-gray-600">Building</Label>
                            <Select
                              value={editingRoom?.node === room.node && editingRoom.building_id !== undefined 
                                ? editingRoom.building_id?.toString() 
                                : (room.building_id?.toString() || '')}
                              onValueChange={(value) => {
                                const buildingId = parseInt(value);
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, building_id: buildingId });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, building_id: buildingId } : null);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select" />
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

                          <div>
                            <Label className="text-xs text-gray-600">Floor</Label>
                            <Select
                              value={editingRoom?.node === room.node && editingRoom.floor_id !== undefined 
                                ? editingRoom.floor_id?.toString() 
                                : (room.floor_id?.toString() || '')}
                              onValueChange={(value) => {
                                const floorId = parseInt(value);
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, floor_id: floorId });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, floor_id: floorId } : null);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {floors.map(floor => (
                                  <SelectItem key={floor.id} value={floor.id.toString()}>
                                    {floor.name} (F{floor.floor_number})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Fill Color */}
                        <div>
                          <Label className="text-xs text-gray-600">Fill Color</Label>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              className="h-9 w-16"
                              value={editingRoom?.node === room.node ? editingRoom.color : room.color}
                              onChange={(e) => {
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, color: e.target.value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, color: e.target.value } : null);
                                }
                              }}
                            />
                            <Input
                              className="h-9"
                              value={editingRoom?.node === room.node ? editingRoom.color : room.color}
                              onChange={(e) => {
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, color: e.target.value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, color: e.target.value } : null);
                                }
                              }}
                              placeholder="#0056B3"
                            />
                          </div>
                        </div>

                        {/* Border Color */}
                        <div>
                          <Label className="text-xs text-gray-600">Border Color</Label>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              className="h-9 w-16"
                              value={editingRoom?.node === room.node && editingRoom.border_color !== undefined
                                ? editingRoom.border_color 
                                : (room.border_color || '#9ca3af')}
                              onChange={(e) => {
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, border_color: e.target.value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, border_color: e.target.value } : null);
                                }
                              }}
                            />
                            <Input
                              className="h-9"
                              value={editingRoom?.node === room.node && editingRoom.border_color !== undefined
                                ? editingRoom.border_color 
                                : (room.border_color || '#9ca3af')}
                              onChange={(e) => {
                                if (editingRoom?.node === room.node) {
                                  setEditingRoom({ ...editingRoom, border_color: e.target.value });
                                } else {
                                  handleEditRoom(room);
                                  setEditingRoom(prev => prev ? { ...prev, border_color: e.target.value } : null);
                                }
                              }}
                              placeholder="#9ca3af"
                            />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="space-y-1.5 pt-3 border-t">
                          <Button 
                            onClick={() => {
                              if (editingRoom?.node === room.node) {
                                handleSaveEdit();
                              } else {
                                handleEditRoom(room);
                              }
                            }}
                            className="w-full bg-green-600 hover:bg-green-700"
                            disabled={saving}
                          >
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? 'Saving...' : 'Save Changes'}
                          </Button>
                          
                          {editingRoom?.node === room.node && (
                            <Button 
                              onClick={handleCancelEdit}
                              variant="outline"
                              className="w-full"
                              disabled={saving}
                            >
                              Cancel Edit
                            </Button>
                          )}
                          
                          <Button
                            onClick={() => handleDeleteRoom(room.node)}
                            variant="destructive"
                            className="w-full"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Room
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Building Dialog */}
      <Dialog open={showBuildingDialog} onOpenChange={setShowBuildingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Building</DialogTitle>
            <DialogDescription>
              Add a new building to organize your rooms
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Building Name</Label>
              <Input
                value={newBuildingName}
                onChange={(e) => setNewBuildingName(e.target.value)}
                placeholder="e.g., Main Building"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBuildingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBuilding}>
              <Plus className="h-4 w-4 mr-2" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Floor Dialog */}
      <Dialog open={showFloorDialog} onOpenChange={setShowFloorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Floor</DialogTitle>
            <DialogDescription>
              Add a new floor to the selected building
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Floor Number</Label>
              <Input
                type="number"
                value={newFloorNumber}
                onChange={(e) => setNewFloorNumber(parseInt(e.target.value) || 1)}
                placeholder="1"
              />
            </div>
            <div>
              <Label>Floor Name</Label>
              <Input
                value={newFloorName}
                onChange={(e) => setNewFloorName(e.target.value)}
                placeholder="e.g., Ground Floor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFloorDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFloor}>
              <Plus className="h-4 w-4 mr-2" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

