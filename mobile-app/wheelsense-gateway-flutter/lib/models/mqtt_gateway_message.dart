import 'dart:convert';

class MqttGatewayMessage {
  const MqttGatewayMessage({
    required this.topic,
    required this.payload,
    required this.receivedAt,
  });

  final String topic;
  final Map<String, Object?> payload;
  final DateTime receivedAt;

  String get payloadText => jsonEncode(payload);
}
