/**
 * WheelSense Mobile App - Zustand Store
 * Global state management for MQTT connection, devices, and app settings
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppMode,
  BLEBeacon,
  HeartRateData,
  PPGData,
  PolarDevice,
  AppSettings,
  WalkStepData,
  RoomPredictionResult,
} from '../types';

// ==================== STORE INTERFACES ====================

interface ConnectionState {
  deviceId: string;
  deviceName: string;
  isMQTTConnected: boolean;
  isDeviceRegistered: boolean;
}

interface DeviceState {
  // Polar device
  polarDevice: PolarDevice | null;
  isPolarConnected: boolean;
  isPolarScanning: boolean;
  lastHR?: HeartRateData;
  lastPPG?: PPGData;

  // BLE beacons
  detectedBeacons: BLEBeacon[];
  closestBeacon?: BLEBeacon;
  isScanningBeacons: boolean;

  // App mode
  appMode: AppMode;

  // Walk steps
  walkSteps: WalkStepData | null;

  // Room prediction (from server)
  roomPrediction: RoomPredictionResult | null;
}

interface UIState {
  isLoading: boolean;
  error: string | null;
  currentScreen: string;
}

// ==================== STORE ACTIONS ====================

interface ConnectionActions {
  setMQTTConnected: (connected: boolean) => void;
  setDeviceRegistered: (registered: boolean) => void;
  setDeviceInfo: (deviceId: string, deviceName: string) => void;
  disconnectAll: () => void;
}

interface DeviceActions {
  // Polar actions
  setPolarDevice: (device: PolarDevice | null) => void;
  setPolarConnection: (connected: boolean) => void;
  setPolarScanning: (scanning: boolean) => void;
  setLastHR: (hr: HeartRateData) => void;
  setLastPPG: (ppg: PPGData) => void;

  // Beacon actions
  addBeacon: (beacon: BLEBeacon) => void;
  updateBeacon: (nodeKey: string, updates: Partial<BLEBeacon>) => void;
  removeStaleBeacons: (maxAgeMs: number) => void;
  clearBeacons: () => void;
  setScanningBeacons: (scanning: boolean) => void;

  // App mode
  setAppMode: (mode: AppMode) => void;

  // Walk steps
  setWalkSteps: (steps: WalkStepData) => void;
  clearWalkSteps: () => void;

  // Room prediction
  setRoomPrediction: (prediction: RoomPredictionResult | null) => void;
}

interface UIActions {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentScreen: (screen: string) => void;
  clearError: () => void;
}

// ==================== DEFAULT SETTINGS ====================

const defaultSettings: AppSettings = {
  deviceName: '',
  mqttBroker: 'broker.emqx.io',
  mqttPort: 1883,
  scanInterval: 5000,
  telemetryInterval: 3000,
  language: 'en',
};

// ==================== STORE DEFINITION ====================

interface AppStore extends ConnectionState, DeviceState, UIState, ConnectionActions, DeviceActions, UIActions {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Connection state
      deviceId: '',
      deviceName: '',
      isMQTTConnected: false,
      isDeviceRegistered: false,

      // Device state
      polarDevice: null,
      isPolarConnected: false,
      isPolarScanning: false,
      detectedBeacons: [],
      closestBeacon: undefined,
      isScanningBeacons: false,
      appMode: 'walking',
      walkSteps: null,
      roomPrediction: null,

      // UI state
      isLoading: false,
      error: null,
      currentScreen: 'home',

      // Settings
      settings: defaultSettings,

      // Connection actions
      setMQTTConnected: (connected) =>
        set({ isMQTTConnected: connected, error: null }),

      setDeviceRegistered: (registered) =>
        set({ isDeviceRegistered: registered }),

      setDeviceInfo: (deviceId, deviceName) =>
        set({ deviceId, deviceName }),

      disconnectAll: () =>
        set({
          isMQTTConnected: false,
          isDeviceRegistered: false,
          detectedBeacons: [],
          closestBeacon: undefined,
          roomPrediction: null,
          walkSteps: null,
        }),

      // Polar actions
      setPolarDevice: (device) =>
        set({
          polarDevice: device,
          isPolarConnected: !!device,
        }),

      setPolarConnection: (connected) =>
        set({ isPolarConnected: connected }),

      setPolarScanning: (scanning) =>
        set({ isPolarScanning: scanning }),

      setLastHR: (hr) =>
        set({ lastHR: hr }),

      setLastPPG: (ppg) =>
        set({ lastPPG: ppg }),

      // Beacon actions
      addBeacon: (beacon) =>
        set((state) => {
          const existingIndex = state.detectedBeacons.findIndex(
            (b) => b.nodeKey === beacon.nodeKey
          );

          let newBeacons: BLEBeacon[];
          if (existingIndex >= 0) {
            newBeacons = [...state.detectedBeacons];
            newBeacons[existingIndex] = beacon;
          } else {
            newBeacons = [...state.detectedBeacons, beacon];
          }

          const closest = newBeacons.reduce((prev, current) =>
            current.rssi > prev.rssi ? current : prev
          );

          return {
            detectedBeacons: newBeacons,
            closestBeacon: closest,
          };
        }),

      updateBeacon: (nodeKey, updates) =>
        set((state) => ({
          detectedBeacons: state.detectedBeacons.map((b) =>
            b.nodeKey === nodeKey ? { ...b, ...updates } : b
          ),
        })),

      removeStaleBeacons: (maxAgeMs) =>
        set((state) => {
          const now = Date.now();
          const filtered = state.detectedBeacons.filter(
            (b) => now - b.lastSeen < maxAgeMs
          );

          const closest = filtered.length > 0
            ? filtered.reduce((prev, current) =>
                current.rssi > prev.rssi ? current : prev
              )
            : undefined;

          return {
            detectedBeacons: filtered,
            closestBeacon: closest,
          };
        }),

      clearBeacons: () =>
        set({
          detectedBeacons: [],
          closestBeacon: undefined,
        }),

      setScanningBeacons: (scanning) =>
        set({ isScanningBeacons: scanning }),

      // App mode
      setAppMode: (mode) =>
        set({ appMode: mode }),

      // Walk steps
      setWalkSteps: (steps) =>
        set({ walkSteps: steps }),

      clearWalkSteps: () =>
        set({ walkSteps: null }),

      // Room prediction
      setRoomPrediction: (prediction) =>
        set({ roomPrediction: prediction }),

      // UI actions
      setLoading: (loading) =>
        set({ isLoading: loading }),

      setError: (error) =>
        set({ error }),

      setCurrentScreen: (screen) =>
        set({ currentScreen: screen }),

      clearError: () =>
        set({ error: null }),

      // Settings actions
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      resetSettings: () =>
        set({ settings: defaultSettings }),
    }),
    {
      name: 'wheelsense-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        isDeviceRegistered: state.isDeviceRegistered,
        settings: state.settings,
        appMode: state.appMode,
      }),
    }
  )
);

// ==================== SELECTORS ====================

export const useConnection = () => {
  const store = useAppStore();
  return {
    deviceId: store.deviceId,
    deviceName: store.deviceName,
    isMQTTConnected: store.isMQTTConnected,
    isDeviceRegistered: store.isDeviceRegistered,
    setMQTTConnected: store.setMQTTConnected,
    setDeviceRegistered: store.setDeviceRegistered,
    setDeviceInfo: store.setDeviceInfo,
    disconnectAll: store.disconnectAll,
  };
};

export const usePolarStore = () => {
  const store = useAppStore();
  return {
    polarDevice: store.polarDevice,
    isPolarConnected: store.isPolarConnected,
    isPolarScanning: store.isPolarScanning,
    lastHR: store.lastHR,
    lastPPG: store.lastPPG,
    setPolarDevice: store.setPolarDevice,
    setPolarConnection: store.setPolarConnection,
    setPolarScanning: store.setPolarScanning,
    setLastHR: store.setLastHR,
    setLastPPG: store.setLastPPG,
  };
};

export const useBeacons = () => {
  const store = useAppStore();
  return {
    detectedBeacons: store.detectedBeacons,
    closestBeacon: store.closestBeacon,
    isScanningBeacons: store.isScanningBeacons,
    addBeacon: store.addBeacon,
    updateBeacon: store.updateBeacon,
    removeStaleBeacons: store.removeStaleBeacons,
    clearBeacons: store.clearBeacons,
    setScanningBeacons: store.setScanningBeacons,
  };
};

export const useAppMode = () => {
  const store = useAppStore();
  return {
    appMode: store.appMode,
    setAppMode: store.setAppMode,
  };
};

export const useWalkSteps = () => {
  const store = useAppStore();
  return {
    walkSteps: store.walkSteps,
    setWalkSteps: store.setWalkSteps,
    clearWalkSteps: store.clearWalkSteps,
  };
};

export const useRoomPrediction = () => {
  const store = useAppStore();
  return {
    roomPrediction: store.roomPrediction,
    setRoomPrediction: store.setRoomPrediction,
  };
};

export const useSettings = () => {
  const store = useAppStore();
  return {
    settings: store.settings,
    updateSettings: store.updateSettings,
    resetSettings: store.resetSettings,
  };
};
