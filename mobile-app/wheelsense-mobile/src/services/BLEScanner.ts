/**
 * WheelSense Mobile App - BLE Scanner Service
 * Scans for Node_Tsimcam beacons (WSN_*) for RSSI-based localization
 */

import { BleManager, Device, ScanMode, State as BLEState } from 'react-native-ble-plx';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { Platform, PermissionsAndroid } from 'react-native';
import { BLEBeacon } from '../types';
import { useAppStore } from '../store/useAppStore';

// ==================== CONSTANTS ====================

const NODE_PREFIX = 'WSN_';
const BLE_SCAN_TASK = 'wheelsense-background-scan';
const STALE_BEACON_MS = 30000; // 30 seconds
const SCAN_WINDOW_MS = 10000;  // 10 seconds per scan cycle

// ==================== BLE SCANNER SERVICE ====================

class BLEScannerService {
  private manager: BleManager;
  private isScanning = false;
  private scanTimeout: NodeJS.Timeout | null = null;

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

  // ==================== PERMISSIONS ====================

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      // iOS permissions are handled in Info.plist
      return true;
    }

    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      
      if (apiLevel >= 31) {
        // Android 12+ (API 31+)
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
        // Android < 12
        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];
        
        const results = await PermissionsAndroid.requestMultiple(permissions);
        
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
      null, // Scan all UUIDs
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
      this.stopScanning();
    }, SCAN_WINDOW_MS);
  }

  stopScanning(): void {
    if (!this.isScanning) return;

    console.log('[BLE] Stopping beacon scan');
    
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    this.manager.stopDeviceScan();
    this.isScanning = false;
    useAppStore.getState().setScanningBeacons(false);
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

    // Update store
    useAppStore.getState().addBeacon(beacon);

    console.log(`[BLE] Beacon detected: ${nodeKey} (RSSI: ${rssi})`);
  }

  private parseNodeKey(name: string): string {
    // Parse "WSN_001" format
    const match = name.match(/WSN_(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      return `WSN_${num.toString().padStart(3, '0')}`;
    }
    return name;
  }

  // ==================== BACKGROUND TASK ====================

  async registerBackgroundTask(): Promise<void> {
    try {
      // Define background task
      TaskManager.defineTask(BLE_SCAN_TASK, async () => {
        try {
          console.log('[BLE Background] Starting scan...');
          
          const scanner = new BLEScannerService();
          await scanner.startScanning();
          
          // Wait for scan to complete
          await new Promise((resolve) => setTimeout(resolve, SCAN_WINDOW_MS));
          
          scanner.stopScanning();
          
          console.log('[BLE Background] Scan completed');
          
          return BackgroundFetch.BackgroundFetchResult.NewData;
        } catch (error) {
          console.error('[BLE Background] Error:', error);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });

      // Register with Expo
      await BackgroundFetch.registerTaskAsync(BLE_SCAN_TASK, {
        minimumInterval: 60, // 1 minute minimum
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log('[BLE] Background task registered');
    } catch (error) {
      console.error('[BLE] Failed to register background task:', error);
    }
  }

  async unregisterBackgroundTask(): Promise<void> {
    try {
      await BackgroundFetch.unregisterTaskAsync(BLE_SCAN_TASK);
      console.log('[BLE] Background task unregistered');
    } catch (error) {
      console.error('[BLE] Failed to unregister background task:', error);
    }
  }

  // ==================== UTILITY ====================

  cleanup(): void {
    this.stopScanning();
    this.manager.destroy();
  }

  getManager(): BleManager {
    return this.manager;
  }
}

// ==================== SINGLETON INSTANCE ====================

export const BLEScanner = new BLEScannerService();

// ==================== HOOK ====================

export function useBLEScanner() {
  const store = useAppStore();
  
  return {
    isScanning: store.isScanningBeacons,
    beacons: store.detectedBeacons,
    closestBeacon: store.closestBeacon,
    startScanning: () => BLEScanner.startScanning(),
    stopScanning: () => BLEScanner.stopScanning(),
    registerBackgroundTask: () => BLEScanner.registerBackgroundTask(),
    unregisterBackgroundTask: () => BLEScanner.unregisterBackgroundTask(),
  };
}
