/**
 * WheelSense Mobile App - Polar Verity Sense Service
 * Integrates with Polar BLE SDK for HR and PPG data streaming
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { PolarDevice, HeartRateData, PPGData } from '../types';
import { useAppStore } from '../store/useAppStore';

// ==================== POLAR SDK INTERFACE ====================

// Note: react-native-polar-ble-sdk is a community wrapper
// Install: npm install react-native-polar-ble-sdk

interface PolarBleSdkType {
  connectToDevice(deviceId: string): Promise<void>;
  disconnectFromDevice(deviceId: string): Promise<void>;
  startHrStreaming(): Promise<void>;
  stopHrStreaming(): Promise<void>;
  startPpgStreaming(): Promise<void>;
  stopPpgStreaming(): Promise<void>;
  startAccStreaming(): Promise<void>;
  stopAccStreaming(): Promise<void>;
  searchForDevice(): Promise<void>;
}

// Try to import the native module
let PolarBleSdk: PolarBleSdkType | null = null;
let eventEmitter: NativeEventEmitter | null = null;

try {
  const { PolarBleSdk: PolarModule } = NativeModules;
  if (PolarModule) {
    PolarBleSdk = PolarModule;
    eventEmitter = new NativeEventEmitter(PolarModule);
  }
} catch (error) {
  console.warn('[Polar] SDK not available:', error);
}

// ==================== POLAR SERVICE ====================

class PolarService {
  private deviceId: string | null = null;
  private isConnected = false;
  private listeners: Array<() => void> = [];

  constructor() {
    this.setupEventListeners();
  }

  // ==================== EVENT LISTENERS ====================

  private setupEventListeners(): void {
    if (!eventEmitter) {
      console.warn('[Polar] Event emitter not available');
      return;
    }

    // Connection state changes
    const connectionListener = eventEmitter.addListener(
      'connectionState',
      (event: { deviceId: string; connected: boolean; error?: string }) => {
        console.log('[Polar] Connection state:', event);
        
        this.isConnected = event.connected;
        
        if (event.connected) {
          this.deviceId = event.deviceId;
          useAppStore.getState().setPolarConnection(true);
        } else {
          useAppStore.getState().setPolarConnection(false);
        }
      }
    );

    // Heart rate data
    const hrListener = eventEmitter.addListener(
      'hrData',
      (data: {
        hr: number;
        rrs?: number[];
        rrAvailable?: boolean;
        contactStatus?: boolean;
      }) => {
        console.log('[Polar] HR data:', data);
        
        const hrData: HeartRateData = {
          bpm: data.hr,
          rr_intervals: data.rrs,
          timestamp: Date.now(),
        };
        
        useAppStore.getState().setLastHR(hrData);
      }
    );

    // PPG data (Verity Sense specific)
    const ppgListener = eventEmitter.addListener(
      'ppgData',
      (data: {
        ppg0: number;
        ppg1: number;
        ppg2: number;
        ambient: number;
        timestamp?: number;
      }) => {
        console.log('[Polar] PPG data:', data);
        
        const ppgData: PPGData = {
          ppg0: data.ppg0,
          ppg1: data.ppg1,
          ppg2: data.ppg2,
          ambient: data.ambient,
          timestamp: data.timestamp || Date.now(),
        };
        
        useAppStore.getState().setLastPPG(ppgData);
      }
    );

    // Battery level
    const batteryListener = eventEmitter.addListener(
      'batteryLevel',
      (level: number) => {
        console.log('[Polar] Battery level:', level);
        
        const store = useAppStore.getState();
        if (store.polarDevice) {
          store.setPolarDevice({
            ...store.polarDevice,
            batteryLevel: level,
          });
        }
      }
    );

    // Firmware version
    const firmwareListener = eventEmitter.addListener(
      'firmwareVersion',
      (version: string) => {
        console.log('[Polar] Firmware version:', version);
        
        const store = useAppStore.getState();
        if (store.polarDevice) {
          store.setPolarDevice({
            ...store.polarDevice,
            firmwareVersion: version,
          });
        }
      }
    );

    // Store listeners for cleanup
    this.listeners = [
      () => connectionListener.remove(),
      () => hrListener.remove(),
      () => ppgListener.remove(),
      () => batteryListener.remove(),
      () => firmwareListener.remove(),
    ];
  }

  // ==================== CONNECTION ====================

  async connect(deviceId: string): Promise<void> {
    if (!PolarBleSdk) {
      throw new Error('Polar BLE SDK not available');
    }

    try {
      console.log('[Polar] Connecting to:', deviceId);
      
      await PolarBleSdk.connectToDevice(deviceId);
      
      this.deviceId = deviceId;
      
      // Set device in store
      useAppStore.getState().setPolarDevice({
        deviceId,
        name: 'Polar Verity Sense',
      });
      
      console.log('[Polar] Connected successfully');
    } catch (error) {
      console.error('[Polar] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!PolarBleSdk || !this.deviceId) {
      return;
    }

    try {
      console.log('[Polar] Disconnecting from:', this.deviceId);
      
      // Stop all streaming first
      await this.stopAllStreaming();
      
      await PolarBleSdk.disconnectFromDevice(this.deviceId);
      
      this.deviceId = null;
      this.isConnected = false;
      
      useAppStore.getState().setPolarDevice(null);
      useAppStore.getState().setPolarConnection(false);
      
      console.log('[Polar] Disconnected');
    } catch (error) {
      console.error('[Polar] Disconnect error:', error);
      throw error;
    }
  }

  // ==================== STREAMING ====================

  async startHRStreaming(): Promise<void> {
    if (!PolarBleSdk) {
      throw new Error('Polar BLE SDK not available');
    }

    if (!this.isConnected) {
      throw new Error('Not connected to Polar device');
    }

    try {
      console.log('[Polar] Starting HR streaming');
      await PolarBleSdk.startHrStreaming();
    } catch (error) {
      console.error('[Polar] Failed to start HR streaming:', error);
      throw error;
    }
  }

  async stopHRStreaming(): Promise<void> {
    if (!PolarBleSdk || !this.isConnected) {
      return;
    }

    try {
      console.log('[Polar] Stopping HR streaming');
      await PolarBleSdk.stopHrStreaming();
    } catch (error) {
      console.error('[Polar] Failed to stop HR streaming:', error);
    }
  }

  async startPPGStreaming(): Promise<void> {
    if (!PolarBleSdk) {
      throw new Error('Polar BLE SDK not available');
    }

    if (!this.isConnected) {
      throw new Error('Not connected to Polar device');
    }

    try {
      console.log('[Polar] Starting PPG streaming');
      await PolarBleSdk.startPpgStreaming();
    } catch (error) {
      console.error('[Polar] Failed to start PPG streaming:', error);
      throw error;
    }
  }

  async stopPPGStreaming(): Promise<void> {
    if (!PolarBleSdk || !this.isConnected) {
      return;
    }

    try {
      console.log('[Polar] Stopping PPG streaming');
      await PolarBleSdk.stopPpgStreaming();
    } catch (error) {
      console.error('[Polar] Failed to stop PPG streaming:', error);
    }
  }

  async startAccStreaming(): Promise<void> {
    if (!PolarBleSdk) {
      throw new Error('Polar BLE SDK not available');
    }

    if (!this.isConnected) {
      throw new Error('Not connected to Polar device');
    }

    try {
      console.log('[Polar] Starting ACC streaming');
      await PolarBleSdk.startAccStreaming();
    } catch (error) {
      console.error('[Polar] Failed to start ACC streaming:', error);
      throw error;
    }
  }

  async stopAccStreaming(): Promise<void> {
    if (!PolarBleSdk || !this.isConnected) {
      return;
    }

    try {
      console.log('[Polar] Stopping ACC streaming');
      await PolarBleSdk.stopAccStreaming();
    } catch (error) {
      console.error('[Polar] Failed to stop ACC streaming:', error);
    }
  }

  async stopAllStreaming(): Promise<void> {
    await Promise.all([
      this.stopHRStreaming(),
      this.stopPPGStreaming(),
      this.stopAccStreaming(),
    ]);
  }

  // ==================== DEVICE DISCOVERY ====================

  async searchForDevice(): Promise<void> {
    if (!PolarBleSdk) {
      throw new Error('Polar BLE SDK not available');
    }

    try {
      console.log('[Polar] Searching for devices...');
      await PolarBleSdk.searchForDevice();
    } catch (error) {
      console.error('[Polar] Search failed:', error);
      throw error;
    }
  }

  // ==================== UTILITY ====================

  isAvailable(): boolean {
    return PolarBleSdk !== null;
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }

  cleanup(): void {
    this.disconnect();
    this.listeners.forEach((remove) => remove());
    this.listeners = [];
  }
}

// ==================== SINGLETON INSTANCE ====================

export const Polar = new PolarService();

// ==================== HOOK ====================

export function usePolar() {
  const store = useAppStore();
  
  return {
    device: store.polarDevice,
    isConnected: store.isPolarConnected,
    isScanning: store.isPolarScanning,
    lastHR: store.lastHR,
    lastPPG: store.lastPPG,
    isAvailable: Polar.isAvailable(),
    connect: (deviceId: string) => Polar.connect(deviceId),
    disconnect: () => Polar.disconnect(),
    startHR: () => Polar.startHRStreaming(),
    stopHR: () => Polar.stopHRStreaming(),
    startPPG: () => Polar.startPPGStreaming(),
    stopPPG: () => Polar.stopPPGStreaming(),
    search: () => Polar.searchForDevice(),
  };
}
