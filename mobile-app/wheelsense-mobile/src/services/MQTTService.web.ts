/**
 * WheelSense Mobile App - MQTT Service (Web Mock)
 * Mock implementation for web builds where native MQTT is not available.
 * Mirrors the MQTTService public API so screens are platform-agnostic.
 */

import { TelemetryPayload, BLEBeacon } from '../types';
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

  // Walk step Publishing (stub)
  async publishWalkStep(data: { steps: number; distance_m?: number; timestamp: number }): Promise<boolean> {
    console.log('[MQTT Web Mock] Would publish walk step:', data);
    return this.isConnected;
  }

  // Registration Publishing (stub)
  async publishRegistration(): Promise<void> {
    console.log('[MQTT Web Mock] Would publish registration');
  }

  // Payload Building — uses the current BLEBeacon shape (nodeKey + rssi + mac)
  buildTelemetryPayload(options: {
    deviceId: string;
    beacons: BLEBeacon[];
    batteryLevel?: number;
    metadata?: Record<string, any>;
  }): TelemetryPayload {
    const timestamp = new Date().toISOString();

    return {
      device_id: options.deviceId,
      device_type: 'mobile_app',
      hardware_type: 'mobile_app',
      firmware: '1.0.0',
      seq: 0,
      timestamp,
      uptime_ms: 0,
      rssi: options.beacons.map((b) => ({
        node: b.nodeKey,
        rssi: b.rssi,
        mac: b.mac,
      })),
      battery: options.batteryLevel
        ? { percentage: options.batteryLevel, voltage_v: 3.8, charging: false }
        : undefined,
      metadata: {
        ...options.metadata,
        source: 'mobile-app-web-mock',
      },
    } as TelemetryPayload & { metadata?: Record<string, any> };
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
  return {
    isConnected: mqttService.isConnectedToBroker(),
    queueSize: mqttService.getQueueSize(),
    connect: (config: MQTTConfig) => mqttService.connect(config),
    disconnect: () => mqttService.disconnect(),
    publish: (payload: TelemetryPayload) => mqttService.publishTelemetry(payload),
    publishWalkStep: (data: Parameters<typeof mqttService.publishWalkStep>[0]) =>
      mqttService.publishWalkStep(data),
  };
}
