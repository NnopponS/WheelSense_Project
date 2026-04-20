/**
 * WheelSense Mobile App - Home Screen
 * Main dashboard with quick actions and status overview
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAppStore, useAuth, usePolar, useBeacons, useAppMode } from '../store/useAppStore';
import { useAPI } from '../services/APIService';
import { useNotifications } from '../services/NotificationService';
import { BLEScanner } from '../services/BLEScanner';
import { mqttService } from '../services/MQTTService';
import { Polar } from '../services/PolarService';
import { Alert as AlertType, WorkflowTask } from '../types';
import { GlobalSosButton } from '../components/GlobalSosButton';
import { alertsInboxUrl } from '../utils/alertsInboxUrl';

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { user, clearAuth } = useAuth();
  const polar = usePolar();
  const beacons = useBeacons();
  const { appMode, setAppMode } = useAppMode();
  const settings = useAppStore((state) => state.settings);
  
  const api = useAPI();
  const notifications = useNotifications();
  
  const [refreshing, setRefreshing] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<AlertType[]>([]);
  const [pendingTasks, setPendingTasks] = useState<WorkflowTask[]>([]);
  const [isMQTTConnected, setIsMQTTConnected] = useState(false);

  // Role-aware landing: navigate to WebView with role-specific path
  useEffect(() => {
    if (user?.role) {
      const landingPath = alertsInboxUrl(user.role as any);
      navigation.navigate('WebView', { path: landingPath });
    }
  }, [user?.role]);

  // Initialize services on mount
  useEffect(() => {
    initializeServices();
    
    return () => {
      // Cleanup
      BLEScanner.stopScanning();
      Polar.disconnect();
      MQTT.disconnect();
    };
  }, []);

  // Periodic data refresh
  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const initializeServices = async () => {
    try {
      // Initialize notifications
      await notifications.initialize();
      
      // Connect to MQTT
      await MQTT.connect({
        host: settings.mqttBroker,
        port: settings.mqttPort,
        clientId: `mobile_${user?.id || Date.now()}`,
      });
      setIsMQTTConnected(true);
      
      // Start BLE scanning
      await BLEScanner.startScanning();
      
      // Load dashboard data
      loadDashboardData();
    } catch (error) {
      console.error('[Home] Service initialization failed:', error);
    }
  };

  const loadDashboardData = async () => {
    try {
      // Load active alerts
      const alerts = await api.getAlerts({ status: 'active' });
      setActiveAlerts(alerts.slice(0, 5)); // Top 5
      
      // Load pending tasks
      const tasks = await api.getTasks({ status: 'pending' });
      setPendingTasks(tasks.slice(0, 5));
    } catch (error) {
      console.error('[Home] Failed to load dashboard data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
          style: 'destructive',
          onPress: async () => {
            await api.logout();
            clearAuth();
          }
        },
      ]
    );
  };

  const toggleAppMode = () => {
    const newMode = appMode === 'wheelchair' ? 'walking' : 'wheelchair';
    setAppMode(newMode);
    Alert.alert(
      'Mode Changed',
      `Switched to ${newMode === 'wheelchair' ? 'Wheelchair' : 'Walking'} mode`
    );
  };

  const getRoleDisplayName = (role: string) => {
    const names: Record<string, string> = {
      admin: 'Administrator',
      head_nurse: 'Head Nurse',
      supervisor: 'Supervisor',
      observer: 'Observer',
      patient: 'Patient',
    };
    return names[role] || role;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <GlobalSosButton />
      
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.username}</Text>
          <Text style={styles.role}>{getRoleDisplayName(user?.role || '')}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Status Cards */}
        <View style={styles.statusGrid}>
          {/* MQTT Status */}
          <View style={[styles.statusCard, isMQTTConnected && styles.statusCardActive]}>
            <Text style={styles.statusIcon}>📡</Text>
            <Text style={styles.statusLabel}>MQTT</Text>
            <Text style={[styles.statusValue, isMQTTConnected && styles.statusValueActive]}>
              {isMQTTConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>

          {/* BLE Status */}
          <View style={[styles.statusCard, beacons.isScanningBeacons && styles.statusCardActive]}>
            <Text style={styles.statusIcon}>📶</Text>
            <Text style={styles.statusLabel}>BLE Scan</Text>
            <Text style={[styles.statusValue, beacons.isScanningBeacons && styles.statusValueActive]}>
              {beacons.isScanningBeacons ? 'Scanning' : 'Idle'}
            </Text>
            {beacons.closestBeacon && (
              <Text style={styles.beaconInfo}>
                {beacons.closestBeacon.nodeKey} ({beacons.closestBeacon.rssi}dBm)
              </Text>
            )}
          </View>

          {/* Polar Status */}
          <View style={[styles.statusCard, polar.isConnected && styles.statusCardActive]}>
            <Text style={styles.statusIcon}>❤️</Text>
            <Text style={styles.statusLabel}>Polar</Text>
            <Text style={[styles.statusValue, polar.isConnected && styles.statusValueActive]}>
              {polar.isConnected ? 'Connected' : 'Disconnected'}
            </Text>
            {polar.lastHR && (
              <Text style={styles.hrValue}>{polar.lastHR.bpm} BPM</Text>
            )}
          </View>

          {/* App Mode */}
          <TouchableOpacity 
            style={[styles.statusCard, styles.modeCard]}
            onPress={toggleAppMode}
          >
            <Text style={styles.statusIcon}>
              {appMode === 'wheelchair' ? '🦽' : '🚶'}
            </Text>
            <Text style={styles.statusLabel}>Mode</Text>
            <Text style={styles.statusValue}>
              {appMode === 'wheelchair' ? 'Wheelchair' : 'Walking'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('WebView')}
            >
              <Text style={styles.actionIcon}>🌐</Text>
              <Text style={styles.actionText}>Web Portal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('Devices')}
            >
              <Text style={styles.actionIcon}>📱</Text>
              <Text style={styles.actionText}>Devices</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => BLEScanner.startScanning()}
            >
              <Text style={styles.actionIcon}>📡</Text>
              <Text style={styles.actionText}>Scan Beacons</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.actionIcon}>⚙️</Text>
              <Text style={styles.actionText}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Active Alerts ({activeAlerts.length})
            </Text>
            {activeAlerts.map((alert) => (
              <TouchableOpacity
                key={alert.id}
                style={[
                  styles.alertCard,
                  alert.severity === 'critical' && styles.alertCritical,
                  alert.severity === 'high' && styles.alertHigh,
                ]}
                onPress={() => navigation.navigate('AlertDetail', { alertId: alert.id })}
              >
                <Text style={styles.alertTitle}>{alert.title}</Text>
                <Text style={styles.alertMeta}>
                  {alert.patient?.first_name} • {alert.severity}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Pending Tasks */}
        {pendingTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Pending Tasks ({pendingTasks.length})
            </Text>
            {pendingTasks.map((task) => (
              <View key={task.id} style={styles.taskCard}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                {task.patient && (
                  <Text style={styles.taskMeta}>
                    For: {task.patient.first_name} {task.patient.last_name}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Detected Beacons */}
        {beacons.detectedBeacons.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Nearby Beacons ({beacons.detectedBeacons.length})
            </Text>
            {beacons.detectedBeacons
              .sort((a, b) => b.rssi - a.rssi)
              .slice(0, 5)
              .map((beacon) => (
                <View key={beacon.nodeKey} style={styles.beaconRow}>
                  <Text style={styles.beaconName}>{beacon.nodeKey}</Text>
                  <Text style={styles.beaconRssi}>{beacon.rssi} dBm</Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#0052cc',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  role: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  statusCard: {
    width: '50%',
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  statusCardActive: {
    borderColor: '#0052cc',
    backgroundColor: '#f0f7ff',
  },
  modeCard: {
    backgroundColor: '#fff8e1',
  },
  statusIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  statusValueActive: {
    color: '#0052cc',
  },
  beaconInfo: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  hrValue: {
    fontSize: 11,
    color: '#e53935',
    fontWeight: '600',
    marginTop: 2,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  actionButton: {
    width: '25%',
    padding: 4,
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  alertCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  alertCritical: {
    borderLeftColor: '#f44336',
    backgroundColor: '#ffebee',
  },
  alertHigh: {
    borderLeftColor: '#ff9800',
    backgroundColor: '#fff3e0',
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  alertMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  taskCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0052cc',
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  taskMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  beaconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  beaconName: {
    fontSize: 14,
    color: '#333',
  },
  beaconRssi: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
  },
});

export default HomeScreen;
