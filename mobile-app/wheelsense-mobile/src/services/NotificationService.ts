/**
 * WheelSense Mobile App - Push Notification Service
 * Handles push notifications for alerts and workflow updates
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { Alert, WorkflowTask, UserRole } from '../types';
import { alertsInboxUrl } from '../utils/alertsInboxUrl';

// ==================== NOTIFICATION CONFIG ====================

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ==================== NOTIFICATION SERVICE ====================

class NotificationService {
  private isInitialized = false;
  private notificationListener: any = null;
  private responseListener: any = null;

  // ==================== INITIALIZATION ====================

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    try {
      // Request permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('[Notifications] Permissions not granted');
        return false;
      }

      // Set up notification categories (for action buttons)
      await this.setNotificationCategories();

      // Set up listeners
      this.setupListeners();

      this.isInitialized = true;
      useAppStore.getState().setNotificationsEnabled(true);
      
      console.log('[Notifications] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[Notifications] Initialization failed:', error);
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      console.log('[Notifications] Must use physical device for push notifications');
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted');
      return false;
    }

    return true;
  }

  private async setNotificationCategories(): Promise<void> {
    // Define notification categories with action buttons
    await Notifications.setNotificationCategoryAsync('alert', [
      {
        identifier: 'acknowledge',
        buttonTitle: 'Acknowledge',
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
        },
      },
      {
        identifier: 'view',
        buttonTitle: 'View Details',
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
          opensAppToForeground: true,
        },
      },
    ]);

    await Notifications.setNotificationCategoryAsync('task', [
      {
        identifier: 'complete',
        buttonTitle: 'Mark Complete',
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
        },
      },
      {
        identifier: 'view',
        buttonTitle: 'View Task',
        options: {
          opensAppToForeground: true,
        },
      },
    ]);
  }

  private setupListeners(): void {
    // Listen for incoming notifications
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Notifications] Received:', notification);
        this.handleNotification(notification);
      }
    );

    // Listen for user interactions with notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Notifications] Response:', response);
        this.handleNotificationResponse(response);
      }
    );
  }

  // ==================== NOTIFICATION HANDLERS ====================

  private handleNotification(notification: Notifications.Notification): void {
    const data = notification.request.content.data;
    
    // Update badge count
    if (data?.type === 'alert') {
      // Increment badge for alerts
      this.incrementBadge();
    }
  }

  private handleNotificationResponse(
    response: Notifications.NotificationResponse
  ): void {
    const { actionIdentifier, notification } = response;
    const data = notification.request.content.data;

    switch (actionIdentifier) {
      case 'acknowledge':
        if (data?.alertId) {
          this.handleAcknowledgeAlert(data.alertId);
        }
        break;
      case 'complete':
        if (data?.taskId) {
          this.handleCompleteTask(data.taskId);
        }
        break;
      case 'view':
      case Notifications.DEFAULT_ACTION_IDENTIFIER:
        // Navigate to appropriate screen
        this.handleNavigateToDetail(data);
        break;
      case 'dismiss':
        // Just dismiss the notification
        break;
    }
  }

  private async handleAcknowledgeAlert(alertId: number): Promise<void> {
    try {
      const { API } = await import('./APIService');
      await API.acknowledgeAlert(alertId);
      console.log('[Notifications] Alert acknowledged:', alertId);
    } catch (error) {
      console.error('[Notifications] Failed to acknowledge alert:', error);
    }
  }

  private async handleCompleteTask(taskId: number): Promise<void> {
    try {
      const { API } = await import('./APIService');
      await API.updateTask(taskId, { status: 'completed' });
      console.log('[Notifications] Task completed:', taskId);
    } catch (error) {
      console.error('[Notifications] Failed to complete task:', error);
    }
  }

  private handleNavigateToDetail(data: any): void {
    const store = useAppStore.getState();
    const role = (store.user?.role || 'observer') as UserRole;
    const alertId = data?.alertId as number | undefined;
    const path = alertsInboxUrl(role, alertId);

    // Store navigation intent for WebView deep-link
    console.log('[Notifications] Deep-link to:', path);
    // The WebView component reads this to navigate after app opens
    useAppStore.setState({ pendingDeepLink: path });
  }

  // ==================== SCHEDULE NOTIFICATIONS ====================

  async scheduleAlertNotification(alert: Alert): Promise<void> {
    const title = `🚨 ${alert.severity.toUpperCase()}: ${alert.title}`;
    const body = alert.description || `Alert for ${alert.patient?.first_name || 'Unknown Patient'}`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'alert',
          alertId: alert.id,
          patientId: alert.patient_id,
          roomId: alert.room_id,
          severity: alert.severity,
        },
        categoryIdentifier: 'alert',
        priority: alert.severity === 'critical' ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Show immediately
    });
  }

  async scheduleTaskNotification(task: WorkflowTask): Promise<void> {
    const title = `📋 Task: ${task.title}`;
    const body = task.description || `Assigned to you for ${task.patient?.first_name || 'Unknown Patient'}`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: 'task',
          taskId: task.id,
          patientId: task.patient_id,
        },
        categoryIdentifier: 'task',
      },
      trigger: null,
    });
  }

  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, any>,
    delaySeconds?: number
  ): Promise<string> {
    const trigger = delaySeconds
      ? { seconds: delaySeconds }
      : null;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger,
    });

    return identifier;
  }

  // ==================== BADGE MANAGEMENT ====================

  async incrementBadge(): Promise<void> {
    const currentCount = await Notifications.getBadgeCountAsync();
    await Notifications.setBadgeCountAsync(currentCount + 1);
  }

  async decrementBadge(): Promise<void> {
    const currentCount = await Notifications.getBadgeCountAsync();
    if (currentCount > 0) {
      await Notifications.setBadgeCountAsync(currentCount - 1);
    }
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  // ==================== CANCEL NOTIFICATIONS ====================

  async cancelNotification(identifier: string): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await this.clearBadge();
  }

  // ==================== GET PUSH TOKEN ====================

  async getPushToken(): Promise<string | null> {
    try {
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'wheelsense-mobile-project',
      });
      return token.data;
    } catch (error) {
      console.error('[Notifications] Failed to get push token:', error);
      return null;
    }
  }

  // ==================== CLEANUP ====================

  cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }

    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }

    this.isInitialized = false;
  }
}

// ==================== SINGLETON INSTANCE ====================

export const NotificationManager = new NotificationService();

// ==================== HOOK ====================

export function useNotifications() {
  const store = useAppStore();
  
  return {
    isEnabled: store.notificationsEnabled,
    initialize: () => NotificationManager.initialize(),
    scheduleAlert: (alert: Alert) => NotificationManager.scheduleAlertNotification(alert),
    scheduleTask: (task: WorkflowTask) => NotificationManager.scheduleTaskNotification(task),
    cancelAll: () => NotificationManager.cancelAllNotifications(),
    clearBadge: () => NotificationManager.clearBadge(),
    getPushToken: () => NotificationManager.getPushToken(),
  };
}
