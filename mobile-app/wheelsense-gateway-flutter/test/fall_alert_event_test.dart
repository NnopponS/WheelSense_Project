import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/fall_alert_event.dart';

const _deviceId = 'M5_BELT1';

void main() {
  group('FallAlertEvent', () {
    test('parses fall_suspect payload with countdown', () {
      const payload = '''
{"event":"fall_suspect","device_id":"M5_BELT1","uptime_ms":12345,"ts":1761000000000,"countdown_s":10}
''';

      final event = FallAlertEvent.tryParse(payload, deviceId: _deviceId);

      expect(event, isNotNull);
      expect(event!.kind, FallAlertKind.suspect);
      expect(event.deviceId, 'M5_BELT1');
      expect(event.uptimeMs, 12345);
      expect(event.countdownSeconds, 10);
      expect(event.timestamp.millisecondsSinceEpoch, 1761000000000);
    });

    test('parses fall_detected payload with impact metrics', () {
      const payload = '''
{"event":"fall_detected","device_id":"M5_BELT1","uptime_ms":23456,"ts":1761000000000,"peak_g":3.42,"battery_pct":87,"reason":"freefall_impact_stillness"}
''';

      final event = FallAlertEvent.tryParse(payload, deviceId: _deviceId);

      expect(event, isNotNull);
      expect(event!.kind, FallAlertKind.detected);
      expect(event.deviceId, 'M5_BELT1');
      expect(event.uptimeMs, 23456);
      expect(event.peakG, closeTo(3.42, 0.001));
      expect(event.batteryPercent, 87);
      expect(event.reason, 'freefall_impact_stillness');
      expect(event.timestamp.millisecondsSinceEpoch, 1761000000000);
    });

    test('parses fall_canceled payload with source', () {
      final fromDevice = FallAlertEvent.tryParse(
        '{"event":"fall_canceled","device_id":"M5_BELT1","uptime_ms":999,"source":"device_button"}',
        deviceId: _deviceId,
      );
      final fromBle = FallAlertEvent.tryParse(
        '{"event":"fall_canceled","device_id":"M5_BELT1","uptime_ms":1200,"source":"ble_command"}',
        deviceId: _deviceId,
      );

      expect(fromDevice, isNotNull);
      expect(fromDevice!.kind, FallAlertKind.canceled);
      expect(fromDevice.source, 'device_button');
      expect(fromBle, isNotNull);
      expect(fromBle!.kind, FallAlertKind.canceled);
      expect(fromBle.source, 'ble_command');
    });

    test('parses fall_test payload', () {
      const payload = '''
{"event":"fall_test","device_id":"M5_BELT1","uptime_ms":4567,"ts":1761000000000,"peak_g":1.8,"battery_pct":92,"reason":"test"}
''';

      final event = FallAlertEvent.tryParse(payload, deviceId: _deviceId);

      expect(event, isNotNull);
      expect(event!.kind, FallAlertKind.test);
      expect(event.deviceId, 'M5_BELT1');
      expect(event.reason, 'test');
      expect(event.peakG, closeTo(1.8, 0.001));
      expect(event.batteryPercent, 92);
    });

    test('accepts integer peak_g values', () {
      final event = FallAlertEvent.tryParse(
        '{"event":"fall_detected","device_id":"M5_BELT1","uptime_ms":7,"peak_g":3}',
        deviceId: _deviceId,
      );

      expect(event, isNotNull);
      expect(event!.peakG, 3);
    });

    test('maps ts epoch ms to timestamp and falls back to now', () {
      final synced = FallAlertEvent.tryParse(
        '{"event":"fall_detected","device_id":"M5_BELT1","uptime_ms":1,"ts":1761000000000}',
        deviceId: _deviceId,
      )!;
      expect(synced.timestamp.millisecondsSinceEpoch, 1761000000000);

      final zeroTs = FallAlertEvent.tryParse(
        '{"event":"fall_detected","device_id":"M5_BELT1","uptime_ms":1,"ts":0}',
        deviceId: _deviceId,
      )!;
      final missingTs = FallAlertEvent.tryParse(
        '{"event":"fall_detected","device_id":"M5_BELT1","uptime_ms":1}',
        deviceId: _deviceId,
      )!;

      for (final event in [zeroTs, missingTs]) {
        expect(
          DateTime.now().difference(event.timestamp).inSeconds.abs(),
          lessThan(5),
        );
      }
    });

    test('tryParse returns null for malformed or invalid payloads', () {
      expect(FallAlertEvent.tryParse('not json', deviceId: _deviceId), isNull);
      expect(FallAlertEvent.tryParse('{"event":', deviceId: _deviceId), isNull);
      expect(
        FallAlertEvent.tryParse('[{"event":"fall_test"}]', deviceId: _deviceId),
        isNull,
      );
      expect(FallAlertEvent.tryParse('[]', deviceId: _deviceId), isNull);
      expect(
        FallAlertEvent.tryParse('{"device_id":"M5_BELT1"}', deviceId: _deviceId),
        isNull,
      );
      expect(
        FallAlertEvent.tryParse('{"event":""}', deviceId: _deviceId),
        isNull,
      );
      expect(
        FallAlertEvent.tryParse('{"event":42}', deviceId: _deviceId),
        isNull,
      );
      expect(
        FallAlertEvent.tryParse('{"event":null}', deviceId: _deviceId),
        isNull,
      );
    });

    test('unknown event strings still parse as unknown kind', () {
      final event = FallAlertEvent.tryParse(
        '{"event":"fall_plateau","device_id":"M5_BELT1","uptime_ms":42}',
        deviceId: _deviceId,
      );

      expect(event, isNotNull);
      expect(event!.kind, FallAlertKind.unknown);
      expect(event.deviceId, 'M5_BELT1');
      expect(event.uptimeMs, 42);
    });

    test('falls back to BLE deviceId when payload lacks device_id', () {
      final event = FallAlertEvent.tryParse(
        '{"event":"fall_detected","uptime_ms":55,"peak_g":2.4}',
        deviceId: 'AA:BB:CC:DD:EE:FF',
      );

      expect(event, isNotNull);
      expect(event!.kind, FallAlertKind.detected);
      expect(event.deviceId, 'AA:BB:CC:DD:EE:FF');
    });

    test('toJson and toJsonString round-trip event and device_id', () {
      final event = FallAlertEvent.tryParse(
        '{"event":"fall_detected","device_id":"M5_BELT1","uptime_ms":321,"ts":1761000000000,"peak_g":2.9,"battery_pct":64,"reason":"freefall_impact_stillness"}',
        deviceId: _deviceId,
      )!;

      final json = event.toJson();
      expect(json['event'], 'fall_detected');
      expect(json['device_id'], 'M5_BELT1');

      final decoded =
          jsonDecode(event.toJsonString()) as Map<String, Object?>;
      expect(decoded['event'], 'fall_detected');
      expect(decoded['device_id'], 'M5_BELT1');

      final reparsed = FallAlertEvent.tryParse(
        event.toJsonString(),
        deviceId: _deviceId,
      );
      expect(reparsed, isNotNull);
      expect(reparsed!.kind, event.kind);
      expect(reparsed.deviceId, event.deviceId);
    });
  });
}
