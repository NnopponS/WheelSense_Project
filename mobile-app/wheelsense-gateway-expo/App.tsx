import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { WebView } from 'react-native-webview';

import { GatewayMqttClient, GatewayMqttMessage, normalizeMqttWebSocketUrl } from './src/gatewayMqtt';
import {
  POLAR_HR_MEASUREMENT_SHORT,
  POLAR_HR_MEASUREMENT_UUID,
  POLAR_HR_SERVICE_SHORT,
  POLAR_HR_SERVICE_UUID,
  parseHeartRateBase64,
  type HeartRateMeasurement,
} from './src/ble/polarHr';
import { NodeRssiStore, isNodeName, normalizeMac, type NodeRssiEntry } from './src/ble/nodeRssi';

type Language = 'en' | 'th';
type TabKey = 'home' | 'devices' | 'alerts' | 'portal' | 'settings';
type GatewayMode = 'offline' | 'connecting' | 'online' | 'degraded' | 'error';
type Severity = 'normal' | 'warning' | 'critical' | 'info';

type GatewayConfig = {
  deviceId: string;
  mqttUrl: string;
  portalBaseUrl: string;
  language: Language;
};

type GatewayAlert = {
  id: string;
  title: string;
  description: string;
  severity: string;
  at: string;
};

const CONFIG_KEY = 'wheelsense.expo.gateway.config.v2';
const PUBLIC_MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';
const LOCAL_MQTT_URL = 'ws://10.4.12.195:9001';
const LOCAL_PORTAL_URL = 'http://10.4.12.195:3000';
const TOPIC_ROOT = 'wheelsense';
const TOPIC_ROOT_ALIASES = [TOPIC_ROOT, 'WheelSense'] as const;
const NOTIFICATION_CHANNEL_ID = 'gateway-alerts';
const M5_SERVICE_UUID = '8f6e0001-b5a3-f393-e0a9-e50e24dcca9e';
const M5_TELEMETRY_UUID = '8f6e0003-b5a3-f393-e0a9-e50e24dcca9e';
const POLAR_SERVICE_UUID = POLAR_HR_SERVICE_SHORT;
// Drop a node from rssi[] if it has not been seen within this window.
const NODE_RSSI_TTL_MS = 12000;
// Fallback cadence so rssi[] / hr reach the server even without M5 notifications.
const PERIODIC_PUBLISH_MS = 3000;

const defaultConfig: GatewayConfig = {
  deviceId: `wheelsense-expo-${Date.now().toString(36)}`,
  mqttUrl: PUBLIC_MQTT_URL,
  portalBaseUrl: LOCAL_PORTAL_URL,
  language: 'th',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const copy = {
  en: {
    home: 'Home',
    devices: 'Devices',
    alerts: 'Alerts',
    portal: 'Portal',
    settings: 'Settings',
    title: 'WheelSense Gateway',
    subtitle: 'MQTT bridge for M5, Polar, alerts, and portal',
    transportHint: 'Mobile uses EMQX secure WebSocket 8084 (wss). The server uses MQTT TCP 1883.',
    start: 'Start gateway',
    stop: 'Stop',
    sendTest: 'Send test',
    openPortal: 'Open portal',
    openExternal: 'Open outside app',
    retry: 'Retry',
    scanM5: 'Scan M5',
    scanPolar: 'Scan Polar',
    stopScan: 'Stop scan',
    disconnect: 'Disconnect',
    save: 'Save',
    reset: 'Reset',
    emqxPreset: 'EMQX public',
    localPreset: 'Local Docker',
    gatewayOnline: 'Gateway is running and listening for alerts.',
    gatewayOffline: 'Tap Start gateway to connect to EMQX.',
    gatewayStarting: 'Connecting to MQTT...',
    firstStep: '1. Start gateway',
    secondStep: '2. Pair M5',
    thirdStep: '3. Use portal',
    startHelp: 'One tap connects this phone to EMQX, registers it, and subscribes to WheelSense alerts.',
    pairHelp: 'Pair the M5StickC Plus2 after the gateway is online.',
    portalHelp: 'The web portal opens inside this app.',
    notifications: 'Notifications',
    notificationsReady: 'Outside-app alerts are on',
    notificationsDenied: 'Allow notifications to receive alerts outside the app.',
    broker: 'Broker',
    topicRoot: 'Topic',
    deviceId: 'Gateway ID',
    portalUrl: 'Portal URL',
    language: 'Language',
    latestRoom: 'Latest room',
    latestPayload: 'Latest telemetry',
    noRoom: 'No room prediction yet',
    noPayload: 'No telemetry yet',
    noAlerts: 'No alerts yet',
    noDevices: 'No nearby devices found',
    connected: 'Connected',
    notConnected: 'Not connected',
    needed: 'Needed',
    ready: 'Ready',
    waiting: 'Waiting',
    telemetry: 'Telemetry',
    logs: 'Gateway logs',
    portalLoading: 'Loading portal...',
    portalError: 'Portal cannot be loaded in the app.',
    m5: 'M5StickC Plus2',
    polar: 'Polar Verity Sense',
    m5Detail: 'Wheelchair movement and RSSI companion',
    polarDetail: 'Optional heart-rate sensor',
    mqttUrl: 'MQTT WebSocket URL',
    connectPolar: 'Connect Polar',
    heartRate: 'Heart rate',
    bpm: 'bpm',
    nodes: 'Room nodes',
    nodesDetail: 'WSN_* beacons in range',
    noHr: 'No heart rate yet',
    scanNodes: 'Scanning room nodes (WSN_*)',
    polarConnected: 'Polar connected',
  },
  th: {
    home: 'หน้าแรก',
    devices: 'อุปกรณ์',
    alerts: 'แจ้งเตือน',
    portal: 'พอร์ทัล',
    settings: 'ตั้งค่า',
    title: 'WheelSense Gateway',
    subtitle: 'สะพาน MQTT สำหรับ M5, Polar, แจ้งเตือน และพอร์ทัล',
    transportHint: 'มือถือใช้ EMQX secure WebSocket 8084 (wss) ส่วน server ใช้ MQTT TCP 1883',
    start: 'เริ่มเกตเวย์',
    stop: 'หยุด',
    sendTest: 'ส่งทดสอบ',
    openPortal: 'เปิดพอร์ทัล',
    openExternal: 'เปิดนอกแอพ',
    retry: 'ลองใหม่',
    scanM5: 'สแกน M5',
    scanPolar: 'สแกน Polar',
    stopScan: 'หยุดสแกน',
    disconnect: 'ตัดการเชื่อมต่อ',
    save: 'บันทึก',
    reset: 'รีเซ็ต',
    emqxPreset: 'EMQX public',
    localPreset: 'Docker ในเครื่อง',
    gatewayOnline: 'เกตเวย์กำลังทำงานและรอรับแจ้งเตือน',
    gatewayOffline: 'แตะเริ่มเกตเวย์เพื่อเชื่อมต่อ EMQX',
    gatewayStarting: 'กำลังเชื่อมต่อ MQTT...',
    firstStep: '1. เริ่มเกตเวย์',
    secondStep: '2. จับคู่ M5',
    thirdStep: '3. ใช้พอร์ทัล',
    startHelp: 'แตะครั้งเดียวเพื่อเชื่อมมือถือกับ EMQX ลงทะเบียน และสมัครรับแจ้งเตือน WheelSense',
    pairHelp: 'จับคู่ M5StickC Plus2 หลังจากเกตเวย์ออนไลน์แล้ว',
    portalHelp: 'เว็บพอร์ทัลจะเปิดในแอพนี้',
    notifications: 'การแจ้งเตือน',
    notificationsReady: 'เปิดแจ้งเตือนนอกแอพแล้ว',
    notificationsDenied: 'อนุญาตแจ้งเตือนเพื่อรับ alert ตอนอยู่นอกแอพ',
    broker: 'Broker',
    topicRoot: 'Topic',
    deviceId: 'รหัสเกตเวย์',
    portalUrl: 'Portal URL',
    language: 'ภาษา',
    latestRoom: 'ห้องล่าสุด',
    latestPayload: 'Telemetry ล่าสุด',
    noRoom: 'ยังไม่มีผลทำนายห้อง',
    noPayload: 'ยังไม่มี telemetry',
    noAlerts: 'ยังไม่มีแจ้งเตือน',
    noDevices: 'ยังไม่พบอุปกรณ์ใกล้เคียง',
    connected: 'เชื่อมต่อแล้ว',
    notConnected: 'ยังไม่เชื่อมต่อ',
    needed: 'ต้องทำ',
    ready: 'พร้อม',
    waiting: 'รอข้อมูล',
    telemetry: 'Telemetry',
    logs: 'บันทึกเกตเวย์',
    portalLoading: 'กำลังโหลดพอร์ทัล...',
    portalError: 'โหลดพอร์ทัลในแอพไม่ได้',
    m5: 'M5StickC Plus2',
    polar: 'Polar Verity Sense',
    m5Detail: 'ตัวส่งข้อมูลการเคลื่อนที่และ RSSI ของรถเข็น',
    polarDetail: 'เซนเซอร์ชีพจรเสริม',
    mqttUrl: 'MQTT WebSocket URL',
    connectPolar: 'เชื่อมต่อ Polar',
    heartRate: 'อัตราการเต้นหัวใจ',
    bpm: 'ครั้ง/นาที',
    nodes: 'โหนดในห้อง',
    nodesDetail: 'บีคอน WSN_* ที่อยู่ในระยะ',
    noHr: 'ยังไม่มีข้อมูลชีพจร',
    scanNodes: 'กำลังสแกนโหนดในห้อง (WSN_*)',
    polarConnected: 'เชื่อมต่อ Polar แล้ว',
  },
} satisfies Record<Language, Record<string, string>>;

const tabs: Array<{ key: TabKey; label: keyof typeof copy.en }> = [
  { key: 'home', label: 'home' },
  { key: 'devices', label: 'devices' },
  { key: 'alerts', label: 'alerts' },
  { key: 'portal', label: 'portal' },
  { key: 'settings', label: 'settings' },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>('home');
  const [config, setConfig] = useState<GatewayConfig>(defaultConfig);
  const [draft, setDraft] = useState<GatewayConfig>(defaultConfig);
  const [mode, setMode] = useState<GatewayMode>('offline');
  const [message, setMessage] = useState('Ready');
  const [notificationsReady, setNotificationsReady] = useState(false);
  const [alerts, setAlerts] = useState<GatewayAlert[]>([]);
  const [roomPrediction, setRoomPrediction] = useState<Record<string, unknown> | null>(null);
  const [latestPayload, setLatestPayload] = useState('');
  const [publishCount, setPublishCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [scanDevices, setScanDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectedM5, setConnectedM5] = useState<Device | null>(null);
  const [connectedPolar, setConnectedPolar] = useState<Device | null>(null);
  const [heartRate, setHeartRate] = useState<HeartRateMeasurement | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [portalKey, setPortalKey] = useState(0);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');

  const mqttRef = useRef<GatewayMqttClient | null>(null);
  const bleRef = useRef<BleManager | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const m5MonitorRef = useRef<{ remove: () => void } | null>(null);
  const polarMonitorRef = useRef<{ remove: () => void } | null>(null);
  const seenAlertIdsRef = useRef<Set<string>>(new Set());
  // Latest M5 BLE payload + HR, plus the live WSN_* node RSSI store and scan state.
  const latestM5RawRef = useRef<string | null>(null);
  const heartRateRef = useRef<HeartRateMeasurement | null>(null);
  const nodeRssiRef = useRef<NodeRssiStore>(new NodeRssiStore());
  const nodeScanActiveRef = useRef(false);
  const discoveryRef = useRef<{ active: boolean; profile: 'm5' | 'polar' }>({ active: false, profile: 'm5' });
  const publishTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = copy[config.language];

  const addLog = useCallback((entry: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLogs((current) => [`${stamp} ${entry}`, ...current].slice(0, 80));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(CONFIG_KEY)
      .then((raw) => {
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as Partial<GatewayConfig>;
        const correctedMqttUrl = normalizeMqttUrl(parsed.mqttUrl);
        const next = {
          ...defaultConfig,
          ...parsed,
          deviceId: sanitizeDeviceId(parsed.deviceId ?? defaultConfig.deviceId),
          mqttUrl: correctedMqttUrl,
        };
        setConfig(next);
        setDraft(next);
        // Migration: if the stored URL was wrong (e.g. port 1883 instead of 8083),
        // persist the corrected value so the error never reappears after restart.
        if (correctedMqttUrl !== parsed.mqttUrl) {
          addLog(`MQTT URL auto-corrected: ${parsed.mqttUrl ?? '(empty)'} → ${correctedMqttUrl}`);
          AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next)).catch(() => undefined);
        }
      })
      .catch(() => addLog('Config load failed; using defaults'));
  }, [addLog]);

  useEffect(() => {
    ensureNotificationsReady()
      .then(setNotificationsReady)
      .catch((error) => addLog(`Notification setup failed: ${errorMessage(error)}`));
  }, [addLog]);

  useEffect(() => {
    return () => {
      mqttRef.current?.disconnect();
      m5MonitorRef.current?.remove();
      polarMonitorRef.current?.remove();
      bleRef.current?.destroy();
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
      }
      if (publishTimerRef.current) {
        clearInterval(publishTimerRef.current);
      }
    };
  }, []);

  const statusText = useMemo(() => {
    if (mode === 'online') {
      return t.gatewayOnline;
    }
    if (mode === 'connecting') {
      return t.gatewayStarting;
    }
    if (mode === 'offline') {
      return t.gatewayOffline;
    }
    return message;
  }, [message, mode, t.gatewayOffline, t.gatewayOnline, t.gatewayStarting]);

  const saveConfig = useCallback(
    async (next: GatewayConfig) => {
      const normalized = {
        ...next,
        deviceId: sanitizeDeviceId(next.deviceId),
        mqttUrl: normalizeMqttUrl(next.mqttUrl),
        portalBaseUrl: normalizePortalUrl(next.portalBaseUrl) ?? LOCAL_PORTAL_URL,
      };
      await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
      setConfig(normalized);
      setDraft(normalized);
      addLog(`Saved config for ${normalized.deviceId}`);
    },
    [addLog],
  );

  const handleMqttMessage = useCallback(
    (event: GatewayMqttMessage) => {
      addLog(`MQTT ${event.topic}`);

      if (isTopic(event.topic, 'config')) {
        const portal = event.payload.portal_base_url;
        if (typeof portal === 'string') {
          const normalized = normalizePortalUrl(portal);
          if (normalized) {
            const next = { ...config, portalBaseUrl: normalized };
            setConfig(next);
            setDraft(next);
            AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next)).catch(() => undefined);
          }
        }
        return;
      }

      if (isTopic(event.topic, 'alerts')) {
        const alert = toAlert(event);
        const duplicate = seenAlertIdsRef.current.has(alert.id);
        seenAlertIdsRef.current.add(alert.id);
        setAlerts((current) => [alert, ...current.filter((item) => item.id !== alert.id)].slice(0, 50));
        if (!duplicate) {
          notifyAlert(alert).catch((error) => addLog(`Notification failed: ${errorMessage(error)}`));
        }
        return;
      }

      if (isTopic(event.topic, 'room')) {
        setRoomPrediction(event.payload);
      }
    },
    [addLog, config],
  );

  const startGateway = useCallback(async () => {
    const activeConfig = {
      ...config,
      mqttUrl: normalizeMqttUrl(config.mqttUrl),
    };
    if (activeConfig.mqttUrl !== config.mqttUrl) {
      setConfig(activeConfig);
      setDraft(activeConfig);
      AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(activeConfig)).catch(() => undefined);
    }
    setMode('connecting');
    setMessage(t.gatewayStarting);
    addLog(`Connecting ${activeConfig.mqttUrl}`);
    try {
      mqttRef.current?.disconnect();
      const client = new GatewayMqttClient(activeConfig.mqttUrl, {
        clientId: `rn-${activeConfig.deviceId}-${Date.now().toString(36)}`,
        onMessage: handleMqttMessage,
        onStatus: addLog,
      });
      mqttRef.current = client;
      await client.connect();

      uniqueTopics(
        TOPIC_ROOT_ALIASES.flatMap((root) => [
          mqttTopic(root, 'config', 'all'),
          mqttTopic(root, 'config', activeConfig.deviceId),
          mqttTopic(root, 'mobile', activeConfig.deviceId, 'control'),
          mqttTopic(root, 'room', activeConfig.deviceId),
          mqttTopic(root, 'alerts', activeConfig.deviceId),
        ]),
      ).forEach((topic) => client.subscribe(topic));

      client.publish(mqttTopic(TOPIC_ROOT, 'mobile', activeConfig.deviceId, 'register'), {
        device_id: activeConfig.deviceId,
        device_name: 'WheelSense Expo Gateway',
        platform: Platform.OS,
        os_version: String(Platform.Version),
        app_version: '1.0.1-expo',
      });

      setMode('online');
      setMessage('MQTT registered with server');
      addLog('Published mobile registration');
    } catch (error) {
      setMode('error');
      const detail = errorMessage(error);
      setMessage(detail);
      addLog(`Start failed: ${detail}`);
    }
  }, [addLog, config, handleMqttMessage, t.gatewayStarting]);

  const stopGateway = useCallback(() => {
    mqttRef.current?.disconnect();
    mqttRef.current = null;
    discoveryRef.current.active = false;
    bleRef.current?.stopDeviceScan();
    nodeScanActiveRef.current = false;
    setScanning(false);
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    nodeRssiRef.current.clear();
    setNodeCount(0);
    setMode('offline');
    setMessage('Stopped');
    addLog('Gateway stopped');
  }, [addLog]);

  // Assemble one unified mobile telemetry payload from all live sources:
  // the latest M5 BLE frame, the WSN_* node RSSI snapshot, and the Polar HR.
  const publishTelemetry = useCallback(
    (rawPayload: string | null, source: 'm5_ble' | 'manual_test' | 'periodic') => {
      if (!mqttRef.current?.isConnected) {
        if (source !== 'periodic') {
          setMode('degraded');
          setMessage('MQTT is not connected');
          addLog('Telemetry skipped: MQTT offline');
        }
        return;
      }

      const nodeRssi = nodeRssiRef.current.snapshot(NODE_RSSI_TTL_MS);
      const hr = heartRateRef.current;
      const decoded = rawPayload ? safeJson(rawPayload) : {};

      // For periodic publishes with nothing new to report, stay quiet.
      if (source === 'periodic' && !rawPayload && nodeRssi.length === 0 && !hr) {
        return;
      }

      // rssi[] is sourced from the live node scan; merge any rssi embedded in the
      // M5 frame as a fallback (node scan takes priority on duplicate node ids).
      const mergedRssi = mergeRssi(nodeRssi, rawPayload ? normalizeRssi(decoded) : []);

      const topic = mqttTopic(TOPIC_ROOT, 'mobile', config.deviceId, 'telemetry');
      const payload: Record<string, unknown> = {
        device_id: config.deviceId,
        device_type: 'mobile_phone',
        hardware_type: 'mobile_phone',
        app_mode: 'expo_ble_gateway',
        timestamp: new Date().toISOString(),
        rssi: mergedRssi,
      };

      if (rawPayload) {
        payload.m5 = normalizeM5Telemetry(decoded, rawPayload, connectedM5, source === 'manual_test' ? 'manual_test' : 'm5_ble');
        payload.gateway_payload = decoded;
      }

      if (hr) {
        // hr_source stays mobile_ble (standard GATT HR, no PPG stream).
        payload.hr = { bpm: hr.bpm, rr_intervals_ms: hr.rrIntervalsMs };
        payload.hr_source = 'mobile_ble';
      }

      mqttRef.current.publish(topic, payload);
      if (rawPayload) {
        setLatestPayload(rawPayload);
      }
      setPublishCount((value) => value + 1);
      if (source !== 'periodic') {
        addLog(`Telemetry published to ${topic}`);
      }
    },
    [addLog, config.deviceId, connectedM5],
  );

  const sendTestTelemetry = useCallback(() => {
    publishTelemetry(
      JSON.stringify({
        device_id: 'M5_EXPO_TEST',
        distance_m: Number((Math.random() * 3).toFixed(2)),
        battery: 87,
      }),
      'manual_test',
    );
  }, [publishTelemetry]);

  const manager = useCallback(() => {
    bleRef.current ??= new BleManager();
    return bleRef.current;
  }, []);

  // Stop the pairing-discovery window but keep the continuous node scan alive.
  const stopScan = useCallback(() => {
    discoveryRef.current.active = false;
    setScanning(false);
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
  }, []);

  // Fully stop the underlying BLE scan (node + discovery).
  const stopAllScans = useCallback(() => {
    stopScan();
    bleRef.current?.stopDeviceScan();
    nodeScanActiveRef.current = false;
  }, [stopScan]);

  // One persistent BLE scan feeds both the WSN_* node RSSI store and, while a
  // discovery window is open, the M5/Polar pairing list.
  const startNodeScan = useCallback(() => {
    if (nodeScanActiveRef.current) {
      return;
    }
    nodeScanActiveRef.current = true;
    addLog('Node RSSI scan started (WSN_*)');
    manager().startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
      if (error) {
        nodeScanActiveRef.current = false;
        addLog(`Scan error: ${error.message}`);
        return;
      }
      if (!device) {
        return;
      }
      const name = device.name ?? device.localName ?? '';
      if (isNodeName(name) && typeof device.rssi === 'number') {
        nodeRssiRef.current.observe(name, device.rssi, normalizeMac(device.id));
      }
      if (discoveryRef.current.active) {
        const profile = discoveryRef.current.profile;
        const uuids = device.serviceUUIDs ?? [];
        const serviceHint = profile === 'm5' ? M5_SERVICE_UUID : POLAR_SERVICE_UUID;
        const match =
          uuids.some((uuid) => uuid.toLowerCase() === serviceHint) ||
          (profile === 'm5' && /m5|stick|wheelsense/i.test(name)) ||
          (profile === 'polar' && /polar|verity|heart/i.test(name));
        if (match) {
          setScanDevices((current) =>
            current.some((item) => item.id === device.id) ? current : [...current, device].slice(0, 12),
          );
        }
      }
    });
  }, [addLog, manager]);

  const scanBle = useCallback(
    async (profile: 'm5' | 'polar') => {
      const allowed = await requestBlePermissions();
      if (!allowed) {
        setMode('degraded');
        setMessage('Bluetooth permission denied');
        return;
      }
      discoveryRef.current = { active: true, profile };
      setScanDevices([]);
      setScanning(true);
      addLog(`Scanning ${profile}`);
      startNodeScan();
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
      }
      scanTimerRef.current = setTimeout(stopScan, 12000);
    },
    [addLog, startNodeScan, stopScan],
  );

  const connectM5 = useCallback(
    async (device: Device) => {
      try {
        stopScan();
        const connected = await manager().connectToDevice(device.id, { timeout: 12000 });
        await connected.discoverAllServicesAndCharacteristics();
        m5MonitorRef.current?.remove();
        m5MonitorRef.current = connected.monitorCharacteristicForService(
          M5_SERVICE_UUID,
          M5_TELEMETRY_UUID,
          (error, characteristic) => {
            if (error) {
              setMode('degraded');
              setMessage(error.message);
              return;
            }
            if (characteristic?.value) {
              const raw = decodeBase64(characteristic.value);
              latestM5RawRef.current = raw;
              publishTelemetry(raw, 'm5_ble');
            }
          },
        );
        setConnectedM5(connected);
        addLog('M5 telemetry notifications enabled');
      } catch (error) {
        setMode('degraded');
        setMessage(errorMessage(error));
      }
    },
    [addLog, manager, publishTelemetry, stopScan],
  );

  const disconnectM5 = useCallback(async () => {
    m5MonitorRef.current?.remove();
    m5MonitorRef.current = null;
    latestM5RawRef.current = null;
    if (connectedM5) {
      await manager().cancelDeviceConnection(connectedM5.id).catch(() => undefined);
    }
    setConnectedM5(null);
  }, [connectedM5, manager]);

  // Connect to the Polar Verity Sense and stream standard GATT heart rate.
  const connectPolar = useCallback(
    async (device: Device) => {
      try {
        stopScan();
        const connected = await manager().connectToDevice(device.id, { timeout: 12000 });
        await connected.discoverAllServicesAndCharacteristics();
        polarMonitorRef.current?.remove();
        polarMonitorRef.current = connected.monitorCharacteristicForService(
          POLAR_HR_SERVICE_UUID,
          POLAR_HR_MEASUREMENT_UUID,
          (error, characteristic) => {
            if (error) {
              addLog(`Polar HR error: ${error.message}`);
              return;
            }
            if (characteristic?.value) {
              const hr = parseHeartRateBase64(characteristic.value);
              if (hr) {
                heartRateRef.current = hr;
                setHeartRate(hr);
              }
            }
          },
        );
        setConnectedPolar(connected);
        addLog('Polar heart-rate notifications enabled');
      } catch (error) {
        setMode('degraded');
        setMessage(errorMessage(error));
      }
    },
    [addLog, manager, stopScan],
  );

  const disconnectPolar = useCallback(async () => {
    polarMonitorRef.current?.remove();
    polarMonitorRef.current = null;
    heartRateRef.current = null;
    setHeartRate(null);
    if (connectedPolar) {
      await manager().cancelDeviceConnection(connectedPolar.id).catch(() => undefined);
    }
    setConnectedPolar(null);
  }, [connectedPolar, manager]);

  // Pick the matching connect handler for a tapped scan result.
  const connectDevice = useCallback(
    (device: Device) => {
      const name = device.name ?? device.localName ?? '';
      if (/polar|verity|heart/i.test(name) || discoveryRef.current.profile === 'polar') {
        return connectPolar(device);
      }
      return connectM5(device);
    },
    [connectM5, connectPolar],
  );

  // While the gateway is online, continuously scan WSN_* node beacons and
  // publish merged telemetry (M5 + rssi[] + hr) on a fixed cadence so the
  // server keeps receiving localization + vitals even between M5 frames.
  useEffect(() => {
    if (mode !== 'online') {
      return;
    }
    startNodeScan();
    const timer = setInterval(() => {
      setNodeCount(nodeRssiRef.current.count(NODE_RSSI_TTL_MS));
      publishTelemetry(latestM5RawRef.current, 'periodic');
    }, PERIODIC_PUBLISH_MS);
    publishTimerRef.current = timer;
    return () => {
      clearInterval(timer);
      publishTimerRef.current = null;
    };
  }, [mode, startNodeScan, publishTelemetry]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Image source={require('./assets/brand/logo.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>WheelSense</Text>
          <Text style={styles.title}>{t[tabs.find((item) => item.key === tab)?.label ?? 'home']}</Text>
        </View>
        <StatusPill label={mode === 'online' ? t.connected : t.notConnected} online={mode === 'online'} />
      </View>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {tab === 'home' ? (
          <>
            <Panel title={mode === 'online' ? t.gatewayOnline : t.gatewayOffline} subtitle={statusText} accent>
              <ActionButton
                label={mode === 'online' ? t.sendTest : t.start}
                onPress={mode === 'online' ? sendTestTelemetry : startGateway}
                disabled={mode === 'connecting'}
              />
              <View style={styles.actions}>
                <ActionButton label={t.stop} onPress={stopGateway} variant="secondary" />
                <ActionButton label={t.openPortal} onPress={() => setTab('portal')} variant="secondary" />
              </View>
            </Panel>
            <Panel title={t.firstStep} subtitle={t.startHelp}>
              <RowCard
                title={t.broker}
                subtitle={config.mqttUrl}
                meta={brokerLabel(config.mqttUrl)}
                severity={config.mqttUrl.includes(':1883') ? 'warning' : 'normal'}
              />
              <RowCard title={t.topicRoot} subtitle={`${TOPIC_ROOT}/mobile/${config.deviceId}`} meta={TOPIC_ROOT} severity="normal" />
              <RowCard
                title={t.notifications}
                subtitle={notificationsReady ? t.notificationsReady : t.notificationsDenied}
                meta={notificationsReady ? t.ready : t.needed}
                severity={notificationsReady ? 'normal' : 'warning'}
              />
            </Panel>
            <Panel title={t.secondStep} subtitle={t.pairHelp}>
              <RowCard
                title={t.m5}
                subtitle={connectedM5 ? connectedM5.name ?? connectedM5.id : t.m5Detail}
                meta={connectedM5 ? t.connected : t.needed}
                severity={connectedM5 ? 'normal' : 'warning'}
              />
              <View style={styles.actions}>
                <ActionButton label={t.scanM5} onPress={() => scanBle('m5')} variant="secondary" />
                <ActionButton label={t.devices} onPress={() => setTab('devices')} variant="secondary" />
              </View>
            </Panel>
            <Panel title={t.thirdStep} subtitle={t.portalHelp}>
              <RowCard title={t.portalUrl} subtitle={config.portalBaseUrl} meta={urlHost(config.portalBaseUrl)} severity="info" />
              <ActionButton label={t.openPortal} onPress={() => setTab('portal')} />
            </Panel>
          </>
        ) : null}

        {tab === 'devices' ? (
          <>
            <MetricGrid
              items={[
                {
                  label: t.heartRate,
                  value: heartRate ? `${heartRate.bpm} ${t.bpm}` : t.noHr,
                  detail: connectedPolar ? t.polarConnected : t.polarDetail,
                  severity: heartRate ? 'critical' : 'info',
                },
                {
                  label: t.nodes,
                  value: String(nodeCount),
                  detail: t.nodesDetail,
                  severity: nodeCount ? 'normal' : 'info',
                },
              ]}
            />
            <DeviceCard
              image={require('./assets/devices/m5stickcplus2.png')}
              title={t.m5}
              subtitle={connectedM5 ? `${t.connected}: ${connectedM5.name ?? connectedM5.id}` : t.m5Detail}
              connected={Boolean(connectedM5)}
            />
            <View style={styles.actions}>
              <ActionButton label={t.scanM5} onPress={() => scanBle('m5')} disabled={scanning} />
              <ActionButton label={t.disconnect} onPress={disconnectM5} variant="secondary" />
            </View>
            <DeviceCard
              image={require('./assets/devices/polar_verity_sense.png')}
              title={t.polar}
              subtitle={connectedPolar ? `${t.connected}: ${connectedPolar.name ?? connectedPolar.id}` : t.polarDetail}
              connected={Boolean(connectedPolar)}
            />
            <View style={styles.actions}>
              <ActionButton label={t.scanPolar} onPress={() => scanBle('polar')} disabled={scanning} variant="secondary" />
              <ActionButton label={t.disconnect} onPress={disconnectPolar} variant="secondary" />
              <ActionButton label={t.stopScan} onPress={stopScan} variant="secondary" />
            </View>
            <Panel title={scanning ? t.waiting : t.devices} subtitle={mode === 'online' ? t.scanNodes : undefined}>
              {scanDevices.length === 0 ? <Text style={styles.muted}>{t.noDevices}</Text> : null}
              {scanDevices.map((device) => (
                <Pressable key={device.id} style={styles.deviceRow} onPress={() => connectDevice(device)}>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>{device.name ?? device.localName ?? 'BLE device'}</Text>
                    <Text style={styles.muted}>{device.id}</Text>
                  </View>
                  <Text style={styles.badge}>{t.connected}</Text>
                </Pressable>
              ))}
            </Panel>
          </>
        ) : null}

        {tab === 'alerts' ? (
          <>
            <MetricGrid
              items={[
                { label: t.alerts, value: String(alerts.length), detail: alerts[0]?.title ?? t.noAlerts, severity: alerts.length ? alertSeverity(alerts[0].severity) : 'info' },
                { label: t.latestRoom, value: roomPrediction ? roomSummary(roomPrediction) : t.waiting, detail: roomPrediction ? JSON.stringify(roomPrediction).slice(0, 80) : t.noRoom, severity: roomPrediction ? 'normal' : 'info' },
                { label: t.telemetry, value: String(publishCount), detail: latestPayload || t.noPayload, severity: publishCount ? 'normal' : 'info' },
              ]}
            />
            <Panel title={t.alerts} subtitle={notificationsReady ? t.notificationsReady : t.notificationsDenied}>
              {alerts.length === 0 ? <RowCard title={t.noAlerts} subtitle={t.startHelp} meta={t.waiting} severity="info" /> : null}
              {alerts.map((alert) => (
                <View key={alert.id} style={styles.alertRow}>
                  <Text style={styles.rowTitle}>{alert.title}</Text>
                  <Text style={styles.body}>{alert.description}</Text>
                  <Text style={styles.muted}>{alert.severity} - {alert.at}</Text>
                </View>
              ))}
            </Panel>
            <Panel title={t.logs} subtitle={message}>
              {logs.length === 0 ? <Text style={styles.muted}>{t.waiting}</Text> : null}
              {logs.map((line) => (
                <Text
                  key={line}
                  style={[
                    styles.logLine,
                    line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('closed')
                      ? styles.logLineError
                      : line.toLowerCase().includes('connected') || line.toLowerCase().includes('online') || line.toLowerCase().includes('registered') || line.toLowerCase().includes('corrected')
                        ? styles.logLineSuccess
                        : null,
                  ]}
                >
                  {line}
                </Text>
              ))}
            </Panel>
          </>
        ) : null}

        {tab === 'portal' ? (
          <PortalPanel
            title={t.portal}
            url={config.portalBaseUrl}
            loadingText={t.portalLoading}
            errorText={t.portalError}
            openExternalText={t.openExternal}
            retryText={t.retry}
            portalKey={portalKey}
            setPortalKey={setPortalKey}
            portalLoading={portalLoading}
            setPortalLoading={setPortalLoading}
            portalError={portalError}
            setPortalError={setPortalError}
          />
        ) : null}

        {tab === 'settings' ? (
          <Panel title={t.settings} subtitle={t.transportHint}>
            <MetricGrid
              items={[
                {
                  label: t.broker,
                  value: brokerLabel(draft.mqttUrl),
                  detail: draft.mqttUrl,
                  severity: draft.mqttUrl.includes(':1883') ? 'warning' : draft.mqttUrl.includes('broker.emqx.io') ? 'normal' : 'info',
                },
                { label: t.topicRoot, value: TOPIC_ROOT, detail: `${TOPIC_ROOT}/mobile/...`, severity: 'normal' },
                { label: t.portalUrl, value: urlHost(draft.portalBaseUrl), detail: draft.portalBaseUrl, severity: 'info' },
              ]}
            />
            {draft.mqttUrl.includes(':1883') ? (
              <View style={styles.transportWarning}>
                <Text style={styles.transportWarningText}>
                  ⚠ Port 1883 is TCP-only. Mobile needs secure WebSocket port 8084 (wss).{'\n'}
                  Tap "EMQX public" below to auto-correct.
                </Text>
              </View>
            ) : null}
            <Field label={t.deviceId} value={draft.deviceId} onChangeText={(deviceId) => setDraft({ ...draft, deviceId })} />
            <Field label={t.mqttUrl} value={draft.mqttUrl} onChangeText={(mqttUrl) => setDraft({ ...draft, mqttUrl })} />
            <Field label={t.portalUrl} value={draft.portalBaseUrl} onChangeText={(portalBaseUrl) => setDraft({ ...draft, portalBaseUrl })} />
            <Text style={styles.label}>{t.language}</Text>
            <View style={styles.segment}>
              <Segment label="English" active={draft.language === 'en'} onPress={() => setDraft({ ...draft, language: 'en' })} />
              <Segment label="ไทย" active={draft.language === 'th'} onPress={() => setDraft({ ...draft, language: 'th' })} />
            </View>
            <View style={styles.actions}>
              <ActionButton label={t.save} onPress={() => saveConfig(draft)} />
              <ActionButton label={t.emqxPreset} onPress={() => setDraft({ ...draft, mqttUrl: PUBLIC_MQTT_URL })} variant="secondary" />
              <ActionButton label={t.localPreset} onPress={() => setDraft({ ...draft, mqttUrl: LOCAL_MQTT_URL, portalBaseUrl: LOCAL_PORTAL_URL })} variant="secondary" />
              <ActionButton label={t.reset} onPress={() => saveConfig(defaultConfig)} variant="secondary" />
            </View>
          </Panel>
        ) : null}
      </ScrollView>
      <View style={styles.tabBar}>
        {tabs.map((item) => (
          <Pressable key={item.key} style={[styles.tab, tab === item.key && styles.tabActive]} onPress={() => setTab(item.key)}>
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{t[item.label]}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function PortalPanel({
  title,
  url,
  loadingText,
  errorText,
  openExternalText,
  retryText,
  portalKey,
  setPortalKey,
  portalLoading,
  setPortalLoading,
  portalError,
  setPortalError,
}: {
  title: string;
  url: string;
  loadingText: string;
  errorText: string;
  openExternalText: string;
  retryText: string;
  portalKey: number;
  setPortalKey: React.Dispatch<React.SetStateAction<number>>;
  portalLoading: boolean;
  setPortalLoading: React.Dispatch<React.SetStateAction<boolean>>;
  portalError: string;
  setPortalError: React.Dispatch<React.SetStateAction<string>>;
}) {
  const portalUrl = normalizePortalUrl(url);
  return (
    <Panel
      title={title}
      subtitle={portalUrl ?? errorText}
      action={<ActionButton label={openExternalText} onPress={() => openExternal(url)} variant="secondary" />}
    >
      {!portalUrl ? <RowCard title={errorText} subtitle={url} meta="URL" severity="warning" /> : null}
      {portalUrl ? (
        <View style={styles.portalFrame}>
          <WebView
            key={portalKey}
            source={{ uri: portalUrl }}
            originWhitelist={['http://*', 'https://*']}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            onLoadStart={() => {
              setPortalLoading(true);
              setPortalError('');
            }}
            onLoadEnd={() => setPortalLoading(false)}
            onError={(event) => {
              setPortalLoading(false);
              setPortalError(event.nativeEvent.description || errorText);
            }}
            style={styles.portalWebView}
          />
          {portalLoading ? (
            <View style={styles.portalOverlay}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.muted}>{loadingText}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {portalError ? (
        <View style={styles.portalError}>
          <Text style={styles.body}>{portalError}</Text>
          <View style={styles.actions}>
            <ActionButton label={retryText} onPress={() => setPortalKey((value) => value + 1)} />
            <ActionButton label={openExternalText} onPress={() => openExternal(url)} variant="secondary" />
          </View>
        </View>
      ) : null}
    </Panel>
  );
}

function Panel({ title, children, accent = false, subtitle, action }: { title: string; children: React.ReactNode; accent?: boolean; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={[styles.panel, accent && styles.panelAccent]}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderText}>
          <Text style={styles.panelTitle}>{title}</Text>
          {subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function ActionButton({ label, onPress, variant = 'primary', disabled = false }: { label: string; onPress: () => void; variant?: 'primary' | 'secondary'; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, variant === 'secondary' && styles.secondaryButton, disabled && styles.disabledButton]}>
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function RowCard({ title, subtitle, meta, severity }: { title: string; subtitle: string; meta: string; severity: Severity }) {
  return (
    <View style={styles.rowCard}>
      <View style={[styles.rowIcon, severityStyle(severity)]}>
        <View style={[styles.rowIconDot, severityDotStyle(severity)]} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.muted} numberOfLines={2}>{subtitle}</Text>
      </View>
      <Text style={[styles.rowMeta, severityTextStyle(severity)]}>{meta}</Text>
    </View>
  );
}

function DeviceCard({ image, title, subtitle, connected }: { image: number; title: string; subtitle: string; connected: boolean }) {
  return (
    <View style={styles.deviceCard}>
      <Image source={image} style={styles.deviceImage} resizeMode="contain" />
      <View style={styles.rowContent}>
        <Text style={styles.panelTitle}>{title}</Text>
        <View style={styles.statusLine}>
          <View style={[styles.statusDot, connected ? styles.statusDotOnline : styles.statusDotIdle]} />
          <Text style={[styles.body, connected ? styles.statusOnlineText : styles.statusIdleText]}>{subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

function MetricGrid({ items }: { items: Array<{ label: string; value: string; detail: string; severity?: Severity }> }) {
  return (
    <View style={styles.metricGrid}>
      {items.map((item) => (
        <View key={item.label} style={[styles.metric, severityStyle(item.severity ?? 'info')]}>
          <Text style={styles.metricLabel}>{item.label}</Text>
          <Text style={styles.metricValue} numberOfLines={2}>{item.value}</Text>
          <Text style={styles.metricDetail} numberOfLines={2}>{item.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function StatusPill({ label, online }: { label: string; online: boolean }) {
  return (
    <View style={[styles.statusPill, online ? styles.statusPillOnline : styles.statusPillIdle]}>
      <View style={[styles.statusDot, online ? styles.statusDotOnline : styles.statusDotIdle]} />
      <Text style={styles.statusPillText}>{label}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChangeText} autoCapitalize="none" autoCorrect={false} />
    </View>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentItem, active && styles.segmentItemActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function mqttTopic(root: string, ...parts: string[]) {
  return [root, ...parts.map((part) => part.replace(/^\/+|\/+$/g, ''))].join('/');
}

function uniqueTopics(topics: string[]) {
  return Array.from(new Set(topics));
}

function isTopic(topic: string, section: 'alerts' | 'config' | 'room') {
  return topic.toLowerCase().startsWith(`${TOPIC_ROOT}/${section}/`);
}

async function requestBlePermissions() {
  if (Platform.OS !== 'android') {
    return true;
  }
  const api = Number.parseInt(String(Platform.Version), 10);
  const permissions =
    api >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
}

async function ensureNotificationsReady() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'WheelSense alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

async function notifyAlert(alert: GatewayAlert) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: alert.title,
      body: alert.description,
      data: { severity: alert.severity, alertId: alert.id },
      sound: true,
    },
    trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID, seconds: 1 } : null,
  });
}

function normalizePortalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return safeUrl(withScheme)?.toString().replace(/\/$/, '') ?? null;
}

function openExternal(value: string) {
  const url = normalizePortalUrl(value);
  if (url) {
    Linking.openURL(url).catch(() => undefined);
  }
}

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function brokerLabel(value: string) {
  const uri = safeUrl(value);
  if (!uri) {
    return value;
  }
  if (uri.hostname === 'broker.emqx.io') {
    return 'EMQX Public';
  }
  if (uri.hostname === '10.4.12.195') {
    return 'Local Docker';
  }
  return uri.hostname || value;
}

function urlHost(value: string) {
  return safeUrl(value)?.hostname || value;
}

function normalizeMqttUrl(value?: string) {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed.includes('mqtt.wheelsense.local') || trimmed.includes('test.mosquitto.org')) {
    return defaultConfig.mqttUrl;
  }

  const lower = trimmed.toLowerCase();

  // Hard-correct the most common misconfiguration: broker.emqx.io on TCP port 1883
  // (either typed directly or saved from an older app version).
  // Port 1883 on broker.emqx.io is TCP MQTT only — not a WebSocket endpoint.
  if (lower.includes('broker.emqx.io:1883')) {
    return defaultConfig.mqttUrl; // wss://broker.emqx.io:8084/mqtt
  }

  const websocketNormalized = normalizeMqttWebSocketUrl(trimmed);
  if (websocketNormalized !== trimmed) {
    return websocketNormalized;
  }

  if (
    lower === 'broker.emqx.io' ||
    lower === 'broker.emqx.io:1883' ||
    lower === 'broker.emqx.io:1883/mqtt' ||
    lower === 'mqtt://broker.emqx.io' ||
    lower === 'mqtt://broker.emqx.io:1883' ||
    lower === 'mqtt://broker.emqx.io:1883/mqtt' ||
    lower === 'tcp://broker.emqx.io' ||
    lower === 'tcp://broker.emqx.io:1883' ||
    lower === 'tcp://broker.emqx.io:1883/mqtt' ||
    lower === 'ws://broker.emqx.io' ||
    lower === 'ws://broker.emqx.io:1883' ||
    lower === 'ws://broker.emqx.io:1883/mqtt' ||
    lower === 'ws://broker.emqx.io:8083' ||
    lower === 'ws://broker.emqx.io:8083/' ||
    lower === 'ws://broker.emqx.io:8083/mqtt'
  ) {
    return defaultConfig.mqttUrl;
  }
  if (
    lower === 'wss://broker.emqx.io' ||
    lower === 'wss://broker.emqx.io:8084' ||
    lower === 'wss://broker.emqx.io:8084/' ||
    lower === 'wss://broker.emqx.io:8084/mqtt'
  ) {
    return 'wss://broker.emqx.io:8084/mqtt';
  }
  if (lower === '10.4.12.195:9001' || lower === 'ws://10.4.12.195' || lower === 'ws://10.4.12.195:9001/') {
    return LOCAL_MQTT_URL;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && trimmed.includes(':')) {
    return `ws://${trimmed.replace(/\/$/, '')}`;
  }
  return trimmed;
}

function sanitizeDeviceId(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 48) || defaultConfig.deviceId;
}

function safeJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? parsed : { raw: value };
  } catch {
    return { raw: value };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeM5Telemetry(
  decoded: unknown,
  rawPayload: string,
  connectedM5: Device | null,
  source: 'm5_ble' | 'manual_test',
) {
  const root = asRecord(decoded);
  const imu = asRecord(root.imu);
  const motion = asRecord(root.motion);
  const battery = asRecord(root.battery);
  const fallbackDeviceId = connectedM5?.id ?? String(root.device_id ?? root.m5_device_id ?? 'm5-ble');

  return {
    device_id: fallbackDeviceId,
    device_name: connectedM5?.name ?? String(root.device_name ?? root.name ?? 'M5StickC Plus2'),
    hardware_type: 'companion_m5',
    device_type: 'wheelchair',
    source,
    raw_payload: rawPayload,
    imu: {
      ax: numberValue(imu.ax ?? root.ax),
      ay: numberValue(imu.ay ?? root.ay),
      az: numberValue(imu.az ?? root.az),
      gx: numberValue(imu.gx ?? root.gx),
      gy: numberValue(imu.gy ?? root.gy),
      gz: numberValue(imu.gz ?? root.gz),
    },
    motion: {
      distance_m: numberValue(motion.distance_m ?? root.distance_m),
      velocity_ms: numberValue(motion.velocity_ms ?? root.velocity_ms ?? root.speed_ms),
      accel_ms2: numberValue(motion.accel_ms2 ?? root.accel_ms2),
      direction: motion.direction ?? root.direction,
    },
    battery: {
      percentage: numberValue(battery.percentage ?? root.battery_pct ?? root.battery),
      voltage_v: numberValue(battery.voltage_v ?? root.battery_v),
      charging: battery.charging === true || root.charging === true,
    },
    firmware: root.firmware,
    model: root.model,
    mac: root.mac,
  };
}

function normalizeRssi(decoded: unknown) {
  const root = asRecord(decoded);
  const rssi = root.rssi;
  if (Array.isArray(rssi)) {
    return rssi
      .map((item) => {
        const row = asRecord(item);
        const value = numberValue(row.rssi);
        const node = row.node ?? row.node_id ?? row.anchor ?? row.device_id;
        if (typeof node !== 'string' || value === undefined) {
          return null;
        }
        return { node, rssi: value, mac: typeof row.mac === 'string' ? row.mac : '' };
      })
      .filter((item): item is { node: string; rssi: number; mac: string } => item !== null);
  }
  if (rssi && typeof rssi === 'object') {
    return Object.entries(rssi as Record<string, unknown>)
      .map(([node, value]) => {
        const parsed = numberValue(value);
        return parsed === undefined ? null : { node, rssi: parsed, mac: '' };
      })
      .filter((item): item is { node: string; rssi: number; mac: string } => item !== null);
  }
  const single = numberValue(rssi);
  if (single !== undefined) {
    return [{ node: String(root.node ?? root.node_id ?? root.device_id ?? 'mobile_rssi'), rssi: single, mac: String(root.mac ?? '') }];
  }
  return [];
}

// Merge the live WSN_* node RSSI snapshot with any rssi embedded in the M5
// frame. Node-scan entries win on duplicate node ids.
function mergeRssi(primary: NodeRssiEntry[], fallback: NodeRssiEntry[]): NodeRssiEntry[] {
  const byNode = new Map<string, NodeRssiEntry>();
  for (const entry of fallback) {
    byNode.set(entry.node, entry);
  }
  for (const entry of primary) {
    byNode.set(entry.node, entry);
  }
  return Array.from(byNode.values());
}

function toAlert(event: GatewayMqttMessage): GatewayAlert {
  const payload = event.payload;
  return {
    id: String(payload.alert_id ?? payload.id ?? `${event.topic}-${event.receivedAt.getTime()}`),
    title: String(payload.title ?? payload.alert_type ?? 'WheelSense alert'),
    description: String(payload.description ?? payload.message ?? 'New server alert'),
    severity: String(payload.severity ?? 'info'),
    at: event.receivedAt.toLocaleTimeString(),
  };
}

function alertSeverity(value?: string): Severity {
  if (!value) {
    return 'info';
  }
  const normalized = value.toLowerCase();
  if (normalized.includes('critical') || normalized.includes('emergency') || normalized.includes('fall')) {
    return 'critical';
  }
  if (normalized.includes('warn')) {
    return 'warning';
  }
  return 'info';
}

function roomSummary(value: Record<string, unknown>) {
  const room = value.room_name ?? value.room ?? value.predicted_room ?? value.label;
  const confidence = value.confidence;
  if (typeof room === 'string' && typeof confidence === 'number') {
    return `${room} ${Math.round(confidence * 100)}%`;
  }
  return typeof room === 'string' ? room : 'Room prediction';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function decodeBase64(input: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of input.replace(/\s/g, '')) {
    if (char === '=') {
      break;
    }
    const value = alphabet.indexOf(char);
    if (value < 0) {
      continue;
    }
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(output.split('').map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return output;
  }
}

function severityStyle(severity: Severity) {
  return {
    normal: styles.severityNormal,
    warning: styles.severityWarning,
    critical: styles.severityCritical,
    info: styles.severityInfo,
  }[severity];
}

function severityTextStyle(severity: Severity) {
  return {
    normal: styles.severityTextNormal,
    warning: styles.severityTextWarning,
    critical: styles.severityTextCritical,
    info: styles.severityTextInfo,
  }[severity];
}

function severityDotStyle(severity: Severity) {
  return {
    normal: styles.dotNormal,
    warning: styles.dotWarning,
    critical: styles.dotCritical,
    info: styles.dotInfo,
  }[severity];
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F9FF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#DCE7F5',
  },
  logo: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  headerText: { flex: 1 },
  eyebrow: { color: '#64748B', fontSize: 12, fontWeight: '800' },
  title: { color: '#172033', fontSize: 22, fontWeight: '800' },
  content: { flex: 1 },
  contentInner: { padding: 14, paddingBottom: 48 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#DCE7F5',
  },
  tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#EFF6FF' },
  tabText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  tabTextActive: { color: '#2563EB' },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DCE7F5',
  },
  panelAccent: { borderColor: '#2563EB' },
  panelHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  panelHeaderText: { flex: 1 },
  panelTitle: { color: '#172033', fontSize: 16, fontWeight: '800' },
  panelSubtitle: { color: '#64748B', fontSize: 12, fontWeight: '600', lineHeight: 17 },
  body: { color: '#172033', fontSize: 14, lineHeight: 20 },
  muted: { color: '#64748B', fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  button: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  secondaryButton: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  disabledButton: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButtonText: { color: '#172033' },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  rowIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginRight: 10 },
  rowIconDot: { width: 10, height: 10, borderRadius: 5 },
  rowContent: { flex: 1 },
  rowTitle: { color: '#172033', fontSize: 14, fontWeight: '800' },
  rowMeta: { fontSize: 12, fontWeight: '800', marginLeft: 8 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  metric: { flexGrow: 1, flexBasis: '47%', minHeight: 82, borderRadius: 8, borderWidth: 1, padding: 12 },
  metricLabel: { color: '#64748B', fontSize: 12, fontWeight: '800' },
  metricValue: { color: '#172033', fontSize: 15, fontWeight: '800', marginTop: 6 },
  metricDetail: { color: '#64748B', fontSize: 12, lineHeight: 16, marginTop: 3 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCE7F5',
    padding: 12,
    marginBottom: 10,
  },
  deviceImage: { width: 74, height: 74, marginRight: 12 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDotOnline: { backgroundColor: '#15803D' },
  statusDotIdle: { backgroundColor: '#64748B' },
  statusOnlineText: { color: '#15803D', fontWeight: '700' },
  statusIdleText: { color: '#64748B', fontWeight: '700' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  badge: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    color: '#172033',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  alertRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#EDF2F7' },
  logLine: {
    color: '#172033',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    marginBottom: 5,
  },
  logLineError: { color: '#DC2626' },
  logLineSuccess: { color: '#15803D' },
  transportWarning: {
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: '#F6D394',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  transportWarningText: { color: '#92400E', fontSize: 13, lineHeight: 18 },
  portalFrame: {
    height: 560,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE7F5',
    backgroundColor: '#F8FAFC',
  },
  portalWebView: { flex: 1, backgroundColor: '#ffffff' },
  portalOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(248,250,252,0.88)',
  },
  portalError: { marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#FBBF24', backgroundColor: '#FFFBEB', padding: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, minHeight: 32 },
  statusPillOnline: { backgroundColor: '#E8F7EE', borderColor: '#B8E3C8' },
  statusPillIdle: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  statusPillText: { color: '#172033', fontSize: 12, fontWeight: '800' },
  field: { marginBottom: 12 },
  label: { color: '#172033', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  input: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCE7F5',
    backgroundColor: '#ffffff',
    color: '#172033',
    paddingHorizontal: 12,
    fontSize: 14,
  },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segmentItem: { flex: 1, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE7F5' },
  segmentItemActive: { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  segmentText: { color: '#64748B', fontWeight: '800' },
  segmentTextActive: { color: '#2563EB' },
  severityNormal: { backgroundColor: '#E8F7EE', borderColor: '#B8E3C8' },
  severityWarning: { backgroundColor: '#FFF7E6', borderColor: '#F6D394' },
  severityCritical: { backgroundColor: '#FFEBEE', borderColor: '#F8B4B4' },
  severityInfo: { backgroundColor: '#F2ECFF', borderColor: '#D6C7FF' },
  severityTextNormal: { color: '#15803D' },
  severityTextWarning: { color: '#D97706' },
  severityTextCritical: { color: '#DC2626' },
  severityTextInfo: { color: '#6D28D9' },
  dotNormal: { backgroundColor: '#15803D' },
  dotWarning: { backgroundColor: '#D97706' },
  dotCritical: { backgroundColor: '#DC2626' },
  dotInfo: { backgroundColor: '#6D28D9' },
});
