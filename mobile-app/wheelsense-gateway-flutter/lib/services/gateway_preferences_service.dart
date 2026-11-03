import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/ble_device_snapshot.dart';
import '../models/gateway_config.dart';

class GatewayPreferencesService {
  GatewayPreferencesService({
    SharedPreferences? preferences,
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _preferences = preferences,
       _storage = storage;

  static const String _configKey = 'wheelsense.gateway.config.v1';
  static const String _pairedM5Key = 'wheelsense.gateway.paired_m5.v1';
  static const String _pairedM5BeltKey = 'wheelsense.gateway.paired_m5_belt.v1';
  static const String _pairedM5WheelchairKey =
      'wheelsense.gateway.paired_m5_wheelchair.v1';
  static const String _pairedPolarKey = 'wheelsense.gateway.paired_polar.v1';
  static const String _passwordKey = 'wheelsense.gateway.mqtt_password.v1';
  final FlutterSecureStorage _storage;

  SharedPreferences? _preferences;

  Future<SharedPreferences> get _prefs async {
    return _preferences ??= await SharedPreferences.getInstance();
  }

  Future<GatewayConfig> loadConfig() async {
    final prefs = await _prefs;
    final raw = prefs.getString(_configKey);
    if (raw == null || raw.isEmpty) {
      final config = GatewayConfig.defaults().copyWith(
        deviceId:
            'wheelsense-mobile-${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}',
      );
      await saveConfig(config);
      return config;
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, Object?>) {
        final config = GatewayConfig.fromJson(decoded);
        if (config.mqttPassword.isNotEmpty) {
          // Remove the legacy secret only after the secure write succeeds.
          await saveConfig(config);
          return config;
        }
        return config.copyWith(
          mqttPassword: await _storage.read(key: _passwordKey) ?? '',
        );
      }
    } on FormatException {
      return GatewayConfig.defaults();
    }
    return GatewayConfig.defaults();
  }

  Future<void> saveConfig(GatewayConfig config) async {
    final prefs = await _prefs;
    await _storage.write(key: _passwordKey, value: config.mqttPassword);
    final json = config.toJson()..remove('mqttPassword');
    if (!await prefs.setString(_configKey, jsonEncode(json))) {
      throw StateError('Unable to save gateway settings');
    }
  }

  Future<void> resetConfig() async {
    final prefs = await _prefs;
    await prefs.remove(_configKey);
    await _storage.delete(key: _passwordKey);
  }

  static const List<String> _m5FallbackServices = <String>[
    BleDeviceSnapshot.wheelSenseM5ServiceUuid,
  ];

  Future<BleDeviceSnapshot?> loadPairedM5Device() {
    return loadPairedM5BeltDevice();
  }

  /// Belt slot. Migrates a device stored under the pre-slot legacy key so
  /// existing installs keep their pairing as the belt.
  Future<BleDeviceSnapshot?> loadPairedM5BeltDevice() async {
    final slot = await _loadPairedDevice(_pairedM5BeltKey, _m5FallbackServices);
    if (slot != null) {
      return slot;
    }
    final legacy = await _loadPairedDevice(_pairedM5Key, _m5FallbackServices);
    if (legacy == null) {
      return null;
    }
    await savePairedM5BeltDevice(legacy);
    final prefs = await _prefs;
    await prefs.remove(_pairedM5Key);
    return legacy;
  }

  Future<BleDeviceSnapshot?> loadPairedM5WheelchairDevice() {
    return _loadPairedDevice(_pairedM5WheelchairKey, _m5FallbackServices);
  }

  Future<Map<M5DeviceSlot, BleDeviceSnapshot>> loadPairedM5DevicesBySlot() async {
    final map = <M5DeviceSlot, BleDeviceSnapshot>{};
    final belt = await loadPairedM5BeltDevice();
    if (belt != null) {
      map[M5DeviceSlot.belt] = belt;
    }
    final wheelchair = await loadPairedM5WheelchairDevice();
    if (wheelchair != null) {
      map[M5DeviceSlot.wheelchair] = wheelchair;
    }
    return map;
  }

  Future<List<BleDeviceSnapshot>> loadPairedM5Devices() async {
    return (await loadPairedM5DevicesBySlot()).values.toList();
  }

  Future<BleDeviceSnapshot?> loadPairedPolarDevice() {
    return _loadPairedDevice(_pairedPolarKey, const <String>[
      BleDeviceSnapshot.heartRateServiceUuid,
    ]);
  }

  Future<void> savePairedM5Device(BleDeviceSnapshot device) {
    return savePairedM5BeltDevice(device);
  }

  Future<void> savePairedM5BeltDevice(BleDeviceSnapshot device) {
    return _savePairedDevice(_pairedM5BeltKey, device, _m5FallbackServices);
  }

  Future<void> savePairedM5WheelchairDevice(BleDeviceSnapshot device) {
    return _savePairedDevice(
      _pairedM5WheelchairKey,
      device,
      _m5FallbackServices,
    );
  }

  Future<void> savePairedPolarDevice(BleDeviceSnapshot device) {
    return _savePairedDevice(_pairedPolarKey, device, const <String>[
      BleDeviceSnapshot.heartRateServiceUuid,
    ]);
  }

  Future<void> clearPairedM5Device() async {
    final prefs = await _prefs;
    await prefs.remove(_pairedM5Key);
    await prefs.remove(_pairedM5BeltKey);
    await prefs.remove(_pairedM5WheelchairKey);
  }

  Future<void> clearPairedM5BeltDevice() async {
    final prefs = await _prefs;
    await prefs.remove(_pairedM5BeltKey);
  }

  Future<void> clearPairedM5WheelchairDevice() async {
    final prefs = await _prefs;
    await prefs.remove(_pairedM5WheelchairKey);
  }

  /// Clears whichever slot currently holds [deviceId] (and the legacy key).
  Future<void> removePairedM5Device(String deviceId) async {
    if ((await loadPairedM5BeltDevice())?.id == deviceId) {
      await clearPairedM5BeltDevice();
    }
    if ((await loadPairedM5WheelchairDevice())?.id == deviceId) {
      await clearPairedM5WheelchairDevice();
    }
    if ((await _loadPairedDevice(_pairedM5Key, _m5FallbackServices))?.id ==
        deviceId) {
      final prefs = await _prefs;
      await prefs.remove(_pairedM5Key);
    }
  }

  Future<void> clearPairedPolarDevice() async {
    final prefs = await _prefs;
    await prefs.remove(_pairedPolarKey);
  }

  Future<BleDeviceSnapshot?> _loadPairedDevice(
    String key,
    List<String> fallbackServices,
  ) async {
    final prefs = await _prefs;
    final raw = prefs.getString(key);
    if (raw == null || raw.isEmpty) {
      return null;
    }
    try {
      final decoded = jsonDecode(raw);
      final map = decoded is Map
          ? Map<String, Object?>.from(decoded)
          : <String, Object?>{};
      final id = '${map['id'] ?? ''}'.trim();
      if (id.isEmpty) {
        return null;
      }
      final rawServices = map['serviceUuids'];
      final serviceUuids = rawServices is List
          ? rawServices.map((value) => '$value').toList()
          : fallbackServices;
      return BleDeviceSnapshot(
        id: id,
        name: '${map['name'] ?? id}',
        rssi: map['rssi'] is num ? (map['rssi'] as num).round() : 0,
        serviceUuids: serviceUuids.isEmpty ? fallbackServices : serviceUuids,
      );
    } on FormatException {
      return null;
    }
  }

  Future<void> _savePairedDevice(
    String key,
    BleDeviceSnapshot device,
    List<String> fallbackServices,
  ) async {
    final prefs = await _prefs;
    final serviceUuids = device.serviceUuids.isEmpty
        ? fallbackServices
        : device.serviceUuids;
    await prefs.setString(
      key,
      jsonEncode(<String, Object?>{
        'id': device.id,
        'name': device.name,
        'rssi': device.rssi,
        'serviceUuids': serviceUuids,
      }),
    );
  }
}
