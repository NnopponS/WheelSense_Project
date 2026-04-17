/**
 * WheelSense Mobile App - MQTT Service
 * MQTT-first communication with WheelSense server via public EMQX broker
 */

import MQTTClient from 'sp-react-native-mqtt';
import {
  TelemetryPayload,
  BLEBeacon,
  HeartRateData,
  PPGData,
  MobileRegistration,
  WalkStepData,
  RoomPredictionResult,
} from '../types';
import { useAppStore } from '../store/useAppStore';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { isMqttNativeAvailable } from '../utils/runtimeEnvironment';

const MQTT_EXPO_GO_HINT =
  '[MQTT] Native MQTT (sp-react-native-mqtt) is not available in Expo Go. Use `npx expo run:android` or a development build.';

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
  private telemetryTimer: NodeJS.Timeout | null = null;
  private alertSubscribedTopic: string | null = null;

  // ==================== CONNECTION ====================

  async connect(config: MQTTConfig): Promise<void> {
    if (this.isConnected) {
      console.log('[MQTT] Already connected');
      return;
    }

    if (!isMqttNativeAvailable()) {
      console.warn(MQTT_EXPO_GO_HINT);
      this.config = config;
      useAppStore.getState().setMQTTConnected(false);
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
        useAppStore.getState().setMQTTConnected(true);
        this.subscribeToTopics();
        this.flushQueue();
      });

      this.client.on('disconnect', () => {
        console.log('[MQTT] Disconnected');
        this.isConnected = false;
        useAppStore.getState().setMQTTConnected(false);
        this.scheduleReconnect();
      });

      this.client.on('error', (err: any) => {
        console.error('[MQTT] Error:', err);
        this.isConnected = false;
        useAppStore.getState().setMQTTConnected(false);
      });

      this.client.on('message', (msg: any) => {
        this.handleIncomingMessage(msg);
      });

      await this.client.connect();
    } catch (error) {
      console.error('[MQTT] Connection failed:', error);
      useAppStore.getState().setMQTTConnected(false);
      this.scheduleReconnect();
      throw error;
    }
  }

  disconnect(): void {
    this.stopTelemetryLoop();
    this.alertSubscribedTopic = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    this.isConnected = false;
    useAppStore.getState().setMQTTConnected(false);
    console.log('[MQTT] Disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (!isMqttNativeAvailable()) {
      return;
    }

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

  private async subscribeToTopics(): Promise<void> {
    if (!this.client || !this.isConnected) return;

    const deviceId = this.getDeviceId();
    const topics = [
      `WheelSense/config/${deviceId}`,
      `WheelSense/config/all`,
      `WheelSense/mobile/${deviceId}/control`,
      `WheelSense/room/${deviceId}`,
    ];

    for (const topic of topics) {
      try {
        await this.client.subscribe(topic, 1);
        console.log(`[MQTT] Subscribed to: ${topic}`);
      } catch (error) {
        console.error(`[MQTT] Failed to subscribe to ${topic}:`, error);
      }
    }
    await this.syncAlertSubscription();
  }

  private handleIncomingMessage(msg: any): void {
    try {
      const data = JSON.parse(msg.data);

      if (msg.topic?.includes('/alerts/')) {
        void this.handleAlertMessage(data);
      } else if (msg.topic.includes('/config/')) {
        this.handleConfigUpdate(data);
      } else if (msg.topic.includes('/control')) {
        this.handleControlCommand(data);
      } else if (msg.topic.includes('/room/')) {
        this.handleRoomPrediction(data);
      }
    } catch (error) {
      console.error('[MQTT] Failed to parse message:', error);
    }
  }

  private async handleAlertMessage(data: any): Promise<void> {
    try {
      const { NotificationManager } = await import('./NotificationService');
      await NotificationManager.notifyAlertFromMqtt(data as Record<string, unknown>);
    } catch (e) {
      console.error('[MQTT] Alert notification failed:', e);
    }
  }

  private async syncAlertSubscription(): Promise<void> {
    if (!this.client || !this.isConnected || !isMqttNativeAvailable()) {
      return;
    }
    const { linkedPatientId, alertsEnabled } = useAppStore.getState().settings;
    const pid = linkedPatientId;
    const allowAlerts = alertsEnabled !== false;
    const topic =
      typeof pid === 'number' && Number.isFinite(pid) && allowAlerts
        ? `WheelSense/alerts/${pid}`
        : null;

    if (topic === this.alertSubscribedTopic) {
      return;
    }

    if (this.alertSubscribedTopic) {
      try {
        await this.client.unsubscribe(this.alertSubscribedTopic);
      } catch (e) {
        console.warn('[MQTT] Failed to unsubscribe previous alerts topic:', e);
      }
      this.alertSubscribedTopic = null;
    }

    if (topic) {
      try {
        await this.client.subscribe(topic, 1);
        this.alertSubscribedTopic = topic;
        console.log(`[MQTT] Subscribed to: ${topic}`);
      } catch (error) {
        console.error(`[MQTT] Failed to subscribe to ${topic}:`, error);
      }
    }
  }

  private handleConfigUpdate(config: any): void {
    console.log('[MQTT] Config update received:', config);
    const patch: Record<string, unknown> = {};

    if (config.scan_interval != null && typeof config.scan_interval === 'number') {
      patch.scanInterval = config.scan_interval;
    }
    if (config.telemetry_interval != null && typeof config.telemetry_interval === 'number') {
      patch.telemetryInterval = config.telemetry_interval;
    }
    if (config.portal_base_url != null && typeof config.portal_base_url === 'string') {
      const u = config.portal_base_url.trim();
      patch.portalBaseUrl = u;
    }
    if ('linked_patient_id' in config) {
      if (config.linked_patient_id === null || config.linked_patient_id === undefined) {
        patch.linkedPatientId = undefined;
      } else {
        const n = Number(config.linked_patient_id);
        if (!Number.isNaN(n)) {
          patch.linkedPatientId = n;
        }
      }
    }
    if (typeof config.alerts_enabled === 'boolean') {
      patch.alertsEnabled = config.alerts_enabled;
    }

    if (Object.keys(patch).length > 0) {
      useAppStore.getState().updateSettings(patch as any);
      void this.syncAlertSubscription();
    }
  }

  private handleControlCommand(command: any): void {
    console.log('[MQTT] Control command received:', command);
  }

  private handleRoomPrediction(data: any): void {
    console.log('[MQTT] Room prediction received:', data);
    const prediction: RoomPredictionResult = {
      room_id: data.room_id ?? null,
      room_name: data.room_name ?? '',
      confidence: data.confidence ?? 0,
      model_type: data.model_type ?? 'knn',
      strategy: data.strategy,
    };
    useAppStore.getState().setRoomPrediction(prediction);
  }

  // ==================== REGISTRATION ====================

  async publishRegistration(): Promise<void> {
    const deviceId = this.getDeviceId();

    const state = useAppStore.getState();
    const registration: MobileRegistration = {
      device_id: deviceId,
      device_name: state.deviceName || Device.deviceName || 'Unknown',
      platform: Platform.OS,
      os_version: Platform.Version?.toString() || 'unknown',
      app_version: '1.0.0',
      hardware_type: 'mobile_phone',
      timestamp: new Date().toISOString(),
    };
    if (state.isPolarConnected && state.polarDevice?.deviceId) {
      registration.companion_polar = {
        polar_device_id: state.polarDevice.deviceId,
        name: state.polarDevice.name,
        firmware_version: state.polarDevice.firmwareVersion,
      };
    }

    const topic = `WheelSense/mobile/${deviceId}/register`;
    const message = JSON.stringify(registration);

    try {
      if (this.client && this.isConnected) {
        await this.client.publish(topic, message, 1, false);
        useAppStore.getState().setDeviceRegistered(true);
        console.log(`[MQTT] Published registration to ${topic}`);
      }
    } catch (error) {
      console.error('[MQTT] Registration publish failed:', error);
    }
  }

  // ==================== TELEMETRY ====================

  async publishTelemetry(payload: TelemetryPayload): Promise<void> {
    if (!this.isConnected || !this.client) {
      this.messageQueue.push(payload);
      return;
    }

    const deviceId = this.getDeviceId();
    const topic = `WheelSense/mobile/${deviceId}/telemetry`;
    const message = JSON.stringify(payload);

    try {
      await this.client.publish(topic, message, 0, false);
    } catch (error) {
      console.error('[MQTT] Publish failed:', error);
      this.messageQueue.push(payload);
    }
  }

  // ==================== WALK STEP ====================

  async publishWalkStep(stepData: WalkStepData): Promise<void> {
    if (!this.isConnected || !this.client) return;

    const deviceId = this.getDeviceId();
    const topic = `WheelSense/mobile/${deviceId}/walkstep`;
    const message = JSON.stringify({
      device_id: deviceId,
      ...stepData,
      timestamp_iso: new Date(stepData.timestamp).toISOString(),
    });

    try {
      await this.client.publish(topic, message, 0, false);
    } catch (error) {
      console.error('[MQTT] Walk step publish failed:', error);
    }
  }

  // ==================== TELEMETRY LOOP ====================

  startTelemetryLoop(): void {
    if (this.telemetryTimer) return;

    const store = useAppStore.getState();
    const interval = store.settings.telemetryInterval;

    console.log(`[MQTT] Starting telemetry loop (${interval}ms)`);

    this.telemetryTimer = setInterval(async () => {
      try {
        const state = useAppStore.getState();
        const payload = await this.buildTelemetryPayload({
          beacons: state.detectedBeacons,
          hr: state.lastHR,
          ppg: state.lastPPG,
          walkSteps: state.walkSteps ?? undefined,
        });
        await this.publishTelemetry(payload);
      } catch (error) {
        console.error('[MQTT] Telemetry loop error:', error);
      }
    }, interval);
  }

  stopTelemetryLoop(): void {
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
      console.log('[MQTT] Telemetry loop stopped');
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
    walkSteps?: WalkStepData;
    includeBattery?: boolean;
  } = {}): Promise<TelemetryPayload> {
    const { beacons, hr, ppg, walkSteps, includeBattery = true } = options;
    const store = useAppStore.getState();

    this.seq++;

    const payload: TelemetryPayload = {
      device_id: this.getDeviceId(),
      device_type: 'mobile_phone',
      hardware_type: 'mobile_phone',
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

    // Add walk step data
    if (walkSteps) {
      payload.walk_steps = walkSteps;
    }

    // Add battery info
    if (includeBattery) {
      payload.battery = await this.getBatteryInfo();
    }

    return payload;
  }

  // ==================== UTILITY ====================

  getDeviceId(): string {
    const store = useAppStore.getState();
    if (store.deviceId) {
      return store.deviceId;
    }
    return `MOBILE_${Device.deviceName || 'UNKNOWN'}`;
  }

  private async getBatteryInfo(): Promise<{ percentage: number; voltage_v: number; charging: boolean }> {
    return {
      percentage: 100,
      voltage_v: 3.8,
      charging: false,
    };
  }

  isConnectedToBroker(): boolean {
    return this.isConnected;
  }

  /** False in Expo Go — MQTT requires a dev/production build with native `Mqtt` module. */
  isNativeModuleAvailable(): boolean {
    return isMqttNativeAvailable();
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }
}

// ==================== SINGLETON INSTANCE ====================

export const mqttService = new MQTTService();
