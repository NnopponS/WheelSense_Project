/**
 * Polar-compatible discovery and standard BLE heart-rate (GATT 0x180D / 0x2A37).
 * Verity Sense often exposes standard HR over BLE; full PPG needs polarofficial native SDK.
 */

import type { BleManager, Device } from 'react-native-ble-plx';
import { State as BLEState } from 'react-native-ble-plx';
import { BLEScanner } from './BLEScanner';
import { useAppStore } from '../store/useAppStore';
import type { PolarDevice } from '../types';

const HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

const POLAR_NAME_RE = /polar|verity|sense|h10|oh1/i;

function looksLikePolarDevice(name: string | null | undefined): boolean {
  if (!name) return false;
  return POLAR_NAME_RE.test(name);
}

function parseHrFromMeasurement(base64Value: string | null): number | null {
  if (!base64Value) return null;
  try {
    const raw = globalThis.atob(base64Value);
    const len = raw.length;
    if (len < 2) return null;
    const flags = raw.charCodeAt(0);
    const uint8Hr = (flags & 0x01) === 0;
    let hr: number;
    if (uint8Hr) {
      hr = raw.charCodeAt(1);
    } else {
      if (len < 3) return null;
      hr = raw.charCodeAt(1) | (raw.charCodeAt(2) << 8);
    }
    return hr > 0 && hr < 300 ? hr : null;
  } catch {
    return null;
  }
}

export function canUsePolarBlePlx(): boolean {
  try {
    BLEScanner.getManager();
    return true;
  } catch {
    return false;
  }
}

export async function scanPolarDevicesPlx(durationMs: number): Promise<void> {
  const permitted = await BLEScanner.requestPermissions();
  if (!permitted) {
    throw new Error('Bluetooth permissions not granted');
  }
  const manager = BLEScanner.getManager();
  const state = await manager.state();
  if (state !== BLEState.PoweredOn) {
    throw new Error(`Bluetooth is not powered on (${state})`);
  }

  const seen = new Set<string>();
  manager.startDeviceScan(null, null, (_err, device) => {
    if (!device?.id) return;
    const name = device.name || device.localName;
    if (!looksLikePolarDevice(name)) return;
    if (seen.has(device.id)) return;
    seen.add(device.id);
    const row: PolarDevice = {
      deviceId: device.id,
      name: name || 'Polar',
    };
    useAppStore.getState().reportPolarDiscovered(row);
  });

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      manager.stopDeviceScan();
      resolve();
    }, durationMs);
  });
}

export async function connectPolarPlx(deviceId: string): Promise<Device> {
  const permitted = await BLEScanner.requestPermissions();
  if (!permitted) {
    throw new Error('Bluetooth permissions not granted');
  }
  const manager = BLEScanner.getManager();
  const dev = await manager.connectToDevice(deviceId, { timeout: 15000 });
  await dev.discoverAllServicesAndCharacteristics();
  return dev;
}

export function startPlxHrMonitor(
  device: Device,
  onHr: (bpm: number) => void,
): { remove: () => void } {
  return device.monitorCharacteristicForService(
    HR_SERVICE_UUID,
    HR_MEASUREMENT_UUID,
    (error, characteristic) => {
      if (error || !characteristic?.value) return;
      const bpm = parseHrFromMeasurement(characteristic.value);
      if (bpm != null) onHr(bpm);
    },
  );
}
