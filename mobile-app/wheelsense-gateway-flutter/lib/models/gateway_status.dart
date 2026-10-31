enum GatewayConnectionMode { idle, scanning, connected, degraded, error }

class GatewayStatus {
  const GatewayStatus({
    required this.mode,
    required this.bleReady,
    required this.mqttReady,
    required this.notificationsReady,
    required this.backgroundReady,
    required this.message,
    required this.updatedAt,
  });

  factory GatewayStatus.initial() {
    return GatewayStatus(
      mode: GatewayConnectionMode.idle,
      bleReady: false,
      mqttReady: false,
      notificationsReady: false,
      backgroundReady: false,
      message: 'Gateway idle',
      updatedAt: DateTime.now(),
    );
  }

  final GatewayConnectionMode mode;
  final bool bleReady;
  final bool mqttReady;
  final bool notificationsReady;
  final bool backgroundReady;
  final String message;
  final DateTime updatedAt;

  GatewayStatus copyWith({
    GatewayConnectionMode? mode,
    bool? bleReady,
    bool? mqttReady,
    bool? notificationsReady,
    bool? backgroundReady,
    String? message,
    DateTime? updatedAt,
  }) {
    return GatewayStatus(
      mode: mode ?? this.mode,
      bleReady: bleReady ?? this.bleReady,
      mqttReady: mqttReady ?? this.mqttReady,
      notificationsReady: notificationsReady ?? this.notificationsReady,
      backgroundReady: backgroundReady ?? this.backgroundReady,
      message: message ?? this.message,
      updatedAt: updatedAt ?? DateTime.now(),
    );
  }
}
