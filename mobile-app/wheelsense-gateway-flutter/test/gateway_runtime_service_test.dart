import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/ble_device_snapshot.dart';
import 'package:wheelsense_gateway_flutter/models/fall_alert_event.dart';
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
  _fallTests();

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

  test('belt and wheelchair M5s relay independently on one phone', () async {
    final ble = _FakeBleGatewayService();
    final mqtt = _CapturingMqttGatewayService();
    final runtime = GatewayRuntimeService(
      preferences: _MemoryGatewayPreferences(),
      ble: ble,
      mqtt: mqtt,
    );
    final config = GatewayConfig.defaults().copyWith(setupCompleted: true);
    const belt = BleDeviceSnapshot(
      id: 'BELT_1',
      name: 'FallGuard Belt',
      rssi: -50,
      serviceUuids: <String>[BleDeviceSnapshot.wheelSenseM5ServiceUuid],
    );
    const wheel = BleDeviceSnapshot(
      id: 'WHEEL_1',
      name: 'Wheel M5',
      rssi: -52,
      serviceUuids: <String>[BleDeviceSnapshot.wheelSenseM5ServiceUuid],
    );

    await runtime.startM5TelemetryRelay(
      config,
      belt,
      slot: M5DeviceSlot.belt,
    );
    await runtime.startM5TelemetryRelay(
      config,
      wheel,
      slot: M5DeviceSlot.wheelchair,
    );

    expect(runtime.isM5RelayActive, isTrue);
    expect(runtime.isM5RelayActiveFor('BELT_1'), isTrue);
    expect(runtime.isM5RelayActiveFor('WHEEL_1'), isTrue);
    expect(runtime.snapshot.pairedBeltM5Device?.id, 'BELT_1');
    expect(runtime.snapshot.pairedWheelchairM5Device?.id, 'WHEEL_1');
    expect(runtime.snapshot.pairedM5Devices, hasLength(2));
    expect(
      mqtt.m5Registrations.map((entry) => entry['device_id']),
      containsAll(<String>['BELT_1', 'WHEEL_1']),
    );

    await runtime.forgetM5Device('BELT_1');
    expect(runtime.isM5RelayActiveFor('BELT_1'), isFalse);
    expect(runtime.isM5RelayActiveFor('WHEEL_1'), isTrue);
    expect(runtime.snapshot.pairedBeltM5Device, isNull);
    expect(runtime.snapshot.pairedWheelchairM5Device?.id, 'WHEEL_1');
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

void _fallTests() {
  final alert = FallAlertEvent(
    kind: FallAlertKind.detected,
    event: 'fall_detected',
    deviceId: 'BELT_1',
    timestamp: DateTime(2026, 10, 29, 9),
    rawPayload: '{}',
  );
  const belt = BleDeviceSnapshot(
    id: 'BELT_1',
    name: 'FallGuard Belt',
    rssi: -50,
    serviceUuids: <String>[BleDeviceSnapshot.wheelSenseM5ServiceUuid],
  );

  test(
    "I'm OK without a connected belt reports the cancel from the phone",
    () async {
      final ble = _FakeBleGatewayService();
      final mqtt = _CapturingMqttGatewayService();
      final runtime = GatewayRuntimeService(
        preferences: _MemoryGatewayPreferences(),
        ble: ble,
        mqtt: mqtt,
        notifications: _SilentNotifications(),
      );
      final events = <FallAlertEvent>[];
      final sub = runtime.fallAlerts.listen(events.add);

      await runtime.confirmWearerOk(alert);
      await Future<void>.delayed(Duration.zero);

      expect(ble.commands, isEmpty);
      expect(events.single.kind, FallAlertKind.canceled);
      expect(events.single.source, 'app');
      expect(mqtt.telemetryPayloads.single, contains('fall_canceled'));
      expect(mqtt.telemetryPayloads.single, contains('BELT_1'));
      await sub.cancel();
      await runtime.dispose();
      await ble.close();
    },
  );

  test("I'm OK with a connected belt cancels on the belt", () async {
    final ble = _FakeBleGatewayService()..fallCapable = true;
    final mqtt = _CapturingMqttGatewayService();
    final runtime = GatewayRuntimeService(
      preferences: _MemoryGatewayPreferences(),
      ble: ble,
      mqtt: mqtt,
      notifications: _SilentNotifications(),
    );
    await runtime.startM5TelemetryRelay(
      GatewayConfig.defaults().copyWith(setupCompleted: true),
      belt,
    );
    expect(runtime.fallBeltConnected, isTrue);

    await runtime.confirmWearerOk(alert);
    await Future<void>.delayed(Duration.zero);

    // The belt echoes fall_canceled itself; the phone does not duplicate it.
    expect(ble.commands.single['command'], 'fall_cancel');
    expect(
      mqtt.telemetryPayloads.where((p) => p.contains('fall_canceled')),
      isEmpty,
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

  @override
  Future<void> cancelFallAlertNotification() async {}

  @override
  Future<void> showFallAlert({
    required String title,
    required String body,
    bool ongoing = false,
  }) async {}
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
  BleDeviceSnapshot? _beltM5;
  BleDeviceSnapshot? _wheelchairM5;
  BleDeviceSnapshot? _polar;

  @override
  Future<GatewayConfig> loadConfig() async => _config;

  @override
  Future<void> saveConfig(GatewayConfig config) async {
    _config = config;
  }

  @override
  Future<void> savePairedM5Device(BleDeviceSnapshot device) async {
    _beltM5 = device;
  }

  @override
  Future<void> savePairedM5BeltDevice(BleDeviceSnapshot device) async {
    _beltM5 = device;
  }

  @override
  Future<void> savePairedM5WheelchairDevice(BleDeviceSnapshot device) async {
    _wheelchairM5 = device;
  }

  @override
  Future<void> savePairedPolarDevice(BleDeviceSnapshot device) async {
    _polar = device;
  }

  @override
  Future<BleDeviceSnapshot?> loadPairedM5Device() async => _beltM5;

  @override
  Future<BleDeviceSnapshot?> loadPairedM5BeltDevice() async => _beltM5;

  @override
  Future<BleDeviceSnapshot?> loadPairedM5WheelchairDevice() async =>
      _wheelchairM5;

  @override
  Future<Map<M5DeviceSlot, BleDeviceSnapshot>>
  loadPairedM5DevicesBySlot() async => <M5DeviceSlot, BleDeviceSnapshot>{
    if (_beltM5 != null) M5DeviceSlot.belt: _beltM5!,
    if (_wheelchairM5 != null) M5DeviceSlot.wheelchair: _wheelchairM5!,
  };

  @override
  Future<BleDeviceSnapshot?> loadPairedPolarDevice() async => _polar;

  @override
  Future<void> clearPairedM5Device() async {
    _beltM5 = null;
    _wheelchairM5 = null;
  }

  @override
  Future<void> clearPairedM5BeltDevice() async {
    _beltM5 = null;
  }

  @override
  Future<void> clearPairedM5WheelchairDevice() async {
    _wheelchairM5 = null;
  }

  @override
  Future<void> removePairedM5Device(String deviceId) async {
    if (_beltM5?.id == deviceId) {
      _beltM5 = null;
    }
    if (_wheelchairM5?.id == deviceId) {
      _wheelchairM5 = null;
    }
  }

  @override
  Future<void> clearPairedPolarDevice() async {
    _polar = null;
  }
}

class _FakeBleGatewayService implements BleGatewayService {
  final StreamController<String> _m5 = StreamController<String>.broadcast();
  final StreamController<FallAlertEvent> _fallAlerts =
      StreamController<FallAlertEvent>.broadcast();

  @override
  Stream<FallAlertEvent> get fallAlerts => _fallAlerts.stream;

  @override
  Stream<bool> get m5FallCapableUpdates => const Stream<bool>.empty();

  /// Set true to act as a connected FallGuard belt.
  bool fallCapable = false;
  final List<Map<String, Object?>> commands = <Map<String, Object?>>[];

  @override
  bool get m5FallCapable => fallCapable;

  @override
  bool isM5FallCapableFor(String deviceId) => fallCapable;

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
  }) async {
    commands.add(payload);
  }

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
    _fallAlerts.close();
    return _m5.close();
  }

  @override
  Future<void> dispose() {
    return close();
  }
}

class _CapturingMqttGatewayService extends MqttGatewayService {
  final List<GatewayConfig> telemetryConfigs = <GatewayConfig>[];
  final List<String> telemetryPayloads = <String>[];
  final List<Map<String, Object?>> m5Registrations =
      <Map<String, Object?>>[];

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
    if (companionM5 != null) {
      m5Registrations.add(companionM5);
    }
    return true;
  }

  @override
  Future<TelemetryPublishResult> publishTelemetry({
    required GatewayConfig config,
    required String payload,
  }) async {
    telemetryConfigs.add(config);
    telemetryPayloads.add(payload);
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
