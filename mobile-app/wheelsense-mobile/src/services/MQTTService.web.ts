/**
 * WheelSense Mobile App - MQTT Service (Web Mock)
 * Mock implementation for web builds where native MQTT is not available
 */

import { TelemetryPayload, BLEBeacon, HeartRateData, PPGData } from '../types';
import { useAppStore } from '../store/useAppStore';

// ==================== MQTT CONFIG ====================

interface MQTTConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientId: string;
  useSSL?: boolean;
}

// ==================== MOCK MQTT SERVICE ====================

class MQTTService {
  private isConnected = false;
  private messageQueue: TelemetryPayload[] = [];
  private config: MQTTConfig | null = null;

  // Connection Management
  async connect(config: MQTTConfig): Promise<boolean> {
    console.log('[MQTT Web Mock] Connect called:', config.host);
    this.config = config;
    this.isConnected = true;
    
    const store = useAppStore.getState();
    store.setMQTTConnected(true);
    
    return true;
  }

  disconnect(): void {
    console.log('[MQTT Web Mock] Disconnect called');
    this.isConnected = false;
    
    const store = useAppStore.getState();
    store.setMQTTConnected(false);
  }

  isConnectedToBroker(): boolean {
    return this.isConnected;
  }

  // Telemetry Publishing
  publishTelemetry(payload: TelemetryPayload): boolean {
    if (!this.isConnected) {
      this.messageQueue.push(payload);
      return false;
    }

    console.log('[MQTT Web Mock] Would publish:', payload);
    return true;
  }

  // Payload Building
  buildTelemetryPayload(options: {
    deviceId: string;
    beacons: BLEBeacon[];
    heartRate?: HeartRateData;
    ppg?: PPGData;
    batteryLevel?: number;
    location?: { latitude: number; longitude: number };
    metadata?: Record<string, any>;
  }): TelemetryPayload {
    const timestamp = new Date().toISOString();

    return {
      device_id: options.deviceId,
      timestamp,
      beacons: options.beacons.map(b => ({
        uuid: b.uuid,
        major: b.major,
        minor: b.minor,
        rssi: b.rssi,
        distance: b.distance,
        timestamp: b.timestamp,
      })),
      heart_rate: options.heartRate,
      ppg: options.ppg,
      battery_level: options.batteryLevel,
      location: options.location,
      metadata: {
        ...options.metadata,
        source: 'mobile-app-web-mock',
      },
    };
  }

  // Queue Management
  getQueueSize(): number {
    return this.messageQueue.length;
  }
}

// ==================== SINGLETON INSTANCE ====================

export const mqttService = new MQTTService();

// ==================== HOOK ====================

export function useMQTT() {
  const store = useAppStore();
  
  return {
    isConnected: mqttService.isConnectedToBroker(),
    queueSize: mqttService.getQueueSize(),
    connect: (config: MQTTConfig) => mqttService.connect(config),
    disconnect: () => mqttService.disconnect(),
    publish: (payload: TelemetryPayload) => mqttService.publishTelemetry(payload),
    buildPayload: (options: Parameters<typeof mqttService.buildTelemetryPayload>[0]) =>
      mqttService.buildTelemetryPayload(options),
  };
}
