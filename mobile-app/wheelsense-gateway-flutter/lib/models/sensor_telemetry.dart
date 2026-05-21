import 'dart:convert';

class M5TelemetrySample {
  const M5TelemetrySample({
    required this.timestamp,
    required this.deviceId,
    required this.gyroX,
    required this.gyroY,
    required this.gyroZ,
    required this.accelX,
    required this.accelY,
    required this.accelZ,
    required this.imuValid,
    required this.distanceM,
    required this.velocityMs,
    required this.accelMs2,
    required this.direction,
    required this.seq,
    required this.deviceName,
    required this.firmware,
    required this.model,
    required this.roomId,
    required this.roomName,
    required this.isRecording,
    required this.batteryPercent,
    required this.batteryVoltageV,
    required this.batteryCharging,
    required this.rawPayload,
  });

  final DateTime timestamp;
  final String? deviceId;
  final double gyroX;
  final double gyroY;
  final double gyroZ;
  final double accelX;
  final double accelY;
  final double accelZ;
  final bool imuValid;
  final double distanceM;
  final double velocityMs;
  final double accelMs2;
  final int? direction;
  final int seq;
  final String? deviceName;
  final String? firmware;
  final String? model;
  final String? roomId;
  final String? roomName;
  final bool isRecording;
  final int? batteryPercent;
  final double? batteryVoltageV;
  final bool batteryCharging;
  final String rawPayload;

  static M5TelemetrySample fromPayload(String payload) {
    final decoded = jsonDecode(payload);
    final map = decoded is Map
        ? Map<String, Object?>.from(decoded)
        : <String, Object?>{};
    final imu = _childMap(map['imu']);
    final motion = _childMap(map['motion']);
    final battery = _childMap(map['battery']);
    return M5TelemetrySample(
      timestamp: _timestamp(map['timestamp']),
      deviceId: _string(map['device_id']),
      gyroX: _number(_first(imu['gx'], map['gx'], map['gyro_x'])),
      gyroY: _number(_first(imu['gy'], map['gy'], map['gyro_y'])),
      gyroZ: _number(_first(imu['gz'], map['gz'], map['gyro_z'])),
      accelX: _number(_first(imu['ax'], map['ax'], map['accel_x'])),
      accelY: _number(_first(imu['ay'], map['ay'], map['accel_y'])),
      accelZ: _number(_first(imu['az'], map['az'], map['accel_z'])),
      imuValid: _bool(_first(imu['valid'], map['imu_valid']), fallback: true),
      distanceM: _number(_first(motion['distance_m'], map['distance_m'])),
      velocityMs: _number(_first(motion['velocity_ms'], map['velocity_ms'])),
      accelMs2: _number(_first(motion['accel_ms2'], map['accel_ms2'])),
      direction: _direction(_first(motion['direction'], map['direction'])),
      seq: _int(map['seq']),
      deviceName: _string(_first(map['device_name'], map['name'])),
      firmware: _string(_first(map['firmware'], map['firmware_version'])),
      model: _string(map['model']),
      roomId: _string(map['room_id']),
      roomName: _string(map['room_name']),
      isRecording: _bool(map['is_recording']),
      batteryPercent:
          _first(battery['percentage'], map['battery_pct']) == null
          ? null
          : _int(_first(battery['percentage'], map['battery_pct'])),
      batteryVoltageV:
          _first(battery['voltage_v'], map['battery_v']) == null
          ? null
          : _number(_first(battery['voltage_v'], map['battery_v'])),
      batteryCharging: _bool(_first(battery['charging'], map['charging'])),
      rawPayload: payload,
    );
  }

  Map<String, Object?> toServerCompanionJson() {
    return <String, Object?>{
      'device_id': deviceId,
      'device_name': deviceName,
      'device_type': 'wheelchair',
      'hardware_type': 'companion_m5',
      'firmware': firmware,
      'model': model ?? 'M5StickCPlus2',
      'seq': seq,
      'timestamp': timestamp.toUtc().toIso8601String(),
      'room_id': roomId,
      'room_name': roomName,
      'is_recording': isRecording,
      'imu': <String, Object?>{
        'ax': accelX,
        'ay': accelY,
        'az': accelZ,
        'gx': gyroX,
        'gy': gyroY,
        'gz': gyroZ,
        'valid': imuValid,
      },
      'motion': <String, Object?>{
        'distance_m': distanceM,
        'velocity_ms': velocityMs,
        'accel_ms2': accelMs2,
        'direction': direction,
      },
      'battery': <String, Object?>{
        'percentage': batteryPercent,
        'voltage_v': batteryVoltageV,
        'charging': batteryCharging,
      },
    };
  }

  static Map<String, Object?> _childMap(Object? value) {
    return value is Map
        ? Map<String, Object?>.from(value)
        : <String, Object?>{};
  }

  static double _number(Object? value) {
    if (value is num) {
      return value.toDouble();
    }
    return double.tryParse('$value') ?? 0;
  }

  static Object? _first(Object? first, [Object? second, Object? third]) {
    for (final value in <Object?>[first, second, third]) {
      if (value != null && '$value'.trim().isNotEmpty) {
        return value;
      }
    }
    return null;
  }

  static String? _string(Object? value) {
    if (value == null || '$value'.trim().isEmpty) {
      return null;
    }
    return '$value';
  }

  static bool _bool(Object? value, {bool fallback = false}) {
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
    return fallback;
  }

  static int _int(Object? value) {
    if (value is num) {
      return value.round();
    }
    return int.tryParse('$value') ?? 0;
  }

  static int? _direction(Object? value) {
    if (value == null || '$value'.trim().isEmpty) {
      return null;
    }
    if (value is num) {
      return value.round();
    }
    final normalized = '$value'.trim().toLowerCase();
    if (normalized == 'forward' || normalized == 'fwd') {
      return 1;
    }
    if (normalized == 'reverse' || normalized == 'backward' || normalized == 'back') {
      return -1;
    }
    if (normalized == 'stopped' || normalized == 'stop' || normalized == 'idle') {
      return 0;
    }
    return int.tryParse(normalized);
  }

  static DateTime _timestamp(Object? value) {
    final parsed = value == null ? null : DateTime.tryParse('$value');
    return parsed ?? DateTime.now();
  }
}

class PolarTelemetrySample {
  const PolarTelemetrySample({
    required this.timestamp,
    required this.heartRateBpm,
    required this.rrIntervalsMs,
    required this.rssi,
    this.spo2Percent,
    this.spo2Estimated = false,
    this.sensorBatteryPercent,
    this.ppgQuality,
    this.ppgRatio,
    this.contactStatus,
  });

  final DateTime timestamp;
  final int heartRateBpm;
  final List<double> rrIntervalsMs;
  final int? rssi;
  final int? spo2Percent;
  final bool spo2Estimated;
  final int? sensorBatteryPercent;
  final int? ppgQuality;
  final double? ppgRatio;
  final bool? contactStatus;

  String get signalLabel {
    final value = rssi;
    if (value == null) {
      return 'RSSI n/a';
    }
    if (value >= -60) {
      return 'Strong';
    }
    if (value >= -75) {
      return 'Good';
    }
    return 'Weak';
  }

  static PolarTelemetrySample fromHeartRateMeasurement(
    List<int> bytes, {
    int? rssi,
  }) {
    if (bytes.isEmpty) {
      return PolarTelemetrySample(
        timestamp: DateTime.now(),
        heartRateBpm: 0,
        rrIntervalsMs: const <double>[],
        rssi: rssi,
      );
    }

    final flags = bytes[0];
    var index = 1;
    final hr16 = (flags & 0x01) != 0;
    final bpm = hr16 && bytes.length >= 3
        ? bytes[index] | (bytes[index + 1] << 8)
        : bytes.length > index
        ? bytes[index]
        : 0;
    index += hr16 ? 2 : 1;

    final hasEnergy = (flags & 0x08) != 0;
    if (hasEnergy && bytes.length >= index + 2) {
      index += 2;
    }

    final rrIntervals = <double>[];
    final hasRr = (flags & 0x10) != 0;
    if (hasRr) {
      while (bytes.length >= index + 2) {
        final raw = bytes[index] | (bytes[index + 1] << 8);
        rrIntervals.add(raw * 1000 / 1024);
        index += 2;
      }
    }

    return PolarTelemetrySample(
      timestamp: DateTime.now(),
      heartRateBpm: bpm,
      rrIntervalsMs: rrIntervals,
      rssi: rssi,
    );
  }
}
