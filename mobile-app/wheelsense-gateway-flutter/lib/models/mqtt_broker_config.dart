class MqttBrokerConfig {
  const MqttBrokerConfig({
    required this.host,
    required this.port,
    required this.useTls,
  });

  final String host;
  final int port;
  final bool useTls;

  static MqttBrokerConfig? parse(String value) {
    final raw = value.trim();
    if (raw.isEmpty) {
      return null;
    }

    final uri = Uri.tryParse(raw.contains('://') ? raw : 'mqtt://$raw');
    if (uri == null || uri.host.isEmpty) {
      return null;
    }
    if (uri.scheme != 'mqtt' && uri.scheme != 'mqtts' && uri.scheme != 'ssl') {
      return null;
    }
    final hasUnsupportedParts =
        uri.hasQuery ||
        uri.hasFragment ||
        uri.userInfo.isNotEmpty ||
        (uri.path.isNotEmpty && uri.path != '/');
    if (hasUnsupportedParts) {
      return null;
    }

    final useTls = uri.scheme == 'mqtts' || uri.scheme == 'ssl';
    return MqttBrokerConfig(
      host: uri.host,
      port: uri.hasPort ? uri.port : (useTls ? 8883 : 1883),
      useTls: useTls,
    );
  }
}
