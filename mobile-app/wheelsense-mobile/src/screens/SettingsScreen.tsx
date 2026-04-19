/**
 * WheelSense Mobile App - Settings Screen
 * App configuration and preferences
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useSettings, useAppMode } from '../store/useAppStore';
import { mqttService } from '../services/MQTTService';
import { BLEScanner } from '../services/BLEScanner';
import { NotificationManager } from '../services/NotificationService';

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { appMode, setAppMode } = useAppMode();
  
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [mqttBroker, setMqttBroker] = useState(settings.mqttBroker);
  const [mqttPort, setMqttPort] = useState(settings.mqttPort.toString());
  const [scanInterval, setScanInterval] = useState(settings.scanInterval.toString());
  const [telemetryInterval, setTelemetryInterval] = useState(settings.telemetryInterval.toString());

  const saveSettings = () => {
    updateSettings({
      serverUrl,
      mqttBroker,
      mqttPort: parseInt(mqttPort, 10) || 1883,
      scanInterval: parseInt(scanInterval, 10) || 5000,
      telemetryInterval: parseInt(telemetryInterval, 10) || 1000,
    });
    
    Alert.alert('Success', 'Settings saved successfully');
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Settings',
      'Are you sure you want to reset all settings to defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetSettings();
            setServerUrl(settings.serverUrl);
            setMqttBroker(settings.mqttBroker);
            setMqttPort(settings.mqttPort.toString());
            setScanInterval(settings.scanInterval.toString());
            setTelemetryInterval(settings.telemetryInterval.toString());
            Alert.alert('Success', 'Settings reset to defaults');
          },
        },
      ]
    );
  };

  const testMQTTConnection = async () => {
    try {
      await mqttService.connect({
        host: mqttBroker,
        port: parseInt(mqttPort, 10) || 1883,
        clientId: `test_${Date.now()}`,
      });
      Alert.alert('Success', 'MQTT connection successful');
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Failed to connect to MQTT broker');
    }
  };

  const testNotifications = async () => {
    try {
      await NotificationManager.scheduleLocalNotification(
        'Test Notification',
        'This is a test notification from WheelSense Mobile',
        { type: 'test' },
        2
      );
      Alert.alert('Success', 'Test notification scheduled (will appear in 2 seconds)');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to schedule notification');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView style={styles.scrollView}>
        {/* Server Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Server Configuration</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://wheelsense.local"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>
        </View>

        {/* MQTT Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MQTT Configuration</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>MQTT Broker</Text>
            <TextInput
              style={styles.input}
              value={mqttBroker}
              onChangeText={setMqttBroker}
              placeholder="wheelsense.local"
              autoCapitalize="none"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>MQTT Port</Text>
            <TextInput
              style={styles.input}
              value={mqttPort}
              onChangeText={setMqttPort}
              placeholder="1883"
              keyboardType="number-pad"
            />
          </View>
          
          <TouchableOpacity
            style={styles.testButton}
            onPress={testMQTTConnection}
          >
            <Text style={styles.testButtonText}>Test MQTT Connection</Text>
          </TouchableOpacity>
        </View>

        {/* Scanning Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scanning Configuration</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>BLE Scan Interval (ms)</Text>
            <TextInput
              style={styles.input}
              value={scanInterval}
              onChangeText={setScanInterval}
              placeholder="5000"
              keyboardType="number-pad"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Telemetry Interval (ms)</Text>
            <TextInput
              style={styles.input}
              value={telemetryInterval}
              onChangeText={setTelemetryInterval}
              placeholder="1000"
              keyboardType="number-pad"
            />
          </View>
        </View>

        {/* App Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Mode</Text>
          
          <View style={styles.modeRow}>
            <View style={styles.modeInfo}>
              <Text style={styles.modeLabel}>
                {appMode === 'wheelchair' ? '🦽 Wheelchair Mode' : '🚶 Walking Mode'}
              </Text>
              <Text style={styles.modeDescription}>
                {appMode === 'wheelchair'
                  ? 'For wheelchair users with M5StickC gateway'
                  : 'For independent walking with mobile sensors'}
              </Text>
            </View>
            <Switch
              value={appMode === 'walking'}
              onValueChange={(value) => setAppMode(value ? 'walking' : 'wheelchair')}
              trackColor={{ false: '#767577', true: '#0052cc' }}
              thumbColor="#f4f3f4"
            />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          
          <TouchableOpacity
            style={styles.testButton}
            onPress={testNotifications}
          >
            <Text style={styles.testButtonText}>Test Push Notification</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSettings}
          >
            <Text style={styles.saveButtonText}>Save Settings</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
          >
            <Text style={styles.resetButtonText}>Reset to Defaults</Text>
          </TouchableOpacity>
        </View>

        {/* Version Info */}
        <View style={styles.versionSection}>
          <Text style={styles.versionText}>WheelSense Mobile v1.0.0</Text>
          <Text style={styles.buildText}>Build 2026.04.16</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  testButton: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#0052cc',
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeInfo: {
    flex: 1,
    marginRight: 16,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modeDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#0052cc',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  resetButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
  },
  versionSection: {
    alignItems: 'center',
    padding: 24,
  },
  versionText: {
    fontSize: 14,
    color: '#666',
  },
  buildText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});

export default SettingsScreen;
