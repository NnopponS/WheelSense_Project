/**
 * WheelSense Mobile App - WebView Screen
 * Full-screen WebView for embedded frontend access
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { WebAppView } from '../components/WebAppView';

type WebViewScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WebView'>;
};

export const WebViewScreen: React.FC<WebViewScreenProps> = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <WebAppView
        onError={(error) => {
          console.error('[WebViewScreen] Error:', error);
        }}
        onLoadStart={() => {
          console.log('[WebViewScreen] Loading started');
        }}
        onLoadEnd={() => {
          console.log('[WebViewScreen] Loading completed');
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});

export default WebViewScreen;
