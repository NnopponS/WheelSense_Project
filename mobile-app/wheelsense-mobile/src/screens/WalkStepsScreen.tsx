/**
 * WheelSense Mobile App - Walk Steps Screen
 * Pedometer tracking using expo-sensors
 * Publishes step data via MQTT
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { Pedometer } from 'expo-sensors';
import { useWalkSteps, useConnection } from '../store/useAppStore';
import { mqttService } from '../services/MQTTService';
import { WalkStepData } from '../types';
import { colors, radius } from '../theme/tokens';

const STEP_LENGTH_M = 0.7; // Average step length in meters

export const WalkStepsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { walkSteps, setWalkSteps, clearWalkSteps } = useWalkSteps();
  const { isMQTTConnected } = useConnection();

  const [isTracking, setIsTracking] = useState(false);
  const [isPedometerAvailable, setIsPedometerAvailable] = useState<boolean | null>(null);
  const [sessionStart, setSessionStart] = useState(0);
  const [publishCount, setPublishCount] = useState(0);

  const subscriptionRef = useRef<ReturnType<typeof Pedometer.watchStepCount> | null>(null);
  const publishIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestWalkRef = useRef<WalkStepData | null>(null);
  const mqttConnectedRef = useRef(isMQTTConnected);

  const stepScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    mqttConnectedRef.current = isMQTTConnected;
  }, [isMQTTConnected]);

  useEffect(() => {
    latestWalkRef.current = walkSteps;
  }, [walkSteps]);

  const animateStep = () => {
    Animated.sequence([
      Animated.timing(stepScale, { toValue: 1.15, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(stepScale, { toValue: 1, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  const stopTrackingInner = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    if (publishIntervalRef.current) {
      clearInterval(publishIntervalRef.current);
      publishIntervalRef.current = null;
    }

    const cur = latestWalkRef.current;
    if (cur && mqttConnectedRef.current) {
      void mqttService.publishWalkStep(cur);
    }

    setIsTracking(false);
  }, []);

  useEffect(() => {
    void Pedometer.isAvailableAsync().then(setIsPedometerAvailable);

    return () => {
      stopTrackingInner();
    };
  }, [stopTrackingInner]);

  const startTracking = useCallback(async () => {
    if (!isPedometerAvailable) {
      Alert.alert(t('common.unavailable'), t('walk.pedometerNotAvailable'));
      return;
    }

    try {
      const perm = await Pedometer.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('common.unavailable'), t('walk.pedometerPermissionDenied'));
        return;
      }
    } catch {
      Alert.alert(t('common.unavailable'), t('walk.pedometerNotAvailable'));
      return;
    }

    const start = Date.now();
    setSessionStart(start);
    setIsTracking(true);

    const initial: WalkStepData = {
      steps: 0,
      distance_m: 0,
      timestamp: start,
      session_start: start,
    };
    latestWalkRef.current = initial;
    setWalkSteps(initial);

    subscriptionRef.current = Pedometer.watchStepCount((result: { steps: number }) => {
      const now = Date.now();
      const data: WalkStepData = {
        steps: result.steps,
        distance_m: parseFloat((result.steps * STEP_LENGTH_M).toFixed(1)),
        timestamp: now,
        session_start: start,
      };
      latestWalkRef.current = data;
      setWalkSteps(data);
      animateStep();
    });

    publishIntervalRef.current = setInterval(() => {
      const cur = latestWalkRef.current;
      if (cur && cur.steps > 0 && mqttConnectedRef.current) {
        void mqttService.publishWalkStep(cur).then(() => {
          setPublishCount((prev) => prev + 1);
        });
      }
    }, 10000);
  }, [isPedometerAvailable, setWalkSteps, t]);

  const stopTracking = useCallback(() => {
    stopTrackingInner();
  }, [stopTrackingInner]);

  const resetSession = () => {
    Alert.alert(t('walk.reset'), t('walk.resetConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('walk.reset'),
        onPress: () => {
          stopTrackingInner();
          clearWalkSteps();
          latestWalkRef.current = null;
          setPublishCount(0);
        },
      },
    ]);
  };

  const formatDuration = (startMs: number): string => {
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}${t('walk.minShort')} ${secs}${t('walk.secShort')}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {isPedometerAvailable === false && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⚠️ {t('walk.pedometerNotAvailable')}</Text>
          </View>
        )}

        <Animated.View style={[styles.stepCircle, { transform: [{ scale: stepScale }] }]}>
          <Text style={styles.stepCount}>{walkSteps?.steps ?? 0}</Text>
          <Text style={styles.stepUnit}>{t('walk.steps')}</Text>
        </Animated.View>

        <View style={styles.distanceRow}>
          <View style={styles.distanceStat}>
            <Text style={styles.distanceValue}>
              {walkSteps?.distance_m ? walkSteps.distance_m.toFixed(1) : '0'}
            </Text>
            <Text style={styles.distanceUnit}>{t('walk.meters')}</Text>
          </View>
          {sessionStart > 0 && (
            <View style={styles.distanceStat}>
              <Text style={styles.distanceValue}>{formatDuration(sessionStart)}</Text>
              <Text style={styles.distanceUnit}>{t('walk.duration')}</Text>
            </View>
          )}
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.primaryBtn, isTracking ? styles.stopBtn : styles.startBtn]}
            onPress={isTracking ? stopTracking : startTracking}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>
              {isTracking ? `⏹  ${t('walk.stopTracking')}` : `▶  ${t('walk.startTracking')}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={resetSession}>
            <Text style={styles.secondaryBtnText}>🔄 {t('walk.reset')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📡 {t('walk.mqttSync')}</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('walk.status')}</Text>
            <Text style={[styles.infoValue, isMQTTConnected ? styles.infoGreen : styles.infoRed]}>
              {isMQTTConnected ? t('home.connected') : t('home.disconnected')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('walk.published')}</Text>
            <Text style={styles.infoValue}>{publishCount} {t('walk.times')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t('walk.interval')}</Text>
            <Text style={styles.infoValue}>{t('walk.every10s')}</Text>
          </View>
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
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  warningBanner: {
    backgroundColor: '#4A2A00',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  warningText: {
    color: '#FFB74D',
    fontSize: 14,
    textAlign: 'center',
  },
  stepCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 4,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    shadowColor: '#4FC3F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 28,
  },
  stepCount: {
    fontSize: 52,
    fontWeight: '800',
    color: colors.success,
  },
  stepUnit: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: -4,
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 32,
  },
  distanceStat: {
    alignItems: 'center',
    marginHorizontal: 24,
  },
  distanceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  distanceUnit: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  controls: {
    width: '100%',
    marginBottom: 28,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  startBtn: {
    backgroundColor: '#2E7D32',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  stopBtn: {
    backgroundColor: '#B71C1C',
    shadowColor: '#F44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  infoGreen: {
    color: '#4CAF50',
  },
  infoRed: {
    color: '#F44336',
  },
});

export default WalkStepsScreen;
