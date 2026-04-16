import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules } from 'react-native';

/** True when running inside the Expo Go app from the store (no custom native modules). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** `sp-react-native-mqtt` native bridge (`NativeModules.Mqtt`). Missing in Expo Go. */
export function isMqttNativeAvailable(): boolean {
  return NativeModules.Mqtt != null;
}
