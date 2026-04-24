/**
 * WheelSense Mobile App - MQTT Service
 * Transmits telemetry data to WheelSense MQTT broker
 */

import MQTTClient from 'sp-react-native-mqtt';
import { TelemetryPayload, BLEBeacon, HeartRateData, PPGData } from '../types';
import { useAppStore } from '../store/useAppStore';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

// ==================== MQTT CONFIG ====================

interface MQTTConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientId: string;
  useSSL?: boolean;
}

// ==================== MQTT SERVICE ====================

class MQTTService {
  private client: any = null;
  private config: MQTTConfig | null = null;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageQueue: TelemetryPayload[] = [];
  private seq = 0;

  // ==================== CONNECTION ====================

  async connect(config: MQTTConfig): Promise<void> {
    if (this.isConnected) {
      console.log('[MQTT] Already connected');
      return;
    }

    this.config = config;

    try {
      console.log(`[MQTT] Connecting to ${config.host}:${config.port}...`);

      const uri = config.useSSL
        ? `mqtts://${config.host}:${config.port}`
        : `mqtt://${config.host}:${config.port}`;

      this.client = await MQTTClient.createClient({
        uri,
        clientId: config.clientId,
        user: config.username,
        pass: config.password,
        keepalive: 60,
        clean: true,
        auth: !!(config.username && config.password),
      });

      // Set up event handlers
      this.client.on('connect', () => {
        console.log('[MQTT] Connected');
        this.isConnected = true;
        this.flushQueue();
      });

      this.client.on('disconnect', () => {
        console.log('[MQTT] Disconnected');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.client.on('error', (err: any) => {
        console.error('[MQTT] Error:', err);
        this.isConnected = false;
      });

      this.client.on('message', (msg: any) => {
        console.log('[MQTT] Message received:', msg);
        this.handleIncomingMessage(msg);
      });

      await this.client.connect();

      // Subscribe to control topics
      await this.subscribeToControlTopics();
    } catch (error) {
      console.error('[MQTT] Connection failed:', error);
      this.scheduleReconnect();
      throw error;
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    this.isConnected = false;
    console.log('[MQTT] Disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    console.log('[MQTT] Scheduling reconnect in 5 seconds...');
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config) {
        this.connect(this.config).catch((err) => {
          console.error('[MQTT] Reconnect failed:', err);
        });
      }
    }, 5000);
  }

  // ==================== SUBSCRIPTION ====================

  private async subscribeToControlTopics(): Promise<void> {
    if (!this.client || !this.isConnected) return;

    const deviceId = await this.getDeviceId();
    const userId = useAppStore.getState().user?.id;
    const topics = [
      `WheelSense/config/${deviceId}`,
      `WheelSense/config/all`,
      `WheelSense/mobile/${deviceId}/control`,
      // Dispatch requests targeted at this specific observer user
      ...(userId ? [`WheelSense/dispatch/${userId}`] : []),
    ];

    for (const topic of topics) {
      try {
        await this.client.subscribe(topic, 1);
        console.log(`[MQTT] Subscribed to: ${topic}`);
      } catch (error) {
        console.error(`[MQTT] Failed to subscribe to ${topic}:`, error);
      }
    }
  }

  private handleIncomingMessage(msg: any): void {
    try {
      const data = JSON.parse(msg.data);
      console.log('[MQTT] Control message:', data);

      // Handle configuration updates
      if (msg.topic.includes('/config/')) {
        this.handleConfigUpdate(data);
      }

      // Handle control commands
      if (msg.topic.includes('/control')) {
        this.handleControlCommand(data);
      }

      // Handle dispatch requests for this observer
      if (msg.topic.includes('/dispatch/')) {
        this.handleDispatchRequest(data);
      }
    } catch (error) {
      console.error('[MQTT] Failed to parse message:', error);
    }
  }

  private handleConfigUpdate(config: any): void {
    console.log('[MQTT] Config update received:', config);
    // Apply configuration changes
    if (config.scan_interval) {
      useAppStore.getState().updateSettings({
        scanInterval: config.scan_interval,
      });
    }
    if (config.telemetry_interval) {
      useAppStore.getState().updateSettings({
        telemetryInterval: config.telemetry_interval,
      });
    }
  }

  private handleControlCommand(command: any): void {
    console.log('[MQTT] Control command received:', command);
    // Handle commands like start/stop streaming, reboot, etc.
  }

  private async handleDispatchRequest(payload: any): Promise<void> {
    const { alertId, patientName, roomName } = payload;
    if (!alertId || !patientName || !roomName) return;
    const { NotificationManager } = await import('./NotificationService');
    await NotificationManager.scheduleDispatchNotification(alertId, patientName, roomName);
  }

  // ==================== PUBLISHING ====================

  async publishTelemetry(payload: TelemetryPayload): Promise<void> {
    if (!this.isConnected || !this.client) {
      // Queue message for later
      this.messageQueue.push(payload);
      console.log('[MQTT] Queued telemetry (not connected)');
      return;
    }

    const deviceId = await this.getDeviceId();
    const topic = `WheelSense/mobile/${deviceId}/telemetry`;
    const message = JSON.stringify(payload);

    try {
      await this.client.publish(topic, message, 1, false);
      console.log(`[MQTT] Published telemetry to ${topic}`);
    } catch (error) {
      console.error('[MQTT] Publish failed:', error);
      // Queue for retry
      this.messageQueue.push(payload);
    }
  }

  private async flushQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    console.log(`[MQTT] Flushing ${this.messageQueue.length} queued messages...`);

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const payload of queue) {
      await this.publishTelemetry(payload);
    }
  }

  // ==================== TELEMETRY BUILDERS ====================

  async buildTelemetryPayload(options: {
    beacons?: BLEBeacon[];
    hr?: HeartRateData;
    ppg?: PPGData;
    includeBattery?: boolean;
  } = {}): Promise<TelemetryPayload> {
    const { beacons, hr, ppg, includeBattery = true } = options;
    const store = useAppStore.getState();
    
    this.seq++;

    const payload: TelemetryPayload = {
      device_id: await this.getDeviceId(),
      device_type: 'mobile_app',
      hardware_type: 'mobile_app',
      firmware: '1.0.0',
      seq: this.seq,
      timestamp: new Date().toISOString(),
      uptime_ms: Date.now(),
      app_mode: store.appMode,
    };

    // Add RSSI data
    if (beacons && beacons.length > 0) {
      payload.rssi = beacons.map((b) => ({
        node: b.nodeKey,
        rssi: b.rssi,
        mac: b.mac,
      }));
    }

    // Add HR data
    if (hr) {
      payload.hr = hr;
    }

    // Add PPG data
    if (ppg) {
      payload.ppg = ppg;
    }

    // Add battery info
    if (includeBattery) {
      payload.battery = await this.getBatteryInfo();
    }

    return payload;
  }

  // ==================== UTILITY ====================

  private async getDeviceId(): Promise<string> {
    const store = useAppStore.getState();
    if (store.user) {
      return `MOBILE_${store.user.id}`;
    }
    
    // Fallback to device identifier
    const deviceId = await Device.deviceName;
    return `MOBILE_${deviceId || 'UNKNOWN'}`;
  }

  private async getBatteryInfo(): Promise<{ percentage: number; voltage_v: number; charging: boolean }> {
    // Note: Battery info requires expo-battery module
    // For now, return placeholder
    return {
      percentage: 100,
      voltage_v: 3.8,
      charging: false,
    };
  }

  isConnectedToBroker(): boolean {
    return this.isConnected;
  }

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
