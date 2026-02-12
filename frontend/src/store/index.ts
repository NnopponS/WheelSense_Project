'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Wheelchair,
  Patient,
  Device,
  Room,
  Building,
  Floor,
  Appliance,
  Routine,
  TimelineEvent,
  Notification,
  Role,
  Theme,
  LocationEstimate,
  NearbyNode,
} from '@/types';

interface WheelSenseState {
  // Theme & UI
  theme: Theme;
  role: Role;
  language: 'en' | 'th';
  sidebarOpen: boolean;
  currentPage: string;

  // Location Selection
  selectedBuilding: string | null;
  selectedFloor: string | null;

  // Core Data
  wheelchairs: Wheelchair[];
  patients: Patient[];
  devices: Device[];
  rooms: Room[];
  buildings: Building[];
  floors: Floor[];
  appliances: Record<string, Appliance[]>; // roomId -> appliances
  routines: Routine[];
  timeline: TimelineEvent[];
  notifications: Notification[];

  // RSSI Localization State
  currentLocation: LocationEstimate | null;
  nearbyNodes: NearbyNode[];
  detectionState: Record<string, { detected: boolean; confidence: number; timestamp: string }>;

  // User Info (for user mode)
  currentUser: Patient | null;

  // Actions
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setRole: (role: Role) => void;
  setLanguage: (lang: 'en' | 'th') => void;
  setSidebarOpen: (open: boolean) => void;

  // Drawer State
  drawerOpen: boolean;
  drawerContent: { type: 'room' | 'wheelchair' | 'patient' | 'patient-edit' | 'wheelchair-edit'; data: any } | null;
  openDrawer: (content: { type: 'room' | 'wheelchair' | 'patient' | 'patient-edit' | 'wheelchair-edit'; data: any }) => void;
  closeDrawer: () => void;

  setCurrentPage: (page: string) => void;
  setSelectedBuilding: (id: string | null) => void;
  setSelectedFloor: (id: string | null) => void;

  // Data setters
  setWheelchairs: (data: Wheelchair[]) => void;
  setPatients: (data: Patient[]) => void;
  setDevices: (data: Device[]) => void;
  setRooms: (data: Room[]) => void;
  setBuildings: (data: Building[]) => void;
  setFloors: (data: Floor[]) => void;
  setAppliances: (data: Record<string, Appliance[]>) => void;
  setRoutines: (data: Routine[]) => void;
  setTimeline: (data: TimelineEvent[]) => void;
  setCurrentUser: (user: Patient | null) => void;

  // RSSI updates
  updateLocation: (location: LocationEstimate) => void;
  updateNearbyNodes: (nodes: NearbyNode[]) => void;
  setDetectionState: (roomId: string, detected: boolean, confidence: number) => void;

  // Wheelchair updates
  updateWheelchairRoom: (wheelchairId: string, roomId: string) => void;
  updateWheelchairStatus: (wheelchairId: string, status: Wheelchair['status']) => void;

  // Device updates
  updateDeviceStatus: (deviceId: string, online: boolean) => void;
  updateDeviceRSSI: (deviceId: string, rssi: number) => void;

  // Appliance control
  toggleAppliance: (roomId: string, applianceId: string) => void;
  setApplianceValue: (roomId: string, applianceId: string, value: number) => void;

  // Notifications
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Timeline
  addTimelineEvent: (event: Omit<TimelineEvent, 'id' | 'timestamp'>) => void;
}

export const useWheelSenseStore = create<WheelSenseState>()(
  persist(
    (set, get) => ({
      // Initial state
      theme: 'dark',
      role: 'admin',
      language: 'en',
      sidebarOpen: false,
      currentPage: 'monitoring',
      selectedBuilding: null,
      selectedFloor: null,

      // Data - Empty arrays, will be populated from API
      wheelchairs: [],
      patients: [],
      devices: [],
      rooms: [],
      buildings: [],
      floors: [],
      appliances: {},
      routines: [],
      timeline: [],
      notifications: [],

      // RSSI State
      currentLocation: null,
      nearbyNodes: [],
      detectionState: {},

      currentUser: null,

      // UI Actions
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      setRole: (role) => set({ role }),
      setLanguage: (language) => set({ language }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      // Drawer Actions
      drawerOpen: false,
      drawerContent: null,
      openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),
      closeDrawer: () => set({ drawerOpen: false, drawerContent: null }),

      setCurrentPage: (currentPage) => set({ currentPage }),
      setSelectedBuilding: (selectedBuilding) => set({ selectedBuilding }),
      setSelectedFloor: (selectedFloor) => set({ selectedFloor }),

      // Data setters
      setWheelchairs: (wheelchairs) => set({ wheelchairs }),
      setPatients: (patients) => set({ patients }),
      setDevices: (devices) => set({ devices }),
      setRooms: (rooms) => set({ rooms }),
      setBuildings: (buildings) => set({ buildings }),
      setFloors: (floors) => set({ floors }),
      setAppliances: (appliances) => set({ appliances }),
      setRoutines: (routines) => set({ routines }),
      setTimeline: (timeline) => set({ timeline }),
      setCurrentUser: (currentUser) => set({ currentUser }),

      // RSSI Actions
      updateLocation: (location) => set({ currentLocation: location }),
      updateNearbyNodes: (nodes) => set({ nearbyNodes: nodes }),
      setDetectionState: (roomId, detected, confidence) =>
        set((state) => ({
          detectionState: {
            ...state.detectionState,
            [roomId]: { detected, confidence, timestamp: new Date().toISOString() },
          },
        })),

      // Wheelchair Actions
      updateWheelchairRoom: (wheelchairId, roomId) =>
        set((state) => ({
          wheelchairs: state.wheelchairs.map((w) =>
            w.id === wheelchairId ? { ...w, currentRoom: roomId, lastSeen: new Date().toISOString() } : w
          ),
        })),
      updateWheelchairStatus: (wheelchairId, status) =>
        set((state) => ({
          wheelchairs: state.wheelchairs.map((w) =>
            w.id === wheelchairId ? { ...w, status } : w
          ),
        })),

      // Device Actions
      updateDeviceStatus: (deviceId, online) =>
        set((state) => ({
          devices: state.devices.map((d) =>
            d.id === deviceId ? { ...d, status: online ? 'online' : 'offline', lastSeen: new Date().toISOString() } : d
          ),
        })),
      updateDeviceRSSI: (deviceId, rssi) =>
        set((state) => ({
          devices: state.devices.map((d) =>
            d.id === deviceId ? { ...d, rssi } : d
          ),
        })),

      // Appliance Actions
      toggleAppliance: (roomId, applianceId) =>
        set((state) => ({
          appliances: {
            ...state.appliances,
            [roomId]: (state.appliances[roomId] || []).map((a) =>
              a.id === applianceId ? { ...a, state: !a.state } : a
            ),
          },
        })),
      setApplianceValue: (roomId, applianceId, value) =>
        set((state) => ({
          appliances: {
            ...state.appliances,
            [roomId]: (state.appliances[roomId] || []).map((a) =>
              a.id === applianceId ? { ...a, value } : a
            ),
          },
        })),

      // Notification Actions
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif-${Date.now()}`,
              timestamp: new Date().toISOString(),
              read: false,
            },
            ...state.notifications,
          ].slice(0, 50),
        })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      // Timeline Actions
      addTimelineEvent: (event) =>
        set((state) => ({
          timeline: [
            {
              ...event,
              id: `event-${Date.now()}`,
              timestamp: new Date().toISOString(),
            },
            ...state.timeline,
          ].slice(0, 100),
        })),
    }),
    {
      name: 'wheelsense-storage',
      partialize: (state) => ({
        theme: state.theme,
        role: state.role,
        language: state.language,
        selectedBuilding: state.selectedBuilding,
        selectedFloor: state.selectedFloor,
      }),
    }
  )
);
