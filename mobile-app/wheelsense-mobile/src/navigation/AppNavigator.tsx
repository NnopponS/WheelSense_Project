/**
 * WheelSense Mobile App - Navigation
 * React Navigation setup with role-based routing
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppStore } from '../store/useAppStore';

// Screens
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { WebViewScreen } from '../screens/WebViewScreen';
import { DeviceScreen } from '../screens/DeviceScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AlertDetailScreen } from '../screens/AlertDetailScreen';

// ==================== NAVIGATION TYPES ====================

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  WebView: { path?: string };
  Devices: undefined;
  Settings: undefined;
  AlertDetail: { alertId: number };
};

// ==================== NAVIGATOR ====================

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, user } = useAppStore();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0052cc',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {!isAuthenticated ? (
          // Auth Stack
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          // Main Stack
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{
                title: 'WheelSense',
                headerBackVisible: false,
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
              options={{
                title: 'Devices',
              }}
            />
            
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                title: 'Settings',
              }}
            />
            
            <Stack.Screen
              name="AlertDetail"
              component={AlertDetailScreen}
              options={{
                title: 'Alert Details',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
