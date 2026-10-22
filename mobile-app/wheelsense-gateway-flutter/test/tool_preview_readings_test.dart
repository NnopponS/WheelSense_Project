import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/preview_metrics.dart';
import 'package:wheelsense_gateway_flutter/models/sensor_telemetry.dart';
import 'package:wheelsense_gateway_flutter/screens/tool_preview_readings.dart';

void main() {
  group('ToolPreviewReadings', () {
    test('fresh real readings win, stale readings use preview fallback', () {
      final now = DateTime(2026, 10, 19, 12);
      final real = Object();
      final preview = Object();

      expect(
        ToolPreviewReadings.prefer(
          actual: real,
          timestamp: now.subtract(const Duration(seconds: 30)),
          preview: preview,
          now: now,
        ),
        same(real),
      );
      expect(
        ToolPreviewReadings.prefer(
          actual: real,
          timestamp: now.subtract(const Duration(minutes: 3)),
          preview: preview,
          now: now,
        ),
        same(preview),
      );
      expect(
        ToolPreviewReadings.prefer(
          actual: real,
          timestamp: now.subtract(const Duration(minutes: 3)),
          preview: null,
          now: now,
        ),
        same(real),
      );
    });

    test(
      'preview sensor history advances and node labels stay human-readable',
      () {
        final start = DateTime(2026, 10, 19, 12);
        final metrics = PreviewMetrics.at(start);
        final later = start.add(const Duration(seconds: 12));
        final firstMotion = ToolPreviewReadings.wheelchair(start, metrics);
        final nextMotion = ToolPreviewReadings.wheelchair(
          later,
          PreviewMetrics.at(later),
        );

        expect(nextMotion.distanceM, greaterThan(firstMotion.distanceM));
        expect(
          ToolPreviewReadings.wheelchairHistory(later, metrics, count: 4),
          hasLength(4),
        );
        expect(
          ToolPreviewReadings.polarHistory(later, metrics, count: 4),
          hasLength(4),
        );
        expect(
          ToolPreviewReadings.nodes(start, metrics).map((node) => node.nodeId),
          ['Node 01', 'Node 02', 'Node 03', 'Node 04'],
        );
      },
    );

    test('fresh Polar metrics stay real while missing fields use preview', () {
      final now = DateTime(2026, 10, 19, 12);
      final real = PolarTelemetrySample(
        timestamp: now,
        heartRateBpm: 76,
        rrIntervalsMs: const [790],
        rssi: -71,
      );

      final resolved = ToolPreviewReadings.resolvePolar(
        actual: real,
        preview: PreviewMetrics.at(now),
        now: now,
      );

      expect(resolved?.heartRateBpm, 76);
      expect(resolved?.rrIntervalsMs, [790]);
      expect(resolved?.rssi, -71);
      expect(resolved?.spo2Percent, isNotNull);
      expect(resolved?.ppgQuality, isNotNull);
    });

    test('fresh partial wheelchair sample is never filled with preview data', () {
      final now = DateTime(2026, 10, 19, 12);
      final real = M5TelemetrySample.fromPayload(
        '{"seq":9,"timestamp":"${now.toIso8601String()}","motion":{"distance_m":2.5}}',
      );

      expect(
        ToolPreviewReadings.resolveWheelchair(
          actual: real,
          preview: PreviewMetrics.at(now),
          now: now,
        ),
        same(real),
      );
    });
  });

  testWidgets('preview clock emits updates while enabled', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ToolPreviewTicker(
          previewAt: DateTime(2026, 10, 19),
          builder: (_, now) => Text(now!.toIso8601String()),
        ),
      ),
    );
    final initial = tester.widget<Text>(find.byType(Text)).data;

    await tester.pump(const Duration(seconds: 1));

    expect(tester.widget<Text>(find.byType(Text)).data, isNot(initial));
  });
}
