import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

import '../models/gateway_config.dart';
import '../models/gateway_runtime_snapshot.dart';
import '../models/mqtt_gateway_message.dart';
import '../models/sensor_telemetry.dart';

class MqttGatewayService {
  MqttGatewayService();

  MqttServerClient? _client;
  StreamSubscription<List<MqttReceivedMessage<MqttMessage>>>? _subscription;
  StreamController<MqttGatewayMessage>? _messageController;
  String? _connectionKey;
  Set<String> _subscribedTopics = const <String>{};

  bool get isConnected =>
      _client?.connectionStatus?.state == MqttConnectionState.connected;

  Future<bool> connect(GatewayConfig config) async {
    final nextConnectionKey = _buildConnectionKey(config);
    if (isConnected && _connectionKey == nextConnectionKey) {
      return true;
    }
    await disconnect();

    final client = MqttServerClient.withPort(
      config.mqttHost,
      'wheelsense-gateway-${config.deviceId}',
      config.mqttPort,
    );
    client.secure = config.mqttUseTls;
    client.keepAlivePeriod = 30;
    client.logging(on: false);
    client.autoReconnect = true;
    client.connectionMessage = MqttConnectMessage()
        .withClientIdentifier('wheelsense-gateway-${config.deviceId}')
        .startClean();

    try {
      final status = await client.connect(
        config.mqttUsername.isEmpty ? null : config.mqttUsername,
        config.mqttPassword.isEmpty ? null : config.mqttPassword,
      );
      _client = client;
      final accepted =
          status?.returnCode == MqttConnectReturnCode.connectionAccepted;
      if (accepted) {
        _connectionKey = nextConnectionKey;
        await publishRegistration(config: config);
      }
      return accepted;
    } on Exception {
      client.disconnect();
      _client = null;
      _connectionKey = null;
      return false;
    }
  }

  Stream<MqttGatewayMessage> subscribeStatus(GatewayConfig config) {
    if (!isConnected) {
      return const Stream<MqttGatewayMessage>.empty();
    }

    final topics = subscriptionTopicsFor(config);
    final removedTopics = _subscribedTopics.difference(topics);
    for (final topic in removedTopics) {
      _client?.unsubscribe(topic);
    }
    for (final topic in topics) {
      _client?.subscribe(topic, MqttQos.atLeastOnce);
    }
    _subscribedTopics = topics;

    final controller = _messageController ??=
        StreamController<MqttGatewayMessage>.broadcast();
    _subscription ??= _client?.updates?.listen((messages) {
      for (final message in messages) {
        final publish = message.payload as MqttPublishMessage;
        final raw = MqttPublishPayload.bytesToStringAsString(
          publish.payload.message,
        );
        if (!controller.isClosed) {
          controller.add(
            MqttGatewayMessage(
              topic: message.topic,
              payload: _decodePayload(raw),
              receivedAt: DateTime.now(),
            ),
          );
        }
      }
    }, onError: controller.addError);
    return controller.stream;
  }

  static Set<String> subscriptionTopicsFor(GatewayConfig config) {
    final topics = <String>{
      'WheelSense/config/all',
      'WheelSense/config/${config.deviceId}',
      'WheelSense/mobile/${config.deviceId}/#',
      'WheelSense/mobile/${config.deviceId}/control',
      'WheelSense/room/${config.deviceId}',
    };
    if (config.alertsEnabled) {
      if (config.linkedPatientId != null) {
        topics.add('WheelSense/alerts/${config.linkedPatientId}');
      } else {
        topics.add('WheelSense/alerts/${config.deviceId}');
      }
    }
    return topics;
  }

  Future<TelemetryPublishResult> publishTelemetry({
    required GatewayConfig config,
    required String payload,
  }) async {
    final topic = 'WheelSense/mobile/${config.deviceId}/telemetry';
    if (!isConnected) {
      return TelemetryPublishResult.failed(
        topic: topic,
        reason: TelemetryPublishFailureReason.disconnected,
      );
    }

    final builder = MqttClientPayloadBuilder()
      ..addUTF8String(_buildMobileTelemetryPayload(config, payload));
    try {
      _client?.publishMessage(topic, MqttQos.atLeastOnce, builder.payload!);
      return TelemetryPublishResult.sent(topic);
    } on Object catch (error) {
      return TelemetryPublishResult.failed(
        topic: topic,
        reason: TelemetryPublishFailureReason.exception,
        errorMessage: '$error',
      );
    }
  }

  Future<TelemetryPublishResult> publishPolarTelemetry({
    required GatewayConfig config,
    required PolarTelemetrySample sample,
  }) async {
    final topic = 'WheelSense/mobile/${config.deviceId}/telemetry';
    if (!isConnected) {
      return TelemetryPublishResult.failed(
        topic: topic,
        reason: TelemetryPublishFailureReason.disconnected,
      );
    }

    final builder = MqttClientPayloadBuilder()
      ..addUTF8String(_buildPolarTelemetryPayload(config, sample));
    try {
      _client?.publishMessage(topic, MqttQos.atLeastOnce, builder.payload!);
      return TelemetryPublishResult.sent(topic);
    } on Object catch (error) {
      return TelemetryPublishResult.failed(
        topic: topic,
        reason: TelemetryPublishFailureReason.exception,
        errorMessage: '$error',
      );
    }
  }

  Future<bool> publishRegistration({
    required GatewayConfig config,
    Map<String, Object?>? companionM5,
    Map<String, Object?>? companionPolar,
  }) async {
    if (!isConnected) {
      return false;
    }

    final payload = <String, Object?>{
      'device_id': config.deviceId,
      'device_name': 'WheelSense Mobile Gateway',
      'platform': Platform.isAndroid
          ? 'android'
          : Platform.isIOS
          ? 'ios'
          : Platform.operatingSystem,
      'os_version': Platform.operatingSystemVersion,
      'app_version': '1.0.0',
    };
    payload.addAll(<String, Object?>{
      ...?(companionM5 == null
          ? null
          : <String, Object?>{'companion_m5': companionM5}),
      ...?(companionPolar == null
          ? null
          : <String, Object?>{'companion_polar': companionPolar}),
    });
    final builder = MqttClientPayloadBuilder()
      ..addUTF8String(jsonEncode(payload));
    _client?.publishMessage(
      'WheelSense/mobile/${config.deviceId}/register',
      MqttQos.atLeastOnce,
      builder.payload!,
    );
    return true;
  }

  Future<void> disconnect() async {
    await _subscription?.cancel();
    _subscription = null;
    await _messageController?.close();
    _messageController = null;
    _client?.disconnect();
    _client = null;
    _connectionKey = null;
    _subscribedTopics = const <String>{};
  }

  String _buildConnectionKey(GatewayConfig config) {
    return [
      config.mqttHost,
      config.mqttPort,
      config.mqttUseTls,
      config.deviceId,
      config.mqttUsername,
      config.mqttPassword,
    ].join('|');
  }

  Map<String, Object?> _decodePayload(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, Object?>) {
        return decoded;
      }
      if (decoded is Map) {
        return Map<String, Object?>.from(decoded);
      }
    } on FormatException {
      return <String, Object?>{'raw': raw};
    }
    return <String, Object?>{'raw': raw};
  }

  String _buildMobileTelemetryPayload(GatewayConfig config, String rawPayload) {
    final decoded = _decodePayload(rawPayload);
    final m5Payload = _normalizeM5Payload(rawPayload, decoded);

    return jsonEncode(<String, Object?>{
      'device_id': config.deviceId,
      'device_type': 'mobile_phone',
      'hardware_type': 'mobile_phone',
      'app_mode': 'ble_gateway',
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'm5': m5Payload,
      'gateway_payload': decoded,
    });
  }

  Map<String, Object?> _normalizeM5Payload(
    String rawPayload,
    Map<String, Object?> decoded,
  ) {
    try {
      final sample = M5TelemetrySample.fromPayload(rawPayload);
      final normalized = sample.toServerCompanionJson();
      normalized['device_id'] =
          sample.deviceId ?? decoded['device_id'] ?? 'm5-ble';
      normalized['device_name'] =
          sample.deviceName ?? decoded['device_name'] ?? 'M5StickC Plus 2';
      return normalized;
    } on Object {
      final fallback = Map<String, Object?>.from(decoded);
      fallback.putIfAbsent('device_id', () => decoded['device_id'] ?? 'm5-ble');
      fallback.putIfAbsent(
        'device_name',
        () => decoded['device_name'] ?? 'M5StickC Plus 2',
      );
      fallback.putIfAbsent('hardware_type', () => 'companion_m5');
      fallback.putIfAbsent('device_type', () => 'wheelchair');
      return fallback;
    }
  }

  String _buildPolarTelemetryPayload(
    GatewayConfig config,
    PolarTelemetrySample sample,
  ) {
    final rrIntervalMs = sample.rrIntervalsMs.isEmpty
        ? null
        : sample.rrIntervalsMs.first;
    return jsonEncode(<String, Object?>{
      'device_id': config.deviceId,
      'device_type': 'mobile_phone',
      'hardware_type': 'mobile_phone',
      'app_mode': 'ble_gateway',
      'timestamp': sample.timestamp.toUtc().toIso8601String(),
      'hr_source': 'polar_sdk',
      'polar_device_model': 'Polar Verity Sense',
      'hr': <String, Object?>{
        'bpm': sample.heartRateBpm,
        'rr_intervals_ms': sample.rrIntervalsMs,
        'rr_intervals': sample.rrIntervalsMs,
        if (sample.spo2Percent != null) 'spo2': sample.spo2Percent,
        if (sample.spo2Percent != null) 'spo2_estimated': sample.spo2Estimated,
        'sensor_battery': ?sample.sensorBatteryPercent,
      },
      'polar_hr': <String, Object?>{
        'heart_rate_bpm': sample.heartRateBpm,
        'rr_interval_ms': ?rrIntervalMs,
        if (sample.spo2Percent != null) 'spo2': sample.spo2Percent,
        if (sample.spo2Percent != null) 'spo2_estimated': sample.spo2Estimated,
        'sensor_battery': ?sample.sensorBatteryPercent,
      },
      'polar_signal': <String, Object?>{
        'rssi': sample.rssi,
        'quality': sample.signalLabel,
        'ppg_quality': sample.ppgQuality,
        'ppg_ratio': sample.ppgRatio,
        'contact_status': sample.contactStatus,
        'spo2_source': sample.spo2Percent == null
            ? null
            : 'estimated_from_polar_ppg',
      },
    });
  }
}
