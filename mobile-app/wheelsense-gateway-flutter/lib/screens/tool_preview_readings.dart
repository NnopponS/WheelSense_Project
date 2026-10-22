import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/preview_metrics.dart';
import '../models/sensor_telemetry.dart';

class ToolPreviewTicker extends StatefulWidget {
  const ToolPreviewTicker({
    super.key,
    required this.previewAt,
    required this.builder,
  });

  final DateTime? previewAt;
  final Widget Function(BuildContext context, DateTime? now) builder;

  @override
  State<ToolPreviewTicker> createState() => _ToolPreviewTickerState();
}

class _ToolPreviewTickerState extends State<ToolPreviewTicker> {
  Timer? _timer;
  DateTime? _now;

  @override
  void initState() {
    super.initState();
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant ToolPreviewTicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ((oldWidget.previewAt == null) != (widget.previewAt == null)) {
      _syncTicker();
    }
  }

  void _syncTicker() {
    _timer?.cancel();
    _timer = null;
    if (widget.previewAt == null) {
      _now = null;
      return;
    }
    _now = DateTime.now();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _now);
}

class ToolPreviewReadings {
  static const freshnessWindow = Duration(minutes: 2);

  static bool isFresh(DateTime? timestamp, DateTime now) {
    if (timestamp == null) return false;
    final age = now.difference(timestamp);
    return age >= Duration.zero && age < freshnessWindow;
  }

  static T? prefer<T>({
    required T? actual,
    required DateTime? timestamp,
    required T? preview,
    required DateTime now,
  }) {
    return preview != null && !isFresh(timestamp, now) ? preview : actual;
  }

  static M5TelemetrySample? resolveWheelchair({
    required M5TelemetrySample? actual,
    required PreviewMetrics? preview,
    required DateTime now,
  }) {
    if (isFresh(actual?.timestamp, now)) return actual;
    return preview == null ? actual : wheelchair(now, preview);
  }

  static PolarTelemetrySample? resolvePolar({
    required PolarTelemetrySample? actual,
    required PreviewMetrics? preview,
    required DateTime now,
  }) {
    final generated = preview == null ? null : polar(now, preview);
    if (!isFresh(actual?.timestamp, now)) return generated ?? actual;
    if (generated == null) return actual;

    final sample = actual!;
    final hasRealSpo2 = sample.spo2Percent != null;
    return PolarTelemetrySample(
      timestamp: sample.timestamp,
      heartRateBpm: sample.heartRateBpm > 0
          ? sample.heartRateBpm
          : generated.heartRateBpm,
      rrIntervalsMs: sample.rrIntervalsMs.isNotEmpty
          ? sample.rrIntervalsMs
          : generated.rrIntervalsMs,
      rssi: sample.rssi ?? generated.rssi,
      spo2Percent: sample.spo2Percent ?? generated.spo2Percent,
      spo2Estimated: hasRealSpo2
          ? sample.spo2Estimated
          : generated.spo2Estimated,
      sensorBatteryPercent:
          sample.sensorBatteryPercent ?? generated.sensorBatteryPercent,
      ppgQuality: sample.ppgQuality ?? generated.ppgQuality,
      ppgRatio: sample.ppgRatio ?? generated.ppgRatio,
      contactStatus: sample.contactStatus ?? generated.contactStatus,
      accelXMg: sample.accelXMg ?? generated.accelXMg,
      accelYMg: sample.accelYMg ?? generated.accelYMg,
      accelZMg: sample.accelZMg ?? generated.accelZMg,
      gyroXDps: sample.gyroXDps ?? generated.gyroXDps,
      gyroYDps: sample.gyroYDps ?? generated.gyroYDps,
      gyroZDps: sample.gyroZDps ?? generated.gyroZDps,
      magXGauss: sample.magXGauss ?? generated.magXGauss,
      magYGauss: sample.magYGauss ?? generated.magYGauss,
      magZGauss: sample.magZGauss ?? generated.magZGauss,
      ppgSamples: sample.ppgSamples.isNotEmpty
          ? sample.ppgSamples
          : generated.ppgSamples,
    );
  }

  static M5TelemetrySample wheelchair(DateTime at, PreviewMetrics metrics) {
    final seconds = at.millisecondsSinceEpoch / 1000;
    final motion = math.sin(seconds / 4.2);
    return M5TelemetrySample(
      timestamp: at,
      deviceId: 'wheelchair-sensor',
      gyroX: 14 * math.sin(seconds / 1.7),
      gyroY: 11 * math.cos(seconds / 2.1),
      gyroZ: 8 * math.sin(seconds / 2.8),
      accelX: 0.08 * math.sin(seconds / 1.3),
      accelY: 0.1 * math.cos(seconds / 1.9),
      accelZ: 1 + 0.025 * math.sin(seconds / 2.6),
      imuValid: true,
      distanceM: metrics.distanceM,
      hasDistance: true,
      velocityMs: 0.65 + 0.28 * motion,
      accelMs2: 0.22 * math.cos(seconds / 3.1),
      direction: 1,
      seq: at.millisecondsSinceEpoch ~/ 1000,
      deviceName: 'Wheelchair sensor',
      firmware: null,
      model: null,
      roomId: null,
      roomName: metrics.currentLocation.roomName,
      isRecording: true,
      batteryPercent: 86,
      batteryVoltageV: 3.92,
      batteryCharging: false,
      rawPayload: '',
    );
  }

  static List<M5TelemetrySample> wheelchairHistory(
    DateTime at,
    PreviewMetrics metrics, {
    int count = 36,
  }) => List.generate(count, (index) {
    final sampleAt = at.subtract(Duration(seconds: count - index - 1));
    return wheelchair(
      sampleAt,
      sampleAt == at ? metrics : PreviewMetrics.at(sampleAt),
    );
  });

  static PolarTelemetrySample polar(DateTime at, PreviewMetrics metrics) {
    final seconds = at.millisecondsSinceEpoch / 1000;
    final heartRate = PreviewMetrics.heartRateAt(at);
    return PolarTelemetrySample(
      timestamp: at,
      heartRateBpm: heartRate,
      rrIntervalsMs: [60000 / heartRate],
      rssi: -62 + (4 * math.sin(seconds / 7)).round(),
      spo2Percent: metrics.oxygenSaturationPercent,
      spo2Estimated: true,
      sensorBatteryPercent: 84,
      ppgQuality: 91 + (5 * math.sin(seconds / 5)).round(),
      ppgRatio: 1.1 + 0.14 * math.sin(seconds / 3),
      contactStatus: true,
      accelXMg: (60 * math.sin(seconds / 2)).round(),
      accelYMg: (80 * math.cos(seconds / 2.4)).round(),
      accelZMg: 1000 + (35 * math.sin(seconds / 3.1)).round(),
      gyroXDps: 12 * math.sin(seconds / 1.7),
      gyroYDps: 9 * math.cos(seconds / 2.3),
      gyroZDps: 7 * math.sin(seconds / 2.9),
    );
  }

  static List<PolarTelemetrySample> polarHistory(
    DateTime at,
    PreviewMetrics metrics, {
    int count = 36,
  }) => List.generate(count, (index) {
    final sampleAt = at.subtract(Duration(seconds: count - index - 1));
    return polar(
      sampleAt,
      sampleAt == at ? metrics : PreviewMetrics.at(sampleAt),
    );
  });

  static List<NodeTsimcamSnapshot> nodes(DateTime at, PreviewMetrics metrics) =>
      [
        for (final location in metrics.locations)
          NodeTsimcamSnapshot(
            deviceId: location.nodeName,
            nodeId: location.nodeName,
            bleMac: '—',
            rssi: location.rssi,
            lastSeen: at,
            status: 'detected',
          ),
      ];
}
