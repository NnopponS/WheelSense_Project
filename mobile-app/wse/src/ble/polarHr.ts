// Polar Verity Sense / standard BLE Heart Rate parsing.
//
// The Polar Verity Sense exposes the standard Bluetooth SIG Heart Rate Service
// (0x180D) with the Heart Rate Measurement characteristic (0x2A37). This module
// decodes that characteristic into a beats-per-minute value plus optional
// RR-intervals, matching the `hr` field the WheelSense server ingests
// (see server/app/mqtt_handler.py:_handle_mobile_telemetry).

export const POLAR_HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
export const POLAR_HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';
// Short forms also accepted by react-native-ble-plx when discovering.
export const POLAR_HR_SERVICE_SHORT = '180d';
export const POLAR_HR_MEASUREMENT_SHORT = '2a37';

export type HeartRateMeasurement = {
  bpm: number;
  rrIntervalsMs: number[];
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a base64 string (as delivered by react-native-ble-plx) into bytes. */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const index = BASE64_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

/**
 * Parse the Heart Rate Measurement characteristic (0x2A37).
 *
 * Layout (Bluetooth SIG):
 *  - byte 0: flags
 *      bit 0: HR value format (0 = uint8, 1 = uint16)
 *      bit 3: energy expended present (2 bytes)
 *      bit 4: RR-intervals present (uint16 each, units of 1/1024 s)
 *  - HR value (1 or 2 bytes, little-endian)
 *  - optional energy expended (2 bytes)
 *  - optional RR-intervals (uint16 LE each)
 */
export function parseHeartRateMeasurement(bytes: Uint8Array): HeartRateMeasurement | null {
  if (bytes.length < 2) {
    return null;
  }
  const flags = bytes[0];
  const hr16 = (flags & 0x01) !== 0;
  const energyPresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;

  let offset = 1;
  let bpm: number;
  if (hr16) {
    if (bytes.length < offset + 2) {
      return null;
    }
    bpm = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
  } else {
    bpm = bytes[offset];
    offset += 1;
  }

  if (energyPresent) {
    offset += 2; // skip energy expended
  }

  const rrIntervalsMs: number[] = [];
  if (rrPresent) {
    for (; offset + 1 < bytes.length; offset += 2) {
      const raw = bytes[offset] | (bytes[offset + 1] << 8);
      // Convert from 1/1024 s units to milliseconds.
      rrIntervalsMs.push(Math.round((raw * 1000) / 1024));
    }
  }

  if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) {
    return null;
  }

  return { bpm, rrIntervalsMs };
}

/** Convert a base64 characteristic value straight into a HeartRateMeasurement. */
export function parseHeartRateBase64(value: string): HeartRateMeasurement | null {
  return parseHeartRateMeasurement(base64ToBytes(value));
}
