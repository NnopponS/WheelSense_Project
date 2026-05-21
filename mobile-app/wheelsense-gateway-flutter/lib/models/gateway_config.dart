class GatewayConfig {
  const GatewayConfig({
    required this.deviceId,
    required this.mqttHost,
    required this.mqttPort,
    required this.mqttUseTls,
    required this.mqttUsername,
    required this.mqttPassword,
    required this.portalBaseUrl,
    required this.bleServiceUuid,
    required this.bleTelemetryCharacteristicUuid,
  });

  factory GatewayConfig.defaults() {
    return const GatewayConfig(
      deviceId: 'wheelsense-mobile-gateway',
      mqttHost: 'broker.emqx.io',
      mqttPort: 1883,
      mqttUseTls: false,
      mqttUsername: '',
      mqttPassword: '',
      portalBaseUrl: 'http://localhost:3000',
      bleServiceUuid: '8f6e0001-b5a3-f393-e0a9-e50e24dcca9e',
      bleTelemetryCharacteristicUuid: '8f6e0003-b5a3-f393-e0a9-e50e24dcca9e',
    );
  }

  final String deviceId;
  final String mqttHost;
  final int mqttPort;
  final bool mqttUseTls;
  final String mqttUsername;
  final String mqttPassword;
  final String portalBaseUrl;
  final String bleServiceUuid;
  final String bleTelemetryCharacteristicUuid;

  GatewayConfig copyWith({
    String? deviceId,
    String? mqttHost,
    int? mqttPort,
    bool? mqttUseTls,
    String? mqttUsername,
    String? mqttPassword,
    String? portalBaseUrl,
    String? bleServiceUuid,
    String? bleTelemetryCharacteristicUuid,
  }) {
    return GatewayConfig(
      deviceId: deviceId ?? this.deviceId,
      mqttHost: mqttHost ?? this.mqttHost,
      mqttPort: mqttPort ?? this.mqttPort,
      mqttUseTls: mqttUseTls ?? this.mqttUseTls,
      mqttUsername: mqttUsername ?? this.mqttUsername,
      mqttPassword: mqttPassword ?? this.mqttPassword,
      portalBaseUrl: portalBaseUrl ?? this.portalBaseUrl,
      bleServiceUuid: bleServiceUuid ?? this.bleServiceUuid,
      bleTelemetryCharacteristicUuid:
          bleTelemetryCharacteristicUuid ?? this.bleTelemetryCharacteristicUuid,
    );
  }

  Map<String, Object?> toJson() {
    return <String, Object?>{
      'deviceId': deviceId,
      'mqttHost': mqttHost,
      'mqttPort': mqttPort,
      'mqttUseTls': mqttUseTls,
      'mqttUsername': mqttUsername,
      'mqttPassword': mqttPassword,
      'portalBaseUrl': portalBaseUrl,
      'bleServiceUuid': bleServiceUuid,
      'bleTelemetryCharacteristicUuid': bleTelemetryCharacteristicUuid,
    };
  }

  static GatewayConfig fromJson(Map<String, Object?> json) {
    final defaults = GatewayConfig.defaults();
    return GatewayConfig(
      deviceId: json['deviceId'] as String? ?? defaults.deviceId,
      mqttHost: json['mqttHost'] as String? ?? defaults.mqttHost,
      mqttPort: json['mqttPort'] as int? ?? defaults.mqttPort,
      mqttUseTls: json['mqttUseTls'] as bool? ?? defaults.mqttUseTls,
      mqttUsername: json['mqttUsername'] as String? ?? defaults.mqttUsername,
      mqttPassword: json['mqttPassword'] as String? ?? defaults.mqttPassword,
      portalBaseUrl: json['portalBaseUrl'] as String? ?? defaults.portalBaseUrl,
      bleServiceUuid:
          json['bleServiceUuid'] as String? ?? defaults.bleServiceUuid,
      bleTelemetryCharacteristicUuid:
          json['bleTelemetryCharacteristicUuid'] as String? ??
          defaults.bleTelemetryCharacteristicUuid,
    );
  }
}
