// Direction codes from ESP32
export enum WheelDirectionCode {
  STRAIGHT = 0,
  LEFT = 1,
  RIGHT = 2,
}

// Convert direction code to text
export function getDirectionText(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'UNKNOWN';
  
  switch (code) {
    case WheelDirectionCode.LEFT:
      return 'LEFT';
    case WheelDirectionCode.RIGHT:
      return 'RIGHT';
    case WheelDirectionCode.STRAIGHT:
    default:
      return 'STRAIGHT';
  }
}

// Convert direction code to Thai labels
export function getDirectionLabel(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'ไม่ระบุ';
  
  switch (code) {
    case WheelDirectionCode.LEFT:
      return '⬅️ ซ้าย';
    case WheelDirectionCode.RIGHT:
      return '➡️ ขวา';
    case WheelDirectionCode.STRAIGHT:
    default:
      return '⬆️ ตรง';
  }
}

// Get emoji only
export function getDirectionEmoji(code: number | null | undefined): string {
  if (code === null || code === undefined) return '❓';
  
  switch (code) {
    case WheelDirectionCode.LEFT:
      return '⬅️';
    case WheelDirectionCode.RIGHT:
      return '➡️';
    case WheelDirectionCode.STRAIGHT:
    default:
      return '⬆️';
  }
}

// Get color based on direction
export function getDirectionColor(code: number | null | undefined): string {
  if (code === null || code === undefined) return 'text-gray-500';
  
  switch (code) {
    case WheelDirectionCode.LEFT:
      return 'text-purple-600';
    case WheelDirectionCode.RIGHT:
      return 'text-blue-600';
    case WheelDirectionCode.STRAIGHT:
    default:
      return 'text-green-600';
  }
}

