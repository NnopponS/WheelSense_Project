/**
 * WheelSense Mobile App - Navigation
 * MQTT-first: no HTTP auth, uses MQTT connection state
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';

// Screens
import { SetupScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { WebViewScreen } from '../screens/WebViewScreen';
import { DeviceScreen } from '../screens/DeviceScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WalkStepsScreen } from '../screens/WalkStepsScreen';
import { PolarHealthScreen } from '../screens/PolarHealthScreen';

// ==================== NAVIGATION TYPES ====================

export type RootStackParamList = {
  Setup: undefined;
  Home: undefined;
  WebView: { path?: string } | undefined;
  Devices: undefined;
  Settings: undefined;
  WalkSteps: undefined;
  PolarHealth: undefined;
};

// ==================== NAVIGATOR ====================

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  // Always ready - bypass login entirely as requested
  const isReady = true;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0D1F38',
          },
          headerTintColor: '#E0E0E0',
          headerTitleStyle: {
            fontWeight: '700',
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: '#0A1628',
          },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="WebView"
          component={WebViewScreen}
          options={{
            title: 'WheelSense Web',
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="Devices"
          component={DeviceScreen}
          options={{ title: 'Devices' }}
        />

        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />

        <Stack.Screen
          name="WalkSteps"
          component={WalkStepsScreen}
          options={{ title: 'Walk Steps' }}
        />

        <Stack.Screen
          name="PolarHealth"
          component={PolarHealthScreen}
          options={{ title: 'Polar Health' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
