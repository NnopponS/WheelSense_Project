/**
 * WheelSense Mobile App - Alert Detail Screen
 * Shows detailed alert information and actions
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useAPI } from '../services/APIService';
import { useAuth } from '../store/useAppStore';
import { Alert as AlertType } from '../types';

type AlertDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'AlertDetail'>;

export const AlertDetailScreen: React.FC<AlertDetailScreenProps> = ({ 
  route,
  navigation,
}) => {
  const { alertId } = route.params;
  const api = useAPI();
  const { user } = useAuth();
  
  const [alert, setAlert] = useState<AlertType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    loadAlert();
  }, [alertId]);

  const loadAlert = async () => {
    try {
      setIsLoading(true);
      const data = await api.getAlert(alertId);
      setAlert(data);
    } catch (error) {
      console.error('[AlertDetail] Failed to load alert:', error);
      Alert.alert('Error', 'Failed to load alert details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!alert) return;
    
    setIsProcessing(true);
    try {
      await api.acknowledgeAlert(alert.id);
      Alert.alert('Success', 'Alert acknowledged');
      loadAlert(); // Reload to get updated status
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to acknowledge alert');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolve = async () => {
    if (!alert) return;
    
    Alert.alert(
      'Resolve Alert',
      'Are you sure you want to resolve this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: async () => {
            setIsProcessing(true);
            try {
              await api.resolveAlert(alert.id);
              Alert.alert('Success', 'Alert resolved');
              loadAlert();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to resolve alert');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#f44336';
      case 'high':
        return '#ff9800';
      case 'medium':
        return '#ffc107';
      case 'low':
        return '#4caf50';
      default:
        return '#757575';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#f44336';
      case 'acknowledged':
        return '#ff9800';
      case 'resolved':
        return '#4caf50';
      default:
        return '#757575';
    }
  };

  const canAcknowledge = () => {
    return alert?.status === 'active' && 
      (user?.role === 'admin' || user?.role === 'head_nurse');
  };

  const canResolve = () => {
    return alert?.status !== 'resolved' &&
      (user?.role === 'admin' || user?.role === 'head_nurse');
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0052cc" />
          <Text style={styles.loadingText}>Loading alert...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!alert) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Alert not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView style={styles.scrollView}>
        {/* Alert Header */}
        <View style={styles.header}>
          <View style={[
            styles.severityBadge,
            { backgroundColor: getSeverityColor(alert.severity) }
          ]}>
            <Text style={styles.severityText}>
              {alert.severity.toUpperCase()}
            </Text>
          </View>
          <View style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(alert.status) }
          ]}>
            <Text style={styles.statusText}>
              {alert.status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Alert Title */}
        <View style={styles.titleSection}>
          <Text style={styles.alertTitle}>{alert.title}</Text>
          <Text style={styles.alertType}>{alert.type}</Text>
        </View>

        {/* Alert Description */}
        {alert.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{alert.description}</Text>
          </View>
        )}

        {/* Patient Info */}
        {alert.patient && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Patient</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>
                {alert.patient.first_name} {alert.patient.last_name}
              </Text>
            </View>
            {alert.patient.care_level && (
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>Care Level</Text>
                <Text style={styles.infoValue}>{alert.patient.care_level}</Text>
              </View>
            )}
          </View>
        )}

        {/* Room Info */}
        {alert.room && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Room</Text>
              <Text style={styles.infoValue}>{alert.room.name}</Text>
            </View>
          </View>
        )}

        {/* Timestamps */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Created</Text>
            <Text style={styles.infoValue}>
              {new Date(alert.created_at).toLocaleString()}
            </Text>
          </View>
          {alert.acknowledged_at && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Acknowledged</Text>
              <Text style={styles.infoValue}>
                {new Date(alert.acknowledged_at).toLocaleString()}
              </Text>
            </View>
          )}
          {alert.resolved_at && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Resolved</Text>
              <Text style={styles.infoValue}>
                {new Date(alert.resolved_at).toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        {(canAcknowledge() || canResolve()) && (
          <View style={styles.actionsSection}>
            {canAcknowledge() && (
              <TouchableOpacity
                style={[styles.actionButton, styles.acknowledgeButton]}
                onPress={handleAcknowledge}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>Acknowledge</Text>
                )}
              </TouchableOpacity>
            )}
            
            {canResolve() && (
              <TouchableOpacity
                style={[styles.actionButton, styles.resolveButton]}
                onPress={handleResolve}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>Resolve</Text>
                )}
              </TouchableOpacity>
            )}
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
  loadingContainer: {
    flex: 1,
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#0052cc',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  severityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  titleSection: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  alertType: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  infoCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  actionsSection: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  acknowledgeButton: {
    backgroundColor: '#ff9800',
  },
  resolveButton: {
    backgroundColor: '#4caf50',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AlertDetailScreen;
