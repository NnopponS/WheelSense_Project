export const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export function computeStatus(entry) {
  if (!entry) return { isOffline: true, className: 'offline', label: 'Offline' };

  const lastSeen = Math.max(
    new Date(entry.ts || 0).getTime(),
    new Date(entry.received_at || 0).getTime()
  );

  // If there's no valid timestamp, it's offline
  if (lastSeen === 0) {
    return { isOffline: true, className: 'offline', label: 'Offline' };
  }

  const isOutdated = (Date.now() - lastSeen) > STALE_THRESHOLD_MS;
  const isOffline = entry.stale || isOutdated;

  return {
    isOffline,
    className: isOffline ? 'offline' : 'online',
    label: isOffline ? 'Offline' : 'Online',
  };
}

export const WheelStatusCode = {
  OK: 0,
  IMU_NOT_FOUND: 1,
  ACCEL_UNRELIABLE: 2,
  DTHETA_CLIPPED: 3,
  UNKNOWN: 255
};

export const WheelMotionCode = {
  STOP: 0,
  FORWARD: 1,
  BACKWARD: 2
};

export const WheelDirectionCode = {
  STRAIGHT: 0,
  LEFT: 1,
  RIGHT: 2
};

export const statusText = (code) => {
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

export const motionText = (code) => {
  switch (code) {
    case WheelMotionCode.FORWARD:
      return "FORWARD";
    case WheelMotionCode.BACKWARD:
      return "BACKWARD";
    default:
      return "STOP";
  }
};

export const directionText = (code) => {
  switch (code) {
    case WheelDirectionCode.LEFT:
      return "LEFT";
    case WheelDirectionCode.RIGHT:
      return "RIGHT";
    default:
      return "STRAIGHT";
  }
};