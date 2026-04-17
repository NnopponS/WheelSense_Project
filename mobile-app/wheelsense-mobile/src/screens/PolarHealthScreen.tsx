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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { usePolarStore, useConnection } from '../store/useAppStore';
import { Polar as PolarService } from '../services/PolarService';
import { colors, radius, space } from '../theme/tokens';

export const PolarHealthScreen: React.FC = () => {
  const { t } = useTranslation();
  const polar = usePolarStore();
  const { isMQTTConnected } = useConnection();

  const [hrHistory, setHrHistory] = useState<{ bpm: number; time: string }[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

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
    if (!PolarService.isAvailable()) {
      Alert.alert(t('common.error'), t('device.polarNotAvailable'));
      return;
    }
    setIsScanning(true);
    polar.clearPolarDiscovery();
    try {
      await PolarService.searchForDevice();
    } catch (e: unknown) {
      Alert.alert(t('common.error'), t('device.polarScanFailed'));
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnectPolar = async (deviceId: string) => {
    setConnectingId(deviceId);
    try {
      await PolarService.connect(deviceId);
      await PolarService.startHRStreaming();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('device.connectionFailed'), msg);
    } finally {
      setConnectingId(null);
    }
  };

  const handleDisconnectPolar = () => {
    Alert.alert(t('common.disconnect'), t('vitals.disconnectConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.disconnect'),
        style: 'destructive',
        onPress: () => {
          void PolarService.disconnect();
          polar.setPolarDevice(null);
          polar.setPolarConnection(false);
          setHrHistory([]);
        },
      },
    ]);
  };

  const getHRZone = (bpm: number): { label: string; color: string } => {
    if (bpm < 60) return { label: t('vitals.hrZoneResting'), color: '#42A5F5' };
    if (bpm < 100) return { label: t('vitals.hrZoneNormal'), color: '#66BB6A' };
    if (bpm < 140) return { label: t('vitals.hrZoneElevated'), color: '#FFA726' };
    if (bpm < 170) return { label: t('vitals.hrZoneHigh'), color: '#EF5350' };
    return { label: t('vitals.hrZoneMax'), color: '#E53935' };
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
                ? t('vitals.statusConnected', { name: polar.polarDevice?.name || 'Polar' })
                : t('vitals.statusNotConnected')}
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
            <Text style={styles.hrUnit}>{t('vitals.hrBpm')}</Text>
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
              <Text style={styles.statLabel}>{t('vitals.avg')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, styles.statMin]}>{minBPM}</Text>
              <Text style={styles.statLabel}>{t('vitals.min')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, styles.statMax]}>{maxBPM}</Text>
              <Text style={styles.statLabel}>{t('vitals.max')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{hrHistory.length}</Text>
              <Text style={styles.statLabel}>{t('vitals.readings')}</Text>
            </View>
          </View>
        )}

        {/* RR Intervals */}
        {polar.lastHR?.rr_intervals && polar.lastHR.rr_intervals.length > 0 && (
          <View style={styles.rrCard}>
            <Text style={styles.cardTitle}>{t('vitals.rrIntervals')}</Text>
            <Text style={styles.rrValues}>
              {polar.lastHR.rr_intervals.map((rr) => rr.toFixed(0)).join(', ')}
            </Text>
          </View>
        )}

        {/* PPG Data */}
        {polar.lastPPG && (
          <View style={styles.ppgCard}>
            <Text style={styles.cardTitle}>{t('vitals.ppgData')}</Text>
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
                <Text style={styles.ppgLabel}>{t('vitals.ambient')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {!polar.isPolarConnected ? (
            <>
              <TouchableOpacity
                style={[styles.primaryBtn, isScanning && styles.primaryBtnDisabled]}
                onPress={handleScanPolar}
                disabled={isScanning}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>
                  {isScanning ? `🔍 ${t('vitals.scanningTarget')}` : `🔍 ${t('vitals.scanTarget')}`}
                </Text>
              </TouchableOpacity>
              {polar.polarDiscoveredDevices.length > 0 && (
                <View style={styles.discoveredBox}>
                  <Text style={styles.cardTitle}>{t('device.polarFound')}</Text>
                  {polar.polarDiscoveredDevices.map((d) => (
                    <TouchableOpacity
                      key={d.deviceId}
                      style={styles.discoveredRow}
                      onPress={() => handleConnectPolar(d.deviceId)}
                      disabled={connectingId === d.deviceId}
                    >
                      <Text style={styles.discoveredName}>{d.name}</Text>
                      <Text style={styles.discoveredId}>{d.deviceId}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.disconnectBtn]}
              onPress={handleDisconnectPolar}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>⏏ {t('vitals.disconnectTarget')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent HR History */}
        {hrHistory.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={styles.cardTitle}>{t('vitals.recentHr')}</Text>
            {hrHistory.slice(0, 10).map((entry, idx) => (
              <View key={idx} style={styles.historyRow}>
                <Text style={styles.historyTime}>{entry.time}</Text>
                <Text style={[styles.historyBpm, { color: getHRZone(entry.bpm).color }]}>
                  {entry.bpm} {t('vitals.hrBpm')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* MQTT Status */}
        <View style={styles.mqttInfo}>
          <Text style={styles.mqttText}>
            MQTT: {isMQTTConnected ? t('vitals.mqttSync') : t('vitals.mqttNoSync')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: space.md + 4,
    paddingBottom: 40,
  },

  // Status card
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusCardConnected: {
    borderColor: colors.success,
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
    backgroundColor: colors.success,
  },
  dotRed: {
    backgroundColor: colors.danger,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  firmwareText: {
    fontSize: 12,
    color: colors.textMuted,
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
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
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
    color: colors.textMuted,
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  statMin: {
    color: colors.primary,
  },
  statMax: {
    color: colors.danger,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },

  // RR / PPG cards
  rrCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rrValues: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 6,
    lineHeight: 20,
  },
  ppgCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
  },
  ppgLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },

  // Controls
  controls: {
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  disconnectBtn: {
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
  },
  primaryBtnText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '700',
  },
  discoveredBox: {
    marginTop: space.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: space.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  discoveredRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  discoveredName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  discoveredId: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontFamily: 'monospace',
  },

  // History
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  historyBpm: {
    fontSize: 13,
    fontWeight: '700',
  },

  // MQTT info
  mqttInfo: {
    padding: space.sm + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  mqttText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});

export default PolarHealthScreen;
