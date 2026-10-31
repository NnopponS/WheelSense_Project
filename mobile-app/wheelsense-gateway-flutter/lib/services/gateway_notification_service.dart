import 'dart:typed_data';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class GatewayNotificationService {
  GatewayNotificationService({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  static const String _channelId = 'wheelsense_gateway';
  static const String _channelName = 'WheelSense';
  static const String _channelDescription =
      'Gateway status, BLE, MQTT, and safety relay notifications.';
  static const String _fallChannelId = 'wheelsense_fall_alert';
  static const String _fallChannelName = 'WheelSense Fall Alerts';
  static const String _fallChannelDescription =
      'Fall detection alarms from the M5 belt device.';
  static const int _fallNotificationId = 2002;

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
          _fallChannelId,
          _fallChannelName,
          description: _fallChannelDescription,
          importance: Importance.max,
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

  Future<void> showFallAlert({
    required String title,
    required String body,
    bool ongoing = false,
  }) async {
    if (!_initialized) {
      await initialize();
    }

    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _fallChannelId,
        _fallChannelName,
        channelDescription: _fallChannelDescription,
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.alarm,
        fullScreenIntent: true,
        enableVibration: true,
        vibrationPattern: Int64List.fromList(<int>[
          0,
          400,
          200,
          400,
          200,
          800,
        ]),
        ongoing: ongoing,
        autoCancel: !ongoing,
        playSound: true,
        enableLights: true,
      ),
      iOS: const DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        interruptionLevel: InterruptionLevel.active,
      ),
    );

    await _plugin.show(
      id: _fallNotificationId,
      title: title,
      body: body,
      notificationDetails: details,
    );
  }

  Future<void> cancelFallAlertNotification() {
    return _plugin.cancel(id: _fallNotificationId);
  }
}
