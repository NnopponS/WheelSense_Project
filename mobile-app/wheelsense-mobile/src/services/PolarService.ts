/**
 * WheelSense Mobile App - Polar Verity Sense Service
 * Native PolarBleSdk (optional Expo module) or BLE GATT HR fallback via react-native-ble-plx.
 * Full PPG requires polarofficial/polar-ble-sdk native integration.
 */

import { NativeEventEmitter, NativeModules, type NativeModule } from 'react-native';
import type { Device } from 'react-native-ble-plx';
import { PolarDevice, HeartRateData, PPGData } from '../types';
import { useAppStore } from '../store/useAppStore';
import {
  canUsePolarBlePlx,
  connectPolarPlx,
  scanPolarDevicesPlx,
  startPlxHrMonitor,
} from './polarBlePlx';
import { mqttService } from './MQTTService';

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

function loadNativePolarModule(): PolarBleSdkType | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeModule } = require('expo-modules-core') as {
      requireNativeModule: (name: string) => PolarBleSdkType;
    };
    return requireNativeModule('PolarBleSdk');
  } catch {
    try {
      const { PolarBleSdk: PolarModule } = NativeModules as {
        PolarBleSdk?: PolarBleSdkType;
      };
      return PolarModule ?? null;
    } catch {
      return null;
    }
  }
}

let PolarBleSdk: PolarBleSdkType | null = loadNativePolarModule();
let eventEmitter: NativeEventEmitter | null = null;

if (PolarBleSdk) {
  try {
    eventEmitter = new NativeEventEmitter(PolarBleSdk as unknown as NativeModule);
  } catch {
    eventEmitter = null;
  }
}

class PolarService {
  private deviceId: string | null = null;
  private isConnected = false;
  private listeners: Array<() => void> = [];
  private usePlx = false;
  private plxDevice: Device | null = null;
  private hrSubscription: { remove: () => void } | null = null;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!eventEmitter) {
      return;
    }

    const deviceFoundListener = eventEmitter.addListener(
      'deviceFound',
      (ev: { deviceId: string; name?: string }) => {
        useAppStore.getState().reportPolarDiscovered({
          deviceId: ev.deviceId,
          name: ev.name || 'Polar',
        });
      },
    );

    const connectionListener = eventEmitter.addListener(
      'connectionState',
      (event: { deviceId: string; connected: boolean }) => {
        this.isConnected = event.connected;
        if (event.connected) {
          this.deviceId = event.deviceId;
          useAppStore.getState().setPolarConnection(true);
        } else {
          useAppStore.getState().setPolarConnection(false);
        }
      },
    );

    const hrListener = eventEmitter.addListener(
      'hrData',
      (data: { hr: number; rrs?: number[]; rrAvailable?: boolean; contactStatus?: boolean }) => {
        const hrData: HeartRateData = {
          bpm: data.hr,
          rr_intervals: data.rrs,
          timestamp: Date.now(),
        };
        useAppStore.getState().setLastHR(hrData);
      },
    );

    const ppgListener = eventEmitter.addListener(
      'ppgData',
      (data: { ppg0: number; ppg1: number; ppg2: number; ambient: number; timestamp?: number }) => {
        const ppgData: PPGData = {
          ppg0: data.ppg0,
          ppg1: data.ppg1,
          ppg2: data.ppg2,
          ambient: data.ambient,
          timestamp: data.timestamp || Date.now(),
        };
        useAppStore.getState().setLastPPG(ppgData);
      },
    );

    const batteryListener = eventEmitter.addListener('batteryLevel', (level: number) => {
      const store = useAppStore.getState();
      if (store.polarDevice) {
        store.setPolarDevice({
          ...store.polarDevice,
          batteryLevel: level,
        });
      }
    });

    const firmwareListener = eventEmitter.addListener('firmwareVersion', (version: string) => {
      const store = useAppStore.getState();
      if (store.polarDevice) {
        store.setPolarDevice({
          ...store.polarDevice,
          firmwareVersion: version,
        });
      }
    });

    this.listeners = [
      () => deviceFoundListener.remove(),
      () => connectionListener.remove(),
      () => hrListener.remove(),
      () => ppgListener.remove(),
      () => batteryListener.remove(),
      () => firmwareListener.remove(),
    ];
  }

  async connect(deviceId: string): Promise<void> {
    if (PolarBleSdk) {
      this.usePlx = false;
      await PolarBleSdk.connectToDevice(deviceId);
      this.deviceId = deviceId;
      this.isConnected = true;
      useAppStore.getState().setPolarDevice({
        deviceId,
        name: 'Polar Verity Sense',
      });
      useAppStore.getState().setPolarConnection(true);
      void mqttService.publishRegistration().catch(() => undefined);
      return;
    }

    if (!canUsePolarBlePlx()) {
      throw new Error('Polar BLE SDK not available and BLE stack is unavailable');
    }

    this.usePlx = true;
    const dev = await connectPolarPlx(deviceId);
    this.plxDevice = dev;
    this.deviceId = deviceId;
    this.isConnected = true;
    useAppStore.getState().setPolarDevice({
      deviceId,
      name: dev.name || dev.localName || 'Polar',
    });
    useAppStore.getState().setPolarConnection(true);
    void mqttService.publishRegistration().catch(() => undefined);
  }

  async disconnect(): Promise<void> {
    if (this.usePlx) {
      await this.stopAllStreaming();
      try {
        await this.plxDevice?.cancelConnection();
      } catch {
        /* ignore */
      }
      this.plxDevice = null;
      this.deviceId = null;
      this.isConnected = false;
      this.usePlx = false;
      useAppStore.getState().setPolarDevice(null);
      useAppStore.getState().setPolarConnection(false);
      void mqttService.publishRegistration().catch(() => undefined);
      return;
    }

    if (!PolarBleSdk || !this.deviceId) {
      return;
    }

    try {
      await this.stopAllStreaming();
      await PolarBleSdk.disconnectFromDevice(this.deviceId);
      this.deviceId = null;
      this.isConnected = false;
      useAppStore.getState().setPolarDevice(null);
      useAppStore.getState().setPolarConnection(false);
      void mqttService.publishRegistration().catch(() => undefined);
    } catch (error) {
      console.error('[Polar] Disconnect error:', error);
      throw error;
    }
  }

  async startHRStreaming(): Promise<void> {
    if (PolarBleSdk && !this.usePlx) {
      if (!this.isConnected) {
        throw new Error('Not connected to Polar device');
      }
      await PolarBleSdk.startHrStreaming();
      return;
    }

    if (this.usePlx && this.plxDevice) {
      this.hrSubscription?.remove();
      this.hrSubscription = startPlxHrMonitor(this.plxDevice, (bpm) => {
        useAppStore.getState().setLastHR({
          bpm,
          timestamp: Date.now(),
        });
      });
      return;
    }

    throw new Error('Not connected to Polar device');
  }

  async stopHRStreaming(): Promise<void> {
    if (PolarBleSdk && !this.usePlx && this.isConnected) {
      await PolarBleSdk.stopHrStreaming();
    }
    this.hrSubscription?.remove();
    this.hrSubscription = null;
  }

  async startPPGStreaming(): Promise<void> {
    if (!PolarBleSdk || this.usePlx) {
      throw new Error('PPG streaming requires the native Polar SDK (polarofficial/polar-ble-sdk)');
    }
    if (!this.isConnected) {
      throw new Error('Not connected to Polar device');
    }
    await PolarBleSdk.startPpgStreaming();
  }

  async stopPPGStreaming(): Promise<void> {
    if (!PolarBleSdk || this.usePlx) {
      return;
    }
    if (!this.isConnected) {
      return;
    }
    await PolarBleSdk.stopPpgStreaming();
  }

  async startAccStreaming(): Promise<void> {
    if (!PolarBleSdk || this.usePlx) {
      throw new Error('ACC streaming requires the native Polar SDK');
    }
    if (!this.isConnected) {
      throw new Error('Not connected to Polar device');
    }
    await PolarBleSdk.startAccStreaming();
  }

  async stopAccStreaming(): Promise<void> {
    if (!PolarBleSdk || this.usePlx) {
      return;
    }
    if (!this.isConnected) {
      return;
    }
    await PolarBleSdk.stopAccStreaming();
  }

  async stopAllStreaming(): Promise<void> {
    await Promise.all([
      this.stopHRStreaming(),
      this.stopPPGStreaming().catch(() => undefined),
      this.stopAccStreaming().catch(() => undefined),
    ]);
  }

  async searchForDevice(): Promise<void> {
    useAppStore.getState().clearPolarDiscovery();
    if (PolarBleSdk) {
      await PolarBleSdk.searchForDevice();
      return;
    }
    await scanPolarDevicesPlx(12000);
  }

  isAvailable(): boolean {
    return PolarBleSdk != null || canUsePolarBlePlx();
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }

  usesPlxFallback(): boolean {
    return this.usePlx;
  }

  cleanup(): void {
    this.disconnect().catch(() => undefined);
    this.listeners.forEach((remove) => remove());
    this.listeners = [];
  }
}

export const Polar = new PolarService();

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
