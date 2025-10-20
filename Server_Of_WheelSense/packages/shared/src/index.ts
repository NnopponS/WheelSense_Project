export enum WheelStatusCode {
  OK = 0,
  IMU_NOT_FOUND = 1,
  ACCEL_UNRELIABLE = 2,
  DTHETA_CLIPPED = 3,
  UNKNOWN = 255
}

export enum WheelMotionCode {
  STOP = 0,
  FORWARD = 1,
  BACKWARD = 2
}

export enum WheelDirectionCode {
  STRAIGHT = 0,
  LEFT = 1,
  RIGHT = 2
}

export const statusText = (code: number): string => {
  switch (code) {
    case WheelStatusCode.OK:
      return "OK";
    case WheelStatusCode.IMU_NOT_FOUND:
      return "IMU_NOT_FOUND";
    case WheelStatusCode.ACCEL_UNRELIABLE:
      return "ACCEL_UNRELIABLE";
    case WheelStatusCode.DTHETA_CLIPPED:
      return "DTHETA_CLIPPED";
    default:
      return "UNKNOWN";
  }
};

export const motionText = (code: number): string => {
  switch (code) {
    case WheelMotionCode.FORWARD:
      return "FORWARD";
    case WheelMotionCode.BACKWARD:
      return "BACKWARD";
    default:
      return "STOP";
  }
};

export const directionText = (code: number): string => {
  switch (code) {
    case WheelDirectionCode.LEFT:
      return "LEFT";
    case WheelDirectionCode.RIGHT:
      return "RIGHT";
    default:
      return "STRAIGHT";
  }
};

export const distanceToUint16 = (distanceMeters: number): number => {
  const clamped = Math.max(0, Math.min(distanceMeters, 655.35));
  return Math.round(clamped * 100);
};

export const ewma = (previous: number | undefined, nextValue: number, alpha: number): number => {
  const base = Number.isFinite(previous) ? Number(previous) : nextValue;
  return base + alpha * (nextValue - base);
};

export interface RouteSnapshot {
  wheelId: number;
  wheelName: string;
  roomId: number;
  path: string[];
  recovered: boolean;
  recoveryMs?: number;
  latencyMs?: number;
  observedAt: string;
}

export const isSameRoute = (a: RouteSnapshot | undefined, b: RouteSnapshot | undefined): boolean => {
  if (!a || !b) return false;
  if (a.wheelId !== b.wheelId) return false;
  if (a.recovered !== b.recovered) return false;
  if ((a.path?.length ?? 0) !== (b.path?.length ?? 0)) return false;
  return a.path.every((value, index) => value === b.path[index]);
};
