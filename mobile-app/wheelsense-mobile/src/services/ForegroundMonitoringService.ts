/**
 * Android: foreground service (persistent notification) keeping JS alive for MQTT + BLE + telemetry.
 * iOS: not used (library would block UI thread); use BackgroundFetch + expo-background-task instead.
 */

import { Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { mqttService } from './MQTTService';
import { BLEScanner } from './BLEScanner';
import { publishStepDeltaIfPossible, runDeferredMonitoringSync } from './monitoringCycle';
import { isExpoGo } from '../utils/runtimeEnvironment';

const WHEELSENSE_HEADLESS_TASK = 'WheelSenseForeground';

let backgroundServiceModule: typeof import('react-native-background-actions') | null = null;

async function getBackgroundService(): Promise<typeof import('react-native-background-actions').default | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  if (isExpoGo()) {
    return null;
  }
  if (!backgroundServiceModule) {
    backgroundServiceModule = await import('react-native-background-actions');
  }
  return backgroundServiceModule.default;
}

export async function startAndroidForegroundMonitoring(): Promise<void> {
  const BackgroundService = await getBackgroundService();
  if (!BackgroundService || !mqttService.isNativeModuleAvailable()) {
    return;
  }
  if (BackgroundService.isRunning()) {
    return;
  }

  const task = async () => {
    try {
      const { settings, deviceId, deviceName } = useAppStore.getState();
      const name = deviceName || settings.deviceName || 'Device';
      const id =
        deviceId ||
        `MOBILE_${String(name).replace(/\s+/g, '_').toUpperCase()}`;
      if (!useAppStore.getState().deviceId) {
        useAppStore.getState().setDeviceInfo(id, name);
      }

      if (!mqttService.isConnectedToBroker()) {
        await mqttService.connect({
          host: settings.mqttBroker,
          port: settings.mqttPort,
          clientId: `ws_${id}_fgs_${Date.now()}`,
        });
      }
      await mqttService.publishRegistration();
      await runDeferredMonitoringSync({ bleWindowMs: 6000 });
      mqttService.startTelemetryLoop();
      await BLEScanner.startContinuousScanning();

      while (BackgroundService.isRunning()) {
        const enabled = !!useAppStore.getState().settings.backgroundMonitoringEnabled;
        if (!enabled) {
          break;
        }
        try {
          await publishStepDeltaIfPossible();
          await BackgroundService.updateNotification({
            taskDesc: `BLE + MQTT • ${new Date().toLocaleTimeString()}`,
          });
        } catch (e) {
          console.warn('[FGS] iteration:', e);
        }
        const interval = Math.max(
          15_000,
          Math.min(120_000, useAppStore.getState().settings.telemetryInterval ?? 15_000)
        );
        await new Promise((r) => setTimeout(r, interval));
      }
    } finally {
      mqttService.stopTelemetryLoop();
      BLEScanner.stopScanning();
    }
  };

  await BackgroundService.start(task, {
    taskName: WHEELSENSE_HEADLESS_TASK,
    taskTitle: 'WheelSense',
    taskDesc: 'BLE nodes, MQTT, steps',
    taskIcon: {
      name: 'ic_launcher',
      type: 'mipmap',
    },
    color: '#1565C0',
    linkingURI: 'wheelsense://',
    foregroundServiceType: ['connectedDevice', 'dataSync'],
    parameters: {},
  });
}

export async function stopAndroidForegroundMonitoring(): Promise<void> {
  const BackgroundService = await getBackgroundService();
  if (!BackgroundService) {
    return;
  }
  try {
    if (BackgroundService.isRunning()) {
      await BackgroundService.stop();
    }
  } catch (e) {
    console.warn('[FGS] stop:', e);
  }
}
