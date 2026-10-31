import 'dart:convert';

enum FallAlertKind { suspect, detected, canceled, test, unknown }

class FallAlertEvent {
  const FallAlertEvent({
    required this.kind,
    required this.event,
    required this.deviceId,
    required this.timestamp,
    this.uptimeMs,
    this.peakG,
    this.batteryPercent,
    this.countdownSeconds,
    this.reason,
    this.source,
    required this.rawPayload,
  });

  final FallAlertKind kind;
  final String event;
  final String deviceId;
  final DateTime timestamp;
  final int? uptimeMs;
  final double? peakG;
  final int? batteryPercent;
  final int? countdownSeconds;
  final String? reason;
  final String? source;
  final String rawPayload;

  factory FallAlertEvent.fromJson(
    Map<String, Object?> json, {
    required String deviceId,
  }) {
    final event = _string(json['event']) ?? '';
    final ts = _nullableInt(json['ts']);
    return FallAlertEvent(
      kind: _kindFromEvent(event),
      event: event,
      deviceId: _string(json['device_id']) ?? deviceId,
      timestamp: ts != null && ts > 0
          ? DateTime.fromMillisecondsSinceEpoch(ts)
          : DateTime.now(),
      uptimeMs: _nullableInt(json['uptime_ms']),
      peakG: _nullableNumber(json['peak_g']),
      batteryPercent: _nullableInt(json['battery_pct']),
      countdownSeconds: _nullableInt(json['countdown_s']),
      reason: _string(json['reason']),
      source: _string(json['source']),
      rawPayload: jsonEncode(json),
    );
  }

  static FallAlertEvent? tryParse(String raw, {required String deviceId}) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) {
      return null;
    }
    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is! Map) {
        return null;
      }
      final map = Map<String, Object?>.from(decoded);
      final eventValue = map['event'];
      if (eventValue is! String || eventValue.trim().isEmpty) {
        return null;
      }
      final parsed = FallAlertEvent.fromJson(map, deviceId: deviceId);
      return FallAlertEvent(
        kind: parsed.kind,
        event: parsed.event,
        deviceId: parsed.deviceId,
        timestamp: parsed.timestamp,
        uptimeMs: parsed.uptimeMs,
        peakG: parsed.peakG,
        batteryPercent: parsed.batteryPercent,
        countdownSeconds: parsed.countdownSeconds,
        reason: parsed.reason,
        source: parsed.source,
        rawPayload: trimmed,
      );
    } on Object {
      return null;
    }
  }

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'kind': kind.name,
      'event': event,
      'device_id': deviceId,
      'timestamp': timestamp.toUtc().toIso8601String(),
      'uptime_ms': uptimeMs,
      'peak_g': peakG,
      'battery_pct': batteryPercent,
      'countdown_s': countdownSeconds,
      'reason': reason,
      'source': source,
      'raw_payload': rawPayload,
    };
  }

  String toJsonString() => jsonEncode(toJson());

  static FallAlertKind _kindFromEvent(String event) {
    switch (event) {
      case 'fall_suspect':
        return FallAlertKind.suspect;
      case 'fall_detected':
        return FallAlertKind.detected;
      case 'fall_canceled':
        return FallAlertKind.canceled;
      case 'fall_test':
        return FallAlertKind.test;
      default:
        return FallAlertKind.unknown;
    }
  }

  static String? _string(Object? value) {
    if (value == null || '$value'.trim().isEmpty) {
      return null;
    }
    return '$value';
  }

  static double? _nullableNumber(Object? value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse('$value');
  }

  static int? _nullableInt(Object? value) {
    if (value == null) return null;
    if (value is num) return value.round();
    return int.tryParse('$value');
  }
}
