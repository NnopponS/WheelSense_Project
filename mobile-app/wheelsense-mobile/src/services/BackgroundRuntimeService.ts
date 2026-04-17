/**
 * Background monitoring: Android foreground service; iOS BackgroundFetch + expo-background-task.
 */

import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { useAppStore } from '../store/useAppStore';
import { isExpoGo } from '../utils/runtimeEnvironment';

export const WHEELSENSE_BACKGROUND_RUNTIME_TASK = 'wheelsense-background-runtime';
export const WHEELSENSE_BG_TASK = 'wheelsense-bg-processing';

/** Legacy task name from earlier BLE-only registration. */
const LEGACY_BLE_SCAN_TASK = 'wheelsense-background-scan';

let taskDefinitionsRegistered = false;

export function defineWheelSenseBackgroundTasks(): void {
  if (taskDefinitionsRegistered) {
    return;
  }
  taskDefinitionsRegistered = true;

  TaskManager.defineTask(WHEELSENSE_BACKGROUND_RUNTIME_TASK, async () => {
    const { runBackgroundRuntimeTick } = await import('./backgroundRuntimeTick');
    return runBackgroundRuntimeTick();
  });

  TaskManager.defineTask(WHEELSENSE_BG_TASK, async () => {
    const BackgroundTaskMod = await import('expo-background-task');
    if (!useAppStore.getState().settings.backgroundMonitoringEnabled) {
      return BackgroundTaskMod.BackgroundTaskResult.Success;
    }
    try {
      const { runDeferredMonitoringSync } = await import('./monitoringCycle');
      await runDeferredMonitoringSync();
      return BackgroundTaskMod.BackgroundTaskResult.Success;
    } catch (e) {
      console.error('[BackgroundTask]', e);
      return BackgroundTaskMod.BackgroundTaskResult.Failed;
    }
  });
}

/** @deprecated Use defineWheelSenseBackgroundTasks */
export function defineWheelSenseBackgroundTask(): void {
  defineWheelSenseBackgroundTasks();
}

export async function registerBackgroundFetchTask(): Promise<void> {
  defineWheelSenseBackgroundTasks();

  try {
    await BackgroundFetch.unregisterTaskAsync(LEGACY_BLE_SCAN_TASK);
  } catch {
    /* */
  }
  try {
    await BackgroundFetch.unregisterTaskAsync(WHEELSENSE_BACKGROUND_RUNTIME_TASK);
  } catch {
    /* */
  }

  await BackgroundFetch.registerTaskAsync(WHEELSENSE_BACKGROUND_RUNTIME_TASK, {
    minimumInterval: 10 * 60,
    stopOnTerminate: false,
    startOnBoot: true,
  });
  console.log('[Background] BackgroundFetch registered');
}

export async function unregisterBackgroundFetchTask(): Promise<void> {
  for (const name of [WHEELSENSE_BACKGROUND_RUNTIME_TASK, LEGACY_BLE_SCAN_TASK]) {
    try {
      await BackgroundFetch.unregisterTaskAsync(name);
    } catch {
      /* */
    }
  }
}

export async function registerExpoProcessingTask(): Promise<void> {
  defineWheelSenseBackgroundTasks();
  const BackgroundTask = await import('expo-background-task');
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    console.warn('[Background] expo-background-task unavailable (e.g. Expo Go or web)');
    return;
  }
  try {
    await BackgroundTask.unregisterTaskAsync(WHEELSENSE_BG_TASK);
  } catch {
    /* */
  }
  await BackgroundTask.registerTaskAsync(WHEELSENSE_BG_TASK, {
    minimumInterval: 15,
  });
  console.log('[Background] expo-background-task registered (min 15 min)');
}

export async function unregisterExpoProcessingTask(): Promise<void> {
  try {
    const BackgroundTask = await import('expo-background-task');
    await BackgroundTask.unregisterTaskAsync(WHEELSENSE_BG_TASK);
  } catch {
    /* */
  }
}

export async function unregisterAllBackgroundInfrastructure(): Promise<void> {
  await unregisterBackgroundFetchTask();
  await unregisterExpoProcessingTask();
  const { stopAndroidForegroundMonitoring } = await import('./ForegroundMonitoringService');
  await stopAndroidForegroundMonitoring();
}

export async function syncRegisteredBackgroundTaskWithSettings(): Promise<void> {
  const enabled = !!useAppStore.getState().settings.backgroundMonitoringEnabled;
  if (!enabled) {
    await unregisterAllBackgroundInfrastructure();
    return;
  }

  defineWheelSenseBackgroundTasks();

  if (Platform.OS === 'android' && !isExpoGo()) {
    await unregisterBackgroundFetchTask();
    await unregisterExpoProcessingTask();
    const { startAndroidForegroundMonitoring } = await import('./ForegroundMonitoringService');
    await startAndroidForegroundMonitoring();
  } else {
    const { stopAndroidForegroundMonitoring } = await import('./ForegroundMonitoringService');
    await stopAndroidForegroundMonitoring();
    await registerBackgroundFetchTask();
    await registerExpoProcessingTask();
  }
}

export function setBackgroundMonitoringEnabled(enabled: boolean): void {
  useAppStore.getState().updateSettings({ backgroundMonitoringEnabled: enabled });
}

/** @deprecated Prefer syncRegisteredBackgroundTaskWithSettings */
export async function registerWheelSenseBackgroundMonitoring(): Promise<void> {
  await syncRegisteredBackgroundTaskWithSettings();
}

/** @deprecated Prefer unregisterAllBackgroundInfrastructure */
export async function unregisterWheelSenseBackgroundMonitoring(): Promise<void> {
  await unregisterAllBackgroundInfrastructure();
}
