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
}
