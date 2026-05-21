import 'dart:async';
import 'dart:convert';

import 'package:flutter_reactive_ble/flutter_reactive_ble.dart';
import 'package:polar/polar.dart';

import '../models/ble_device_snapshot.dart';
import '../models/gateway_config.dart';
import '../models/sensor_telemetry.dart';

enum BleScanProfile { all, gatewayPairing }

class BleGatewayService {
  BleGatewayService({FlutterReactiveBle? ble, Polar? polar})
    : _ble = ble ?? FlutterReactiveBle(),
      _polar = polar ?? Polar(bluetoothScanNeverForLocation: false);

  final FlutterReactiveBle _ble;
  final Polar _polar;
  StreamSubscription<ConnectionStateUpdate>? _m5ConnectionSubscription;
  StreamSubscription<String>? _m5TelemetrySubscription;
  StreamSubscription<ConnectionStateUpdate>? _polarConnectionSubscription;
  StreamSubscription<PolarTelemetrySample>? _polarTelemetrySubscription;
  StreamSubscription<PolarHrData>? _polarSdkHrSubscription;
  StreamSubscription<PolarPpgData>? _polarSdkPpgSubscription;
  StreamSubscription<PolarBatteryLevelEvent>? _polarBatterySubscription;
  final List<List<int>> _polarPpgWindow = <List<int>>[];
  int? _latestPolarBatteryPercent;
  int? _latestSpo2Estimate;
  double? _latestPpgRatio;

  Stream<BleDeviceSnapshot> scan(
    GatewayConfig config, {
    BleScanProfile profile = BleScanProfile.all,
  }) {
    return _ble
        .scanForDevices(
          withServices: const <Uuid>[],
          scanMode: ScanMode.lowLatency,
          requireLocationServicesEnabled: false,
        )
        .map(
          (device) => BleDeviceSnapshot(
            id: device.id,
            name: device.name.isEmpty ? 'Unnamed BLE Device' : device.name,
            rssi: device.rssi,
            serviceUuids: device.serviceUuids
                .map((uuid) => uuid.toString())
                .toList(),
          ),
        )
        .where(
          (device) =>
              profile == BleScanProfile.all || device.isGatewayPairingTarget,
        )
        .timeout(
          const Duration(seconds: 12),
          onTimeout: (sink) {
            sink.close();
          },
        );
  }

  Stream<String> connectM5Telemetry({
    required GatewayConfig config,
    required String deviceId,
  }) {
    final controller = StreamController<String>();
    final reassembler = _JsonObjectReassembler();
    final serviceUuid = Uuid.parse(config.bleServiceUuid);
    final characteristicUuid = Uuid.parse(
      config.bleTelemetryCharacteristicUuid,
    );

    _m5ConnectionSubscription?.cancel();
    _m5ConnectionSubscription = _ble
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
              unawaited(_requestTelemetryMtu(deviceId));
              final characteristic = QualifiedCharacteristic(
                serviceId: serviceUuid,
                characteristicId: characteristicUuid,
                deviceId: deviceId,
              );
              _m5TelemetrySubscription?.cancel();
              _m5TelemetrySubscription = _ble
                  .subscribeToCharacteristic(characteristic)
                  .map((bytes) => utf8.decode(bytes, allowMalformed: true))
                  .listen(
                    (chunk) {
                      for (final packet in reassembler.addChunk(chunk)) {
                        controller.add(packet);
                      }
                    },
                    onError: controller.addError,
                  );
            } else if (update.connectionState ==
                    DeviceConnectionState.disconnected &&
                !controller.isClosed) {
              controller.addError(StateError('M5StickC disconnected'));
            }
          },
          onError: (Object error) {
            if (!controller.isClosed) {
              controller.addError(error);
            }
          },
          onDone: () async {
            if (!controller.isClosed) {
              await controller.close();
            }
          },
        );

    controller.onCancel = () async {
      await _m5TelemetrySubscription?.cancel();
      await _m5ConnectionSubscription?.cancel();
      _m5TelemetrySubscription = null;
      _m5ConnectionSubscription = null;
    };
    return controller.stream;
  }

  Future<void> _requestTelemetryMtu(String deviceId) async {
    try {
      await _ble.requestMtu(deviceId: deviceId, mtu: 512);
    } on Object {
      // Not all platforms allow explicit MTU negotiation. The JSON
      // reassembler still protects against application-level chunking.
    }
  }

  Stream<PolarTelemetrySample> connectPolarHeartRate({
    required String deviceId,
  }) {
    final controller = StreamController<PolarTelemetrySample>();
    unawaited(_connectPolarSdkTelemetry(deviceId, controller));

    controller.onCancel = () async {
      await _polarSdkHrSubscription?.cancel();
      await _polarSdkPpgSubscription?.cancel();
      await _polarBatterySubscription?.cancel();
      await _polarTelemetrySubscription?.cancel();
      await _polarConnectionSubscription?.cancel();
      _polarSdkHrSubscription = null;
      _polarSdkPpgSubscription = null;
      _polarBatterySubscription = null;
      _polarTelemetrySubscription = null;
      _polarConnectionSubscription = null;
      _polarPpgWindow.clear();
      try {
        await _polar.disconnectFromDevice(deviceId);
      } on Object {
        // The GATT fallback path may be active instead of the Polar SDK path.
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
      if (availableTypes.contains(PolarDataType.ppg)) {
        _polarSdkPpgSubscription = _polar.startPpgStreaming(deviceId).listen(
          _updateSpo2EstimateFromPpg,
          onError: (_) {
            _latestSpo2Estimate = null;
            _latestPpgRatio = null;
          },
        );
      }

      if (!availableTypes.contains(PolarDataType.hr)) {
        await _connectPolarGattHeartRate(deviceId, controller);
        return;
      }

      _polarSdkHrSubscription = _polar.startHrStreaming(deviceId).listen(
        (event) {
          for (final sample in event.samples) {
            if (controller.isClosed) {
              return;
            }
            controller.add(
              PolarTelemetrySample(
                timestamp: DateTime.now(),
                heartRateBpm: sample.correctedHr > 0
                    ? sample.correctedHr
                    : sample.hr,
                rrIntervalsMs: sample.rrsMs
                    .map((value) => value.toDouble())
                    .toList(),
                rssi: null,
                spo2Percent: _latestSpo2Estimate,
                spo2Estimated: _latestSpo2Estimate != null,
                sensorBatteryPercent: _latestPolarBatteryPercent,
                ppgQuality: sample.ppgQuality,
                ppgRatio: _latestPpgRatio,
                contactStatus: sample.contactStatusSupported
                    ? sample.contactStatus
                    : null,
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
      if (sample.channelSamples.length < 4) {
        continue;
      }
      final status = sample.statusBits;
      if (status != null && status.isNotEmpty && status.first == 0) {
        continue;
      }
      _polarPpgWindow.add(sample.channelSamples);
    }
    if (_polarPpgWindow.length > 176) {
      _polarPpgWindow.removeRange(0, _polarPpgWindow.length - 176);
    }
    if (_polarPpgWindow.length < 28) {
      return;
    }

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
    if (redDc <= 0 || irDc <= 0 || redAc <= 0 || irAc <= 0) {
      return;
    }

    final ratio = (redAc / redDc) / (irAc / irDc);
    final estimate = (110 - (25 * ratio)).round().clamp(70, 100).toInt();
    _latestPpgRatio = ratio;
    _latestSpo2Estimate = estimate;
  }

  double _average(List<double> values) {
    if (values.isEmpty) {
      return 0;
    }
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
            if (!controller.isClosed) {
              controller.addError(error);
            }
          },
          onDone: () async {
            if (!controller.isClosed) {
              await controller.close();
            }
          },
        );
  }

  Future<void> writeM5Command({
    required GatewayConfig config,
    required String deviceId,
    required Map<String, Object?> payload,
  }) async {
    final characteristic = QualifiedCharacteristic(
      serviceId: Uuid.parse(config.bleServiceUuid),
      characteristicId: Uuid.parse('8f6e0004-b5a3-f393-e0a9-e50e24dcca9e'),
      deviceId: deviceId,
    );
    await _ble.writeCharacteristicWithResponse(
      characteristic,
      value: utf8.encode(jsonEncode(payload)),
    );
  }

  Future<void> writeM5RoomConfig({
    required GatewayConfig config,
    required String deviceId,
    required Map<String, Object?> payload,
  }) async {
    final characteristic = QualifiedCharacteristic(
      serviceId: Uuid.parse(config.bleServiceUuid),
      characteristicId: Uuid.parse('8f6e0006-b5a3-f393-e0a9-e50e24dcca9e'),
      deviceId: deviceId,
    );
    await _ble.writeCharacteristicWithResponse(
      characteristic,
      value: utf8.encode(jsonEncode(payload)),
    );
  }

  Future<void> dispose() async {
    await _m5TelemetrySubscription?.cancel();
    await _m5ConnectionSubscription?.cancel();
    await _polarSdkHrSubscription?.cancel();
    await _polarSdkPpgSubscription?.cancel();
    await _polarBatterySubscription?.cancel();
    await _polarTelemetrySubscription?.cancel();
    await _polarConnectionSubscription?.cancel();
    _m5TelemetrySubscription = null;
    _m5ConnectionSubscription = null;
    _polarSdkHrSubscription = null;
    _polarSdkPpgSubscription = null;
    _polarBatterySubscription = null;
    _polarTelemetrySubscription = null;
    _polarConnectionSubscription = null;
  }
}

class _JsonObjectReassembler {
  final StringBuffer _buffer = StringBuffer();
  var _depth = 0;
  var _inString = false;
  var _escaped = false;
  var _started = false;

  List<String> addChunk(String chunk) {
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
          _buffer.clear();
          _depth = 0;
          _started = false;
          _inString = false;
          _escaped = false;
        }
      }
    }
    return packets;
  }
}
