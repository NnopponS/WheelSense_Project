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
import { useTranslation } from 'react-i18next';

type SettingsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings, resetSettings } = useSettings();
  const { appMode, setAppMode } = useAppMode();
  
  const [mqttBroker, setMqttBroker] = useState(settings.mqttBroker);
  const [mqttPort, setMqttPort] = useState(settings.mqttPort.toString());
  const [scanInterval, setScanInterval] = useState(settings.scanInterval.toString());
  const [telemetryInterval, setTelemetryInterval] = useState(settings.telemetryInterval.toString());

  const saveSettings = () => {
    updateSettings({
      mqttBroker,
      mqttPort: parseInt(mqttPort, 10) || 1883,
      scanInterval: parseInt(scanInterval, 10) || 5000,
      telemetryInterval: parseInt(telemetryInterval, 10) || 1000,
    });
    
    
    Alert.alert(t('common.success'), t('settings.settingsSaved'));
  };

  const handleReset = () => {
    Alert.alert(
      t('settings.resetDefaults'),
      t('settings.resetConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.reset'),
          style: 'destructive',
          onPress: () => {
            resetSettings();
            setMqttBroker(settings.mqttBroker);
            setMqttPort(settings.mqttPort.toString());
            setScanInterval(settings.scanInterval.toString());
            setTelemetryInterval(settings.telemetryInterval.toString());
            Alert.alert(t('common.success'), t('settings.settingsReset'));
          },
        },
      ]
    );
  };

  const testMQTTConnection = async () => {
    try {
      const connected = mqttService.isConnectedToBroker();
      if (connected) {
        Alert.alert(t('common.success'), t('settings.mqttConnected'));
      } else {
        Alert.alert(t('home.disconnected'), t('settings.mqttNotConnected'));
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || 'Unable to check MQTT status');
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
      Alert.alert(t('common.success'), t('settings.notificationScheduled'));
    } catch (error: any) {
      Alert.alert(t('common.error'), error.message || 'Failed to schedule notification');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView style={styles.scrollView}>
        {/* MQTT Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.mqttConfig')}</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('settings.mqttBroker')}</Text>
            <TextInput
              style={styles.input}
              value={mqttBroker}
              onChangeText={setMqttBroker}
              placeholder="wheelsense.local"
              autoCapitalize="none"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('settings.mqttPort')}</Text>
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
            <Text style={styles.testButtonText}>{t('settings.testMQTT')}</Text>
          </TouchableOpacity>
        </View>

        {/* Scanning Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.scanConfig')}</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('settings.bleScanInterval')}</Text>
            <TextInput
              style={styles.input}
              value={scanInterval}
              onChangeText={setScanInterval}
              placeholder="5000"
              keyboardType="number-pad"
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('settings.telemetryInterval')}</Text>
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
          <Text style={styles.sectionTitle}>{t('settings.appMode')}</Text>
          
          <View style={styles.modeRow}>
            <View style={styles.modeInfo}>
              <Text style={styles.modeLabel}>
                {appMode === 'wheelchair' ? `🦽 ${t('settings.wheelchairMode')}` : `🚶 ${t('settings.walkingMode')}`}
              </Text>
              <Text style={styles.modeDescription}>
                {appMode === 'wheelchair'
                  ? t('settings.wheelchairDesc')
                  : t('settings.walkingDesc')}
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

        {/* Language Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
          <View style={styles.languageRow}>
            <TouchableOpacity 
              style={[styles.languageBtn, i18n.language === 'en' && styles.languageBtnActive]}
              onPress={() => i18n.changeLanguage('en')}
            >
              <Text style={[styles.languageBtnText, i18n.language === 'en' && styles.languageBtnTextActive]}>
                {t('settings.english')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.languageBtn, i18n.language === 'th' && styles.languageBtnActive]}
              onPress={() => i18n.changeLanguage('th')}
            >
              <Text style={[styles.languageBtnText, i18n.language === 'th' && styles.languageBtnTextActive]}>
                {t('settings.thai')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.notifications')}</Text>
          
          <TouchableOpacity
            style={styles.testButton}
            onPress={testNotifications}
          >
            <Text style={styles.testButtonText}>{t('settings.testNotification')}</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSettings}
          >
            <Text style={styles.saveButtonText}>{t('settings.saveSettings')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleReset}
          >
            <Text style={styles.resetButtonText}>{t('settings.resetDefaults')}</Text>
          </TouchableOpacity>
        </View>

        {/* Version Info */}
        <View style={styles.versionSection}>
          <Text style={styles.versionText}>{t('settings.version')} v1.0.0</Text>
          <Text style={styles.buildText}>{t('settings.build')} 2026.04.16</Text>
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
  languageRow: {
    flexDirection: 'row',
    gap: 8,
  },
  languageBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  languageBtnActive: {
    borderColor: '#0052cc',
    backgroundColor: '#eef4ff',
  },
  languageBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  languageBtnTextActive: {
    color: '#0052cc',
    fontWeight: '600',
  },
});

export default SettingsScreen;
