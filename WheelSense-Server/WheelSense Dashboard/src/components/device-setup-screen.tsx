import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Radio, CheckCircle2, Network, ArrowRight, Edit } from 'lucide-react'
import { useSensorData, useDeviceLabels } from '../hooks/useApi'
import type { SensorData } from '../services/api'

// ---- Types ----
interface Device {
  id: string
  name: string
  mac: string
  rssi: number
  type: 'wheelchair' | 'node' | 'gateway'
  status: 'online' | 'offline'
  room?: string
  nodeId?: number
  wheelId?: number
}

interface MQTTRoute {
  from: string
  to: string
  topic: string
  qos: number
  retained: boolean
  lastMessage: string
}

interface EditDialogProps {
  device: Device
  onSave: (nodeId: number, wheelId: number, nodeLabel: string, wheelLabel: string) => Promise<void>
}

// ---- Utils ----
const isDefined = <T,>(v: T | undefined | null): v is T => v !== undefined && v !== null
const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
const safeTime = (d: unknown) => {
  const t = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d instanceof Date ? d : new Date()
  return isNaN(t.getTime()) ? new Date() : t
}

function EditDeviceDialog({ device, onSave }: EditDialogProps) {
  const [open, setOpen] = useState(false)
  const [nodeLabel, setNodeLabel] = useState(device.room ?? '')
  const [wheelLabel, setWheelLabel] = useState(device.name ?? '')
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    // avoid treating 0 as falsy; check undefined explicitly
    if (device.nodeId === undefined || device.wheelId === undefined) return
    setLoading(true)
    try {
      await onSave(device.nodeId, device.wheelId, nodeLabel.trim(), wheelLabel.trim())
      setOpen(false)
    } catch (error) {
      console.error('Failed to save labels:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Edit labels">
        <Edit className="h-4 w-4" />
      </Button>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Device Labels</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor={`nodeLabel-${device.id}`}>Room/Node Label</Label>
                <Input
                  id={`nodeLabel-${device.id}`}
                  value={nodeLabel}
                  onChange={e => setNodeLabel(e.target.value)}
                  placeholder="Enter room name"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor={`wheelLabel-${device.id}`}>Wheelchair Label</Label>
                <Input
                  id={`wheelLabel-${device.id}`}
                  value={wheelLabel}
                  onChange={e => setWheelLabel(e.target.value)}
                  placeholder="Enter wheelchair name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={loading || (!nodeLabel.trim() && !wheelLabel.trim())}>
                  {loading ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

export function DeviceSetupScreen() {
  const { data: sensorData = [], loading, error } = useSensorData()
  const { updateLabel } = useDeviceLabels()

  const devices: Device[] = useMemo(
    () =>
      (sensorData as SensorData[]).map(sensor => ({
        id: `${sensor.node_id}-${sensor.wheel_id}`,
        name: sensor.wheel_label || `Wheel ${sensor.wheel_id}`,
        mac: `AA:BB:CC:DD:EE:${String(sensor.node_id ?? '').padStart(2, '0')}`,
        rssi: sensor.rssi ?? 0,
        type: 'wheelchair',
        status: sensor.stale ? 'offline' : 'online',
        room: sensor.node_label || `Room ${sensor.node_id}`,
        nodeId: sensor.node_id,
        wheelId: sensor.wheel_id,
      })),
    [sensorData]
  )

  const mqttRoutes: MQTTRoute[] = useMemo(
    () =>
      (sensorData as SensorData[]).map(sensor => {
        const room = sensor.node_label || `Room-${sensor.node_id}`
        const wheel = sensor.wheel_label || `Wheel-${sensor.wheel_id}`
        const from = `${room}-${wheel}`
        const topic = `wheelsense/wheelchair/${slug(room)}-${slug(wheel)}/telemetry`
        const to = 'MQTT Broker'
        const lastMessage = safeTime(sensor.ts).toLocaleTimeString()
        return { from, to, topic, qos: 0, retained: false, lastMessage }
      }),
    [sensorData]
  )

  const handleSaveLabels = async (nodeId: number, wheelId: number, nodeLabel: string, wheelLabel: string) => {
    await updateLabel(nodeId, wheelId, nodeLabel, wheelLabel)
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0056B3] mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading devices...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-destructive">
          <p>Error loading devices</p>
          <p className="text-sm mt-2">{String(error)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-[#fafafa]">
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h2 className="english-text text-[#0056B3]">Device Setup</h2>
          <p className="thai-text text-muted-foreground">จัดการอุปกรณ์และการเชื่อมต่อ</p>
        </div>

        <Tabs defaultValue="devices" className="w-full">
          <TabsList>
            <TabsTrigger value="devices">
              <Radio className="mr-2 h-4 w-4" />
              Devices
            </TabsTrigger>
            <TabsTrigger value="mqtt">
              <Network className="mr-2 h-4 w-4" />
              MQTT Routes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="devices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  Connected Devices ({devices.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {devices.map(device => (
                      <Card key={device.id} className="border-l-4 border-l-[#0056B3]">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold">{device.name}</h4>
                              <Badge variant={device.status === 'online' ? 'default' : 'secondary'} className="mt-1">
                                {device.status}
                              </Badge>
                            </div>
                            <EditDeviceDialog device={device} onSave={handleSaveLabels} />
                          </div>
                          <div className="text-sm space-y-1 mt-3">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">MAC:</span>
                              <span className="font-mono">{device.mac}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">RSSI:</span>
                              <span>{device.rssi} dBm</span>
                            </div>
                            {device.room && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">📍 Location:</span>
                                <span>{device.room}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mqtt" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>MQTT Routes ({mqttRoutes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {mqttRoutes.map((route, idx) => (
                      <Card key={idx} className="border-l-4 border-l-green-500">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span className="font-semibold">{route.from}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">{route.to}</span>
                          </div>
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Topic:</span>
                              <span className="font-mono text-xs">{route.topic}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">QoS:</span>
                              <span>{route.qos}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Last Message:</span>
                              <span>{route.lastMessage}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
