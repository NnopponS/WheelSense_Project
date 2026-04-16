/**
 * WheelSense Mobile App - Device Screen
 * BLE device management and Polar connection
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { usePolar, useBeacons, useAppStore } from '../store/useAppStore';
import { Polar as PolarService } from '../services/PolarService';
import { BLEScanner } from '../services/BLEScanner';
import { PolarDevice, BLEBeacon } from '../types';

type DeviceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Devices'>;
};

export const DeviceScreen: React.FC<DeviceScreenProps> = ({ navigation }) => {
  const polar = usePolar();
  const beacons = useBeacons();
  const settings = useAppStore((state) => state.settings);
  
  const [isScanningPolar, setIsScanningPolar] = useState(false);
  const [foundPolarDevices, setFoundPolarDevices] = useState<PolarDevice[]>([]);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);

  // Polar device discovery
  const scanForPolarDevices = async () => {
    if (!PolarService.isAvailable()) {
      Alert.alert('Error', 'Polar SDK is not available on this device');
      return;
    }

    setIsScanningPolar(true);
    setFoundPolarDevices([]);

    try {
      await PolarService.searchForDevice();
      
      // Wait for devices to be found (simulated - in real app, listen to discovery events)
      setTimeout(() => {
        setIsScanningPolar(false);
      }, 10000);
    } catch (error) {
      console.error('[DeviceScreen] Polar scan failed:', error);
      setIsScanningPolar(false);
      Alert.alert('Error', 'Failed to scan for Polar devices');
    }
  };

  const connectToPolar = async (deviceId: string) => {
    setConnectingDeviceId(deviceId);
    
    try {
      await PolarService.connect(deviceId);
      Alert.alert('Success', 'Connected to Polar device');
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Failed to connect');
    } finally {
      setConnectingDeviceId(null);
    }
  };

  const disconnectPolar = async () => {
    try {
      await PolarService.disconnect();
      Alert.alert('Disconnected', 'Polar device disconnected');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to disconnect');
    }
  };

  const startHR = async () => {
    try {
      await PolarService.startHRStreaming();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const stopHR = async () => {
    await PolarService.stopHRStreaming();
  };

  const startPPG = async () => {
    try {
      await PolarService.startPPGStreaming();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const stopPPG = async () => {
    await PolarService.stopPPGStreaming();
  };

  const renderBeaconItem = ({ item }: { item: BLEBeacon }) => (
    <View style={styles.beaconItem}>
      <View style={styles.beaconInfo}>
        <Text style={styles.beaconName}>{item.nodeKey}</Text>
        <Text style={styles.beaconMac}>{item.mac}</Text>
      </View>
      <View style={styles.beaconSignal}>
        <Text style={[
          styles.beaconRssi,
          item.rssi > -70 && styles.signalStrong,
          item.rssi > -85 && item.rssi <= -70 && styles.signalMedium,
          item.rssi <= -85 && styles.signalWeak,
        ]}>
          {item.rssi} dBm
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <FlatList
        ListHeaderComponent={(
          <>
            {/* Polar Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Polar Verity Sense</Text>
              
              {!polar.isAvailable ? (
                <View style={styles.unavailableCard}>
                  <Text style={styles.unavailableText}>
                    Polar SDK not available
                  </Text>
                </View>
              ) : polar.isConnected ? (
                <View style={styles.connectedCard}>
                  <View style={styles.deviceHeader}>
                    <Text style={styles.deviceName}>
                      {polar.device?.name || 'Polar Device'}
                    </Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>Connected</Text>
                    </View>
                  </View>
                  
                  {polar.device?.batteryLevel !== undefined && (
                    <Text style={styles.batteryText}>
                      Battery: {polar.device.batteryLevel}%
                    </Text>
                  )}
                  
                  {polar.lastHR && (
                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Heart Rate:</Text>
                      <Text style={styles.metricValue}>{polar.lastHR.bpm} BPM</Text>
                    </View>
                  )}
                  
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.startButton]}
                      onPress={startHR}
                    >
                      <Text style={styles.buttonText}>Start HR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.stopButton]}
                      onPress={stopHR}
                    >
                      <Text style={styles.buttonText}>Stop HR</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.startButton]}
                      onPress={startPPG}
                    >
                      <Text style={styles.buttonText}>Start PPG</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.stopButton]}
                      onPress={stopPPG}
                    >
                      <Text style={styles.buttonText}>Stop PPG</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity
                    style={[styles.disconnectButton]}
                    onPress={disconnectPolar}
                  >
                    <Text style={styles.disconnectButtonText}>Disconnect</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.scanSection}>
                  <TouchableOpacity
                    style={styles.scanButton}
                    onPress={scanForPolarDevices}
                    disabled={isScanningPolar}
                  >
                    {isScanningPolar ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.scanButtonText}>
                        Scan for Polar Devices
                      </Text>
                    )}
                  </TouchableOpacity>
                  
                  {foundPolarDevices.length > 0 && (
                    <View style={styles.deviceList}>
                      <Text style={styles.listTitle}>Found Devices:</Text>
                      {foundPolarDevices.map((device) => (
                        <TouchableOpacity
                          key={device.deviceId}
                          style={styles.deviceItem}
                          onPress={() => connectToPolar(device.deviceId)}
                          disabled={connectingDeviceId === device.deviceId}
                        >
                          <Text style={styles.deviceItemName}>{device.name}</Text>
                          {connectingDeviceId === device.deviceId && (
                            <ActivityIndicator size="small" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* BLE Beacons Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>BLE Beacons</Text>
                <TouchableOpacity
                  style={styles.scanBeaconButton}
                  onPress={() => BLEScanner.startScanning()}
                  disabled={beacons.isScanningBeacons}
                >
                  <Text style={styles.scanBeaconText}>
                    {beacons.isScanningBeacons ? 'Scanning...' : 'Scan'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              {beacons.detectedBeacons.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No beacons detected. Tap Scan to search.
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        )}
        data={beacons.detectedBeacons.sort((a, b) => b.rssi - a.rssi)}
        keyExtractor={(item) => item.nodeKey}
        renderItem={renderBeaconItem}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  unavailableCard: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
  },
  unavailableText: {
    color: '#c62828',
    textAlign: 'center',
  },
  connectedCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  batteryText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  metricLabel: {
    fontSize: 14,
    color: '#666',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e53935',
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#4caf50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  disconnectButton: {
    backgroundColor: '#757575',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  disconnectButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  scanSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
  },
  scanButton: {
    backgroundColor: '#0052cc',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceList: {
    marginTop: 16,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  deviceItemName: {
    fontSize: 14,
    color: '#333',
  },
  scanBeaconButton: {
    backgroundColor: '#0052cc',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  scanBeaconText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
  },
  beaconItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  beaconInfo: {
    flex: 1,
  },
  beaconName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  beaconMac: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  beaconSignal: {
    alignItems: 'flex-end',
  },
  beaconRssi: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  signalStrong: {
    color: '#4caf50',
  },
  signalMedium: {
    color: '#ff9800',
  },
  signalWeak: {
    color: '#f44336',
  },
});

export default DeviceScreen;
