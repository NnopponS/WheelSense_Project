/**
 * Map Editor - Fixed version
 * ✓ Save works
 * ✓ Drag rooms works  
 * ✓ Buildings/Floors work
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useSensorData, useMapLayout } from '../hooks/useApi';
import {
  getBuildings,
  createBuilding,
  getFloors,
  createFloor,
  getPathways,
  createPathway,
  deletePathway,
  type Building,
  type Floor,
  type Pathway,
} from '../services/api';
import {
  Building2,
  Layers,
  Route,
  Plus,
  Save,
  ArrowLeft,
  Trash2,
  MapPin,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';

interface Room {
  node: number;
  name: string;
  x: number;
  y: number;
  floor_id: number;
  building_id: number;
}

export function MapEditor() {
  const { data: sensorData } = useSensorData();
  const { layout: mapLayout } = useMapLayout();
  const svgRef = useRef<SVGSVGElement>(null);

  // State
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [selectedBuilding, setSelectedBuilding] = useState<number>(1);
  const [selectedFloor, setSelectedFloor] = useState<number>(1);
  const [editMode, setEditMode] = useState<'room' | 'pathway'>('room');
  const [drawingPath, setDrawingPath] = useState<{x: number; y: number}[]>([]);
  const [draggingRoom, setDraggingRoom] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Zoom/Pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Load initial data
  useEffect(() => {
    loadBuildings();
  }, []);

  useEffect(() => {
    if (selectedBuilding) {
      loadFloors(selectedBuilding);
    }
  }, [selectedBuilding]);

  useEffect(() => {
    if (selectedFloor) {
      loadPathways(selectedFloor);
    }
  }, [selectedFloor]);

  // Load rooms from sensor data and map layout
  useEffect(() => {
    const activeNodes = Array.from(new Set(sensorData.filter(s => !s.stale).map(s => s.node)));
    
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
        floor_id: saved?.floor_id || selectedFloor,
        building_id: saved?.building_id || selectedBuilding,
      };
    });
    
    setRooms(roomsData);
  }, [sensorData, mapLayout, selectedFloor, selectedBuilding]);

  const loadBuildings = async () => {
    try {
      const data = await getBuildings();
      setBuildings(data);
      if (data.length > 0) {
        setSelectedBuilding(data[0].id);
      }
    } catch (error) {
      console.error('Error loading buildings:', error);
    }
  };

  const loadFloors = async (buildingId: number) => {
    try {
      const data = await getFloors(buildingId);
      setFloors(data);
      if (data.length > 0) {
        setSelectedFloor(data[0].id);
      }
    } catch (error) {
      console.error('Error loading floors:', error);
    }
  };

  const loadPathways = async (floorId: number) => {
    try {
      const data = await getPathways(floorId);
      setPathways(data);
    } catch (error) {
      console.error('Error loading pathways:', error);
    }
  };

  const currentFloorRooms = rooms.filter(r => r.floor_id === selectedFloor);
  const currentFloorPaths = pathways.filter(p => p.floor_id === selectedFloor);

  const addBuilding = async () => {
    const name = prompt('Building name:');
    if (name) {
      try {
        await createBuilding({ name });
        await loadBuildings();
        toast.success(`Added: ${name}`);
      } catch (error) {
        toast.error('Failed to create building');
      }
    }
  };

  const addFloor = async () => {
    const name = prompt('Floor name:');
    if (name) {
      try {
        const floorNumber = floors.filter(f => f.building_id === selectedBuilding).length + 1;
        await createFloor({
          building_id: selectedBuilding,
          floor_number: floorNumber,
          name,
        });
        await loadFloors(selectedBuilding);
        toast.success(`Added: ${name}`);
      } catch (error) {
        toast.error('Failed to create floor');
      }
    }
  };

  // Convert screen coordinates to SVG coordinates
  const getSVGCoords = (e: React.MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const handleMapClick = (e: React.MouseEvent) => {
    if (editMode !== 'pathway' || isPanning) return;

    const coords = getSVGCoords(e);
    setDrawingPath([...drawingPath, coords]);
  };

  const finishPathway = async () => {
    if (drawingPath.length < 2) {
      toast.error('Need at least 2 points');
      return;
    }

    try {
      await createPathway({
        floor_id: selectedFloor,
        name: `Pathway ${pathways.length + 1}`,
        points: drawingPath,
        width: 40,
        type: 'corridor',
      });
      await loadPathways(selectedFloor);
      setDrawingPath([]);
      toast.success('Pathway created!');
    } catch (error) {
      toast.error('Failed to create pathway');
    }
  };

  const deletePath = async (id: number) => {
    try {
      await deletePathway(id);
      await loadPathways(selectedFloor);
      toast.info('Pathway deleted');
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const handleRoomMouseDown = (e: React.MouseEvent, node: number) => {
    if (editMode !== 'room') return;
    e.stopPropagation();
    
    const room = rooms.find(r => r.node === node);
    if (!room) return;

    const coords = getSVGCoords(e);
    setDraggingRoom(node);
    setDragStart({ x: coords.x - room.x, y: coords.y - room.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingRoom !== null && editMode === 'room') {
      const coords = getSVGCoords(e);
      setRooms(rooms.map(room => 
        room.node === draggingRoom
          ? { ...room, x: coords.x - dragStart.x, y: coords.y - dragStart.y }
          : room
      ));
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingRoom(null);
    setIsPanning(false);
  };

  const handlePanStart = (e: React.MouseEvent) => {
    if (editMode === 'room' && !draggingRoom) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.5));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  const saveChanges = async () => {
    try {
      console.log('Saving rooms:', rooms);
      
      const response = await fetch('http://localhost:3000/api/map-layout/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to save: ${error}`);
      }
      
      const result = await response.json();
      console.log('Save result:', result);
      
      window.dispatchEvent(new Event('map-layout-updated'));
      
      toast.success('Changes saved!', {
        description: `Saved ${result.updated} rooms. Dashboard will update.`
      });
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save changes', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
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
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <MapPin className="h-6 w-6 text-gray-400" />
                Map Editor
              </h2>
              <p className="text-sm text-gray-500">
                {editMode === 'room' ? 'Drag rooms to position' : 'Click to draw pathway'}
              </p>
            </div>
          </div>
          <Button onClick={saveChanges} className="bg-gray-900">
            <Save className="h-4 w-4 mr-2" />
            Save All
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Controls */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Buildings */}
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4" />
                    Building
                  </Label>
                  <div className="space-y-2">
                    {buildings.map(b => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBuilding(b.id)}
                        className={`w-full text-left px-3 py-2 text-sm rounded border ${
                          selectedBuilding === b.id
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                    <Button onClick={addBuilding} variant="outline" size="sm" className="w-full">
                      <Plus className="h-3 w-3 mr-1" />
                      Add Building
                    </Button>
                  </div>
                </div>

                {/* Floors */}
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <Layers className="h-4 w-4" />
                    Floor
                  </Label>
                  <div className="space-y-2">
                    {floors.filter(f => f.building_id === selectedBuilding).map(f => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedFloor(f.id)}
                        className={`w-full text-left px-3 py-2 text-sm rounded border ${
                          selectedFloor === f.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                    <Button onClick={addFloor} variant="outline" size="sm" className="w-full">
                      <Plus className="h-3 w-3 mr-1" />
                      Add Floor
                    </Button>
                  </div>
                </div>

                {/* Edit Mode */}
                <div>
                  <Label className="mb-2">Edit Mode</Label>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setEditMode('room');
                        setDrawingPath([]);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm rounded border ${
                        editMode === 'room'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200'
                      }`}
                    >
                      <Building2 className="h-3 w-3 inline mr-2" />
                      Rooms (Drag)
                    </button>
                    <button
                      onClick={() => setEditMode('pathway')}
                      className={`w-full text-left px-3 py-2 text-sm rounded border ${
                        editMode === 'pathway'
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200'
                      }`}
                    >
                      <Route className="h-3 w-3 inline mr-2" />
                      Pathways (Click)
                    </button>
                  </div>
                  
                  {editMode === 'pathway' && (
                    <div className="mt-4 p-3 bg-orange-50 rounded border border-orange-200">
                      <p className="text-xs text-orange-700 mb-2">
                        Click to add points
                      </p>
                      {drawingPath.length > 0 && (
                        <div className="space-y-2">
                          <Badge variant="outline">{drawingPath.length} points</Badge>
                          <div className="flex gap-2">
                            <Button onClick={finishPathway} size="sm" className="flex-1">
                              Finish
                            </Button>
                            <Button onClick={() => setDrawingPath([])} size="sm" variant="outline">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Pathways List */}
                {currentFloorPaths.length > 0 && (
                  <div>
                    <Label className="mb-2">Pathways ({currentFloorPaths.length})</Label>
                    <ScrollArea className="h-40">
                      <div className="space-y-2">
                        {currentFloorPaths.map(p => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs"
                          >
                            <span>{p.name || `Pathway ${p.id}`}</span>
                            <button
                              onClick={() => deletePath(p.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Map Canvas */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base flex justify-between">
                <span>
                  {buildings.find(b => b.id === selectedBuilding)?.name || 'Building'} - {' '}
                  {floors.find(f => f.id === selectedFloor)?.name || 'Floor'}
                </span>
                <div className="flex gap-2">
                  <Badge variant="outline">{currentFloorRooms.length} rooms</Badge>
                  <Badge variant="outline">{currentFloorPaths.length} paths</Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Zoom Controls */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white rounded-lg shadow-md p-2 border">
                  <button
                    onClick={handleZoomIn}
                    className="h-8 w-8 flex items-center justify-center hover:bg-gray-100 rounded"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="h-8 w-8 flex items-center justify-center hover:bg-gray-100 rounded"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleResetView}
                    className="h-8 w-8 flex items-center justify-center hover:bg-gray-100 rounded"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <div className="border-t my-1" />
                  <div className="text-xs text-center">{Math.round(zoom * 100)}%</div>
                </div>

                {/* SVG Map */}
                <div 
                  className="bg-white rounded border overflow-hidden"
                  style={{ 
                    cursor: isPanning ? 'grabbing' : editMode === 'room' ? 'grab' : 'crosshair',
                    height: 600
                  }}
                >
                  <svg
                    ref={svgRef}
                    width="100%"
                    height="600"
                    viewBox="0 0 800 600"
                    onMouseDown={handlePanStart}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                  >
                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                      <defs>
                        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect width="800" height="600" fill="#fafafa" />
                      <rect width="800" height="600" fill="url(#grid)" onClick={handleMapClick} />

                      {/* Pathways */}
                      {currentFloorPaths.map(path => (
                        <g key={path.id}>
                          <polyline
                            points={path.points.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth={path.width}
                            strokeLinecap="round"
                            opacity="0.3"
                          />
                          <polyline
                            points={path.points.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="2"
                            strokeDasharray="5,5"
                          />
                        </g>
                      ))}

                      {/* Drawing path */}
                      {drawingPath.length > 0 && (
                        <>
                          <polyline
                            points={drawingPath.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="40"
                            strokeLinecap="round"
                            opacity="0.3"
                          />
                          {drawingPath.map((p, idx) => (
                            <circle key={idx} cx={p.x} cy={p.y} r="5" fill="#3b82f6" />
                          ))}
                        </>
                      )}

                      {/* Rooms */}
                      {currentFloorRooms.map(room => (
                        <g 
                          key={room.node}
                          onMouseDown={(e) => handleRoomMouseDown(e, room.node)}
                          style={{ cursor: editMode === 'room' ? 'move' : 'default' }}
                        >
                          <rect
                            x={room.x}
                            y={room.y}
                            width="200"
                            height="150"
                            fill="white"
                            stroke={draggingRoom === room.node ? '#3b82f6' : '#e5e7eb'}
                            strokeWidth="2"
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
                          <text
                            x={room.x + 100}
                            y={room.y + 110}
                            textAnchor="middle"
                            className="text-xs fill-gray-400"
                            pointerEvents="none"
                          >
                            Floor: {room.floor_id} | Bldg: {room.building_id}
                          </text>
                        </g>
                      ))}
                    </g>
                  </svg>
                </div>

                <div className="mt-2 text-xs text-gray-500 text-center">
                  {editMode === 'room' ? '🖱️ Drag rooms to reposition' : '🖱️ Click to draw pathway'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
