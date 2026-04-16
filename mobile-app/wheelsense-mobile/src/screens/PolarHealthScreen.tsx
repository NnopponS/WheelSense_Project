/**
 * WheelSense Mobile App - Polar Health Screen
 * Heart rate and PPG monitoring via Polar device
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { usePolarStore, useConnection } from '../store/useAppStore';
import { HeartRateData, PolarDevice } from '../types';

export const PolarHealthScreen: React.FC = () => {
  const polar = usePolarStore();
  const { isMQTTConnected } = useConnection();

  const [hrHistory, setHrHistory] = useState<{ bpm: number; time: string }[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // HR heartbeat animation
  const beatScale = useRef(new Animated.Value(1)).current;

  // Track HR updates
  useEffect(() => {
    if (polar.lastHR) {
      // Animate heartbeat
      Animated.sequence([
        Animated.timing(beatScale, { toValue: 1.25, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beatScale, { toValue: 1, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start();

      // Add to history
      setHrHistory((prev) => {
        const time = new Date().toLocaleTimeString();
        const updated = [{ bpm: polar.lastHR!.bpm, time }, ...prev];
        return updated.slice(0, 60); // Keep last 60 readings
      });
    }
  }, [polar.lastHR?.timestamp]);

  const handleScanPolar = async () => {
    setIsScanning(true);
    // Note: PolarService should be imported and used here
    // This is a placeholder for the actual Polar BLE scan
    Alert.alert(
      'Polar Scan',
      'Scanning for nearby Polar devices...\n\nMake sure your Polar device (H10, OH1, Verity Sense) is turned on and in pairing mode.',
      [{ text: 'OK' }]
    );
    setTimeout(() => setIsScanning(false), 3000);
  };

  const handleDisconnectPolar = () => {
    Alert.alert('Disconnect', 'Disconnect from Polar device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          polar.setPolarDevice(null);
          polar.setPolarConnection(false);
          setHrHistory([]);
        },
      },
    ]);
  };

  const getHRZone = (bpm: number): { label: string; color: string } => {
    if (bpm < 60) return { label: 'Resting', color: '#42A5F5' };
    if (bpm < 100) return { label: 'Normal', color: '#66BB6A' };
    if (bpm < 140) return { label: 'Elevated', color: '#FFA726' };
    if (bpm < 170) return { label: 'High', color: '#EF5350' };
    return { label: 'Max', color: '#E53935' };
  };

  const currentBPM = polar.lastHR?.bpm ?? 0;
  const zone = getHRZone(currentBPM);

  // Calculate basic HR stats from history
  const avgBPM = hrHistory.length > 0
    ? Math.round(hrHistory.reduce((sum, h) => sum + h.bpm, 0) / hrHistory.length)
    : 0;
  const maxBPM = hrHistory.length > 0
    ? Math.max(...hrHistory.map((h) => h.bpm))
    : 0;
  const minBPM = hrHistory.length > 0
    ? Math.min(...hrHistory.map((h) => h.bpm))
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Connection Status */}
        <View style={[styles.statusCard, polar.isPolarConnected && styles.statusCardConnected]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, polar.isPolarConnected ? styles.dotGreen : styles.dotRed]} />
            <Text style={styles.statusText}>
              {polar.isPolarConnected
                ? `Connected: ${polar.polarDevice?.name || 'Polar'}`
                : 'Not Connected'}
            </Text>
          </View>
          {polar.polarDevice?.firmwareVersion && (
            <Text style={styles.firmwareText}>FW: {polar.polarDevice.firmwareVersion}</Text>
          )}
        </View>

        {/* Heart Rate Display */}
        <View style={styles.hrSection}>
          <Animated.View style={[styles.hrCircle, { transform: [{ scale: beatScale }] }]}>
            <Text style={styles.heartEmoji}>❤️</Text>
            <Text style={[styles.hrValue, { color: zone.color }]}>{currentBPM || '--'}</Text>
            <Text style={styles.hrUnit}>BPM</Text>
          </Animated.View>
          {currentBPM > 0 && (
            <View style={[styles.zoneBadge, { backgroundColor: zone.color + '22', borderColor: zone.color }]}>
              <Text style={[styles.zoneText, { color: zone.color }]}>{zone.label}</Text>
            </View>
          )}
        </View>

        {/* HR Stats */}
        {hrHistory.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{avgBPM}</Text>
              <Text style={styles.statLabel}>Avg</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, styles.statMin]}>{minBPM}</Text>
              <Text style={styles.statLabel}>Min</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, styles.statMax]}>{maxBPM}</Text>
              <Text style={styles.statLabel}>Max</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{hrHistory.length}</Text>
              <Text style={styles.statLabel}>Readings</Text>
            </View>
          </View>
        )}

        {/* RR Intervals */}
        {polar.lastHR?.rr_intervals && polar.lastHR.rr_intervals.length > 0 && (
          <View style={styles.rrCard}>
            <Text style={styles.cardTitle}>RR Intervals (ms)</Text>
            <Text style={styles.rrValues}>
              {polar.lastHR.rr_intervals.map((rr) => rr.toFixed(0)).join(', ')}
            </Text>
          </View>
        )}

        {/* PPG Data */}
        {polar.lastPPG && (
          <View style={styles.ppgCard}>
            <Text style={styles.cardTitle}>PPG Sensor Data</Text>
            <View style={styles.ppgRow}>
              <View style={styles.ppgItem}>
                <Text style={styles.ppgValue}>{polar.lastPPG.ppg0}</Text>
                <Text style={styles.ppgLabel}>PPG0</Text>
              </View>
              <View style={styles.ppgItem}>
                <Text style={styles.ppgValue}>{polar.lastPPG.ppg1}</Text>
                <Text style={styles.ppgLabel}>PPG1</Text>
              </View>
              <View style={styles.ppgItem}>
                <Text style={styles.ppgValue}>{polar.lastPPG.ppg2}</Text>
                <Text style={styles.ppgLabel}>PPG2</Text>
              </View>
              <View style={styles.ppgItem}>
                <Text style={styles.ppgValue}>{polar.lastPPG.ambient}</Text>
                <Text style={styles.ppgLabel}>Ambient</Text>
              </View>
            </View>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {!polar.isPolarConnected ? (
            <TouchableOpacity
              style={[styles.primaryBtn, isScanning && styles.primaryBtnDisabled]}
              onPress={handleScanPolar}
              disabled={isScanning}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>
                {isScanning ? '🔍 Scanning...' : '🔍 Scan for Polar'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.disconnectBtn]}
              onPress={handleDisconnectPolar}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>⏏ Disconnect Polar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent HR History */}
        {hrHistory.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={styles.cardTitle}>Recent Heart Rate</Text>
            {hrHistory.slice(0, 10).map((entry, idx) => (
              <View key={idx} style={styles.historyRow}>
                <Text style={styles.historyTime}>{entry.time}</Text>
                <Text style={[styles.historyBpm, { color: getHRZone(entry.bpm).color }]}>
                  {entry.bpm} BPM
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* MQTT Status */}
        <View style={styles.mqttInfo}>
          <Text style={styles.mqttText}>
            MQTT: {isMQTTConnected ? '✅ HR data synced to server' : '❌ Offline — data not synced'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Status card
  statusCard: {
    backgroundColor: '#111D30',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  statusCardConnected: {
    borderColor: '#2E7D32',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotGreen: {
    backgroundColor: '#4CAF50',
  },
  dotRed: {
    backgroundColor: '#F44336',
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E0E0E0',
  },
  firmwareText: {
    fontSize: 12,
    color: '#667788',
    marginTop: 4,
    marginLeft: 20,
  },

  // Heart rate section
  hrSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  hrCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: '#3A1A2A',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A0D14',
    shadowColor: '#EF5350',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 14,
  },
  heartEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  hrValue: {
    fontSize: 48,
    fontWeight: '800',
  },
  hrUnit: {
    fontSize: 14,
    color: '#667788',
    marginTop: -4,
  },
  zoneBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  zoneText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#111D30',
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#E0E0E0',
  },
  statMin: {
    color: '#42A5F5',
  },
  statMax: {
    color: '#EF5350',
  },
  statLabel: {
    fontSize: 11,
    color: '#667788',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#1A3050',
  },

  // RR / PPG cards
  rrCard: {
    backgroundColor: '#111D30',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  rrValues: {
    color: '#B0BEC5',
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 6,
    lineHeight: 20,
  },
  ppgCard: {
    backgroundColor: '#111D30',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  ppgRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  ppgItem: {
    alignItems: 'center',
  },
  ppgValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E0E0E0',
  },
  ppgLabel: {
    fontSize: 11,
    color: '#667788',
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8899AA',
  },

  // Controls
  controls: {
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: '#1565C0',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#1565C0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  disconnectBtn: {
    backgroundColor: '#B71C1C',
    shadowColor: '#F44336',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },

  // History
  historyCard: {
    backgroundColor: '#111D30',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#1A2A40',
  },
  historyTime: {
    fontSize: 12,
    color: '#667788',
    fontFamily: 'monospace',
  },
  historyBpm: {
    fontSize: 13,
    fontWeight: '700',
  },

  // MQTT info
  mqttInfo: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0D1F38',
    alignItems: 'center',
  },
  mqttText: {
    fontSize: 11,
    color: '#556677',
  },
});

export default PolarHealthScreen;
