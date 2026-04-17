/**
 * WheelSense Mobile App
 * Main entry point for the WheelSense mobile application
 */

import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { NotificationManager } from './src/services/NotificationService';
import { BLEScanner } from './src/services/BLEScanner';
import './src/i18n';
import { useAppStore } from './src/store/useAppStore';
import i18next from 'i18next';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Require cycle:',
  // Expo Go (SDK 53+): remote push not in the Go client (noise in the console)
  'Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

export default function App() {
  const language = useAppStore((state) => state.settings?.language || 'en');

  // Sync i18n language
  useEffect(() => {
    if (i18next.language !== language) {
      i18next.changeLanguage(language);
    }
  }, [language]);

  // Initialize app on mount
  useEffect(() => {
    initializeApp();

    const syncBg = () => {
      void import('./src/services/BackgroundRuntimeService').then(({ syncRegisteredBackgroundTaskWithSettings }) => {
        void syncRegisteredBackgroundTaskWithSettings();
      });
    };

    const unsubHydrate = useAppStore.persist.onFinishHydration(() => {
      syncBg();
    });
    if (useAppStore.persist.hasHydrated()) {
      syncBg();
    }

    return () => {
      unsubHydrate();
      // Cleanup on unmount
      cleanup();
    };
  }, []);

  useEffect(() => {
    let prev = !!useAppStore.getState().settings.backgroundMonitoringEnabled;
    const unsub = useAppStore.subscribe((state) => {
      const next = !!state.settings.backgroundMonitoringEnabled;
      if (next === prev) {
        return;
      }
      prev = next;
      void import('./src/services/BackgroundRuntimeService').then(({ syncRegisteredBackgroundTaskWithSettings }) => {
        void syncRegisteredBackgroundTaskWithSettings();
      });
    });
    return unsub;
  }, []);

  const initializeApp = async () => {
    try {
      console.log('[App] Initializing WheelSense Mobile...');
      
      // Initialize notifications
      await NotificationManager.initialize();
      
      console.log('[App] Initialization complete');
    } catch (error) {
      console.error('[App] Initialization failed:', error);
    }
  };

  const cleanup = () => {
    BLEScanner.cleanup();
    NotificationManager.cleanup();
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
