/**
 * GlobalSosButton — a persistent floating SOS button for patient users.
 * Only visible when the authenticated user role is 'patient'.
 * Tapping it enqueues an sos_create_alert via OfflineQueue and the API.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { useAppStore, useAuth } from '../store/useAppStore';
import { useAPI } from '../services/APIService';
import { OfflineQueue } from '../services/OfflineQueue';

export const SOS_ALERT_TYPE = 'sos';
export const SOS_SEVERITY = 'high';

export const GlobalSosButton: React.FC = () => {
  const { user } = useAuth();
  const api = useAPI();
  const [isSending, setIsSending] = useState(false);

  const isPatient = user?.role === 'patient';
  const patientId = user?.linked_patient?.id ?? null;

  const handleSos = useCallback(async () => {
    if (isSending) return;
    if (!patientId) {
      Alert.alert('Error', 'No patient profile linked to this account.');
      return;
    }

    setIsSending(true);

    try {
      // Try online path first
      await api.createAlert({
        patient_id: patientId,
        alert_type: SOS_ALERT_TYPE,
        severity: SOS_SEVERITY,
        description: 'SOS triggered from mobile app',
      });

      // Announce for accessibility (Thai voice hint on Android)
      if (Platform.OS === 'android') {
        AccessibilityInfo.announceForAccessibility('ส่งคำขอช่วยเหลือฉุกเฉินแล้ว');
      }

      Alert.alert('SOS Sent', 'Emergency assistance request has been sent.');
    } catch (error) {
      // Offline fallback — queue the action
      await OfflineQueue.enqueue('sos_create_alert', {
        patient_id: patientId,
        description: 'SOS triggered from mobile app (offline)',
      });
      Alert.alert(
        'SOS Queued',
        'No connection right now. Your SOS will be sent when you are back online.',
      );
    } finally {
      setIsSending(false);
    }
  }, [api, isSending, patientId]);

  if (!isPatient) return null;

  return (
    <View style={styles.container} testID="global-sos-button">
      <TouchableOpacity
        style={[styles.button, isSending && styles.buttonDisabled]}
        onPress={handleSos}
        disabled={isSending}
        accessibilityRole="button"
        accessibilityLabel="SOS Emergency Help"
        accessibilityHint="แตะเพื่อขอความช่วยเหลือฉุกเฉิน"
      >
        <Text style={styles.text}>
          {isSending ? 'Sending...' : 'SOS'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 999,
  },
  button: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  buttonDisabled: {
    backgroundColor: '#991b1b',
    opacity: 0.7,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
