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
    this.linkedPatientId,
    this.linkedCaregiverId,
    this.linkedPersonType,
    this.alertsEnabled = false,
    this.setupCompleted = false,
  });

  factory GatewayConfig.defaults() {
    return const GatewayConfig(
      deviceId: 'wheelsense-mobile-gateway',
      mqttHost: 'broker.emqx.io',
      mqttPort: 1883,
      mqttUseTls: false,
      mqttUsername: '',
      mqttPassword: '',
      portalBaseUrl: 'https://portal.wheelsense.local',
      bleServiceUuid: '0000a1b2-0000-1000-8000-00805f9b34fb',
      bleTelemetryCharacteristicUuid: '0000a1b3-0000-1000-8000-00805f9b34fb',
      alertsEnabled: false,
      setupCompleted: false,
    );
  }

  static const Object _unset = Object();

  final String deviceId;
  final String mqttHost;
  final int mqttPort;
  final bool mqttUseTls;
  final String mqttUsername;
  final String mqttPassword;
  final String portalBaseUrl;
  final String bleServiceUuid;
  final String bleTelemetryCharacteristicUuid;
  final int? linkedPatientId;
  final int? linkedCaregiverId;
  final String? linkedPersonType;
  final bool alertsEnabled;
  final bool setupCompleted;

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
    Object? linkedPatientId = _unset,
    Object? linkedCaregiverId = _unset,
    Object? linkedPersonType = _unset,
    bool? alertsEnabled,
    bool? setupCompleted,
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
      linkedPatientId: identical(linkedPatientId, _unset)
          ? this.linkedPatientId
          : linkedPatientId as int?,
      linkedCaregiverId: identical(linkedCaregiverId, _unset)
          ? this.linkedCaregiverId
          : linkedCaregiverId as int?,
      linkedPersonType: identical(linkedPersonType, _unset)
          ? this.linkedPersonType
          : linkedPersonType as String?,
      alertsEnabled: alertsEnabled ?? this.alertsEnabled,
      setupCompleted: setupCompleted ?? this.setupCompleted,
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
      'linkedPatientId': linkedPatientId,
      'linkedCaregiverId': linkedCaregiverId,
      'linkedPersonType': linkedPersonType,
      'alertsEnabled': alertsEnabled,
      'setupCompleted': setupCompleted,
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
      linkedPatientId: _optionalInt(json['linkedPatientId']),
      linkedCaregiverId: _optionalInt(json['linkedCaregiverId']),
      linkedPersonType: _optionalString(json['linkedPersonType']),
      alertsEnabled: json['alertsEnabled'] as bool? ?? defaults.alertsEnabled,
      setupCompleted:
          json['setupCompleted'] as bool? ?? defaults.setupCompleted,
    );
  }

  static int? _optionalInt(Object? value) {
    if (value == null) {
      return null;
    }
    if (value is num) {
      return value.round();
    }
    return int.tryParse('$value');
  }

  static String? _optionalString(Object? value) {
    if (value == null || '$value'.trim().isEmpty) {
      return null;
    }
    return '$value'.trim();
  }
}
