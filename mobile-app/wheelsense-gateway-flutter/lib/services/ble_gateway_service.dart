import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:collection/collection.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart' as fbp;
import 'package:flutter_reactive_ble/flutter_reactive_ble.dart';
import 'package:polar/polar.dart';

import '../models/ble_device_snapshot.dart';
import '../models/gateway_config.dart';
import '../models/sensor_telemetry.dart';

enum BleScanProfile { all, gatewayPairing, cameraNodes }

class BleGatewayService {
  BleGatewayService({FlutterReactiveBle? ble, Polar? polar})
      : _ble = ble ?? FlutterReactiveBle(),
        _polar = polar ?? Polar(bluetoothScanNeverForLocation: false);

  final FlutterReactiveBle _ble;
  final Polar _polar;

  StreamSubscription<ConnectionStateUpdate>? _polarConnectionSubscription;
  StreamSubscription<PolarTelemetrySample>? _polarTelemetrySubscription;
  StreamSubscription<PolarHrData>? _polarSdkHrSubscription;
  StreamSubscription<PolarPpgData>? _polarSdkPpgSubscription;
  StreamSubscription<PolarAccData>? _polarSdkAccSubscription;
  StreamSubscription<PolarGyroData>? _polarSdkGyroSubscription;
  StreamSubscription<PolarMagnetometerData>? _polarSdkMagSubscription;
  StreamSubscription<PolarPpiData>? _polarSdkPpiSubscription;
  StreamSubscription<PolarBatteryLevelEvent>? _polarBatterySubscription;

  final List<List<int>> _polarPpgWindow = <List<int>>[];
  int? _latestPolarBatteryPercent;
  int? _latestSpo2Estimate;
  double? _latestPpgRatio;

  // Latest 3D motion from Polar Verity Sense
  int? _latestAccXMg, _latestAccYMg, _latestAccZMg;
  double? _latestGyroXDps, _latestGyroYDps, _latestGyroZDps;
  double? _latestMagXGauss, _latestMagYGauss, _latestMagZGauss;
  final List<double> _latestRriList = <double>[];

  Stream<BleDeviceSnapshot> scan(
    GatewayConfig config, {
    BleScanProfile profile = BleScanProfile.all,
  }) {
    final controller = StreamController<BleDeviceSnapshot>();
    final seen = <String>{};

    void handleDiscovered(
      String id,
      String name,
      int rssi,
      List<String> serviceUuids,
    ) {
      if (seen.add(id)) {
        final device = BleDeviceSnapshot(
          id: id,
          name: name.isEmpty ? 'Unnamed BLE Device' : name,
          rssi: rssi,
          serviceUuids: serviceUuids,
        );

        if (profile == BleScanProfile.all) {
          if (!controller.isClosed) controller.add(device);
        } else if (profile == BleScanProfile.cameraNodes) {
          if (name.startsWith('WSN_') || name.startsWith('WS-Camera-') || name.startsWith('CAM_')) {
            if (!controller.isClosed) controller.add(device);
          }
        } else if (device.isGatewayPairingTarget) {
          if (!controller.isClosed) controller.add(device);
        }
      }
    }

    unawaited(() async {
      try {
        try {
          final systemList = await fbp.FlutterBluePlus.systemDevices(
            [fbp.Guid(config.bleServiceUuid)],
          );
          for (final device in systemList) {
            handleDiscovered(
              device.remoteId.str,
              device.platformName.isNotEmpty ? device.platformName : 'M5StickCPlus2',
              -45,
              [config.bleServiceUuid],
            );
          }
        } on Object {
          // Best effort lookup for bonded devices
        }

        final sub = fbp.FlutterBluePlus.scanResults.listen((results) {
          for (final r in results) {
            final name = r.advertisementData.advName.isNotEmpty
                ? r.advertisementData.advName
                : r.device.platformName;
            handleDiscovered(
              r.device.remoteId.str,
              name,
              r.rssi,
              r.advertisementData.serviceUuids.map((g) => g.str128).toList(),
            );
          }
        });

        await fbp.FlutterBluePlus.startScan(
          timeout: const Duration(seconds: 12),
        );
        await fbp.FlutterBluePlus.isScanning
            .where((scanning) => !scanning)
            .first
            .timeout(
              const Duration(seconds: 14),
              onTimeout: () => false,
            );
        await sub.cancel();
      } on Object catch (e) {
        debugPrint('[BleGatewayService] Scan error: $e');
      } finally {
        if (!controller.isClosed) {
          await controller.close();
        }
      }
    }());

    return controller.stream;
  }

  Stream<String> connectM5Telemetry({
    required GatewayConfig config,
    required String deviceId,
  }) {
    final controller = StreamController<String>();
    final reassembler = _JsonObjectReassembler();
    final serviceGuid = fbp.Guid(config.bleServiceUuid);
    final telemetryGuid = fbp.Guid(config.bleTelemetryCharacteristicUuid);
    StreamSubscription<List<int>>? telemetrySubscription;

    unawaited(
      () async {
        var backoff = const Duration(seconds: 2);
        while (!controller.isClosed) {
          try {
            final device = fbp.BluetoothDevice.fromId(deviceId);
            if (!device.isConnected) {
              await device.connect(
                license: fbp.License.nonprofit,
                mtu: 512,
                timeout: const Duration(seconds: 10),
              );
            }
            try {
              await device.requestConnectionPriority(
                connectionPriorityRequest: fbp.ConnectionPriority.high,
              );
            } on Object {
              // Best-effort
            }

            final services = await device.discoverServices();
            final service = services.firstWhereOrNull(
              (s) =>
                  s.serviceUuid == serviceGuid ||
                  s.serviceUuid.str128.toLowerCase() ==
                      config.bleServiceUuid.toLowerCase() ||
                  s.serviceUuid.str128.toLowerCase() ==
                      '0000a1b2-0000-1000-8000-00805f9b34fb',
            );
            if (service == null) {
              throw StateError(
                'Service ${config.bleServiceUuid} not found on $deviceId',
              );
            }

            final telemetryChar = service.characteristics.firstWhereOrNull(
              (c) =>
                  c.characteristicUuid == telemetryGuid ||
                  c.characteristicUuid.str128.toLowerCase() ==
                      config.bleTelemetryCharacteristicUuid.toLowerCase() ||
                  c.characteristicUuid.str128.toLowerCase() ==
                      '0000a1b3-0000-1000-8000-00805f9b34fb',
            );
            if (telemetryChar == null) {
              throw StateError(
                'Telemetry characteristic not found on $deviceId',
              );
            }

            await telemetrySubscription?.cancel();
            telemetrySubscription = telemetryChar.onValueReceived.listen((
              bytes,
            ) {
              if (controller.isClosed || bytes.isEmpty) {
                return;
              }

              // Fast path 1: 20-byte raw IMU sample frame (§2.1)
              if (bytes.length == 20 && bytes[0] != 0x7B) {
                try {
                  final uint8List = bytes is Uint8List
                      ? bytes
                      : Uint8List.fromList(bytes);
                  final sample = M5TelemetrySample.fromRawBytes(
                    uint8List,
                    deviceId: deviceId,
                    deviceName: 'M5StickC Plus2',
                  );
                  controller.add(sample.toJsonString());
                  return;
                } on Object catch (e) {
                  debugPrint('[BleGatewayService] Raw IMU decode error: $e');
                }
              }

              // Fast path 2: compact 30-byte binary frame
              if (bytes.length >= 30 && bytes[0] != 0x7B) {
                try {
                  final uint8List = bytes is Uint8List
                      ? bytes
                      : Uint8List.fromList(bytes);
                  final sample = M5TelemetrySample.fromBytes(
                    uint8List,
                    deviceId: deviceId,
                    deviceName: 'M5StickC Plus2',
                  );
                  controller.add(sample.toJsonString());
                  return;
                } on Object catch (e) {
                  debugPrint('[BleGatewayService] Binary frame decode error: $e');
                }
              }

              // Fallback path: JSON text frame chunk
              final decodedText = utf8.decode(bytes, allowMalformed: true);
              for (final packet in reassembler.addChunk(decodedText)) {
                controller.add(packet);
              }
            });

            if (!telemetryChar.isNotifying) {
              await telemetryChar.setNotifyValue(true);
            }
            reassembler.reset();
            backoff = const Duration(seconds: 2);

            await device.connectionState
                .skipWhile((state) => state == fbp.BluetoothConnectionState.connected)
                .where((state) => state == fbp.BluetoothConnectionState.disconnected)
                .first;
          } on Object catch (error, stack) {
            debugPrint('[BleGatewayService] M5 connect/subscribe error: $error\n$stack');
          }
          if (controller.isClosed) {
            break;
          }
          await Future<void>.delayed(backoff);
          backoff = backoff * 2 > const Duration(seconds: 15)
              ? const Duration(seconds: 15)
              : backoff * 2;
        }
      }(),
    );

    controller.onCancel = () async {
      await telemetrySubscription?.cancel();
      try {
        await fbp.BluetoothDevice.fromId(deviceId).disconnect();
      } on Object {
        // Already disconnected
      }
    };
    return controller.stream;
  }

  Future<void> disconnectM5(String deviceId) async {
    try {
      final device = fbp.BluetoothDevice.fromId(deviceId);
      await device.disconnect();
    } on Object catch (e) {
      debugPrint('[BleGatewayService] M5 disconnect error: $e');
    }
  }

  /// Connects to Polar Verity Sense / Polar H10 and activates all supported
  /// data channels: HR, PPI, Optical PPG, 3D ACC, 3D GYRO, 3D MAG, and Battery.
  Stream<PolarTelemetrySample> connectPolarHeartRate({
    required String deviceId,
  }) {
    final controller = StreamController<PolarTelemetrySample>();
    unawaited(_connectPolarSdkTelemetry(deviceId, controller));

    controller.onCancel = () async {
      await _polarSdkHrSubscription?.cancel();
      await _polarSdkPpgSubscription?.cancel();
      await _polarSdkAccSubscription?.cancel();
      await _polarSdkGyroSubscription?.cancel();
      await _polarSdkMagSubscription?.cancel();
      await _polarSdkPpiSubscription?.cancel();
      await _polarBatterySubscription?.cancel();
      await _polarTelemetrySubscription?.cancel();
      await _polarConnectionSubscription?.cancel();
      _polarSdkHrSubscription = null;
      _polarSdkPpgSubscription = null;
      _polarSdkAccSubscription = null;
      _polarSdkGyroSubscription = null;
      _polarSdkMagSubscription = null;
      _polarSdkPpiSubscription = null;
      _polarBatterySubscription = null;
      _polarTelemetrySubscription = null;
      _polarConnectionSubscription = null;
      _polarPpgWindow.clear();
      try {
        await _polar.disconnectFromDevice(deviceId);
      } on Object {
        // GATT fallback
      }
    };
    return controller.stream;
  }

  Future<void> _connectPolarSdkTelemetry(
    String deviceId,
    StreamController<PolarTelemetrySample> controller,
  ) async {
    try {
      await _polarSdkHrSubscription?.cancel();
      await _polarSdkPpgSubscription?.cancel();
      await _polarSdkAccSubscription?.cancel();
      await _polarSdkGyroSubscription?.cancel();
      await _polarSdkMagSubscription?.cancel();
      await _polarSdkPpiSubscription?.cancel();
      await _polarBatterySubscription?.cancel();
      _polarPpgWindow.clear();
      _latestSpo2Estimate = null;
      _latestPpgRatio = null;

      _polarBatterySubscription = _polar.batteryLevel.listen((event) {
        if (event.identifier == deviceId) {
          _latestPolarBatteryPercent = event.level;
        }
      });

      await _polar.connectToDevice(deviceId);
      await _polar.sdkFeatureReady
          .firstWhere(
            (event) =>
                event.identifier == deviceId &&
                event.feature == PolarSdkFeature.onlineStreaming,
          )
          .timeout(const Duration(seconds: 14));

      final availableTypes = await _polar.getAvailableOnlineStreamDataTypes(
        deviceId,
      );

      // 1. Optical PPG Stream (Photoplethysmography)
      if (availableTypes.contains(PolarDataType.ppg)) {
        _polarSdkPpgSubscription = _polar.startPpgStreaming(deviceId).listen(
          _updateSpo2EstimateFromPpg,
          onError: (_) {
            _latestSpo2Estimate = null;
            _latestPpgRatio = null;
          },
        );
      }

      // 2. 3-Axis Accelerometer (ACC)
      if (availableTypes.contains(PolarDataType.acc)) {
        _polarSdkAccSubscription = _polar.startAccStreaming(deviceId).listen(
          (event) {
            if (event.samples.isNotEmpty) {
              final s = event.samples.last;
              _latestAccXMg = s.x;
              _latestAccYMg = s.y;
              _latestAccZMg = s.z;
            }
          },
          onError: (_) {},
        );
      }

      // 3. 3-Axis Gyroscope (GYRO)
      if (availableTypes.contains(PolarDataType.gyro)) {
        _polarSdkGyroSubscription = _polar.startGyroStreaming(deviceId).listen(
          (event) {
            if (event.samples.isNotEmpty) {
              final s = event.samples.last;
              _latestGyroXDps = s.x;
              _latestGyroYDps = s.y;
              _latestGyroZDps = s.z;
            }
          },
          onError: (_) {},
        );
      }

      // 4. 3-Axis Magnetometer (MAG)
      if (availableTypes.contains(PolarDataType.magnetometer)) {
        _polarSdkMagSubscription = _polar.startMagnetometerStreaming(deviceId).listen(
          (event) {
            if (event.samples.isNotEmpty) {
              final s = event.samples.last;
              _latestMagXGauss = s.x;
              _latestMagYGauss = s.y;
              _latestMagZGauss = s.z;
            }
          },
          onError: (_) {},
        );
      }

      // 5. Peak-to-Peak PPI (R-R Interval stream)
      if (availableTypes.contains(PolarDataType.ppi)) {
        _polarSdkPpiSubscription = _polar.startPpiStreaming(deviceId).listen(
          (event) {
            for (final sample in event.samples) {
              if (sample.ppi > 0) {
                _latestRriList.add(sample.ppi.toDouble());
                if (_latestRriList.length > 30) _latestRriList.removeAt(0);
              }
            }
          },
          onError: (_) {},
        );
      }

      // 6. Heart Rate (HR)
      if (!availableTypes.contains(PolarDataType.hr)) {
        await _connectPolarGattHeartRate(deviceId, controller);
        return;
      }

      _polarSdkHrSubscription = _polar.startHrStreaming(deviceId).listen(
        (event) {
          for (final sample in event.samples) {
            if (controller.isClosed) return;

            final rrs = sample.rrsMs.isNotEmpty
                ? sample.rrsMs.map((v) => v.toDouble()).toList()
                : List<double>.from(_latestRriList);

            controller.add(
              PolarTelemetrySample(
                timestamp: DateTime.now(),
                heartRateBpm: sample.correctedHr > 0
                    ? sample.correctedHr
                    : sample.hr,
                rrIntervalsMs: rrs,
                rssi: null,
                spo2Percent: _latestSpo2Estimate,
                spo2Estimated: _latestSpo2Estimate != null,
                sensorBatteryPercent: _latestPolarBatteryPercent,
                ppgQuality: sample.ppgQuality,
                ppgRatio: _latestPpgRatio,
                contactStatus: sample.contactStatusSupported
                    ? sample.contactStatus
                    : null,
                accelXMg: _latestAccXMg,
                accelYMg: _latestAccYMg,
                accelZMg: _latestAccZMg,
                gyroXDps: _latestGyroXDps,
                gyroYDps: _latestGyroYDps,
                gyroZDps: _latestGyroZDps,
                magXGauss: _latestMagXGauss,
                magYGauss: _latestMagYGauss,
                magZGauss: _latestMagZGauss,
                ppgSamples: List<List<int>>.from(_polarPpgWindow),
              ),
            );
          }
        },
        onError: controller.addError,
      );
    } on Object {
      await _connectPolarGattHeartRate(deviceId, controller);
    }
  }

  void _updateSpo2EstimateFromPpg(PolarPpgData data) {
    for (final sample in data.samples) {
      if (sample.channelSamples.length < 4) continue;
      final status = sample.statusBits;
      if (status != null && status.isNotEmpty && status.first == 0) continue;
      _polarPpgWindow.add(sample.channelSamples);
    }
    if (_polarPpgWindow.length > 176) {
      _polarPpgWindow.removeRange(0, _polarPpgWindow.length - 176);
    }
    if (_polarPpgWindow.length < 28) return;

    final redLike = <double>[];
    final irLike = <double>[];
    for (final row in _polarPpgWindow) {
      final ambient = row.length > 3 ? row[3].toDouble() : 0.0;
      redLike.add((row[0].toDouble() - ambient).abs());
      irLike.add((row[1].toDouble() - ambient).abs());
    }

    final redDc = _average(redLike);
    final irDc = _average(irLike);
    final redAc = redLike.reduce((a, b) => a > b ? a : b) -
        redLike.reduce((a, b) => a < b ? a : b);
    final irAc = irLike.reduce((a, b) => a > b ? a : b) -
        irLike.reduce((a, b) => a < b ? a : b);
    if (redDc <= 0 || irDc <= 0 || redAc <= 0 || irAc <= 0) return;

    final ratio = (redAc / redDc) / (irAc / irDc);
    final estimate = (110 - (25 * ratio)).round().clamp(70, 100).toInt();
    _latestPpgRatio = ratio;
    _latestSpo2Estimate = estimate;
  }

  double _average(List<double> values) {
    if (values.isEmpty) return 0;
    return values.reduce((a, b) => a + b) / values.length;
  }

  Future<void> _connectPolarGattHeartRate(
    String deviceId,
    StreamController<PolarTelemetrySample> controller,
  ) async {
    final serviceUuid = Uuid.parse(BleDeviceSnapshot.heartRateServiceUuid);
    final characteristicUuid = Uuid.parse(
      '00002a37-0000-1000-8000-00805f9b34fb',
    );

    _polarConnectionSubscription?.cancel();
    _polarConnectionSubscription = _ble
        .connectToDevice(
          id: deviceId,
          servicesWithCharacteristicsToDiscover: <Uuid, List<Uuid>>{
            serviceUuid: <Uuid>[characteristicUuid],
          },
          connectionTimeout: const Duration(seconds: 12),
        )
        .listen(
          (update) {
            if (update.connectionState == DeviceConnectionState.connected) {
              final characteristic = QualifiedCharacteristic(
                serviceId: serviceUuid,
                characteristicId: characteristicUuid,
                deviceId: deviceId,
              );
              _polarTelemetrySubscription?.cancel();
              _polarTelemetrySubscription = _ble
                  .subscribeToCharacteristic(characteristic)
                  .asyncMap((bytes) async {
                    int? rssi;
                    try {
                      rssi = await _ble.readRssi(deviceId);
                    } on Object {
                      rssi = null;
                    }
                    return PolarTelemetrySample.fromHeartRateMeasurement(
                      bytes,
                      rssi: rssi,
                    );
                  })
                  .listen(controller.add, onError: controller.addError);
            } else if (update.connectionState ==
                    DeviceConnectionState.disconnected &&
                !controller.isClosed) {
              controller.addError(StateError('Polar device disconnected'));
            }
          },
          onError: (Object error) {
            if (!controller.isClosed) controller.addError(error);
          },
          onDone: () async {
            if (!controller.isClosed) await controller.close();
          },
        );
  }

  Future<void> writeM5Command({
    required GatewayConfig config,
    required String deviceId,
    required Map<String, Object?> payload,
  }) async {
    await _writeM5Characteristic(
      serviceUuid: config.bleServiceUuid,
      characteristicUuid: '8f6e0004-b5a3-f393-e0a9-e50e24dcca9e',
      deviceId: deviceId,
      payload: payload,
    );
  }

  Future<void> writeM5RoomConfig({
    required GatewayConfig config,
    required String deviceId,
    required Map<String, Object?> payload,
  }) async {
    await _writeM5Characteristic(
      serviceUuid: config.bleServiceUuid,
      characteristicUuid: '8f6e0006-b5a3-f393-e0a9-e50e24dcca9e',
      deviceId: deviceId,
      payload: payload,
    );
  }

  Future<void> _writeM5Characteristic({
    required String serviceUuid,
    required String characteristicUuid,
    required String deviceId,
    required Map<String, Object?> payload,
  }) async {
    final device = fbp.BluetoothDevice.fromId(deviceId);
    final services = device.servicesList.isNotEmpty
        ? device.servicesList
        : await device.discoverServices();
    final targetServiceGuid = fbp.Guid(serviceUuid);
    final targetCharGuid = fbp.Guid(characteristicUuid);
    final service = services.firstWhereOrNull(
      (s) =>
          s.serviceUuid == targetServiceGuid ||
          s.serviceUuid.str128.toLowerCase() == serviceUuid.toLowerCase(),
    );
    if (service == null) {
      throw StateError('Service $serviceUuid not found on $deviceId');
    }
    final characteristic = service.characteristics.firstWhereOrNull(
      (c) =>
          c.characteristicUuid == targetCharGuid ||
          c.characteristicUuid.str128.toLowerCase() ==
              characteristicUuid.toLowerCase(),
    );
    if (characteristic == null) {
      throw StateError('Characteristic $characteristicUuid not found on $deviceId');
    }
    await characteristic.write(
      utf8.encode(jsonEncode(payload)),
      withoutResponse: false,
    );
  }

  Future<void> dispose() async {
    await _polarSdkHrSubscription?.cancel();
    await _polarSdkPpgSubscription?.cancel();
    await _polarSdkAccSubscription?.cancel();
    await _polarSdkGyroSubscription?.cancel();
    await _polarSdkMagSubscription?.cancel();
    await _polarSdkPpiSubscription?.cancel();
    await _polarBatterySubscription?.cancel();
    await _polarTelemetrySubscription?.cancel();
    await _polarConnectionSubscription?.cancel();
    _polarSdkHrSubscription = null;
    _polarSdkPpgSubscription = null;
    _polarSdkAccSubscription = null;
    _polarSdkGyroSubscription = null;
    _polarSdkMagSubscription = null;
    _polarSdkPpiSubscription = null;
    _polarBatterySubscription = null;
    _polarTelemetrySubscription = null;
    _polarConnectionSubscription = null;
  }
}

class _JsonObjectReassembler {
  static const int _maxBufferedLength = 2048;

  final StringBuffer _buffer = StringBuffer();
  var _depth = 0;
  var _inString = false;
  var _escaped = false;
  var _started = false;

  void reset() => _reset();

  List<String> addChunk(String chunk) {
    if (!_started && _buffer.isEmpty) {
      final trimmed = chunk.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          final decoded = jsonDecode(trimmed);
          if (decoded is Map) {
            return <String>[trimmed];
          }
        } on Object {
          // Streaming parser fallback
        }
      }
    }

    if (_buffer.length > _maxBufferedLength) {
      _reset();
    }
    final packets = <String>[];
    for (final codeUnit in chunk.codeUnits) {
      if (!_started) {
        if (codeUnit != 0x7B) {
          continue;
        }
        _started = true;
      }

      _buffer.writeCharCode(codeUnit);

      if (_escaped) {
        _escaped = false;
        continue;
      }

      if (_inString && codeUnit == 0x5C) {
        _escaped = true;
        continue;
      }

      if (codeUnit == 0x22) {
        _inString = !_inString;
        continue;
      }

      if (_inString) {
        continue;
      }

      if (codeUnit == 0x7B) {
        _depth += 1;
      } else if (codeUnit == 0x7D) {
        _depth -= 1;
        if (_depth <= 0) {
          packets.add(_buffer.toString());
          _reset();
        }
      }
    }
    return packets;
  }

  void _reset() {
    _buffer.clear();
    _depth = 0;
    _inString = false;
    _escaped = false;
    _started = false;
  }
}
