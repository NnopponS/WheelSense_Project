/**
 * WheelSense Mobile App
 * Main entry point for the WheelSense mobile application
 */

import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useAppStore } from './src/store/useAppStore';
import { API } from './src/services/APIService';
import { NotificationManager } from './src/services/NotificationService';
import { BLEScanner } from './src/services/BLEScanner';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Require cycle:',
]);

export default function App() {
  // Initialize app on mount
  useEffect(() => {
    initializeApp();
    
    return () => {
      // Cleanup on unmount
      cleanup();
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('[App] Initializing WheelSense Mobile...');
      
      // Load persisted auth state
      const store = useAppStore.getState();
      
      // Set API base URL from settings
      API.setBaseUrl(store.settings.serverUrl);
      
      // If we have a token, try to refresh the session
      if (store.authToken) {
        try {
          await API.refreshSession();
          console.log('[App] Session refreshed successfully');
        } catch (error) {
          console.error('[App] Session refresh failed:', error);
          // Clear invalid auth state
          store.clearAuth();
        }
      }
      
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
