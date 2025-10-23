/**
 * Device Setup Screen
 * หน้าจอสำหรับตั้งค่าและจัดการอุปกรณ์
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useSensorData, useDeviceLabels } from '../hooks/useApi';
import { Settings, Save, X, Edit2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface EditingDevice {
  node: number;
  wheel: number;
  node_label: string;
  wheel_label: string;
}

export function DeviceSetupScreen() {
  const { data: sensorData, refetch } = useSensorData();
  const { updateLabels, loading: updating } = useDeviceLabels();
  
  const [editingDevice, setEditingDevice] = useState<EditingDevice | null>(null);
  const [nodeLabel, setNodeLabel] = useState('');
  const [wheelLabel, setWheelLabel] = useState('');

  // เริ่มแก้ไข
  const startEdit = (node: number, wheel: number, currentNodeLabel: string, currentWheelLabel: string) => {
    setEditingDevice({ node, wheel, node_label: currentNodeLabel, wheel_label: currentWheelLabel });
    setNodeLabel(currentNodeLabel);
    setWheelLabel(currentWheelLabel);
  };

  // ยกเลิกการแก้ไข
  const cancelEdit = () => {
    setEditingDevice(null);
    setNodeLabel('');
    setWheelLabel('');
  };

  // บันทึกการแก้ไข
  const saveEdit = async () => {
    if (!editingDevice) return;

    try {
      await updateLabels(editingDevice.node, editingDevice.wheel, {
        node_label: nodeLabel || undefined,
        wheel_label: wheelLabel || undefined,
      });
      
      toast.success('บันทึกสำเร็จ', {
        description: `อัพเดท Node ${editingDevice.node} Wheel ${editingDevice.wheel}`,
      });
      
      await refetch();
      cancelEdit();
    } catch (error) {
      console.error('Error saving labels:', error);
      toast.error('บันทึกไม่สำเร็จ', {
        description: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด',
      });
    }
  };

  // จัดกลุ่มอุปกรณ์ตาม node
  const devicesByNode = sensorData.reduce((acc, sensor) => {
    if (!acc[sensor.node]) {
      acc[sensor.node] = [];
    }
    acc[sensor.node].push(sensor);
    return acc;
  }, {} as Record<number, typeof sensorData>);

  const nodeNumbers = Object.keys(devicesByNode).map(Number).sort((a, b) => a - b);

  return (
    <div className="h-full bg-[#fafafa] overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="english-text text-[#0056B3] flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Device Setup
          </h2>
          <p className="thai-text text-muted-foreground">การตั้งค่าอุปกรณ์</p>
        </div>

        {/* Instructions */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="text-base">คำแนะนำ</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>• คลิกปุ่ม <Edit2 className="inline h-4 w-4" /> เพื่อแก้ไขชื่ออุปกรณ์</p>
            <p>• Node Label = ชื่อห้องหรือตำแหน่งติดตั้ง</p>
            <p>• Wheel Label = ชื่อรถเข็นหรือหมายเลขอ้างอิง</p>
            <p>• อุปกรณ์ที่ออฟไลน์จะแสดงเป็นสีเทา</p>
          </CardContent>
        </Card>

        {/* Device List */}
        <div className="space-y-4">
          {nodeNumbers.length === 0 ? (
            <Card>
              <CardContent className="py-20 text-center">
                <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">ไม่พบอุปกรณ์</p>
                <p className="text-sm text-muted-foreground">รอการเชื่อมต่อจาก sensor nodes</p>
              </CardContent>
            </Card>
          ) : (
            nodeNumbers.map((nodeNum) => {
              const devices = devicesByNode[nodeNum];
              const firstDevice = devices[0];
              const nodeLabel = firstDevice.node_label || `Node ${nodeNum}`;

              return (
                <Card key={nodeNum}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="english-text text-lg">{nodeLabel}</span>
                      <Badge variant="outline">Node {nodeNum}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-[400px]">
                      <div className="space-y-3">
                        {devices.map((device) => {
                          const isEditing = editingDevice?.node === device.node && editingDevice?.wheel === device.wheel;
                          
                          return (
                            <div
                              key={`${device.node}-${device.wheel}`}
                              className={`p-4 rounded-lg border-2 transition-all ${
                                isEditing
                                  ? 'border-[#0056B3] bg-blue-50'
                                  : device.stale
                                  ? 'border-gray-200 bg-gray-50 opacity-60'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {isEditing ? (
                                /* Edit Mode */
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor={`node-label-${device.node}-${device.wheel}`}>
                                        Node Label
                                      </Label>
                                      <Input
                                        id={`node-label-${device.node}-${device.wheel}`}
                                        value={nodeLabel}
                                        onChange={(e) => setNodeLabel(e.target.value)}
                                        placeholder={`Node ${device.node}`}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`wheel-label-${device.node}-${device.wheel}`}>
                                        Wheelchair Label
                                      </Label>
                                      <Input
                                        id={`wheel-label-${device.node}-${device.wheel}`}
                                        value={wheelLabel}
                                        onChange={(e) => setWheelLabel(e.target.value)}
                                        placeholder={`Wheel ${device.wheel}`}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      onClick={saveEdit}
                                      disabled={updating}
                                      size="sm"
                                      className="bg-[#00945E] hover:bg-[#007a4d]"
                                    >
                                      <Check className="mr-2 h-4 w-4" />
                                      {updating ? 'กำลังบันทึก...' : 'บันทึก'}
                                    </Button>
                                    <Button
                                      onClick={cancelEdit}
                                      disabled={updating}
                                      size="sm"
                                      variant="outline"
                                    >
                                      <X className="mr-2 h-4 w-4" />
                                      ยกเลิก
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* View Mode */
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-semibold text-lg">
                                        {device.wheel_label || `Wheel ${device.wheel}`}
                                      </h4>
                                      {device.stale ? (
                                        <Badge variant="secondary">Offline</Badge>
                                      ) : device.motion === 1 ? (
                                        <Badge className="bg-green-500">Moving</Badge>
                                      ) : (
                                        <Badge variant="outline">Online</Badge>
                                      )}
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                      <div>
                                        <p className="text-muted-foreground text-xs">Wheel ID</p>
                                        <p className="font-mono font-semibold">{device.wheel}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground text-xs">Distance</p>
                                        <p className="font-mono">
                                          {device.distance !== null && device.distance !== undefined
                                            ? `${device.distance.toFixed(2)} m`
                                            : '-'}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground text-xs">RSSI</p>
                                        <p className={`font-mono ${
                                          !device.rssi ? 'text-gray-400' :
                                          device.rssi >= -60 ? 'text-green-600' :
                                          device.rssi >= -75 ? 'text-yellow-600' :
                                          'text-red-600'
                                        }`}>
                                          {device.rssi ? `${device.rssi} dBm` : '-'}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground text-xs">Motion</p>
                                        <p className="font-mono">
                                          {device.motion === 1 ? 'Moving' : 'Idle'}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {device.ts && (
                                      <div className="text-xs text-muted-foreground">
                                        Last updated: {new Date(device.ts).toLocaleString('th-TH')}
                                      </div>
                                    )}
                                  </div>
                                  
                                  <Button
                                    onClick={() => startEdit(
                                      device.node,
                                      device.wheel,
                                      device.node_label || `Node ${device.node}`,
                                      device.wheel_label || `Wheel ${device.wheel}`
                                    )}
                                    size="sm"
                                    variant="outline"
                                    className="ml-4"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-muted-foreground mb-1">Total Nodes</p>
                <p className="text-3xl font-bold text-blue-600">{nodeNumbers.length}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-muted-foreground mb-1">Total Devices</p>
                <p className="text-3xl font-bold text-green-600">{sensorData.length}</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-muted-foreground mb-1">Online Devices</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {sensorData.filter(d => !d.stale).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
