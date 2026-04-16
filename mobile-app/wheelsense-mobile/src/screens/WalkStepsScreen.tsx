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
import { Pedometer } from 'expo-sensors';
import { useWalkSteps, useConnection } from '../store/useAppStore';
import { mqttService } from '../services/MQTTService';
import { WalkStepData } from '../types';

const STEP_LENGTH_M = 0.7; // Average step length in meters

export const WalkStepsScreen: React.FC = () => {
  const { walkSteps, setWalkSteps, clearWalkSteps } = useWalkSteps();
  const { isMQTTConnected } = useConnection();

  const [isTracking, setIsTracking] = useState(false);
  const [isPedometerAvailable, setIsPedometerAvailable] = useState<boolean | null>(null);
  const [sessionStart, setSessionStart] = useState(0);
  const [publishCount, setPublishCount] = useState(0);

  const subscriptionRef = useRef<ReturnType<typeof Pedometer.watchStepCount> | null>(null);
  const publishIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Step count animation
  const stepScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    checkAvailability();

    return () => {
      stopTracking();
    };
  }, []);

  const checkAvailability = async () => {
    const result = await Pedometer.isAvailableAsync();
    setIsPedometerAvailable(result);
  };

  const animateStep = () => {
    Animated.sequence([
      Animated.timing(stepScale, { toValue: 1.15, duration: 100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(stepScale, { toValue: 1, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  const startTracking = useCallback(() => {
    if (!isPedometerAvailable) {
      Alert.alert('Unavailable', 'Pedometer is not available on this device');
      return;
    }

    const start = Date.now();
    setSessionStart(start);
    setIsTracking(true);

    // Initialize walk steps
    setWalkSteps({
      steps: 0,
      distance_m: 0,
      timestamp: start,
      session_start: start,
    });

    // Subscribe to step updates
    subscriptionRef.current = Pedometer.watchStepCount((result) => {
      const now = Date.now();
      const data: WalkStepData = {
        steps: result.steps,
        distance_m: parseFloat((result.steps * STEP_LENGTH_M).toFixed(1)),
        timestamp: now,
        session_start: start,
      };

      setWalkSteps(data);
      animateStep();
    });

    // Periodic MQTT publish (every 10 seconds)
    publishIntervalRef.current = setInterval(async () => {
      const currentSteps = walkSteps;
      if (currentSteps && isMQTTConnected) {
        await mqttService.publishWalkStep(currentSteps);
        setPublishCount((prev) => prev + 1);
      }
    }, 10000);
  }, [isPedometerAvailable, isMQTTConnected]);

  const stopTracking = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    if (publishIntervalRef.current) {
      clearInterval(publishIntervalRef.current);
      publishIntervalRef.current = null;
    }

    // Final publish
    if (walkSteps && isMQTTConnected) {
      mqttService.publishWalkStep(walkSteps);
    }

    setIsTracking(false);
  }, [walkSteps, isMQTTConnected]);

  const resetSession = () => {
    Alert.alert('Reset', 'Reset step counter to 0?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: () => {
          stopTracking();
          clearWalkSteps();
          setPublishCount(0);
        },
      },
    ]);
  };

  const formatDuration = (startMs: number): string => {
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Availability Banner */}
        {isPedometerAvailable === false && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⚠️ Pedometer is not available on this device</Text>
          </View>
        )}

        {/* Step Counter */}
        <Animated.View style={[styles.stepCircle, { transform: [{ scale: stepScale }] }]}>
          <Text style={styles.stepCount}>{walkSteps?.steps ?? 0}</Text>
          <Text style={styles.stepUnit}>steps</Text>
        </Animated.View>

        {/* Distance */}
        <View style={styles.distanceRow}>
          <View style={styles.distanceStat}>
            <Text style={styles.distanceValue}>
              {walkSteps?.distance_m ? walkSteps.distance_m.toFixed(1) : '0'}
            </Text>
            <Text style={styles.distanceUnit}>meters</Text>
          </View>
          {sessionStart > 0 && (
            <View style={styles.distanceStat}>
              <Text style={styles.distanceValue}>{formatDuration(sessionStart)}</Text>
              <Text style={styles.distanceUnit}>duration</Text>
            </View>
          )}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.primaryBtn, isTracking ? styles.stopBtn : styles.startBtn]}
            onPress={isTracking ? stopTracking : startTracking}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>
              {isTracking ? '⏹  Stop Tracking' : '▶  Start Tracking'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={resetSession}>
            <Text style={styles.secondaryBtnText}>🔄 Reset</Text>
          </TouchableOpacity>
        </View>

        {/* MQTT Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📡 MQTT Sync</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={[styles.infoValue, isMQTTConnected ? styles.infoGreen : styles.infoRed]}>
              {isMQTTConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Published</Text>
            <Text style={styles.infoValue}>{publishCount} times</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Interval</Text>
            <Text style={styles.infoValue}>Every 10s</Text>
          </View>
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
    borderColor: '#1A3A5C',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D2137',
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
    color: '#66BB6A',
  },
  stepUnit: {
    fontSize: 16,
    color: '#667788',
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
    color: '#E0E0E0',
  },
  distanceUnit: {
    fontSize: 12,
    color: '#667788',
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
    backgroundColor: '#111D30',
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  secondaryBtnText: {
    color: '#B0BEC5',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#111D30',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1A3050',
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#B0BEC5',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#667788',
  },
  infoValue: {
    fontSize: 13,
    color: '#B0BEC5',
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
