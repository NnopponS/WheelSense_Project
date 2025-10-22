import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { SensorData } from '../services/api';

interface NodeDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sensor?: SensorData | null;
}

export function NodeDetailModal({ open, onOpenChange, sensor }: NodeDetailModalProps) {
  if (!sensor) return null;

  const routePath = Array.isArray(sensor.route_path) ? sensor.route_path : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="english-text">Node Detail</span>
            <Badge className={sensor.stale ? 'bg-gray-400' : 'bg-[#00945E]'}>
              {sensor.stale ? 'stale' : 'live'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 text-sm">
            <div><span className="font-medium text-muted-foreground">Node:</span> {sensor.node_label || `Room ${sensor.node_id}`} (ID: {sensor.node_id})</div>
            <div><span className="font-medium text-muted-foreground">Wheel:</span> {sensor.wheel_label || `Wheel ${sensor.wheel_id}`} (ID: {sensor.wheel_id})</div>
            <div><span className="font-medium text-muted-foreground">RSSI:</span> {sensor.rssi} dBm</div>
            <div><span className="font-medium text-muted-foreground">Distance:</span> {sensor.distance ?? '-'} m</div>
            <div><span className="font-medium text-muted-foreground">Motion:</span> {sensor.motion === 1 ? 'moving' : 'idle'}</div>
            <div><span className="font-medium text-muted-foreground">Direction:</span> {sensor.direction}°</div>
          </div>

          <div className="space-y-2 text-sm">
            <div><span className="font-medium text-muted-foreground">Route recovered:</span> {sensor.route_recovered ? 'yes' : 'no'}</div>
            <div><span className="font-medium text-muted-foreground">Route latency:</span> {sensor.route_latency_ms ?? 0} ms</div>
            <div><span className="font-medium text-muted-foreground">Recovery time:</span> {sensor.route_recovery_ms ?? 0} ms</div>
            <div><span className="font-medium text-muted-foreground">Received at:</span> {sensor.received_at}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="font-medium text-muted-foreground mb-2">Routing path (node hops)</div>
          <ScrollArea className="h-32 border rounded-md p-2 bg-gray-50">
            {routePath.length === 0 ? (
              <div className="text-xs text-muted-foreground">No route path data</div>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                {routePath.map((hop, idx) => (
                  <Badge key={`${hop}-${idx}`} variant="outline" className="text-[#0056B3]">{hop}</Badge>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="mt-4">
          <div className="font-medium text-muted-foreground mb-2">Raw payload</div>
          <ScrollArea className="h-40 border rounded-md p-2 bg-black text-[#00ff00]">
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(sensor.raw ?? {}, null, 2)}</pre>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}






