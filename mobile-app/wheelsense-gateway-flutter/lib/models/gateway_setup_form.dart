import 'gateway_config.dart';
import 'mqtt_broker_config.dart';

class GatewaySetupFormResult {
  const GatewaySetupFormResult._({this.config, this.error});

  const GatewaySetupFormResult.valid(GatewayConfig config)
    : this._(config: config);

  const GatewaySetupFormResult.invalid(String error) : this._(error: error);

  final GatewayConfig? config;
  final String? error;

  bool get isValid => config != null;
}

GatewaySetupFormResult buildGatewayConfigFromSetupForm({
  required GatewayConfig current,
  required String portalInput,
  required String mqttInput,
  required String gatewayIdInput,
  required String usernameInput,
  required String passwordInput,
}) {
  final defaults = GatewayConfig.defaults();
  final portal = portalInput.trim().isEmpty
      ? defaults.portalBaseUrl
      : portalInput.trim();
  final portalUri = Uri.tryParse(portal);
  if (portalUri == null ||
      portalUri.host.isEmpty ||
      (portalUri.scheme != 'http' && portalUri.scheme != 'https')) {
    return const GatewaySetupFormResult.invalid(
      'Portal URL must be an http or https URL with a host.',
    );
  }

  final mqttRaw = mqttInput.trim();
  final mqtt = mqttRaw.isEmpty
      ? MqttBrokerConfig(
          host: defaults.mqttHost,
          port: defaults.mqttPort,
          useTls: defaults.mqttUseTls,
        )
      : MqttBrokerConfig.parse(mqttRaw);
  if (mqtt == null || mqtt.host.trim().isEmpty || mqtt.port <= 0) {
    return const GatewaySetupFormResult.invalid(
      'MQTT broker must be a valid mqtt:// or mqtts:// URL with host and port.',
    );
  }

  return GatewaySetupFormResult.valid(
    current.copyWith(
      portalBaseUrl: portal.replaceAll(RegExp(r'/+$'), ''),
      mqttHost: mqtt.host,
      mqttPort: mqtt.port,
      mqttUseTls: mqtt.useTls,
      deviceId: gatewayIdInput.trim().isEmpty
          ? defaults.deviceId
          : gatewayIdInput.trim(),
      mqttUsername: usernameInput.trim(),
      mqttPassword: passwordInput,
    ),
  );
}
