import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { MapPin, Plus, Edit, Save, X, Trash2 } from 'lucide-react';
import { useMapLayout } from '../hooks/useApi';
import { MapLayout } from '../services/api';

interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface RoomEditorProps {
  room?: Room;
  onSave: (room: Room) => void;
  onCancel: () => void;
}

function RoomEditor({ room, onSave, onCancel }: RoomEditorProps) {
  const [name, setName] = useState(room?.name || '');
  const [x, setX] = useState(room?.x || 100);
  const [y, setY] = useState(room?.y || 100);
  const [width, setWidth] = useState(room?.width || 200);
  const [height, setHeight] = useState(room?.height || 150);
  const [color, setColor] = useState(room?.color || '#e8f4ff');

  const handleSave = () => {
    const newRoom: Room = {
      id: room?.id || `room-${Date.now()}`,
      name,
      x,
      y,
      width,
      height,
      color,
    };
    onSave(newRoom);
  };

  const predefinedColors = [
    { name: 'Blue', value: '#e8f4ff' },
    { name: 'Green', value: '#f0fdf4' },
    { name: 'Yellow', value: '#fef3c7' },
    { name: 'Purple', value: '#ede9fe' },
    { name: 'Red', value: '#fee2e2' },
    { name: 'Orange', value: '#ffedd5' },
    { name: 'Pink', value: '#fce7f3' },
    { name: 'Gray', value: '#f3f4f6' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="roomName">Room Name</Label>
        <Input
          id="roomName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter room name"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="roomX">X Position</Label>
          <Input
            id="roomX"
            type="number"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="roomY">Y Position</Label>
          <Input
            id="roomY"
            type="number"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="roomWidth">Width</Label>
          <Input
            id="roomWidth"
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          />
        </div>
        <div>
          <Label htmlFor="roomHeight">Height</Label>
          <Input
            id="roomHeight"
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </div>
      </div>
      <div>
        <Label>Room Color</Label>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {predefinedColors.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className={`h-10 rounded-md border-2 transition-all ${
                color === c.value ? 'border-[#0056B3] ring-2 ring-[#0056B3] ring-offset-2' : 'border-gray-300'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>
        <div className="mt-2">
          <Label htmlFor="customColor" className="text-xs">Custom Color</Label>
          <Input
            id="customColor"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-full cursor-pointer"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save Room
        </Button>
      </div>
    </div>
  );
}

export function MapLayoutEditor() {
  const { layout: mapLayout, loading, saveLayout } = useMapLayout();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draggingRoom, setDraggingRoom] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Convert map layout to rooms
  useEffect(() => {
    if (mapLayout.length > 0) {
      const convertedRooms = mapLayout.map((room, index) => ({
        id: `room-${room.room_id}`,
        name: room.room_name,
        x: room.x_pos,
        y: room.y_pos,
        width: 200,
        height: 150,
        color: ['#e8f4ff', '#f0fdf4', '#fef3c7', '#ede9fe', '#fee2e2'][index % 5],
      }));
      setRooms(convertedRooms);
    } else {
      // Start with empty layout - users can add rooms as needed
      setRooms([]);
    }
  }, [mapLayout]);

  const handleSaveRoom = (room: Room) => {
    const updatedRooms = editingRoom
      ? rooms.map(r => r.id === room.id ? room : r)
      : [...rooms, room];
    setRooms(updatedRooms);
    setEditingRoom(null);
    setShowEditor(false);
  };

  const handleDeleteRoom = (roomId: string) => {
    const updatedRooms = rooms.filter(r => r.id !== roomId);
    setRooms(updatedRooms);
  };

  const handleSaveLayout = async () => {
    const layoutData: MapLayout[] = rooms.map((room, index) => ({
      room_id: index + 1,
      room_name: room.name,
      x_pos: room.x,
      y_pos: room.y,
    }));
    
    try {
      await saveLayout(layoutData);
    } catch (error) {
      console.error('Failed to save layout:', error);
    }
  };

  // Import rooms from online nodes (using current sensor data via window.__SENSOR_DATA if available)
  const handleImportFromOnlineNodes = async () => {
    try {
      setImporting(true);
      // Expect sensor data to be available via custom event; if not, gracefully skip
      const globalAny: any = window as any;
      const sensorData: any[] = globalAny.__SENSOR_DATA || [];
      const uniqueNodes = Array.from(new Set(sensorData.map((s: any) => s.node_id)));
      if (uniqueNodes.length === 0) {
        setImporting(false);
        return;
      }

      const baseX = 100;
      const baseY = 100;
      const newRooms: Room[] = uniqueNodes.map((nodeId: number, idx: number) => {
        const s = sensorData.find((x: any) => x.node_id === nodeId);
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        return {
          id: `room-${nodeId}`,
          name: s?.node_label || `Room ${nodeId}`,
          x: baseX + col * 250,
          y: baseY + row * 200,
          width: 200,
          height: 150,
          color: ['#e8f4ff', '#f0fdf4', '#fef3c7', '#ede9fe', '#fee2e2'][idx % 5],
        };
      });
      setRooms(newRooms);
    } finally {
      setImporting(false);
    }
  };

  // Drag and drop handlers
  const handleMouseDown = (roomId: string, e: React.MouseEvent<SVGRectElement>) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    setDraggingRoom(roomId);
    setDragOffset({
      x: svgP.x - room.x,
      y: svgP.y - room.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingRoom) return;
    
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    setRooms(prevRooms => prevRooms.map(room => 
      room.id === draggingRoom 
        ? { ...room, x: Math.round(svgP.x - dragOffset.x), y: Math.round(svgP.y - dragOffset.y) }
        : room
    ));
  };

  const handleMouseUp = () => {
    setDraggingRoom(null);
  };

  return (
    <div className="h-full bg-[#fafafa]">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="english-text text-[#0056B3]">Map Layout Editor</h2>
            <p className="thai-text text-muted-foreground">แก้ไขตำแหน่งห้องในแผนที่</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowEditor(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Room
            </Button>
          <Button onClick={handleImportFromOnlineNodes} disabled={importing} variant="outline">
            <MapPin className="mr-2 h-4 w-4" />
            {importing ? 'Importing...' : 'Import from Online Nodes'}
          </Button>
            <Button onClick={handleSaveLayout} disabled={loading}>
              <Save className="mr-2 h-4 w-4" />
              Save Layout
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map Preview */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Floor Map Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full h-[600px] bg-white border-2 border-border rounded-lg overflow-hidden">
                <svg 
                  width="100%" 
                  height="100%" 
                  viewBox="0 0 900 650"
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {rooms.map((room) => (
                    <g key={room.id}>
                      <rect
                        x={room.x}
                        y={room.y}
                        width={room.width}
                        height={room.height}
                        fill={room.color}
                        stroke="#0056B3"
                        strokeWidth="2"
                        rx="8"
                        onMouseDown={(e) => handleMouseDown(room.id, e)}
                        style={{ 
                          cursor: draggingRoom === room.id ? 'grabbing' : 'grab',
                          opacity: draggingRoom === room.id ? 0.7 : 1,
                          transition: draggingRoom === room.id ? 'none' : 'opacity 0.2s'
                        }}
                      />
                      <text
                        x={room.x + room.width / 2}
                        y={room.y + room.height / 2}
                        textAnchor="middle"
                        className="english-text"
                        fill="#1a1a1a"
                        fontSize="14"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {room.name}
                      </text>
                      {/* Edit button overlay */}
                      <foreignObject x={room.x + room.width - 30} y={room.y + 5} width="25" height="25">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 w-6 p-0"
                          onClick={() => setEditingRoom(room)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </foreignObject>
                    </g>
                  ))}
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* Room List */}
          <Card>
            <CardHeader>
              <CardTitle>Room List</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {rooms.map((room) => (
                    <Card key={room.id} className="border-l-4" style={{ borderLeftColor: room.color }}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{room.name}</h4>
                              <div 
                                className="h-4 w-4 rounded border border-gray-300" 
                                style={{ backgroundColor: room.color }}
                                title={`Color: ${room.color}`}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1 mt-1">
                              <div>Position: ({room.x}, {room.y})</div>
                              <div>Size: {room.width} × {room.height}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingRoom(room)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteRoom(room.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Room Editor Dialog */}
        <Dialog open={showEditor || !!editingRoom} onOpenChange={() => {
          setShowEditor(false);
          setEditingRoom(null);
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingRoom ? 'Edit Room' : 'Add New Room'}
              </DialogTitle>
            </DialogHeader>
            <RoomEditor
              room={editingRoom || undefined}
              onSave={handleSaveRoom}
              onCancel={() => {
                setShowEditor(false);
                setEditingRoom(null);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
