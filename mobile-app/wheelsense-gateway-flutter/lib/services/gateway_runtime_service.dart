import 'dart:async';

import '../models/gateway_config.dart';
import '../models/gateway_runtime_snapshot.dart';
import '../models/gateway_status.dart';
import '../models/ble_device_snapshot.dart';
import '../models/mqtt_gateway_message.dart';
import '../models/sensor_telemetry.dart';
import 'ble_gateway_service.dart';
import 'gateway_foreground_service.dart';
import 'gateway_notification_service.dart';
import 'gateway_permission_service.dart';
import 'gateway_preferences_service.dart';
import 'mqtt_gateway_service.dart';

class GatewayRuntimeService {
  GatewayRuntimeService({
    GatewayPreferencesService? preferences,
    GatewayPermissionService? permissions,
    GatewayNotificationService? notifications,
    GatewayForegroundService? foreground,
    BleGatewayService? ble,
    MqttGatewayService? mqtt,
  }) : _preferences = preferences ?? GatewayPreferencesService(),
       _permissions = permissions ?? GatewayPermissionService(),
       _notifications = notifications ?? GatewayNotificationService(),
       _foreground = foreground ?? GatewayForegroundService(),
       _ble = ble,
       _mqtt = mqtt;

  final GatewayPreferencesService _preferences;
  final GatewayPermissionService _permissions;
  final GatewayNotificationService _notifications;
  final GatewayForegroundService _foreground;
  BleGatewayService? _ble;
  MqttGatewayService? _mqtt;
  final StreamController<GatewayStatus> _statusController =
      StreamController<GatewayStatus>.broadcast();
  final StreamController<GatewayConfig> _configController =
      StreamController<GatewayConfig>.broadcast();
  final StreamController<GatewayRuntimeSnapshot> _snapshotController =
      StreamController<GatewayRuntimeSnapshot>.broadcast();

  StreamSubscription<String>? _m5TelemetrySubscription;
  StreamSubscription<PolarTelemetrySample>? _polarTelemetrySubscription;
  StreamSubscription<MqttGatewayMessage>? _mqttStatusSubscription;
  GatewayStatus _status = GatewayStatus.initial();
  GatewayRuntimeSnapshot _snapshot = GatewayRuntimeSnapshot.initial();

  Stream<GatewayStatus> get statuses => _statusController.stream;
  Stream<GatewayConfig> get configUpdates => _configController.stream;
  Stream<GatewayRuntimeSnapshot> get snapshots => _snapshotController.stream;
  GatewayStatus get status => _status;
  GatewayRuntimeSnapshot get snapshot => _snapshot;

  Future<GatewayConfig> loadConfig() async {
    final config = await _preferences.loadConfig();
    _emitSnapshot(_snapshot.copyWith(config: config));
    return config;
  }

  Future<void> saveConfig(GatewayConfig config) async {
    await _preferences.saveConfig(config);
    _emitSnapshot(_snapshot.copyWith(config: config));
    if (!_configController.isClosed) {
      _configController.add(config);
    }
  }

  Future<GatewayStatus> bootstrap({GatewayConfig? config}) async {
    final effectiveConfig = config ?? await loadConfig();
    await _loadPairedDevicesIntoSnapshot(effectiveConfig);
    final permissionResult = await _permissions.requestRuntimePermissions();
    final notificationsReady = await _notifications.initialize();
    final notificationAllowed = await _notifications.requestPermission();
    final mqttReady = await _mqttService.connect(effectiveConfig);
    final foregroundReady = await _foreground.start();
    if (mqttReady) {
      _startMqttSubscriptions(effectiveConfig);
    }

    final mode = permissionResult.bleGranted
        ? GatewayConnectionMode.idle
        : GatewayConnectionMode.degraded;

    return _emit(
      _status.copyWith(
        mode: mode,
        bleReady: permissionResult.bleGranted,
        mqttReady: mqttReady,
        notificationsReady: notificationsReady && notificationAllowed,
        backgroundReady: permissionResult.backgroundGranted || foregroundReady,
        message: mode == GatewayConnectionMode.degraded
            ? 'BLE permission is required for production gateway mode'
            : 'Production gateway ready',
      ),
    );
  }

  Future<GatewayStatus> resumeGateway({bool autoStartBle = true}) async {
    final config = await loadConfig();
    final status = await bootstrap(config: config);
    if (!shouldAutoStartBleRelay(
      config: config,
      status: status,
      requested: autoStartBle,
    )) {
      if (autoStartBle && status.bleReady && !config.setupCompleted) {
        return _emit(
          status.copyWith(
            message: 'Complete gateway setup before automatic BLE relay starts',
          ),
        );
      }
      return status;
    }
    final pairedM5 = await _preferences.loadPairedM5Device();
    final pairedPolar = await _preferences.loadPairedPolarDevice();
    if (pairedM5 != null && _m5TelemetrySubscription == null) {
      unawaited(startM5TelemetryRelay(config, pairedM5));
    }
    if (pairedPolar != null && _polarTelemetrySubscription == null) {
      unawaited(startPolarTelemetryRelay(config, pairedPolar));
    }
    return status;
  }

  Future<GatewayStatus> requestPermissionsForAppOpen() async {
    final permissionResult = await _permissions.requestRuntimePermissions();
    final notificationsReady = await _notifications.initialize();
    final notificationAllowed = await _notifications.requestPermission();
    if (!permissionResult.ready &&
        _permissions.hasBlockedRuntimePermission(permissionResult)) {
      await _permissions.openPermissionSettings();
    }

    final bleReady = permissionResult.bleGranted;
    final status = _emit(
      _status.copyWith(
        mode: bleReady
            ? _status.mode == GatewayConnectionMode.degraded
                  ? GatewayConnectionMode.idle
                  : _status.mode
            : GatewayConnectionMode.degraded,
        bleReady: bleReady,
        notificationsReady: notificationsReady && notificationAllowed,
        backgroundReady: permissionResult.backgroundGranted,
        message: bleReady
            ? 'Permissions ready. Pair or reconnect M5StickC Plus 2 and Polar.'
            : 'Allow Bluetooth, location, and notifications for live sensors.',
      ),
    );
    unawaited(connectMqttConfigStream());
    return status;
  }

  Future<GatewayStatus> connectMqttConfigStream({GatewayConfig? config}) async {
    final effectiveConfig = config ?? await loadConfig();
    final connected = await _mqttService.connect(effectiveConfig);
    if (connected) {
      _startMqttSubscriptions(effectiveConfig);
    }
    return _emit(
      _status.copyWith(
        mode: connected ? _status.mode : GatewayConnectionMode.degraded,
        mqttReady: connected,
        message: connected
            ? 'MQTT connected. Waiting for retained portal link.'
            : 'MQTT broker is offline; enter broker settings or try again.',
      ),
    );
  }

  Future<BleDeviceSnapshot?> loadPairedM5Device() {
    return _preferences.loadPairedM5Device();
  }

  Future<BleDeviceSnapshot?> loadPairedPolarDevice() {
    return _preferences.loadPairedPolarDevice();
  }

  Stream<BleDeviceSnapshot> scanBleDevices(GatewayConfig config) {
    return _bleService.scan(config);
  }

  Stream<BleDeviceSnapshot> scanPairableDevices(GatewayConfig config) {
    return _bleService.scan(config, profile: BleScanProfile.gatewayPairing);
  }

  Future<Stream<String>> startM5TelemetryRelay(
    GatewayConfig config,
    BleDeviceSnapshot device,
  ) async {
    await _preferences.savePairedM5Device(device);
    _emitSnapshot(_snapshot.copyWith(pairedM5Device: device));
    await _ensureMqtt(config);
    await _m5TelemetrySubscription?.cancel();
    unawaited(
      _mqttService.publishRegistration(
        config: config,
        companionM5: <String, Object?>{
          'device_id': device.id,
          'name': device.name,
          'model': 'M5StickCPlus2',
          'transport': 'ble',
          'rssi': device.rssi,
        },
      ),
    );
    final stream = _bleService
        .connectM5Telemetry(config: config, deviceId: device.id)
        .asBroadcastStream();
    _m5TelemetrySubscription = stream.listen(
      (payload) async {
        final result = await _mqttService.publishTelemetry(
          config: _snapshot.config,
          payload: payload,
        );
        _recordPublishResult(result);
        _recordM5Payload(payload);
      },
      onError: (Object error) {
        _emit(
          _status.copyWith(
            mode: GatewayConnectionMode.error,
            message: 'M5 telemetry error: $error',
          ),
        );
      },
    );
    _emit(
      _status.copyWith(
        mode: GatewayConnectionMode.connected,
        mqttReady: _mqttService.isConnected,
        message: 'M5 telemetry relay active',
      ),
    );
    return stream;
  }

  Future<Stream<PolarTelemetrySample>> startPolarTelemetryRelay(
    GatewayConfig config,
    BleDeviceSnapshot device,
  ) async {
    await _preferences.savePairedPolarDevice(device);
    _emitSnapshot(_snapshot.copyWith(pairedPolarDevice: device));
    await _ensureMqtt(config);
    await _polarTelemetrySubscription?.cancel();
    unawaited(
      _mqttService.publishRegistration(
        config: config,
        companionPolar: <String, Object?>{
          'device_id': device.id,
          'polar_device_id': device.id,
          'name': device.name,
          'model': 'Polar Verity Sense',
          'transport': 'ble',
          'rssi': device.rssi,
        },
      ),
    );
    final stream = _bleService
        .connectPolarHeartRate(deviceId: device.id)
        .asBroadcastStream();
    _polarTelemetrySubscription = stream.listen(
      (sample) async {
        final result = await _mqttService.publishPolarTelemetry(
          config: _snapshot.config,
          sample: sample,
        );
        _recordPublishResult(result);
        _emitSnapshot(_snapshot.copyWith(latestPolarSample: sample));
      },
      onError: (Object error) {
        _emit(
          _status.copyWith(
            mode: GatewayConnectionMode.error,
            message: 'Polar telemetry error: $error',
          ),
        );
      },
    );
    _emit(
      _status.copyWith(
        mode: GatewayConnectionMode.connected,
        mqttReady: _mqttService.isConnected,
        message: 'Polar heart-rate relay active',
      ),
    );
    return stream;
  }

  Future<void> renameM5Device({
    required GatewayConfig config,
    required BleDeviceSnapshot device,
    required String name,
  }) async {
    final renamed = device.copyWith(name: name);
    await _preferences.savePairedM5Device(renamed);
    _emitSnapshot(_snapshot.copyWith(pairedM5Device: renamed));
    try {
      await _bleService.writeM5RoomConfig(
        config: config,
        deviceId: device.id,
        payload: <String, Object?>{'device_name': name},
      );
    } on Object {
      _emit(
        _status.copyWith(
          mode: GatewayConnectionMode.degraded,
          message: 'M5 local name saved; reconnect to sync firmware name',
        ),
      );
    }
    await _mqttService.publishRegistration(
      config: config,
      companionM5: <String, Object?>{
        'device_id': device.id,
        'name': name,
        'model': 'M5StickCPlus2',
        'transport': 'ble',
        'rssi': device.rssi,
      },
    );
  }

  Future<void> renamePolarDevice({
    required GatewayConfig config,
    required BleDeviceSnapshot device,
    required String name,
  }) async {
    final renamed = device.copyWith(name: name);
    await _preferences.savePairedPolarDevice(renamed);
    _emitSnapshot(_snapshot.copyWith(pairedPolarDevice: renamed));
    await _mqttService.publishRegistration(
      config: config,
      companionPolar: <String, Object?>{
        'device_id': device.id,
        'polar_device_id': device.id,
        'name': name,
        'model': 'Polar Verity Sense',
        'transport': 'ble',
        'rssi': device.rssi,
      },
    );
  }

  Future<void> forgetM5Device() async {
    await _m5TelemetrySubscription?.cancel();
    _m5TelemetrySubscription = null;
    await _preferences.clearPairedM5Device();
    _emitSnapshot(_snapshot.copyWith(pairedM5Device: null));
  }

  Future<void> forgetPolarDevice() async {
    await _polarTelemetrySubscription?.cancel();
    _polarTelemetrySubscription = null;
    await _preferences.clearPairedPolarDevice();
    _emitSnapshot(_snapshot.copyWith(pairedPolarDevice: null));
  }

  Future<void> markSetupCompleted() async {
    final config = (await loadConfig()).copyWith(setupCompleted: true);
    await saveConfig(config);
  }

  Future<void> sendM5Command({
    required GatewayConfig config,
    required BleDeviceSnapshot device,
    required String command,
  }) {
    return _bleService.writeM5Command(
      config: config,
      deviceId: device.id,
      payload: <String, Object?>{
        'command': command,
        'command_id': DateTime.now().microsecondsSinceEpoch.toString(),
      },
    );
  }

  Future<void> notifyStatus(String title, String body) {
    return _notifications.showGatewayStatus(title: title, body: body);
  }

  Future<void> dispose() async {
    await _m5TelemetrySubscription?.cancel();
    await _polarTelemetrySubscription?.cancel();
    await _mqttStatusSubscription?.cancel();
    await _ble?.dispose();
    await _mqtt?.disconnect();
    await _foreground.stop();
    await _configController.close();
    await _snapshotController.close();
    await _statusController.close();
  }

  BleGatewayService get _bleService {
    return _ble ??= BleGatewayService();
  }

  MqttGatewayService get _mqttService {
    return _mqtt ??= MqttGatewayService();
  }

  Future<void> _ensureMqtt(GatewayConfig config) async {
    if (_mqttService.isConnected) {
      _startMqttSubscriptions(config);
      return;
    }
    final connected = await _mqttService.connect(config);
    if (connected) {
      _startMqttSubscriptions(config);
      return;
    }
    if (!connected) {
      _emit(
        _status.copyWith(
          mode: GatewayConnectionMode.degraded,
          mqttReady: false,
          message: 'MQTT broker is offline; BLE data remains visible locally',
        ),
      );
    }
  }

  void _startMqttSubscriptions(GatewayConfig config) {
    unawaited(_mqttStatusSubscription?.cancel());
    _mqttStatusSubscription = _mqttService
        .subscribeStatus(config)
        .listen(
          (message) => unawaited(_handleMqttMessage(message)),
          onError: (Object error) {
            _emit(
              _status.copyWith(
                mode: GatewayConnectionMode.degraded,
                message: 'MQTT subscription error: $error',
              ),
            );
          },
        );
  }

  Future<void> _handleMqttMessage(MqttGatewayMessage message) async {
    if (message.topic.startsWith('WheelSense/config/')) {
      await _handleConfigMessage(message);
      return;
    }
    if (message.topic.startsWith('WheelSense/room/')) {
      _handleRoomMessage(message);
      return;
    }
    if (message.topic.startsWith('WheelSense/alerts/')) {
      await _handleAlertMessage(message);
      return;
    }
    if (message.topic.endsWith('/control')) {
      _emit(
        _status.copyWith(
          mqttReady: true,
          message: 'Mobile control message received from server',
        ),
      );
    }
  }

  Future<void> _handleConfigMessage(MqttGatewayMessage message) async {
    final current = await loadConfig();
    final next = applyMqttConfigUpdate(current, message.payload);
    if (gatewayConfigEquals(next, current)) {
      return;
    }
    await _preferences.saveConfig(next);
    if (!_configController.isClosed) {
      _configController.add(next);
    }
    _emitSnapshot(_snapshot.copyWith(config: next));
    if (_mqttService.isConnected) {
      _startMqttSubscriptions(next);
    }
    _emit(
      _status.copyWith(
        mqttReady: true,
        message: 'Gateway config updated from MQTT',
      ),
    );
  }

  void _handleRoomMessage(MqttGatewayMessage message) {
    _emitSnapshot(
      _snapshot.copyWith(
        latestRoomPrediction: RoomPredictionEvent.fromPayload(message.payload),
      ),
    );
    _emit(
      _status.copyWith(mqttReady: true, message: 'Room prediction updated'),
    );
  }

  Future<void> _handleAlertMessage(MqttGatewayMessage message) async {
    final alert = GatewayAlertEvent.fromMqtt(
      topic: message.topic,
      payload: message.payload,
    );
    final nextAlerts = <GatewayAlertEvent>[
      alert,
      ..._snapshot.alerts.where((existing) => existing.id != alert.id),
    ];
    if (nextAlerts.length > 50) {
      nextAlerts.removeRange(50, nextAlerts.length);
    }
    _emitSnapshot(_snapshot.copyWith(alerts: nextAlerts));
    if (alert.severity == GatewayAlertSeverity.critical) {
      await notifyStatus(alert.title, alert.description);
    }
  }

  GatewayStatus _emit(GatewayStatus next) {
    _status = next;
    if (!_statusController.isClosed) {
      _statusController.add(next);
    }
    _emitSnapshot(_snapshot.copyWith(status: next));
    return next;
  }

  void _emitSnapshot(GatewayRuntimeSnapshot next) {
    _snapshot = next;
    if (!_snapshotController.isClosed) {
      _snapshotController.add(next);
    }
  }

  void _recordPublishResult(TelemetryPublishResult result) {
    _emitSnapshot(_snapshot.recordPublish(result));
    if (result.success) {
      if (!_status.mqttReady ||
          _status.mode == GatewayConnectionMode.degraded ||
          _status.mode == GatewayConnectionMode.error) {
        _emit(
          _status.copyWith(
            mode: GatewayConnectionMode.connected,
            mqttReady: true,
            message: 'Telemetry publish recovered',
          ),
        );
      }
      return;
    }
    if (!result.success) {
      _emit(
        _status.copyWith(
          mode: GatewayConnectionMode.degraded,
          mqttReady: false,
          message: 'Telemetry publish failed: ${result.reason.name}',
        ),
      );
    }
  }

  void _recordM5Payload(String payload) {
    try {
      final sample = M5TelemetrySample.fromPayload(payload);
      _emitSnapshot(_snapshot.copyWith(latestM5Sample: sample));
    } on Object {
      _emit(
        _status.copyWith(
          mode: GatewayConnectionMode.degraded,
          message: 'M5 packet is not valid JSON telemetry',
        ),
      );
    }
  }

  Future<void> _loadPairedDevicesIntoSnapshot(GatewayConfig config) async {
    final pairedM5 = await _preferences.loadPairedM5Device();
    final pairedPolar = await _preferences.loadPairedPolarDevice();
    _emitSnapshot(
      _snapshot.copyWith(
        config: config,
        pairedM5Device: pairedM5,
        pairedPolarDevice: pairedPolar,
      ),
    );
  }
}
