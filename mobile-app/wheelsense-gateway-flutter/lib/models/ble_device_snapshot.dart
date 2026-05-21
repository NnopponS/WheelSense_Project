class BleDeviceSnapshot {
  const BleDeviceSnapshot({
    required this.id,
    required this.name,
    required this.rssi,
    required this.serviceUuids,
    this.lastPayload,
  });

  final String id;
  final String name;
  final int rssi;
  final List<String> serviceUuids;
  final String? lastPayload;

  static const wheelSenseM5ServiceUuid =
      '8f6e0001-b5a3-f393-e0a9-e50e24dcca9e';
  static const heartRateServiceUuid = '0000180d-0000-1000-8000-00805f9b34fb';

  bool get advertisesM5Service {
    return serviceUuids.any(
      (uuid) => uuid.toLowerCase() == wheelSenseM5ServiceUuid,
    );
  }

  bool get advertisesHeartRateService {
    return serviceUuids.any(
      (uuid) => uuid.toLowerCase() == heartRateServiceUuid,
    );
  }

  bool get looksLikePolar {
    final lower = name.toLowerCase();
    return lower.contains('polar') ||
        lower.contains('verity') ||
        advertisesHeartRateService;
  }

  bool get looksLikeM5 {
    final lower = name.toLowerCase();
    return advertisesM5Service ||
        lower.contains('m5') ||
        lower.contains('wheelsense');
  }

  bool get looksLikeNodeTsimcam {
    final lower = name.toLowerCase();
    return lower.startsWith('wsn_') ||
        lower.contains('tsimcam') ||
        lower.contains('t-simcam') ||
        lower.contains('camera node');
  }

  bool get isGatewayPairingTarget {
    return !looksLikeNodeTsimcam && (looksLikeM5 || looksLikePolar);
  }

  String get pairingFamily {
    if (looksLikeM5) {
      return 'M5StickC Plus 2';
    }
    if (looksLikePolar) {
      return 'Polar Verity Sense';
    }
    if (looksLikeNodeTsimcam) {
      return 'Node_Tsimcam RSSI beacon';
    }
    return 'BLE device';
  }

  BleDeviceSnapshot copyWith({
    String? id,
    String? name,
    int? rssi,
    List<String>? serviceUuids,
    String? lastPayload,
  }) {
    return BleDeviceSnapshot(
      id: id ?? this.id,
      name: name ?? this.name,
      rssi: rssi ?? this.rssi,
      serviceUuids: serviceUuids ?? this.serviceUuids,
      lastPayload: lastPayload ?? this.lastPayload,
    );
  }
}
