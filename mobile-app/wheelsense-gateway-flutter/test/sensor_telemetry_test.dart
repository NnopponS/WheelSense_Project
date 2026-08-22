import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/sensor_telemetry.dart';

void main() {
  test('M5TelemetrySample parses gyro and battery payload', () {
    const payload = '''
{
  "seq": 7,
  "device_name": "WheelSense Chair",
  "timestamp": "2026-05-17T03:00:00Z",
  "imu": {"gx": 1.25, "gy": -2.5, "gz": 3.75, "ax": 0.1, "ay": 0.2, "az": 0.3},
  "motion": {"distance_m": 1.2, "velocity_ms": 0.4, "accel_ms2": 0.05},
  "battery": {"percentage": 84, "voltage_v": 3.91, "charging": false}
}
''';

    final sample = M5TelemetrySample.fromPayload(payload);

    expect(sample.seq, 7);
    expect(sample.gyroX, 1.25);
    expect(sample.gyroY, -2.5);
    expect(sample.gyroZ, 3.75);
    expect(sample.distanceM, 1.2);
    expect(sample.velocityMs, 0.4);
    expect(sample.accelMs2, 0.05);
    expect(sample.deviceName, 'WheelSense Chair');
    expect(sample.batteryPercent, 84);
    expect(sample.batteryVoltageV, 3.91);
    expect(sample.batteryCharging, isFalse);
  });

  test('PolarTelemetrySample parses heart rate and RR intervals', () {
    final sample = PolarTelemetrySample.fromHeartRateMeasurement(<int>[
      0x10,
      72,
      0x00,
      0x04,
    ], rssi: -62);

    expect(sample.heartRateBpm, 72);
    expect(sample.rrIntervalsMs, hasLength(1));
    expect(sample.rrIntervalsMs.single, closeTo(1000, 0.01));
    expect(sample.signalLabel, 'Good');
  });

  test('M5TelemetrySample parses complete M5StickCPlus2 gateway payload', () {
    const firmwarePayload = '''
{
  "device_id": "M5StickCPlus2-B14C",
  "device_name": "WheelSense Chair",
  "device_type": "wheelchair",
  "hardware_type": "companion_m5",
  "firmware": "4.0.0-ble-gateway",
  "model": "M5StickCPlus2",
  "seq": 42,
  "timestamp": "2026-08-22T07:05:00.000Z",
  "uptime_ms": 152340,
  "room_id": "ROOM_101",
  "room_name": "Physical Therapy Lab",
  "imu": {
    "ax": 0.02,
    "ay": -0.01,
    "az": 0.99,
    "gx": 0.15,
    "gy": -0.22,
    "gz": 0.05,
    "valid": true
  },
  "motion": {
    "distance_m": 25.4,
    "velocity_ms": 1.15,
    "accel_ms2": 0.35,
    "direction": 1
  },
  "battery": {
    "percentage": 92,
    "voltage_v": 4.12,
    "charging": false
  },
  "is_recording": true,
  "action_label": "propulsion_test",
  "record_elapsed_ms": 12500
}
''';

    final sample = M5TelemetrySample.fromPayload(firmwarePayload);

    expect(sample.deviceId, 'M5StickCPlus2-B14C');
    expect(sample.deviceName, 'WheelSense Chair');
    expect(sample.firmware, '4.0.0-ble-gateway');
    expect(sample.model, 'M5StickCPlus2');
    expect(sample.seq, 42);
    expect(sample.roomId, 'ROOM_101');
    expect(sample.roomName, 'Physical Therapy Lab');
    expect(sample.accelX, 0.02);
    expect(sample.accelZ, 0.99);
    expect(sample.gyroX, 0.15);
    expect(sample.imuValid, isTrue);
    expect(sample.distanceM, 25.4);
    expect(sample.velocityMs, 1.15);
    expect(sample.accelMs2, 0.35);
    expect(sample.direction, 1);
    expect(sample.batteryPercent, 92);
    expect(sample.batteryVoltageV, 4.12);
    expect(sample.batteryCharging, isFalse);
    expect(sample.isRecording, isTrue);
  });

  test('M5TelemetrySample parses 30-byte binary frame correctly', () {
    final buffer = ByteData(30);
    buffer.setUint32(0, 105, Endian.little); // seq
    buffer.setUint32(4, 1724310000000 % 4294967296, Endian.little); // timestamp
    buffer.setInt16(8, 120, Endian.little); // ax: 0.120g
    buffer.setInt16(10, -350, Endian.little); // ay: -0.350g
    buffer.setInt16(12, 980, Endian.little); // az: 0.980g
    buffer.setInt16(14, 45, Endian.little); // gx: 4.5 dps
    buffer.setInt16(16, -120, Endian.little); // gy: -12.0 dps
    buffer.setInt16(18, 320, Endian.little); // gz: 32.0 dps
    buffer.setUint8(20, 88); // battery: 88%
    buffer.setUint16(21, 4050, Endian.little); // battery: 4.05V
    buffer.setInt16(23, 145, Endian.little); // velocity: 1.45 m/s
    buffer.setUint32(25, 3420, Endian.little); // distance: 34.20 m
    buffer.setUint8(29, 3); // flags: recording(1) + imuValid(2)

    final sample = M5TelemetrySample.fromBytes(
      buffer.buffer.asUint8List(),
      deviceId: 'M5-TEST',
      deviceName: 'Wheelchair Right',
    );

    expect(sample.seq, 105);
    expect(sample.accelX, closeTo(0.120, 0.001));
    expect(sample.accelY, closeTo(-0.350, 0.001));
    expect(sample.accelZ, closeTo(0.980, 0.001));
    expect(sample.gyroX, closeTo(4.5, 0.01));
    expect(sample.gyroY, closeTo(-12.0, 0.01));
    expect(sample.gyroZ, closeTo(32.0, 0.01));
    expect(sample.batteryPercent, 88);
    expect(sample.batteryVoltageV, closeTo(4.05, 0.01));
    expect(sample.velocityMs, closeTo(1.45, 0.01));
    expect(sample.distanceM, closeTo(34.20, 0.01));
    expect(sample.isRecording, isTrue);
    expect(sample.imuValid, isTrue);
    expect(sample.batteryCharging, isFalse);
    expect(sample.deviceId, 'M5-TEST');
    expect(sample.deviceName, 'Wheelchair Right');
  });

  test('M5TelemetrySample parses 20-byte raw IMU frame correctly', () {
    final buffer = ByteData(20);
    buffer.setUint32(0, 501, Endian.little); // seq
    buffer.setUint32(4, 1200000, Endian.little); // tDeviceUs
    buffer.setInt16(8, 2048, Endian.little); // rawAx: 2048 LSB (1.0g with ±16g scale)
    buffer.setInt16(10, 0, Endian.little); // rawAy
    buffer.setInt16(12, -2048, Endian.little); // rawAz: -1.0g
    buffer.setInt16(14, 164, Endian.little); // rawGx: 10.0 dps
    buffer.setInt16(16, 0, Endian.little); // rawGy
    buffer.setInt16(18, -164, Endian.little); // rawGz: -10.0 dps

    final sample = M5TelemetrySample.fromRawBytes(
      buffer.buffer.asUint8List(),
      deviceId: 'BOARD_001',
    );

    expect(sample.seq, 501);
    expect(sample.tDeviceUs, 1200000);
    expect(sample.rawAx, 2048);
    expect(sample.accelX, closeTo(1.0, 0.05));
    expect(sample.accelZ, closeTo(-1.0, 0.05));
    expect(sample.gyroX, closeTo(10.0, 0.1));
    expect(sample.gyroZ, closeTo(-10.0, 0.1));
  });

  test('PolarTelemetrySample serializes full 6-stream telemetry correctly', () {
    final sample = PolarTelemetrySample(
      timestamp: DateTime.utc(2026, 8, 22, 10, 0, 0),
      heartRateBpm: 75,
      rrIntervalsMs: const [800.0, 805.5],
      rssi: -55,
      spo2Percent: 99,
      spo2Estimated: true,
      sensorBatteryPercent: 95,
      contactStatus: true,
      accelXMg: 15,
      accelYMg: -980,
      accelZMg: 45,
      gyroXDps: 0.5,
      gyroYDps: -1.2,
      gyroZDps: 0.1,
      magXGauss: 120.0,
      magYGauss: -230.0,
      magZGauss: 410.0,
      ppgQuality: 100,
    );

    final json = sample.toServerPolarJson();
    expect(json['heart_rate_bpm'], 75);
    expect(json['rr_interval_ms'], 800.0);
    expect(json['spo2_percent'], 99);
    expect(json['contact_status'], isTrue);
    expect(json['accel'], isA<Map>());
    expect(json['gyro'], isA<Map>());
    expect(json['mag'], isA<Map>());
  });
}
