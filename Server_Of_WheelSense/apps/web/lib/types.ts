export interface Room {
  id: number;
  name: string;
  rect_x: number;
  rect_y: number;
  rect_w: number;
  rect_h: number;
}

export interface WheelSummary {
  id: number;
  name: string;
  assignedRoomId: number | null;
  assignedRoomName: string | null;
  online: boolean;
  lastSeen: string | null;
  avgRssi: number | null;
  roomId: number | null;
}

export interface RouteSnapshot {
  wheelId: number;
  wheelName: string;
  roomId: number;
  roomName: string;
  path: string[];
  hopCount?: number;
  recovered: boolean;
  recoveryMs?: number | null;
  latencyMs?: number | null;
  observedAt: string;
}
