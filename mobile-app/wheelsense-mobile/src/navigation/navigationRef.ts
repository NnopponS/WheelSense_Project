import { createNavigationContainerRef } from '@react-navigation/native';

export type RootStackParamList = {
  Setup: undefined;
  Home: undefined;
  WebView: { path?: string } | undefined;
  Devices: undefined;
  Settings: undefined;
  WalkSteps: undefined;
  PolarHealth: undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
