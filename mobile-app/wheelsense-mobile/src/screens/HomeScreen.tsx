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

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { deviceName, isMQTTConnected, isDeviceRegistered, disconnectAll } = useConnection();
  const polar = usePolarStore();
  const beaconStore = useBeacons();
  const { appMode, setAppMode } = useAppMode();
  const { walkSteps } = useWalkSteps();
  const { roomPrediction } = useRoomPrediction();

  const [refreshing, setRefreshing] = useState(false);

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

    return () => {
      BLEScanner.stopScanning();
    };
  }, []);

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
      'Disconnect',
      'Disconnect from MQTT and return to setup?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
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
            <Text style={styles.headerLogo}>🦽</Text>
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
              {isMQTTConnected ? `Connected — ${deviceName}` : 'Disconnected'}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <Text style={styles.disconnectText}>⏏</Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4FC3F7" />}
      >
        {/* ===== ROOM PREDICTION BANNER ===== */}
        {roomPrediction && roomPrediction.room_name !== '' && (
          <View style={styles.roomBanner}>
            <Text style={styles.roomLabel}>📍 Current Location</Text>
            <Text style={styles.roomName}>{roomPrediction.room_name}</Text>
            <Text style={styles.roomConfidence}>
              {(roomPrediction.confidence * 100).toFixed(0)}% confidence • {roomPrediction.model_type}
            </Text>
          </View>
        )}

        {/* ===== MODE TOGGLE ===== */}
        <TouchableOpacity style={styles.modeToggle} onPress={toggleAppMode} activeOpacity={0.7}>
          <View style={styles.modeLeft}>
            <Text style={styles.modeIcon}>{appMode === 'wheelchair' ? '🦽' : '🚶'}</Text>
            <View>
              <Text style={styles.modeLabel}>Mode</Text>
              <Text style={styles.modeValue}>
                {appMode === 'wheelchair' ? 'Wheelchair' : 'Walking'}
              </Text>
            </View>
          </View>
          <Text style={styles.modeSwitchHint}>Tap to switch</Text>
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
                <Text style={styles.cardTitle}>BLE Scanner</Text>
                <Text style={[styles.cardStatus, beaconStore.isScanningBeacons && styles.cardStatusActive]}>
                  {beaconStore.isScanningBeacons ? '● Scanning' : '○ Idle'}
                </Text>
              </View>
            </View>

            {/* Beacon count */}
            <View style={styles.cardStatRow}>
              <View style={styles.cardStat}>
                <Text style={styles.statValue}>{beaconStore.detectedBeacons.length}</Text>
                <Text style={styles.statLabel}>Nodes</Text>
              </View>
              {beaconStore.closestBeacon && (
                <View style={styles.cardStat}>
                  <Text style={styles.statValue}>{beaconStore.closestBeacon.rssi}</Text>
                  <Text style={styles.statLabel}>Closest dBm</Text>
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
                    BLEScanner.stopScanning();
                  } else {
                    BLEScanner.startContinuousScanning();
                  }
                }}
              >
                <Text style={styles.actionBtnText}>
                  {beaconStore.isScanningBeacons ? '⏹ Stop' : '▶ Start'}
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
                <Text style={styles.cardTitle}>Walk Steps</Text>
                <Text style={styles.cardStatus}>Pedometer</Text>
              </View>
            </View>

            <View style={styles.cardStatRow}>
              <View style={styles.cardStat}>
                <Text style={[styles.statValue, styles.statValueLarge]}>
                  {walkSteps?.steps ?? 0}
                </Text>
                <Text style={styles.statLabel}>Steps</Text>
              </View>
              <View style={styles.cardStat}>
                <Text style={styles.statValue}>
                  {walkSteps?.distance_m ? `${walkSteps.distance_m.toFixed(1)}` : '0'}
                </Text>
                <Text style={styles.statLabel}>Meters</Text>
              </View>
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('WalkSteps')}
              >
                <Text style={styles.actionBtnText}>📊 Details</Text>
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
                <Text style={styles.cardTitle}>Polar Health</Text>
                <Text style={[styles.cardStatus, polar.isPolarConnected && styles.cardStatusActive]}>
                  {polar.isPolarConnected ? `● ${polar.polarDevice?.name || 'Connected'}` : '○ Not connected'}
                </Text>
              </View>
            </View>

            <View style={styles.cardStatRow}>
              <View style={styles.cardStat}>
                <Text style={[styles.statValue, styles.statHR]}>
                  {polar.lastHR?.bpm ?? '--'}
                </Text>
                <Text style={styles.statLabel}>BPM</Text>
              </View>
              {polar.polarDevice?.batteryLevel != null && (
                <View style={styles.cardStat}>
                  <Text style={styles.statValue}>{polar.polarDevice.batteryLevel}%</Text>
                  <Text style={styles.statLabel}>Battery</Text>
                </View>
              )}
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => navigation.navigate('PolarHealth')}
              >
                <Text style={styles.actionBtnText}>💓 Monitor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ===== QUICK ACTIONS ===== */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Settings')}>
              <Text style={styles.quickIcon}>⚙️</Text>
              <Text style={styles.quickLabel}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('WebView')}>
              <Text style={styles.quickIcon}>🌐</Text>
              <Text style={styles.quickLabel}>Web Portal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Devices')}>
              <Text style={styles.quickIcon}>📱</Text>
              <Text style={styles.quickLabel}>Devices</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== MQTT STATUS BAR ===== */}
        <View style={styles.mqttBar}>
          <Text style={styles.mqttBarText}>
            MQTT: {isMQTTConnected ? '✅ Online' : '❌ Offline'} • Queue: {mqttService.getQueueSize()} • Beacons: {beaconStore.detectedBeacons.length}
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
    backgroundColor: '#0A1628',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0D1F38',
    borderBottomWidth: 1,
    borderBottomColor: '#1A3050',
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
    color: '#E0E0E0',
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
    color: '#8899AA',
  },
  disconnectBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  disconnectText: {
    fontSize: 20,
    color: '#E0E0E0',
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
    backgroundColor: '#0D2A40',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A4060',
  },
  roomLabel: {
    fontSize: 12,
    color: '#8899AA',
    marginBottom: 2,
  },
  roomName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4FC3F7',
  },
  roomConfidence: {
    fontSize: 11,
    color: '#667788',
    marginTop: 2,
  },

  // Mode toggle
  modeToggle: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    backgroundColor: '#111D30',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#1A3050',
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
    color: '#667788',
  },
  modeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  modeSwitchHint: {
    fontSize: 11,
    color: '#556677',
  },

  // Card grid
  cardGrid: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  card: {
    backgroundColor: '#111D30',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  cardActive: {
    borderColor: '#2A5A8C',
    shadowColor: '#4FC3F7',
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
    backgroundColor: '#1A2A40',
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
    color: '#E0E0E0',
  },
  cardStatus: {
    fontSize: 12,
    color: '#667788',
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
    color: '#E0E0E0',
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
    color: '#667788',
    marginTop: 1,
  },

  // Beacon list
  beaconList: {
    borderTopWidth: 1,
    borderTopColor: '#1A3050',
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
    color: '#B0BEC5',
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
    backgroundColor: '#1A3050',
    marginRight: 10,
  },
  actionBtnActive: {
    backgroundColor: '#B71C1C',
  },
  actionBtnText: {
    fontSize: 13,
    color: '#B0BEC5',
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
    color: '#8899AA',
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
    backgroundColor: '#111D30',
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  quickIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  quickLabel: {
    fontSize: 11,
    color: '#8899AA',
    fontWeight: '600',
  },

  // MQTT footer bar
  mqttBar: {
    marginHorizontal: 16,
    marginTop: 20,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0D1F38',
    alignItems: 'center',
  },
  mqttBarText: {
    fontSize: 11,
    color: '#556677',
    fontFamily: 'monospace',
  },
});

export default HomeScreen;
