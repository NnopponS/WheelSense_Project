/**
 * WheelSense Mobile App - WebView Component
 * Embeds the WheelSense web frontend with seamless authentication
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useAppStore } from '../store/useAppStore';
import { useBLEScanner } from '../services/BLEScanner';
import { usePolar } from '../services/PolarService';

// ==================== INTERFACES ====================

interface WebAppViewProps {
  serverUrl?: string;
  onError?: (error: any) => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

interface WebViewMessage {
  type: string;
  payload?: any;
}

// ==================== WEBVIEW COMPONENT ====================

const USER_AGENT = 'WheelSenseMobileApp/1.0';

export const WebAppView: React.FC<WebAppViewProps> = ({
  serverUrl,
  onError,
  onLoadStart,
  onLoadEnd,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  
  const store = useAppStore();
  const bleScanner = useBLEScanner();
  const polar = usePolar();
  
  const baseUrl = serverUrl || store.settings.serverUrl;
  const authToken = store.authToken;

  // ==================== INJECTED JAVASCRIPT ====================

  const injectedJavaScript = `
    (function() {
      // Mark as mobile app
      window.__WHEELSENSE_MOBILE__ = true;
      window.__WHEELSENSE_MOBILE_VERSION__ = '1.0.0';
      
      // Inject auth token for seamless login
      ${authToken ? `window.__WHEELSENSE_AUTH_TOKEN__ = '${authToken}';` : ''}
      
      // Mobile app bridge
      window.WheelSenseMobile = {
        // Request BLE scan
        requestBLEScan: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'REQUEST_BLE_SCAN'
          }));
        },
        
        // Connect to Polar
        connectPolar: function(deviceId) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CONNECT_POLAR',
            payload: { deviceId }
          }));
        },
        
        // Disconnect Polar
        disconnectPolar: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DISCONNECT_POLAR'
          }));
        },
        
        // Start HR streaming
        startHRStreaming: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'START_HR_STREAMING'
          }));
        },
        
        // Stop HR streaming
        stopHRStreaming: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'STOP_HR_STREAMING'
          }));
        },
        
        // Get device info
        getDeviceInfo: function() {
          return {
            platform: '${store.appMode}',
            version: '1.0.0',
            deviceId: '${store.user?.id || 'unknown'}'
          };
        },
        
        // Navigate to screen
        navigate: function(path) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'NAVIGATE',
            payload: { path }
          }));
        }
      };
      
      // Listen for messages from React Native
      window.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          
          // Dispatch custom event for web app
          const customEvent = new CustomEvent('wheelsense-mobile-message', {
            detail: data
          });
          window.dispatchEvent(customEvent);
        } catch (e) {
          console.error('Failed to parse mobile message:', e);
        }
      });
      
      // Notify when page is ready
      window.addEventListener('load', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_LOADED',
          payload: { url: window.location.href }
        }));
      });
      
      // Override console.log to send to React Native
      const originalLog = console.log;
      console.log = function(...args) {
        originalLog.apply(console, args);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CONSOLE_LOG',
          payload: { args: args.map(a => String(a)) }
        }));
      };
      
      true;
    })();
  `;

  // ==================== MESSAGE HANDLING ====================

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message: WebViewMessage = JSON.parse(event.nativeEvent.data);
      console.log('[WebView] Message from web:', message.type);

      switch (message.type) {
        case 'REQUEST_BLE_SCAN':
          handleBLEScanRequest();
          break;
          
        case 'CONNECT_POLAR':
          if (message.payload?.deviceId) {
            polar.connect(message.payload.deviceId);
          }
          break;
          
        case 'DISCONNECT_POLAR':
          polar.disconnect();
          break;
          
        case 'START_HR_STREAMING':
          polar.startHR();
          break;
          
        case 'STOP_HR_STREAMING':
          polar.stopHR();
          break;
          
        case 'NAVIGATE':
          // Handle navigation requests from web app
          console.log('[WebView] Navigate request:', message.payload);
          break;
          
        case 'PAGE_LOADED':
          setIsLoading(false);
          onLoadEnd?.();
          break;
          
        case 'CONSOLE_LOG':
          // Forward console logs from webview
          console.log('[WebView Console]:', ...(message.payload?.args || []));
          break;
          
        default:
          console.log('[WebView] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[WebView] Failed to handle message:', error);
    }
  }, [bleScanner, polar, onLoadEnd]);

  const handleBLEScanRequest = useCallback(async () => {
    try {
      await bleScanner.startScanning();
      
      // Wait for scan to complete
      setTimeout(() => {
        const beacons = useAppStore.getState().detectedBeacons;
        
        // Send results back to webview
        webViewRef.current?.postMessage(JSON.stringify({
          type: 'BLE_SCAN_RESULTS',
          payload: { beacons }
        }));
        
        bleScanner.stopScanning();
      }, 5000);
    } catch (error) {
      console.error('[WebView] BLE scan failed:', error);
      
      webViewRef.current?.postMessage(JSON.stringify({
        type: 'BLE_SCAN_ERROR',
        payload: { error: String(error) }
      }));
    }
  }, [bleScanner]);

  // ==================== EVENT HANDLERS ====================

  const handleLoadStart = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    onLoadStart?.();
  }, [onLoadStart]);

  const handleLoadEnd = useCallback(() => {
    // Loading state is set by PAGE_LOADED message
  }, []);

  const handleError = useCallback((error: any) => {
    console.error('[WebView] Load error:', error);
    setLoadError('Failed to load WheelSense. Please check your connection.');
    setIsLoading(false);
    onError?.(error);
  }, [onError]);

  const handleNavigationStateChange = useCallback((navState: any) => {
    setCanGoBack(navState.canGoBack);
  }, []);

  // ==================== PUBLIC METHODS ====================

  const goBack = useCallback(() => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    }
  }, [canGoBack]);

  const reload = useCallback(() => {
    setLoadError(null);
    webViewRef.current?.reload();
  }, []);

  const postMessage = useCallback((message: any) => {
    webViewRef.current?.postMessage(JSON.stringify(message));
  }, []);

  // ==================== RENDER ====================

  if (loadError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" />
        <Text style={styles.errorTitle}>Connection Error</Text>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={reload}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <WebView
        ref={webViewRef}
        source={{ uri: baseUrl }}
        userAgent={USER_AGENT}
        injectedJavaScript={injectedJavaScript}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onNavigationStateChange={handleNavigationStateChange}
        
        // Configuration
        javaScriptEnabled={true}
        domStorageEnabled={true}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        
        // Performance
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        
        // UI
        pullToRefreshEnabled={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        
        // Security
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        
        // Debugging
        webviewDebuggingEnabled={__DEV__}
      />
      
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0052cc" />
          <Text style={styles.loadingText}>Loading WheelSense...</Text>
        </View>
      )}
    </View>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#0052cc',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default WebAppView;
