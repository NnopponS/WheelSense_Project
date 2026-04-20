/**
 * WheelSense Mobile App - Zustand Store
 * Global state management for auth, devices, and app settings
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  UserRole,
  Patient,
  AppMode,
  BLEBeacon,
  HeartRateData,
  PPGData,
  PolarDevice,
  AppSettings,
} from '../types';

// ==================== STORE INTERFACES ====================

interface AuthState {
  authToken: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
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
}

interface UIState {
  isLoading: boolean;
  error: string | null;
  currentScreen: string;
  notificationsEnabled: boolean;
  pendingDeepLink: string | null;
}

// ==================== STORE ACTIONS ====================

interface AuthActions {
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<User>) => void;
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
}

interface UIActions {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentScreen: (screen: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  clearError: () => void;
}

// ==================== DEFAULT SETTINGS ====================

const defaultSettings: AppSettings = {
  serverUrl: 'https://wheelsense.local',
  mqttBroker: 'wheelsense.local',
  mqttPort: 1883,
  scanInterval: 5000,      // 5 seconds
  telemetryInterval: 1000, // 1 second
};

// ==================== STORE DEFINITION ====================

interface AppStore extends AuthState, DeviceState, UIState, AuthActions, DeviceActions, UIActions {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Auth state
      authToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      // Device state
      polarDevice: null,
      isPolarConnected: false,
      isPolarScanning: false,
      detectedBeacons: [],
      closestBeacon: undefined,
      isScanningBeacons: false,
      appMode: 'walking',

      // UI state
      isLoading: false,
      error: null,
      currentScreen: 'home',
      notificationsEnabled: false,
      pendingDeepLink: null,

      // Settings
      settings: defaultSettings,

      // Auth actions
      setAuth: (token, user) =>
        set({
          authToken: token,
          user,
          isAuthenticated: true,
          error: null,
        }),

      clearAuth: () =>
        set({
          authToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),

      updateUser: (userUpdates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...userUpdates } : null,
        })),

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
            // Update existing beacon
            newBeacons = [...state.detectedBeacons];
            newBeacons[existingIndex] = beacon;
          } else {
            // Add new beacon
            newBeacons = [...state.detectedBeacons, beacon];
          }
          
          // Find closest beacon (highest RSSI = closest)
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
          
          // Recalculate closest beacon
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

      // UI actions
      setLoading: (loading) =>
        set({ isLoading: loading }),

      setError: (error) =>
        set({ error }),

      setCurrentScreen: (screen) =>
        set({ currentScreen: screen }),

      setNotificationsEnabled: (enabled) =>
        set({ notificationsEnabled: enabled }),

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
        authToken: state.authToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        settings: state.settings,
        appMode: state.appMode,
        notificationsEnabled: state.notificationsEnabled,
      }),
    }
  )
);

// ==================== SELECTORS ====================

export const useAuth = () => {
  const store = useAppStore();
  return {
    authToken: store.authToken,
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    setAuth: store.setAuth,
    clearAuth: store.clearAuth,
    updateUser: store.updateUser,
  };
};

export const usePolar = () => {
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

export const useSettings = () => {
  const store = useAppStore();
  return {
    settings: store.settings,
    updateSettings: store.updateSettings,
    resetSettings: store.resetSettings,
  };
};
