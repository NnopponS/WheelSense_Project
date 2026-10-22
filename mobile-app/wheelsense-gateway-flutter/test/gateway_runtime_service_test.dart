import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/ble_device_snapshot.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_config.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_runtime_snapshot.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_status.dart';
import 'package:wheelsense_gateway_flutter/models/mqtt_gateway_message.dart';
import 'package:wheelsense_gateway_flutter/models/sensor_telemetry.dart';
import 'package:wheelsense_gateway_flutter/services/ble_gateway_service.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_preferences_service.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_runtime_service.dart';
import 'package:wheelsense_gateway_flutter/services/mqtt_gateway_service.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_permission_service.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_notification_service.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_foreground_service.dart';

void main() {
  test(
    'Concurrent resume requests share startup and resume checks denied permissions without prompting again',
    () async {
      final permissions = _DeniedPermissions();
      final foreground = _CountingForeground();
      final runtime = GatewayRuntimeService(
        preferences: _MemoryGatewayPreferences(),
        permissions: permissions,
        foreground: foreground,
        notifications: _SilentNotifications(),
        mqtt: _UnavailableMqttGatewayService(),
      );
      await Future.wait([
        runtime.resumeGateway(requestPermissions: true),
        runtime.resumeGateway(requestPermissions: true),
      ]);
      expect(permissions.requests, 1);
      await runtime.resumeGateway();
      expect(permissions.requests, 1);
      expect(permissions.checks, 1);
      expect(foreground.starts, 0);
      expect(runtime.status.mqttReady, isFalse);
      await runtime.dispose();
    },
  );
  test('MQTT startup does not depend on BLE permission', () async {
    final runtime = GatewayRuntimeService(
      preferences: _MemoryGatewayPreferences(),
      permissions: _DeniedPermissions(),
      notifications: _SilentNotifications(),
      mqtt: _ConnectedMqttGatewayService(),
    );

    final status = await runtime.bootstrap(requestPermissions: false);

    expect(status.bleReady, isFalse);
    expect(status.mqttReady, isTrue);
    expect(status.mode, GatewayConnectionMode.idle);
    expect(status.message, isNot(contains('BLE permission')));
    await runtime.dispose();
  });
  test('applyMqttConfigUpdate stores retained portal URL', () {
    final config = GatewayConfig.defaults();

    final next = applyMqttConfigUpdate(config, <String, Object?>{
      'portal_base_url': 'https://demo.trycloudflare.com/',
      'linked_patient_id': 12,
      'alerts_enabled': true,
    });

    expect(next.portalBaseUrl, 'https://demo.trycloudflare.com');
    expect(next.mqttHost, config.mqttHost);
  });

  test('applyMqttConfigUpdate ignores unsafe portal URL', () {
    final config = GatewayConfig.defaults().copyWith(
      portalBaseUrl: 'https://current.trycloudflare.com',
    );

    final next = applyMqttConfigUpdate(config, <String, Object?>{
      'portal_base_url': 'javascript:alert(1)',
    });

    expect(next.portalBaseUrl, 'https://current.trycloudflare.com');
  });

  test('active M5 relay publishes with latest saved runtime config', () async {
    final preferences = _MemoryGatewayPreferences();
    final ble = _FakeBleGatewayService();
    final mqtt = _CapturingMqttGatewayService();
    final runtime = GatewayRuntimeService(
      preferences: preferences,
      ble: ble,
      mqtt: mqtt,
    );
    final initialConfig = GatewayConfig.defaults().copyWith(
      deviceId: 'MOBILE_OLD',
      setupCompleted: true,
    );
    final nextConfig = initialConfig.copyWith(deviceId: 'MOBILE_NEW');
    await runtime.saveConfig(initialConfig);

    await runtime.startM5TelemetryRelay(
      initialConfig,
      const BleDeviceSnapshot(
        id: 'M5_A',
        name: 'M5StickC Plus2',
        rssi: -48,
        serviceUuids: <String>[BleDeviceSnapshot.wheelSenseM5ServiceUuid],
      ),
    );
    await runtime.saveConfig(nextConfig);

    ble.emitM5('{"device_id":"M5_A","distance_m":1.2}');
    await Future<void>.delayed(Duration.zero);

    expect(mqtt.telemetryConfigs.single.deviceId, 'MOBILE_NEW');
    await runtime.dispose();
    await ble.close();
  });

  test('M5 live readings update before a slow MQTT publish completes', () async {
    final ble = _FakeBleGatewayService();
    final mqtt = _BlockingMqttGatewayService();
    final runtime = GatewayRuntimeService(
      preferences: _MemoryGatewayPreferences(),
      ble: ble,
      mqtt: mqtt,
    );
    final config = GatewayConfig.defaults();
    await runtime.startM5TelemetryRelay(
      config,
      const BleDeviceSnapshot(
        id: 'M5_A',
        name: 'Wheelchair sensor',
        rssi: -48,
        serviceUuids: <String>[BleDeviceSnapshot.wheelSenseM5ServiceUuid],
      ),
    );
    final liveReading = runtime.snapshots.firstWhere(
      (snapshot) => snapshot.latestM5Sample?.seq == 17,
    );

    ble.emitM5(
      '{"seq":17,"timestamp":"2026-10-19T12:00:00Z","motion":{"distance_m":42.0,"velocity_ms":1.2}}',
    );

    expect(
      (await liveReading.timeout(
        const Duration(seconds: 1),
      )).latestM5Sample?.distanceM,
      42.0,
    );
    mqtt.pending.complete(
      TelemetryPublishResult.sent(
        'WheelSense/mobile/${config.deviceId}/telemetry',
      ),
    );
    await runtime.dispose();
    await ble.close();
  });
}

class _UnavailableMqttGatewayService extends MqttGatewayService {
  @override
  Future<bool> connect(GatewayConfig config) async => false;
}

class _ConnectedMqttGatewayService extends MqttGatewayService {
  @override
  bool get isConnected => true;

  @override
  Future<bool> connect(GatewayConfig config) async => true;

  @override
  Stream<MqttGatewayMessage> subscribeStatus(GatewayConfig config) {
    return const Stream<MqttGatewayMessage>.empty();
  }
}

class _DeniedPermissions extends GatewayPermissionService {
  int requests = 0;
  int checks = 0;
  static const result = GatewayPermissionResult(
    bleGranted: false,
    notificationGranted: false,
    backgroundGranted: false,
    statuses: {},
  );
  @override
  Future<GatewayPermissionResult> requestRuntimePermissions() async {
    requests++;
    return result;
  }

  @override
  Future<GatewayPermissionResult> checkRuntimePermissions() async {
    checks++;
    return result;
  }
}

class _SilentNotifications extends GatewayNotificationService {
  @override
  Future<bool> initialize() async => true;
}

class _CountingForeground extends GatewayForegroundService {
  int starts = 0;
  @override
  Future<bool> start() async {
    starts++;
    return true;
  }

  @override
  Future<void> stop() async {}
}

class _MemoryGatewayPreferences extends GatewayPreferencesService {
  GatewayConfig _config = GatewayConfig.defaults();
  BleDeviceSnapshot? _m5;
  BleDeviceSnapshot? _polar;

  @override
  Future<GatewayConfig> loadConfig() async => _config;

  @override
  Future<void> saveConfig(GatewayConfig config) async {
    _config = config;
  }

  @override
  Future<void> savePairedM5Device(BleDeviceSnapshot device) async {
    _m5 = device;
  }

  @override
  Future<void> savePairedPolarDevice(BleDeviceSnapshot device) async {
    _polar = device;
  }

  @override
  Future<BleDeviceSnapshot?> loadPairedM5Device() async => _m5;

  @override
  Future<BleDeviceSnapshot?> loadPairedPolarDevice() async => _polar;

  @override
  Future<void> clearPairedM5Device() async {
    _m5 = null;
  }

  @override
  Future<void> clearPairedPolarDevice() async {
    _polar = null;
  }
}

class _FakeBleGatewayService implements BleGatewayService {
  final StreamController<String> _m5 = StreamController<String>.broadcast();

  @override
  Stream<BleDeviceSnapshot> scan(
    GatewayConfig config, {
    BleScanProfile profile = BleScanProfile.all,
  }) {
    return const Stream<BleDeviceSnapshot>.empty();
  }

  @override
  Stream<String> connectM5Telemetry({
    required GatewayConfig config,
    required String deviceId,
  }) {
    return _m5.stream;
  }

  @override
  Stream<PolarTelemetrySample> connectPolarHeartRate({
    required String deviceId,
  }) {
    return const Stream<PolarTelemetrySample>.empty();
  }

  @override
  Future<void> disconnectM5(String deviceId) async {}

  @override
  Future<void> writeM5Command({
    required GatewayConfig config,
    required String deviceId,
    required Map<String, Object?> payload,
  }) async {}

  @override
  Future<void> writeM5RoomConfig({
    required GatewayConfig config,
    required String deviceId,
    required Map<String, Object?> payload,
  }) async {}

  void emitM5(String payload) {
    _m5.add(payload);
  }

  Future<void> close() {
    return _m5.close();
  }

  @override
  Future<void> dispose() {
    return close();
  }
}

class _CapturingMqttGatewayService extends MqttGatewayService {
  final List<GatewayConfig> telemetryConfigs = <GatewayConfig>[];

  @override
  bool get isConnected => true;

  @override
  Stream<MqttGatewayMessage> subscribeStatus(GatewayConfig config) {
    return const Stream<MqttGatewayMessage>.empty();
  }

  @override
  Future<bool> publishRegistration({
    required GatewayConfig config,
    Map<String, Object?>? companionM5,
    Map<String, Object?>? companionPolar,
  }) async {
    return true;
  }

  @override
  Future<TelemetryPublishResult> publishTelemetry({
    required GatewayConfig config,
    required String payload,
  }) async {
    telemetryConfigs.add(config);
    return TelemetryPublishResult.sent(
      'WheelSense/mobile/${config.deviceId}/telemetry',
    );
  }
}

class _BlockingMqttGatewayService extends _CapturingMqttGatewayService {
  final Completer<TelemetryPublishResult> pending =
      Completer<TelemetryPublishResult>();

  @override
  Future<TelemetryPublishResult> publishTelemetry({
    required GatewayConfig config,
    required String payload,
  }) => pending.future;
}
