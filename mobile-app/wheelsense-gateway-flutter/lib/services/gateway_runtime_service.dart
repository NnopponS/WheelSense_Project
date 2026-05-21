import 'dart:async';

import '../models/gateway_config.dart';
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

  StreamSubscription<String>? _m5TelemetrySubscription;
  StreamSubscription<PolarTelemetrySample>? _polarTelemetrySubscription;
  StreamSubscription<MqttGatewayMessage>? _mqttStatusSubscription;
  GatewayStatus _status = GatewayStatus.initial();

  Stream<GatewayStatus> get statuses => _statusController.stream;
  Stream<GatewayConfig> get configUpdates => _configController.stream;
  GatewayStatus get status => _status;

  Future<GatewayConfig> loadConfig() => _preferences.loadConfig();
  Future<void> saveConfig(GatewayConfig config) =>
      _preferences.saveConfig(config);

  Future<GatewayStatus> bootstrap({GatewayConfig? config}) async {
    final effectiveConfig = config ?? await loadConfig();
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
        await _mqttService.publishTelemetry(config: config, payload: payload);
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
        await _mqttService.publishPolarTelemetry(
          config: config,
          sample: sample,
        );
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

  Future<void> forgetM5Device() {
    return _preferences.clearPairedM5Device();
  }

  Future<void> forgetPolarDevice() {
    return _preferences.clearPairedPolarDevice();
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
    if (!message.topic.startsWith('WheelSense/config/')) {
      return;
    }
    final current = await loadConfig();
    final next = applyMqttConfigUpdate(current, message.payload);
    if (next == current) {
      return;
    }
    await _preferences.saveConfig(next);
    if (!_configController.isClosed) {
      _configController.add(next);
    }
    _emit(
      _status.copyWith(
        mqttReady: true,
        message: 'Portal link updated from MQTT',
      ),
    );
  }

  GatewayStatus _emit(GatewayStatus next) {
    _status = next;
    if (!_statusController.isClosed) {
      _statusController.add(next);
    }
    return next;
  }
}

GatewayConfig applyMqttConfigUpdate(
  GatewayConfig current,
  Map<String, Object?> payload,
) {
  final portalBaseUrl = _portalUrl(payload['portal_base_url']);
  if (portalBaseUrl == null || portalBaseUrl == current.portalBaseUrl) {
    return current;
  }
  return current.copyWith(portalBaseUrl: portalBaseUrl);
}

String? _portalUrl(Object? value) {
  final raw = value == null
      ? ''
      : '$value'.trim().replaceAll(RegExp(r'/+$'), '');
  if (raw.isEmpty) {
    return null;
  }
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.host.isEmpty) {
    return null;
  }
  if (uri.scheme != 'https' && uri.scheme != 'http') {
    return null;
  }
  return raw;
}
