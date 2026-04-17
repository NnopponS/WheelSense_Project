/**
 * Shared MQTT + BLE + steps + one-shot telemetry (no telemetry loop lifecycle).
 * Used by BackgroundFetch, expo-background-task, and optional foreground iterations.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import * as Device from 'expo-device';
import { useAppStore } from '../store/useAppStore';
import { BLEScanner } from './BLEScanner';
import { mqttService } from './MQTTService';

const BG_STEP_END_KEY = 'wheelsense-bg-step-query-end';
const STEP_LENGTH_M = 0.7;
export const DEFAULT_BLE_WINDOW_MS = 8000;

async function pedometerPermissionGranted(): Promise<boolean> {
  try {
    const r = await Pedometer.requestPermissionsAsync();
    return r.status === 'granted';
  } catch {
    return false;
  }
}

function applyWalkStepsFromWindow(steps: number, startWindow: Date, endMs: number): void {
  const data = {
    steps,
    distance_m: parseFloat((steps * STEP_LENGTH_M).toFixed(1)),
    timestamp: endMs,
    session_start: startWindow.getTime(),
  };
  useAppStore.getState().setWalkSteps(data);
}

export async function runDeferredMonitoringSync(options?: { bleWindowMs?: number }): Promise<void> {
  const bleMs = options?.bleWindowMs ?? DEFAULT_BLE_WINDOW_MS;

  if (!mqttService.isNativeModuleAvailable()) {
    return;
  }

  const { settings, deviceId, deviceName } = useAppStore.getState();
  if (!settings.backgroundMonitoringEnabled) {
    return;
  }

  const name = deviceName || settings.deviceName || Device.deviceName || 'Device';
  const id =
    deviceId ||
    `MOBILE_${String(name).replace(/\s+/g, '_').toUpperCase()}`;
  if (!useAppStore.getState().deviceId) {
    useAppStore.getState().setDeviceInfo(id, name);
  }

  try {
    if (!mqttService.isConnectedToBroker()) {
      await mqttService.connect({
        host: settings.mqttBroker,
        port: settings.mqttPort,
        clientId: `ws_${id}_bg_${Date.now()}`,
      });
    }
    await mqttService.publishRegistration();
  } catch (e) {
    console.warn('[Monitoring] MQTT connect/register:', e);
  }

  try {
    BLEScanner.stopScanning();
    await BLEScanner.startScanning();
    const elapsed = Math.min(bleMs, 24000);
    await new Promise((r) => setTimeout(r, elapsed));
    BLEScanner.stopScanning();
  } catch (e) {
    console.warn('[Monitoring] BLE window:', e);
  }

  try {
    const permitted = await pedometerPermissionGranted();
    const available = permitted && (await Pedometer.isAvailableAsync());
    if (available) {
      const end = new Date();
      const rawEnd = await AsyncStorage.getItem(BG_STEP_END_KEY);
      const prevEnd = rawEnd ? parseInt(rawEnd, 10) : NaN;
      const startWindow = Number.isFinite(prevEnd)
        ? new Date(prevEnd)
        : new Date(end.getTime() - 60 * 60 * 1000);

      if (startWindow < end) {
        const { steps } = await Pedometer.getStepCountAsync(startWindow, end);
        const now = Date.now();
        applyWalkStepsFromWindow(steps, startWindow, now);
        if (steps > 0) {
          await mqttService.publishWalkStep({
            steps,
            distance_m: parseFloat((steps * STEP_LENGTH_M).toFixed(1)),
            timestamp: now,
            session_start: startWindow.getTime(),
          });
        }
      }
      await AsyncStorage.setItem(BG_STEP_END_KEY, String(end.getTime()));
    }
  } catch (e) {
    if (Platform.OS === 'android') {
      console.warn('[Monitoring] Step query (Android may be limited):', e);
    } else {
      console.warn('[Monitoring] Pedometer:', e);
    }
  }

  try {
    if (mqttService.isConnectedToBroker()) {
      const state = useAppStore.getState();
      const payload = await mqttService.buildTelemetryPayload({
        beacons: state.detectedBeacons,
        walkSteps: state.walkSteps ?? undefined,
      });
      await mqttService.publishTelemetry(payload);
    }
  } catch (e) {
    console.warn('[Monitoring] Telemetry snapshot:', e);
  }
}

/** Pedometer delta + MQTT walkstep only (no BLE) — safe inside Android FGS loop while continuous scan runs. */
export async function publishStepDeltaIfPossible(): Promise<void> {
  if (!mqttService.isNativeModuleAvailable() || !mqttService.isConnectedToBroker()) {
    return;
  }
  if (!useAppStore.getState().settings.backgroundMonitoringEnabled) {
    return;
  }
  try {
    const permitted = await pedometerPermissionGranted();
    if (!permitted) {
      return;
    }
    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      return;
    }
    const end = new Date();
    const rawEnd = await AsyncStorage.getItem(BG_STEP_END_KEY);
    const prevEnd = rawEnd ? parseInt(rawEnd, 10) : NaN;
    const startWindow = Number.isFinite(prevEnd)
      ? new Date(prevEnd)
      : new Date(end.getTime() - 60 * 60 * 1000);
    if (startWindow >= end) {
      return;
    }
    const { steps } = await Pedometer.getStepCountAsync(startWindow, end);
    const now = Date.now();
    applyWalkStepsFromWindow(steps, startWindow, now);
    if (steps > 0) {
      await mqttService.publishWalkStep({
        steps,
        distance_m: parseFloat((steps * STEP_LENGTH_M).toFixed(1)),
        timestamp: now,
        session_start: startWindow.getTime(),
      });
    }
    await AsyncStorage.setItem(BG_STEP_END_KEY, String(end.getTime()));
  } catch (e) {
    if (Platform.OS === 'android') {
      console.warn('[Monitoring] Step delta:', e);
    }
  }
}
