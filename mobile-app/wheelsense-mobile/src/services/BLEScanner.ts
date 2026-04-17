/**
 * WheelSense Mobile App - BLE Scanner Service
 * Scans for Node_Tsimcam beacons (WSN_*) for RSSI-based localization
 * Supports continuous scanning mode for persistent telemetry
 */

import {
  BleManager,
  Device,
  ScanMode,
  State as BLEState,
} from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { BLEBeacon } from '../types';
import { useAppStore } from '../store/useAppStore';

/** Public surface shared by native BLE and Expo Go fallback (no native module). */
export interface BLEScannerApi {
  onBeaconsUpdated(callback: (beacons: BLEBeacon[]) => void): void;
  requestPermissions(): Promise<boolean>;
  startScanning(): Promise<void>;
  stopScanning(): void;
  startContinuousScanning(): Promise<void>;
  registerBackgroundTask(): Promise<void>;
  unregisterBackgroundTask(): Promise<void>;
  getIsScanning(): boolean;
  getIsContinuous(): boolean;
  cleanup(): void;
  getManager(): BleManager;
}

// ==================== CONSTANTS ====================

const NODE_PREFIX = 'WSN_';
const STALE_BEACON_MS = 30000; // 30 seconds
const SCAN_WINDOW_MS = 10000;  // 10 seconds per scan cycle
const SCAN_REST_MS = 2000;     // 2 seconds rest between cycles

const EXPO_GO_BLE_HINT =
  '[BLE] Bluetooth scanning needs a development build (expo run:android / run:ios). Expo Go does not ship react-native-ble-plx native code.';

/**
 * Used when `BleManager` native module is missing (Expo Go, web, or misconfigured build).
 */
class BleUnavailableScannerService implements BLEScannerApi {
  private onBeaconsUpdatedCallback: ((beacons: BLEBeacon[]) => void) | null = null;

  onBeaconsUpdated(callback: (beacons: BLEBeacon[]) => void): void {
    this.onBeaconsUpdatedCallback = callback;
  }

  async requestPermissions(): Promise<boolean> {
    return false;
  }

  async startScanning(): Promise<void> {
    console.warn(EXPO_GO_BLE_HINT);
  }

  stopScanning(): void {
    useAppStore.getState().setScanningBeacons(false);
  }

  async startContinuousScanning(): Promise<void> {
    console.warn(EXPO_GO_BLE_HINT);
  }

  async registerBackgroundTask(): Promise<void> {
    console.warn(EXPO_GO_BLE_HINT);
  }

  async unregisterBackgroundTask(): Promise<void> {}

  getIsScanning(): boolean {
    return false;
  }

  getIsContinuous(): boolean {
    return false;
  }

  cleanup(): void {
    this.stopScanning();
  }

  getManager(): BleManager {
    throw new Error(
      'BLE native module is not available. Use a development or production build with react-native-ble-plx.'
    );
  }
}

// ==================== BLE SCANNER SERVICE ====================

class BLEScannerService implements BLEScannerApi {
  private manager: BleManager;
  private isScanning = false;
  private isContinuousMode = false;
  private scanTimeout: NodeJS.Timeout | null = null;
  private restartTimeout: NodeJS.Timeout | null = null;
  private staleCleanupTimer: NodeJS.Timeout | null = null;
  private onBeaconsUpdatedCallback: ((beacons: BLEBeacon[]) => void) | null = null;

  constructor() {
    this.manager = new BleManager();
    this.setupStateListener();
  }

  // ==================== INITIALIZATION ====================

  private setupStateListener(): void {
    this.manager.onStateChange((state) => {
      console.log('[BLE] State changed:', state);
      if (state === BLEState.PoweredOn) {
        console.log('[BLE] Bluetooth is powered on');
      } else if (state === BLEState.PoweredOff) {
        console.log('[BLE] Bluetooth is powered off');
        this.stopScanning();
      }
    }, true);
  }

  // ==================== CALLBACKS ====================

  onBeaconsUpdated(callback: (beacons: BLEBeacon[]) => void): void {
    this.onBeaconsUpdatedCallback = callback;
  }

  // ==================== PERMISSIONS ====================

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true;
    }

    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;

      if (apiLevel >= 31) {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

        const results = await PermissionsAndroid.requestMultiple(permissions);

        return (
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
          results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        // Android < 12 (API < 31): only location permission needed for BLE scanning
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        return Object.values(results).every(
          (result) => result === PermissionsAndroid.RESULTS.GRANTED
        );
      }
    }

    return false;
  }

  // ==================== SCANNING ====================

  async startScanning(): Promise<void> {
    if (this.isScanning) {
      console.log('[BLE] Already scanning');
      return;
    }

    const hasPermissions = await this.requestPermissions();
    if (!hasPermissions) {
      console.error('[BLE] Permissions not granted');
      throw new Error('Bluetooth permissions not granted');
    }

    const state = await this.manager.state();
    if (state !== BLEState.PoweredOn) {
      throw new Error(`Bluetooth is not powered on: ${state}`);
    }

    this.isScanning = true;
    useAppStore.getState().setScanningBeacons(true);

    console.log('[BLE] Starting beacon scan...');

    this.manager.startDeviceScan(
      null,
      {
        scanMode: ScanMode.LowLatency,
        allowDuplicates: true,
      },
      (error, device) => {
        if (error) {
          console.error('[BLE] Scan error:', error);
          return;
        }

        if (device) {
          this.handleDiscoveredDevice(device);
        }
      }
    );

    // Auto-stop after scan window
    this.scanTimeout = setTimeout(() => {
      this.manager.stopDeviceScan();

      // Clean stale beacons
      useAppStore.getState().removeStaleBeacons(STALE_BEACON_MS);

      // Notify callback with current beacons
      if (this.onBeaconsUpdatedCallback) {
        const beacons = useAppStore.getState().detectedBeacons;
        this.onBeaconsUpdatedCallback(beacons);
      }

      if (this.isContinuousMode) {
        // Rest briefly then restart
        this.isScanning = false;
        this.restartTimeout = setTimeout(() => {
          this.startScanning().catch((err) => {
            console.error('[BLE] Continuous restart failed:', err);
          });
        }, SCAN_REST_MS);
      } else {
        this.isScanning = false;
        useAppStore.getState().setScanningBeacons(false);
      }
    }, SCAN_WINDOW_MS);
  }

  stopScanning(): void {
    console.log('[BLE] Stopping beacon scan');
    this.isContinuousMode = false;

    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.staleCleanupTimer) {
      clearInterval(this.staleCleanupTimer);
      this.staleCleanupTimer = null;
    }

    this.manager.stopDeviceScan();
    this.isScanning = false;
    useAppStore.getState().setScanningBeacons(false);
  }

  /**
   * Start continuous scanning — scans in cycles (scan → rest → scan...)
   * Automatically cleans stale beacons and triggers callbacks after each cycle.
   */
  async startContinuousScanning(): Promise<void> {
    this.isContinuousMode = true;

    // Periodic stale beacon cleanup
    this.staleCleanupTimer = setInterval(() => {
      useAppStore.getState().removeStaleBeacons(STALE_BEACON_MS);
    }, STALE_BEACON_MS);

    await this.startScanning();
  }

  // ==================== DEVICE HANDLING ====================

  private handleDiscoveredDevice(device: Device): void {
    const name = device.name || device.localName;

    if (!name || !name.startsWith(NODE_PREFIX)) {
      return; // Not a WheelSense node beacon
    }

    const nodeKey = this.parseNodeKey(name);
    const rssi = device.rssi ?? -100;
    const mac = device.id;
    const timestamp = Date.now();

    const beacon: BLEBeacon = {
      nodeKey,
      rssi,
      mac,
      timestamp,
      lastSeen: timestamp,
    };

    useAppStore.getState().addBeacon(beacon);
  }

  private parseNodeKey(name: string): string {
    const match = name.match(/WSN_(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      return `WSN_${num.toString().padStart(3, '0')}`;
    }
    return name;
  }

  // ==================== BACKGROUND TASK ====================

  async registerBackgroundTask(): Promise<void> {
    const { setBackgroundMonitoringEnabled } = await import('./BackgroundRuntimeService');
    setBackgroundMonitoringEnabled(true);
  }

  async unregisterBackgroundTask(): Promise<void> {
    const { setBackgroundMonitoringEnabled } = await import('./BackgroundRuntimeService');
    setBackgroundMonitoringEnabled(false);
  }

  // ==================== UTILITY ====================

  getIsScanning(): boolean {
    return this.isScanning;
  }

  getIsContinuous(): boolean {
    return this.isContinuousMode;
  }

  cleanup(): void {
    this.stopScanning();
    this.manager.destroy();
  }

  getManager(): BleManager {
    return this.manager;
  }
}

// ==================== SINGLETON INSTANCE ====================

function createBleScannerSingleton(): BLEScannerApi {
  try {
    return new BLEScannerService();
  } catch {
    console.warn(EXPO_GO_BLE_HINT);
    return new BleUnavailableScannerService();
  }
}

export const BLEScanner: BLEScannerApi = createBleScannerSingleton();

// ==================== HOOK ====================

export function useBLEScanner() {
  const store = useAppStore();

  return {
    isScanning: store.isScanningBeacons,
    beacons: store.detectedBeacons,
    closestBeacon: store.closestBeacon,
    startScanning: () => BLEScanner.startScanning(),
    stopScanning: () => BLEScanner.stopScanning(),
    startContinuousScanning: () => BLEScanner.startContinuousScanning(),
    registerBackgroundTask: () => BLEScanner.registerBackgroundTask(),
    unregisterBackgroundTask: () => BLEScanner.unregisterBackgroundTask(),
  };
}
