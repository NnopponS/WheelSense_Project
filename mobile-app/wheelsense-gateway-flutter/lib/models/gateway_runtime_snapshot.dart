import 'ble_device_snapshot.dart';
import 'gateway_config.dart';
import 'gateway_status.dart';
import 'sensor_telemetry.dart';

const Object _snapshotUnset = Object();
const Object _payloadUnset = Object();

enum GatewayAlertSeverity { normal, warning, critical, info }

enum TelemetryPublishFailureReason { none, disconnected, rejected, exception }

class TelemetryPublishResult {
  const TelemetryPublishResult({
    required this.success,
    required this.topic,
    required this.publishedAt,
    this.reason = TelemetryPublishFailureReason.none,
    this.errorMessage,
  });

  factory TelemetryPublishResult.sent(String topic) {
    return TelemetryPublishResult(
      success: true,
      topic: topic,
      publishedAt: DateTime.now(),
    );
  }

  factory TelemetryPublishResult.failed({
    required String topic,
    required TelemetryPublishFailureReason reason,
    String? errorMessage,
  }) {
    return TelemetryPublishResult(
      success: false,
      topic: topic,
      reason: reason,
      errorMessage: errorMessage,
      publishedAt: DateTime.now(),
    );
  }

  final bool success;
  final String topic;
  final DateTime publishedAt;
  final TelemetryPublishFailureReason reason;
  final String? errorMessage;
}

class GatewayConfigUpdate {
  const GatewayConfigUpdate({
    this.portalBaseUrl = _payloadUnset,
    this.linkedPatientId = _payloadUnset,
    this.linkedCaregiverId = _payloadUnset,
    this.linkedPersonType = _payloadUnset,
    this.alertsEnabled = _payloadUnset,
  });

  factory GatewayConfigUpdate.fromPayload(Map<String, Object?> payload) {
    return GatewayConfigUpdate(
      portalBaseUrl: payload.containsKey('portal_base_url')
          ? _safePortalUrl(payload['portal_base_url'])
          : _payloadUnset,
      linkedPatientId: payload.containsKey('linked_patient_id')
          ? _int(payload['linked_patient_id'])
          : _payloadUnset,
      linkedCaregiverId: payload.containsKey('linked_caregiver_id')
          ? _int(payload['linked_caregiver_id'])
          : _payloadUnset,
      linkedPersonType: payload.containsKey('linked_person_type')
          ? _string(payload['linked_person_type'])
          : _payloadUnset,
      alertsEnabled: payload.containsKey('alerts_enabled')
          ? _bool(payload['alerts_enabled'])
          : _payloadUnset,
    );
  }

  final Object? portalBaseUrl;
  final Object? linkedPatientId;
  final Object? linkedCaregiverId;
  final Object? linkedPersonType;
  final Object? alertsEnabled;

  bool get isEmpty {
    return identical(portalBaseUrl, _payloadUnset) &&
        identical(linkedPatientId, _payloadUnset) &&
        identical(linkedCaregiverId, _payloadUnset) &&
        identical(linkedPersonType, _payloadUnset) &&
        identical(alertsEnabled, _payloadUnset);
  }

  GatewayConfig applyTo(GatewayConfig current) {
    if (isEmpty) {
      return current;
    }
    return current.copyWith(
      portalBaseUrl: identical(portalBaseUrl, _payloadUnset)
          ? current.portalBaseUrl
          : portalBaseUrl as String?,
      linkedPatientId: identical(linkedPatientId, _payloadUnset)
          ? current.linkedPatientId
          : linkedPatientId as int?,
      linkedCaregiverId: identical(linkedCaregiverId, _payloadUnset)
          ? current.linkedCaregiverId
          : linkedCaregiverId as int?,
      linkedPersonType: identical(linkedPersonType, _payloadUnset)
          ? current.linkedPersonType
          : linkedPersonType as String?,
      alertsEnabled: identical(alertsEnabled, _payloadUnset)
          ? current.alertsEnabled
          : (alertsEnabled as bool?) ?? false,
    );
  }
}

class GatewayAlertEvent {
  const GatewayAlertEvent({
    required this.id,
    required this.topic,
    required this.title,
    required this.description,
    required this.severity,
    required this.timestamp,
    this.alertType,
    this.patientId,
    this.deviceId,
  });

  factory GatewayAlertEvent.fromMqtt({
    required String topic,
    required Map<String, Object?> payload,
  }) {
    final alertType = _string(payload['alert_type']);
    final title = _string(payload['title']) ?? _fallbackAlertTitle(alertType);
    final timestamp = _date(payload['timestamp']);
    return GatewayAlertEvent(
      id:
          _string(payload['alert_id']) ??
          _string(payload['id']) ??
          '${topic.hashCode}-${timestamp.microsecondsSinceEpoch}',
      topic: topic,
      title: title,
      description:
          _string(payload['description']) ??
          _string(payload['detail']) ??
          'Open the portal for response details.',
      severity: _severity(payload['severity']),
      timestamp: timestamp,
      alertType: alertType,
      patientId: _int(payload['patient_id']),
      deviceId: _string(payload['device_id']),
    );
  }

  final String id;
  final String topic;
  final String title;
  final String description;
  final GatewayAlertSeverity severity;
  final DateTime timestamp;
  final String? alertType;
  final int? patientId;
  final String? deviceId;
}

class RoomPredictionEvent {
  const RoomPredictionEvent({
    required this.roomId,
    required this.roomName,
    required this.confidence,
    required this.modelType,
    required this.timestamp,
    this.strategy,
  });

  factory RoomPredictionEvent.fromPayload(Map<String, Object?> payload) {
    return RoomPredictionEvent(
      roomId: _string(payload['room_id']) ?? '',
      roomName: _string(payload['room_name']) ?? 'Unknown room',
      confidence: _double(payload['confidence']),
      modelType: _string(payload['model_type']) ?? 'unknown',
      strategy: _string(payload['strategy']),
      timestamp: _date(payload['timestamp']),
    );
  }

  final String roomId;
  final String roomName;
  final double confidence;
  final String modelType;
  final DateTime timestamp;
  final String? strategy;
}

class GatewayRuntimeSnapshot {
  const GatewayRuntimeSnapshot({
    required this.config,
    required this.status,
    this.pairedM5Device,
    this.pairedPolarDevice,
    this.latestM5Sample,
    this.latestPolarSample,
    this.latestRoomPrediction,
    this.alerts = const <GatewayAlertEvent>[],
    this.lastSuccessfulPublishAt,
    this.failedPublishCount = 0,
    this.lastPublishFailure,
  });

  factory GatewayRuntimeSnapshot.initial() {
    return GatewayRuntimeSnapshot(
      config: GatewayConfig.defaults(),
      status: GatewayStatus.initial(),
    );
  }

  final GatewayConfig config;
  final GatewayStatus status;
  final BleDeviceSnapshot? pairedM5Device;
  final BleDeviceSnapshot? pairedPolarDevice;
  final M5TelemetrySample? latestM5Sample;
  final PolarTelemetrySample? latestPolarSample;
  final RoomPredictionEvent? latestRoomPrediction;
  final List<GatewayAlertEvent> alerts;
  final DateTime? lastSuccessfulPublishAt;
  final int failedPublishCount;
  final TelemetryPublishResult? lastPublishFailure;

  bool get setupReady {
    return config.setupCompleted &&
        status.bleReady &&
        status.mqttReady &&
        pairedM5Device != null;
  }

  GatewayRuntimeSnapshot copyWith({
    GatewayConfig? config,
    GatewayStatus? status,
    Object? pairedM5Device = _snapshotUnset,
    Object? pairedPolarDevice = _snapshotUnset,
    M5TelemetrySample? latestM5Sample,
    PolarTelemetrySample? latestPolarSample,
    RoomPredictionEvent? latestRoomPrediction,
    List<GatewayAlertEvent>? alerts,
    DateTime? lastSuccessfulPublishAt,
    int? failedPublishCount,
    Object? lastPublishFailure = _snapshotUnset,
  }) {
    return GatewayRuntimeSnapshot(
      config: config ?? this.config,
      status: status ?? this.status,
      pairedM5Device: identical(pairedM5Device, _snapshotUnset)
          ? this.pairedM5Device
          : pairedM5Device as BleDeviceSnapshot?,
      pairedPolarDevice: identical(pairedPolarDevice, _snapshotUnset)
          ? this.pairedPolarDevice
          : pairedPolarDevice as BleDeviceSnapshot?,
      latestM5Sample: latestM5Sample ?? this.latestM5Sample,
      latestPolarSample: latestPolarSample ?? this.latestPolarSample,
      latestRoomPrediction: latestRoomPrediction ?? this.latestRoomPrediction,
      alerts: alerts ?? this.alerts,
      lastSuccessfulPublishAt:
          lastSuccessfulPublishAt ?? this.lastSuccessfulPublishAt,
      failedPublishCount: failedPublishCount ?? this.failedPublishCount,
      lastPublishFailure: identical(lastPublishFailure, _snapshotUnset)
          ? this.lastPublishFailure
          : lastPublishFailure as TelemetryPublishResult?,
    );
  }

  GatewayRuntimeSnapshot recordPublish(TelemetryPublishResult result) {
    if (result.success) {
      return copyWith(
        lastSuccessfulPublishAt: result.publishedAt,
        failedPublishCount: 0,
        lastPublishFailure: null,
      );
    }
    return copyWith(
      failedPublishCount: failedPublishCount + 1,
      lastPublishFailure: result,
    );
  }
}

String? _safePortalUrl(Object? value) {
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
  if (uri.scheme != 'http' && uri.scheme != 'https') {
    return null;
  }
  return raw;
}

String _fallbackAlertTitle(String? alertType) {
  final normalized = (alertType ?? 'alert').replaceAll('_', ' ').trim();
  if (normalized.isEmpty) {
    return 'Clinical alert';
  }
  return '${normalized[0].toUpperCase()}${normalized.substring(1)} alert';
}

GatewayAlertSeverity _severity(Object? value) {
  final normalized = '$value'.trim().toLowerCase();
  if (normalized == 'critical' ||
      normalized == 'high' ||
      normalized == 'emergency') {
    return GatewayAlertSeverity.critical;
  }
  if (normalized == 'warning' || normalized == 'medium') {
    return GatewayAlertSeverity.warning;
  }
  if (normalized == 'info' || normalized == 'low') {
    return GatewayAlertSeverity.info;
  }
  return GatewayAlertSeverity.normal;
}

int? _int(Object? value) {
  if (value == null) {
    return null;
  }
  if (value is num) {
    return value.round();
  }
  return int.tryParse('$value');
}

double _double(Object? value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse('$value') ?? 0;
}

bool? _bool(Object? value) {
  if (value == null) {
    return null;
  }
  if (value is bool) {
    return value;
  }
  final normalized = '$value'.trim().toLowerCase();
  if (normalized == 'true' || normalized == '1' || normalized == 'yes') {
    return true;
  }
  if (normalized == 'false' || normalized == '0' || normalized == 'no') {
    return false;
  }
  return null;
}

String? _string(Object? value) {
  if (value == null || '$value'.trim().isEmpty) {
    return null;
  }
  return '$value'.trim();
}

DateTime _date(Object? value) {
  if (value == null || '$value'.trim().isEmpty) {
    return DateTime.now();
  }
  return DateTime.tryParse('$value') ?? DateTime.now();
}

GatewayConfig applyMqttConfigUpdate(
  GatewayConfig current,
  Map<String, Object?> payload,
) {
  return GatewayConfigUpdate.fromPayload(payload).applyTo(current);
}

bool gatewayConfigEquals(GatewayConfig left, GatewayConfig right) {
  return left.deviceId == right.deviceId &&
      left.mqttHost == right.mqttHost &&
      left.mqttPort == right.mqttPort &&
      left.mqttUseTls == right.mqttUseTls &&
      left.mqttUsername == right.mqttUsername &&
      left.mqttPassword == right.mqttPassword &&
      left.portalBaseUrl == right.portalBaseUrl &&
      left.bleServiceUuid == right.bleServiceUuid &&
      left.bleTelemetryCharacteristicUuid ==
          right.bleTelemetryCharacteristicUuid &&
      left.linkedPatientId == right.linkedPatientId &&
      left.linkedCaregiverId == right.linkedCaregiverId &&
      left.linkedPersonType == right.linkedPersonType &&
      left.alertsEnabled == right.alertsEnabled &&
      left.setupCompleted == right.setupCompleted;
}

bool shouldAutoStartBleRelay({
  required GatewayConfig config,
  required GatewayStatus status,
  required bool requested,
}) {
  return requested && config.setupCompleted && status.bleReady;
}
