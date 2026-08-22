import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

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
    this.rawAx,
    this.rawAy,
    this.rawAz,
    this.rawGx,
    this.rawGy,
    this.rawGz,
    this.tDeviceUs,
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

  // Raw int16 IMU values & hardware timestamp
  final int? rawAx;
  final int? rawAy;
  final int? rawAz;
  final int? rawGx;
  final int? rawGy;
  final int? rawGz;
  final int? tDeviceUs;

  double get speedKmh => velocityMs * 3.6;

  /// Parses 20-byte WheelSense / WheelAthlete raw IMU packet (§2.1).
  /// Layout: [seq 4B LE][tDeviceUs 4B LE][ax 2B LE][ay 2B LE][az 2B LE][gx 2B LE][gy 2B LE][gz 2B LE]
  static M5TelemetrySample fromRawBytes(
    Uint8List bytes, {
    String? deviceId,
    String? deviceName,
    double accelScale = 16.0 / 32768.0, // default ±16g
    double gyroScale = 2000.0 / 32768.0, // default ±2000 dps
  }) {
    if (bytes.length < 20) {
      throw ArgumentError(
        'Raw IMU frame requires at least 20 bytes, got ${bytes.length}',
        'bytes',
      );
    }
    final data = ByteData.sublistView(bytes, 0, 20);
    final seq = data.getUint32(0, Endian.little);
    final tDeviceUs = data.getUint32(4, Endian.little);
    final rawAx = data.getInt16(8, Endian.little);
    final rawAy = data.getInt16(10, Endian.little);
    final rawAz = data.getInt16(12, Endian.little);
    final rawGx = data.getInt16(14, Endian.little);
    final rawGy = data.getInt16(16, Endian.little);
    final rawGz = data.getInt16(18, Endian.little);

    final ax = rawAx * accelScale;
    final ay = rawAy * accelScale;
    final az = rawAz * accelScale;
    final gx = rawGx * gyroScale;
    final gy = rawGy * gyroScale;
    final gz = rawGz * gyroScale;
    final totalAccelG = math.sqrt(ax * ax + ay * ay + az * az);

    return M5TelemetrySample(
      timestamp: DateTime.now(),
      deviceId: deviceId,
      gyroX: gx,
      gyroY: gy,
      gyroZ: gz,
      accelX: ax,
      accelY: ay,
      accelZ: az,
      imuValid: true,
      distanceM: 0.0,
      velocityMs: 0.0,
      accelMs2: totalAccelG * 9.80665,
      direction: 0,
      seq: seq,
      deviceName: deviceName ?? 'IMU Board',
      firmware: '1.0.0-raw',
      model: 'M5StickCPlus2',
      roomId: null,
      roomName: null,
      isRecording: false,
      batteryPercent: null,
      batteryVoltageV: null,
      batteryCharging: false,
      rawPayload: '',
      rawAx: rawAx,
      rawAy: rawAy,
      rawAz: rawAz,
      rawGx: rawGx,
      rawGy: rawGy,
      rawGz: rawGz,
      tDeviceUs: tDeviceUs,
    );
  }

  /// Parses compact 30-byte WheelSense binary frame (§2.1 / BLE direct).
  static M5TelemetrySample fromBytes(
    Uint8List bytes, {
    String? deviceId,
    String? deviceName,
    String? roomId,
    String? roomName,
  }) {
    if (bytes.length < 30) {
      throw ArgumentError(
        'Binary telemetry frame requires 30 bytes, got ${bytes.length}',
        'bytes',
      );
    }
    final data = ByteData.sublistView(bytes, 0, 30);
    final seq = data.getUint32(0, Endian.little);
    final timestampMs = data.getUint32(4, Endian.little);
    final rawAx = data.getInt16(8, Endian.little);
    final rawAy = data.getInt16(10, Endian.little);
    final rawAz = data.getInt16(12, Endian.little);
    final rawGx = data.getInt16(14, Endian.little);
    final rawGy = data.getInt16(16, Endian.little);
    final rawGz = data.getInt16(18, Endian.little);

    final ax = rawAx / 1000.0;
    final ay = rawAy / 1000.0;
    final az = rawAz / 1000.0;
    final gx = rawGx / 10.0;
    final gy = rawGy / 10.0;
    final gz = rawGz / 10.0;
    final battPct = data.getUint8(20);
    final battMv = data.getUint16(21, Endian.little);
    final velMs = data.getInt16(23, Endian.little) / 100.0;
    final distM = data.getUint32(25, Endian.little) / 100.0;
    final flags = data.getUint8(29);

    final isRecording = (flags & 1) != 0;
    final imuValid = (flags & 2) != 0;
    final batteryCharging = (flags & 4) != 0;
    final totalAccelG = math.sqrt(ax * ax + ay * ay + az * az);

    return M5TelemetrySample(
      timestamp: DateTime.fromMillisecondsSinceEpoch(
        timestampMs > 0 ? timestampMs : DateTime.now().millisecondsSinceEpoch,
      ),
      deviceId: deviceId,
      gyroX: gx,
      gyroY: gy,
      gyroZ: gz,
      accelX: ax,
      accelY: ay,
      accelZ: az,
      imuValid: imuValid,
      distanceM: distM,
      velocityMs: velMs,
      accelMs2: totalAccelG * 9.80665,
      direction: velMs > 0.01 ? 1 : (velMs < -0.01 ? -1 : 0),
      seq: seq,
      deviceName: deviceName ?? 'M5StickCPlus2',
      firmware: '4.0.0-binary',
      model: 'M5StickCPlus2',
      roomId: roomId,
      roomName: roomName,
      isRecording: isRecording,
      batteryPercent: battPct > 0 ? battPct : null,
      batteryVoltageV: battMv > 0 ? (battMv / 1000.0) : null,
      batteryCharging: batteryCharging,
      rawPayload: '',
      rawAx: rawAx,
      rawAy: rawAy,
      rawAz: rawAz,
      rawGx: rawGx,
      rawGy: rawGy,
      rawGz: rawGz,
      tDeviceUs: timestampMs * 1000,
    );
  }

  String toJsonString() {
    final map = <String, Object?>{
      'seq': seq,
      'timestamp': timestamp.toUtc().toIso8601String(),
      'device_id': deviceId,
      'device_name': deviceName,
      'firmware': firmware,
      'model': model ?? 'M5StickCPlus2',
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
        if (rawAx != null) 'raw_ax': rawAx,
        if (rawAy != null) 'raw_ay': rawAy,
        if (rawAz != null) 'raw_az': rawAz,
        if (rawGx != null) 'raw_gx': rawGx,
        if (rawGy != null) 'raw_gy': rawGy,
        if (rawGz != null) 'raw_gz': rawGz,
        if (tDeviceUs != null) 't_device_us': tDeviceUs,
      },
      'motion': <String, Object?>{
        'distance_m': distanceM,
        'velocity_ms': velocityMs,
        'speed_kmh': speedKmh,
        'accel_ms2': accelMs2,
        'direction': direction,
      },
      'battery': <String, Object?>{
        'percentage': batteryPercent,
        'voltage_v': batteryVoltageV,
        'charging': batteryCharging,
      },
    };
    return jsonEncode(map);
  }

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
      rawAx: _nullableInt(imu['raw_ax']),
      rawAy: _nullableInt(imu['raw_ay']),
      rawAz: _nullableInt(imu['raw_az']),
      rawGx: _nullableInt(imu['raw_gx']),
      rawGy: _nullableInt(imu['raw_gy']),
      rawGz: _nullableInt(imu['raw_gz']),
      tDeviceUs: _nullableInt(imu['t_device_us']),
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
        if (rawAx != null) 'raw_ax': rawAx,
        if (rawAy != null) 'raw_ay': rawAy,
        if (rawAz != null) 'raw_az': rawAz,
        if (rawGx != null) 'raw_gx': rawGx,
        if (rawGy != null) 'raw_gy': rawGy,
        if (rawGz != null) 'raw_gz': rawGz,
        if (tDeviceUs != null) 't_device_us': tDeviceUs,
      },
      'motion': <String, Object?>{
        'distance_m': distanceM,
        'velocity_ms': velocityMs,
        'speed_kmh': speedKmh,
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

  static int? _nullableInt(Object? value) {
    if (value == null) return null;
    if (value is num) return value.round();
    return int.tryParse('$value');
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
    this.accelXMg,
    this.accelYMg,
    this.accelZMg,
    this.gyroXDps,
    this.gyroYDps,
    this.gyroZDps,
    this.magXGauss,
    this.magYGauss,
    this.magZGauss,
    this.ppgSamples = const <List<int>>[],
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

  // Polar Verity Sense 3D Motion Streams
  final int? accelXMg;
  final int? accelYMg;
  final int? accelZMg;
  final double? gyroXDps;
  final double? gyroYDps;
  final double? gyroZDps;
  final double? magXGauss;
  final double? magYGauss;
  final double? magZGauss;

  // Optical PPG Raw Data (4 channels per sample)
  final List<List<int>> ppgSamples;

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

  Map<String, Object?> toServerPolarJson() {
    return <String, Object?>{
      'heart_rate_bpm': heartRateBpm,
      'rr_interval_ms': rrIntervalsMs.isEmpty ? null : rrIntervalsMs.first,
      'rr_intervals_ms': rrIntervalsMs,
      if (spo2Percent != null) 'spo2': spo2Percent,
      if (spo2Percent != null) 'spo2_percent': spo2Percent,
      'spo2_estimated': spo2Estimated,
      if (sensorBatteryPercent != null) 'sensor_battery': sensorBatteryPercent,
      if (contactStatus != null) 'contact_status': contactStatus,
      if (accelXMg != null)
        'accel': <String, Object?>{
          'x_mg': accelXMg,
          'y_mg': accelYMg,
          'z_mg': accelZMg,
        },
      if (gyroXDps != null)
        'gyro': <String, Object?>{
          'x_dps': gyroXDps,
          'y_dps': gyroYDps,
          'z_dps': gyroZDps,
        },
      if (magXGauss != null)
        'mag': <String, Object?>{
          'x_gauss': magXGauss,
          'y_gauss': magYGauss,
          'z_gauss': magZGauss,
        },
      if (ppgQuality != null) 'ppg_quality': ppgQuality,
      if (ppgRatio != null) 'ppg_ratio': ppgRatio,
    };
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

/// Represents a discovered Node_Tsimcam or BLE Camera Beacon.
class NodeTsimcamSnapshot {
  const NodeTsimcamSnapshot({
    required this.deviceId,
    required this.nodeId,
    required this.bleMac,
    required this.rssi,
    required this.lastSeen,
    this.ipAddress,
    this.firmware,
    this.batteryPercent,
    this.batteryVoltageV,
    this.streamEnabled = false,
    this.framesCaptured = 0,
    this.status = 'discovered',
  });

  final String deviceId;
  final String nodeId;
  final String bleMac;
  final int rssi;
  final DateTime lastSeen;
  final String? ipAddress;
  final String? firmware;
  final int? batteryPercent;
  final double? batteryVoltageV;
  final bool streamEnabled;
  final int framesCaptured;
  final String status;

  NodeTsimcamSnapshot copyWith({
    String? deviceId,
    String? nodeId,
    String? bleMac,
    int? rssi,
    DateTime? lastSeen,
    String? ipAddress,
    String? firmware,
    int? batteryPercent,
    double? batteryVoltageV,
    bool? streamEnabled,
    int? framesCaptured,
    String? status,
  }) {
    return NodeTsimcamSnapshot(
      deviceId: deviceId ?? this.deviceId,
      nodeId: nodeId ?? this.nodeId,
      bleMac: bleMac ?? this.bleMac,
      rssi: rssi ?? this.rssi,
      lastSeen: lastSeen ?? this.lastSeen,
      ipAddress: ipAddress ?? this.ipAddress,
      firmware: firmware ?? this.firmware,
      batteryPercent: batteryPercent ?? this.batteryPercent,
      batteryVoltageV: batteryVoltageV ?? this.batteryVoltageV,
      streamEnabled: streamEnabled ?? this.streamEnabled,
      framesCaptured: framesCaptured ?? this.framesCaptured,
      status: status ?? this.status,
    );
  }
}
