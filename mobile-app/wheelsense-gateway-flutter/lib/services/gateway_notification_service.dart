import 'dart:typed_data';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class GatewayNotificationService {
  GatewayNotificationService({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  static const String _channelId = 'wheelsense_gateway';
  static const String _channelName = 'WheelSense';
  static const String _channelDescription =
      'Gateway status, BLE, MQTT, and safety relay notifications.';
  static const String _alarmChannelId = 'wheelsense_fall_alarm';
  static const String _alarmChannelName = 'WheelSense Fall Alarm';
  static const String _alarmChannelDescription =
      'Fall-detection emergency alerts that sound until acknowledged.';
  static const int _fallAlarmNotificationId = 2001;

  final FlutterLocalNotificationsPlugin _plugin;
  bool _initialized = false;

  Future<bool> initialize() async {
    try {
      const androidSettings = AndroidInitializationSettings(
        '@mipmap/ic_launcher',
      );
      const iosSettings = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );
      const settings = InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
      );

      _initialized = await _plugin.initialize(settings: settings) ?? false;

      final android = _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >();
      await android?.createNotificationChannel(
        const AndroidNotificationChannel(
          _channelId,
          _channelName,
          description: _channelDescription,
          importance: Importance.high,
        ),
      );
      await android?.createNotificationChannel(
        const AndroidNotificationChannel(
          _alarmChannelId,
          _alarmChannelName,
          description: _alarmChannelDescription,
          importance: Importance.max,
          playSound: true,
          sound: RawResourceAndroidNotificationSound('fall_alarm'),
          enableVibration: true,
        ),
      );

      return _initialized;
    } on Object {
      _initialized = false;
      return false;
    }
  }

  Future<bool> requestPermission() async {
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    final ios = _plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >();

    final androidResult = await android?.requestNotificationsPermission();
    final iosResult = await ios?.requestPermissions(
      alert: true,
      badge: true,
      sound: true,
    );
    return androidResult ?? iosResult ?? true;
  }

  Future<void> showGatewayStatus({
    required String title,
    required String body,
  }) async {
    if (!_initialized) {
      await initialize();
    }

    const details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channelId,
        _channelName,
        channelDescription: _channelDescription,
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      ),
    );

    await _plugin.show(
      id: 1001,
      title: title,
      body: body,
      notificationDetails: details,
    );
  }

  /// Emergency fall alert — siren loops (FLAG_INSISTENT) until cancelled.
  Future<void> showFallAlarm({
    required String title,
    required String body,
  }) async {
    if (!_initialized) {
      await initialize();
    }

    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _alarmChannelId,
        _alarmChannelName,
        channelDescription: _alarmChannelDescription,
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.alarm,
        visibility: NotificationVisibility.public,
        sound: const RawResourceAndroidNotificationSound('fall_alarm'),
        audioAttributesUsage: AudioAttributesUsage.alarm,
        additionalFlags: Int32List.fromList(<int>[4]), // FLAG_INSISTENT
        ongoing: true,
        autoCancel: false,
        fullScreenIntent: true,
        enableVibration: true,
        vibrationPattern: Int64List.fromList(<int>[0, 400, 300, 400, 300, 400]),
      ),
      iOS: const DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
      ),
    );

    await _plugin.show(
      id: _fallAlarmNotificationId,
      title: title,
      body: body,
      notificationDetails: details,
    );
  }

  /// Stop the fall alarm — call when the alert is resolved anywhere.
  Future<void> cancelFallAlarm() async {
    if (!_initialized) {
      await initialize();
    }
    await _plugin.cancel(id: _fallAlarmNotificationId);
  }
}
