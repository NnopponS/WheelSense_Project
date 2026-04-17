/**
 * BackgroundFetch task entry — delegates to shared monitoring cycle.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import { useAppStore } from '../store/useAppStore';
import { mqttService } from './MQTTService';
import { runDeferredMonitoringSync } from './monitoringCycle';

export async function runBackgroundRuntimeTick(): Promise<BackgroundFetch.BackgroundFetchResult> {
  try {
    if (!useAppStore.getState().settings.backgroundMonitoringEnabled) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }
    if (!mqttService.isNativeModuleAvailable()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await runDeferredMonitoringSync();
    mqttService.stopTelemetryLoop();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (e) {
    console.error('[BackgroundFetch] Tick failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}
