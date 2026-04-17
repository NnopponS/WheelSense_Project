/**
 * WheelSense Mobile App — MQTT setup (first screen)
 * File: SetupScreen.tsx — NOT web-style login; configures broker + device id for MQTT.
 * MQTT-first: connect broker, register mobile device, start telemetry loop.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import { useSettings, useConnection } from '../store/useAppStore';
import { mqttService } from '../services/MQTTService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTranslation } from 'react-i18next';
import { Logo } from '../components/Logo';
import { colors, radius, space } from '../theme/tokens';

type SetupScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Setup'>;
};

export const SetupScreen: React.FC<SetupScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const [deviceName, setDeviceName] = useState('');
  const [brokerHost, setBrokerHost] = useState('');
  const [brokerPort, setBrokerPort] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const { settings, updateSettings } = useSettings();
  const { setDeviceInfo, setMQTTConnected, setDeviceRegistered } = useConnection();

  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Auto-fill from stored settings
    setDeviceName(settings.deviceName || Device.deviceName || '');
    setBrokerHost(settings.mqttBroker);
    setBrokerPort(settings.mqttPort.toString());

    // Pulse animation for the connect button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleConnect = async () => {
    if (!deviceName.trim()) {
      Alert.alert(t('common.required'), t('setup.requiredDeviceName'));
      return;
    }
    if (!brokerHost.trim()) {
      Alert.alert(t('common.required'), t('setup.requiredBroker'));
      return;
    }

    setIsConnecting(true);
    setStatusMessage(t('setup.statusConnecting'));

    try {
      if (!mqttService.isNativeModuleAvailable()) {
        throw new Error('MQTT native module is unavailable. Use an Android development or production build.');
      }

      // Save settings
      const port = parseInt(brokerPort, 10) || 1883;
      updateSettings({
        deviceName: deviceName.trim(),
        mqttBroker: brokerHost.trim(),
        mqttPort: port,
      });

      // Generate device ID
      const deviceId = `MOBILE_${deviceName.trim().replace(/\s+/g, '_').toUpperCase()}`;
      setDeviceInfo(deviceId, deviceName.trim());

      // Connect to MQTT
      await mqttService.connect({
        host: brokerHost.trim(),
        port,
        clientId: `ws_${deviceId}_${Date.now()}`,
      });

      setStatusMessage(t('setup.statusRegistering'));

      // Publish registration
      await mqttService.publishRegistration();

      setStatusMessage(t('setup.statusConnected'));
      setMQTTConnected(true);
      setDeviceRegistered(true);

      // Start telemetry loop
      mqttService.startTelemetryLoop();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });

    } catch (error: any) {
      console.error('[Setup] Connection failed:', error);
      setStatusMessage('');
      Alert.alert(
        t('setup.connectionFailed'),
        `${t('setup.connectionFailedDetail', { host: brokerHost, port: brokerPort })}\n\n${error.message || t('setup.checkBroker')}`
      );
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header with gradient effect */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Logo size={60} color={colors.text} />
            </View>
            <Text style={styles.title}>WheelSense</Text>
            <View style={styles.divider} />
            <Text style={styles.description}>
              {t('setup.description')}
            </Text>
          </View>

          {/* Setup Form */}
          <View style={styles.form}>
            {/* Device Name */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.labelIcon}>📱</Text>
                <Text style={styles.label}>{t('setup.deviceName')}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={deviceName}
                onChangeText={setDeviceName}
                placeholder={t('setup.deviceNamePlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isConnecting}
              />
            </View>

            {/* MQTT Broker */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.labelIcon}>📡</Text>
                <Text style={styles.label}>{t('setup.mqttBroker')}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={brokerHost}
                onChangeText={setBrokerHost}
                placeholder={t('setup.mqttBrokerPlaceholder')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!isConnecting}
              />
            </View>

            {/* Port */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.labelIcon}>🔌</Text>
                <Text style={styles.label}>{t('setup.port')}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.portInput]}
                value={brokerPort}
                onChangeText={setBrokerPort}
                placeholder={t('setup.portPlaceholder')}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                editable={!isConnecting}
              />
            </View>

            {/* Status message */}
            {statusMessage !== '' && (
              <View style={styles.statusContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.statusText}>{statusMessage}</Text>
              </View>
            )}

            {/* Connect Button */}
            <Animated.View style={[styles.connectButtonWrapper, { transform: [{ scale: isConnecting ? 1 : pulseAnim }] }]}>
              <TouchableOpacity
                style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
                onPress={handleConnect}
                disabled={isConnecting}
                activeOpacity={0.8}
              >
                {isConnecting ? (
                  <ActivityIndicator color={colors.surface} size="small" />
                ) : (
                  <>
                    <Text style={styles.connectIcon}>⚡</Text>
                    <Text style={styles.connectText}>{t('setup.connect')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              WheelSense Mobile v1.0.0 • MQTT-First
            </Text>
            <Text style={styles.footerHint}>
              {t('setup.footerHint')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.md,
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  logoIcon: {
    fontSize: 44,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: colors.primary,
    marginTop: 4,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  divider: {
    width: 48,
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginVertical: space.md,
  },
  description: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  portInput: {
    width: 120,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    padding: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
  },
  statusText: {
    color: colors.primary,
    fontSize: 14,
    marginLeft: 10,
    fontWeight: '500',
  },
  connectButtonWrapper: {
    marginTop: space.sm,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: space.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  connectButtonDisabled: {
    backgroundColor: colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  connectIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  connectText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  footerHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
});

export default SetupScreen;
