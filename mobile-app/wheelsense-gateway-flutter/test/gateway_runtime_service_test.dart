import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_config.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_runtime_service.dart';

void main() {
  test('applyMqttConfigUpdate stores retained portal URL', () {
    final config = GatewayConfig.defaults();

    final next = applyMqttConfigUpdate(config, <String, Object?>{
      'portal_base_url': 'https://demo.trycloudflare.com/',
      'linked_patient_id': 12,
      'alerts_enabled': true,
    });

    expect(next.portalBaseUrl, 'https://demo.trycloudflare.com');
    expect(next.mqttHost, config.mqttHost);
  });

  test('applyMqttConfigUpdate ignores unsafe portal URL', () {
    final config = GatewayConfig.defaults().copyWith(
      portalBaseUrl: 'https://current.trycloudflare.com',
    );

    final next = applyMqttConfigUpdate(config, <String, Object?>{
      'portal_base_url': 'javascript:alert(1)',
    });

    expect(next.portalBaseUrl, 'https://current.trycloudflare.com');
  });
}
