/**
 * WheelSense Mobile App - Home Dashboard
 * MQTT-first: BLE Scanner, Walk Steps, Polar Health
 * No HTTP login or server REST calls required
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
  Easing,
  Switch,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import {
  useAppStore,
  useConnection,
  usePolarStore,
  useBeacons,
  useAppMode,
  useWalkSteps,
  useRoomPrediction,
} from '../store/useAppStore';
import { BLEScanner } from '../services/BLEScanner';
import { mqttService } from '../services/MQTTService';
import { setBackgroundMonitoringEnabled } from '../services/BackgroundRuntimeService';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '../theme/tokens';
import { useSettings } from '../store/useAppStore';
import * as Device from 'expo-device';
import { Logo } from '../components/Logo';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { deviceName, isMQTTConnected, isDeviceRegistered, disconnectAll, setDeviceInfo, setMQTTConnected, setDeviceRegistered } = useConnection();
  const { settings, updateSettings } = useSettings();
  const polar = usePolarStore();
  const beaconStore = useBeacons();
  const { appMode, setAppMode } = useAppMode();
  const { walkSteps } = useWalkSteps();
  const { roomPrediction } = useRoomPrediction();

  const [refreshing, setRefreshing] = useState(false);
  /** User explicitly stopped BLE from the home card — do not auto-resume on app foreground. */
  const userStoppedBleRef = useRef(false);

  // Animations
  const mqttPulse = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance fade-in
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    // Start continuous BLE scan
    BLEScanner.startContinuousScanning().catch((err) => {
      console.error('[Home] BLE scan failed:', err);
    });

    // Auto-connect to MQTT for testing (Bypassing Setup)
    if (!isMQTTConnected) {
      handleAutoConnect();
    }

    return () => {
      BLEScanner.stopScanning();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !userStoppedBleRef.current) {
        BLEScanner.startContinuousScanning().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const handleAutoConnect = async () => {
    try {
      if (!mqttService.isNativeModuleAvailable()) {
        console.log('[Home] MQTT native module unavailable — skipping auto-connect (Expo Go / web).');
        return;
      }

      console.log('[Home] Initiating auto-connect...');
      
      // Ensure device name and info
      const name = deviceName || settings.deviceName || Device.deviceName || 'TestDevice';
      const deviceId = `MOBILE_${name.replace(/\s+/g, '_').toUpperCase()}`;
      
      if (!deviceName) {
        setDeviceInfo(deviceId, name);
        updateSettings({ deviceName: name });
      }

      // Connect to MQTT
      await mqttService.connect({
        host: settings.mqttBroker,
        port: settings.mqttPort,
        clientId: `ws_${deviceId}_${Date.now()}`,
      });

      // Publish registration
      await mqttService.publishRegistration();
      
      // Start telemetry
      mqttService.startTelemetryLoop();
      
      console.log('[Home] Auto-connect successful');
    } catch (error) {
      console.error('[Home] Auto-connect failed:', error);
    }
  };

  // MQTT pulse indicator
  useEffect(() => {
    if (isMQTTConnected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(mqttPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
          Animated.timing(mqttPulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      mqttPulse.setValue(0);
    }
  }, [isMQTTConnected]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    beaconStore.clearBeacons();
    try {
      await BLEScanner.startScanning();
    } catch (err) {
      console.error('[Home] Refresh scan failed:', err);
    }
    setRefreshing(false);
  }, []);

  const handleDisconnect = () => {
    Alert.alert(
      t('home.disconnect'),
      t('home.disconnectConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('home.disconnect'),
          style: 'destructive',
          onPress: () => {
            BLEScanner.stopScanning();
            mqttService.stopTelemetryLoop();
            mqttService.disconnect();
            disconnectAll();
          },
        },
      ]
    );
  };

  const toggleAppMode = () => {
    const newMode = appMode === 'wheelchair' ? 'walking' : 'wheelchair';
    setAppMode(newMode);
  };

  const applyBackgroundMonitoring = (enabled: boolean) => {
    setBackgroundMonitoringEnabled(enabled);
  };

  const onToggleBackgroundMonitoring = (value: boolean) => {
    if (value) {
      Alert.alert(t('home.backgroundMonitoringTitle'), t('home.backgroundMonitoringExplain'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: () => {
            void applyBackgroundMonitoring(true);
          },
        },
      ]);
    } else {
      void applyBackgroundMonitoring(false);
    }
  };

  const mqttDotOpacity = mqttPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* ===== HEADER ===== */}
      <Animated.View style={[styles.header, { opacity: fadeIn }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Logo size={24} color="#E0E0E0" />
            <Text style={styles.headerTitle}>WheelSense</Text>
          </View>
          <View style={styles.headerStatusRow}>
            <Animated.View
              style={[
                styles.mqttDot,
                isMQTTConnected ? styles.mqttDotOn : styles.mqttDotOff,
                isMQTTConnected && { opacity: mqttDotOpacity },
              ]}
            />
            <Text style={styles.headerSubtitle}>
              {isMQTTConnected 
                ? `${t('home.connected')} — ${deviceName}` 
                : t('home.disconnected')}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>⏏</Text>
        </TouchableOpacity>
      </Animated.View>

      <View style={styles.backgroundRow}>
        <View style={styles.backgroundRowText}>
          <Text style={styles.backgroundRowTitle}>{t('home.backgroundMonitoring')}</Text>
          <Text style={styles.backgroundRowHint}>{t('home.backgroundMonitoringHint')}</Text>
        </View>
        <Switch
          value={!!settings.backgroundMonitoringEnabled}
          onValueChange={onToggleBackgroundMonitoring}
          trackColor={{ false: '#333', true: '#2E7D6A' }}
          thumbColor={settings.backgroundMonitoringEnabled ? '#B2DFDB' : '#888'}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4FC3F7" />}
      >
        {/* ===== ROOM PREDICTION BANNER ===== */}
        {roomPrediction && roomPrediction.room_name !== '' && (
          <View style={styles.roomBanner}>
            <Text style={styles.roomLabel}>📍 {t('home.currentLocation')}</Text>
            <Text style={styles.roomName}>{roomPrediction.room_name}</Text>
            <Text style={styles.roomConfidence}>
              {(roomPrediction.confidence * 100).toFixed(0)}% {t('home.confidence')} • {roomPrediction.model_type}
            </Text>
          </View>
        )}

        {/* ===== MODE TOGGLE ===== */}
        <TouchableOpacity style={styles.modeToggle} onPress={toggleAppMode} activeOpacity={0.7}>
          <View style={styles.modeLeft}>
            <Text style={styles.modeIcon}>{appMode === 'wheelchair' ? '🦽' : '🚶'}</Text>
            <View>
              <Text style={styles.modeLabel}>{t('home.mode')}</Text>
              <Text style={styles.modeValue}>
                {appMode === 'wheelchair' ? t('home.wheelchair') : t('home.walking')}
              </Text>
            </View>
          </View>
          <Text style={styles.modeSwitchHint}>{t('home.tapToSwitch')}</Text>
        </TouchableOpacity>

        {/* ===== FUNCTION CARDS GRID ===== */}
        <View style={styles.cardGrid}>
          {/* --- Card 1: BLE Scanner --- */}
          <View style={[styles.card, beaconStore.isScanningBeacons && styles.cardActive]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Text style={styles.cardIcon}>📡</Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle}>{t('home.bleScanner')}</Text>
                <Text style={[styles.cardStatus, beaconStore.isScanningBeacons && styles.cardStatusActive]}>
                  {beaconStore.isScanningBeacons ? `● ${t('home.scanning')}` : `○ ${t('home.idle')}`}
                </Text>
              </View>
            </View>

            {/* Beacon count */}
            <View style={styles.cardStatRow}>
              <View style={styles.cardStat}>
                <Text style={styles.statValue}>{beaconStore.detectedBeacons.length}</Text>
                <Text style={styles.statLabel}>{t('home.nodes')}</Text>
              </View>
              {beaconStore.closestBeacon && (
                <View style={styles.cardStat}>
                  <Text style={styles.statValue}>{beaconStore.closestBeacon.rssi}</Text>
                  <Text style={styles.statLabel}>{t('home.closestDbm')}</Text>
                </View>
              )}
            </View>

            {/* Beacon list */}
            {beaconStore.detectedBeacons.length > 0 && (
              <View style={styles.beaconList}>
                {beaconStore.detectedBeacons
                  .sort((a, b) => b.rssi - a.rssi)
                  .slice(0, 4)
                  .map((b) => (
                    <View key={b.nodeKey} style={styles.beaconRow}>
                      <Text style={styles.beaconName}>{b.nodeKey}</Text>
                      <Text style={[
                        styles.beaconRssi,
                        b.rssi > -60 && styles.rssiStrong,
                        b.rssi <= -60 && b.rssi > -80 && styles.rssiMedium,
                        b.rssi <= -80 && styles.rssiWeak,
                      ]}>{b.rssi} dBm</Text>
                    </View>
                  ))}
              </View>
            )}

            {/* Scan controls */}
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={[styles.actionBtn, beaconStore.isScanningBeacons && styles.actionBtnActive]}
                onPress={() => {
                  if (beaconStore.isScanningBeacons) {
                    userStoppedBleRef.current = true;
                    BLEScanner.stopScanning();
                  } else {
                    userStoppedBleRef.current = false;
                    BLEScanner.startContinuousScanning();
                  }
                }}
              >
                <Text style={styles.actionBtnText}>
                  {beaconStore.isScanningBeacons ? `⏹ ${t('home.stop')}` : `▶ ${t('home.start')}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* --- Card 2: Walk Steps --- */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#1A3A2A' }]}>
                <Text style={styles.cardIcon}>👟</Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle}>{t('home.walkSteps')}</Text>
                <Text style={styles.cardStatus}>{t('home.pedometer')}</Text>
              </View>
            </View>

            <View style={styles.cardStatRow}>
              <View style={styles.cardStat}>
                <Text style={[styles.statValue, styles.statValueLarge]}>
                  {walkSteps?.steps ?? 0}
                </Text>
                <Text style={styles.statLabel}>{t('home.steps')}</Text>
              </View>
              <View style={styles.cardStat}>
                <Text style={styles.statValue}>
                  {walkSteps?.distance_m ? `${walkSteps.distance_m.toFixed(1)}` : '0'}
                </Text>
                <Text style={styles.statLabel}>{t('home.meters')}</Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('WalkSteps')}
              >
                <Text style={styles.actionBtnText}>📊 {t('home.details')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* --- Card 3: Polar Health --- */}
          <View style={[styles.card, polar.isPolarConnected && styles.cardActive]}>
            <View style={styles.cardHeader}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#3A1A2A' }]}>
                <Text style={styles.cardIcon}>❤️</Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle}>{t('home.polarHealth')}</Text>
                <Text style={[styles.cardStatus, polar.isPolarConnected && styles.cardStatusActive]}>
                  {polar.isPolarConnected 
                    ? `● ${polar.polarDevice?.name || t('home.connected')}` 
                    : `○ ${t('home.notConnected')}`}
                </Text>
              </View>
            </View>

            <View style={styles.cardStatRow}>
              <View style={styles.cardStat}>
                <Text style={[styles.statValue, styles.statHR]}>
                  {polar.lastHR?.bpm ?? '--'}
                </Text>
                <Text style={styles.statLabel}>{t('home.bpm')}</Text>
              </View>
              {polar.polarDevice?.batteryLevel != null && (
                <View style={styles.cardStat}>
                  <Text style={styles.statValue}>{polar.polarDevice.batteryLevel}%</Text>
                  <Text style={styles.statLabel}>{t('home.battery')}</Text>
                </View>
              )}
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('PolarHealth')}
              >
                <Text style={styles.actionBtnText}>💓 {t('home.monitor')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ===== QUICK ACTIONS ===== */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.quickIcon}>⚙️</Text>
              <Text style={styles.quickLabel}>{t('home.settings')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('WebView')}>
              <Text style={styles.quickIcon}>🌐</Text>
              <Text style={styles.quickLabel}>{t('home.webPortal')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Devices')}>
              <Text style={styles.quickIcon}>📱</Text>
              <Text style={styles.quickLabel}>{t('home.devices')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== MQTT STATUS BAR ===== */}
        <View style={styles.mqttBar}>
          <Text style={styles.mqttBarText}>
            MQTT: {isMQTTConnected ? `✅ ${t('home.mqttOnline')}` : `❌ ${t('home.mqttOffline')}`} • {t('home.queue')}: {mqttService.getQueueSize()} • {t('home.bleScanner')}: {beaconStore.detectedBeacons.length}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {},
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    fontSize: 22,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.5,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  mqttDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  mqttDotOn: {
    backgroundColor: '#4CAF50',
  },
  mqttDotOff: {
    backgroundColor: '#F44336',
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  disconnectBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  disconnectText: {
    fontSize: 20,
    color: colors.text,
  },
  backgroundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backgroundRowText: {
    flex: 1,
    marginRight: 12,
  },
  backgroundRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  backgroundRowHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Room prediction banner
  roomBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roomLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 2,
  },
  roomName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  roomConfidence: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Mode toggle
  modeToggle: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  modeLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  modeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  modeSwitchHint: {
    fontSize: 11,
    color: colors.textMuted,
  },

  // Card grid
  cardGrid: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardIcon: {
    fontSize: 22,
  },
  cardMeta: {},
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardStatus: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  cardStatusActive: {
    color: '#4CAF50',
  },
  cardStatRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  cardStat: {
    marginRight: 28,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  statValueLarge: {
    fontSize: 32,
    color: '#66BB6A',
  },
  statHR: {
    color: '#EF5350',
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Beacon list
  beaconList: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginBottom: 10,
  },
  beaconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  beaconName: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  beaconRssi: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  rssiStrong: {
    color: '#4CAF50',
  },
  rssiMedium: {
    color: '#FFC107',
  },
  rssiWeak: {
    color: '#F44336',
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    marginRight: 10,
  },
  actionBtnActive: {
    backgroundColor: colors.danger,
  },
  actionBtnText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },

  // Quick actions
  quickActions: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  actionRow: {
    flexDirection: 'row',
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },

  // MQTT footer bar
  mqttBar: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  mqttBarText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
});

export default HomeScreen;
