import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_config.dart';

void main() {
  test('defaults match the M5StickC Plus2 firmware service and telemetry', () {
    final config = GatewayConfig.defaults();
    expect(config.bleServiceUuid, '8f6e0001-b5a3-f393-e0a9-e50e24dcca9e');
    expect(
      config.bleTelemetryCharacteristicUuid,
      '8f6e0003-b5a3-f393-e0a9-e50e24dcca9e',
    );
  });

  test('saved legacy UUIDs migrate without changing broker settings', () {
    final config = GatewayConfig.fromJson({
      'bleServiceUuid': '0000a1b2-0000-1000-8000-00805f9b34fb',
      'bleTelemetryCharacteristicUuid': '0000a1b3-0000-1000-8000-00805f9b34fb',
      'mqttHost': 'example.org',
      'mqttPort': 8883,
      'mqttUseTls': true,
    });
    expect(config.bleServiceUuid, '8f6e0001-b5a3-f393-e0a9-e50e24dcca9e');
    expect(
      config.bleTelemetryCharacteristicUuid,
      '8f6e0003-b5a3-f393-e0a9-e50e24dcca9e',
    );
    expect(config.mqttHost, 'example.org');
    expect(config.mqttPort, 8883);
    expect(config.mqttUseTls, isTrue);
  });

  test('custom BLE UUIDs remain configurable', () {
    final config = GatewayConfig.fromJson({
      'bleServiceUuid': '12340001-0000-1000-8000-00805f9b34fb',
      'bleTelemetryCharacteristicUuid': '12340002-0000-1000-8000-00805f9b34fb',
    });
    expect(config.bleServiceUuid, '12340001-0000-1000-8000-00805f9b34fb');
    expect(
      config.bleTelemetryCharacteristicUuid,
      '12340002-0000-1000-8000-00805f9b34fb',
    );
  });
}
