import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/screens/health_insights_screen.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_services.dart';
import 'package:wheelsense_gateway_flutter/services/health_data_source.dart';
import 'package:wheelsense_gateway_flutter/theme/app_theme.dart';

void main() {
  PolarTelemetrySample sample(DateTime time, int bpm) => PolarTelemetrySample(
    timestamp: time,
    heartRateBpm: bpm,
    rrIntervalsMs: const [833],
    rssi: -50,
  );

  Future<void> showHealth(
    WidgetTester tester,
    GatewayRuntimeSnapshot snapshot, {
    DateTime? previewAt,
  }) async {
    final locale = GatewayLocaleController();
    final healthData = HealthDataSource();
    addTearDown(locale.dispose);
    addTearDown(healthData.dispose);
    await tester.pumpWidget(
      GatewayLocaleScope(
        controller: locale,
        child: GatewayServicesScope(
          runtime: _SnapshotRuntime(snapshot),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: Scaffold(
              body: HealthInsightsScreen(
                healthData: healthData,
                onPolarStudio: () {},
                previewAt: previewAt,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'sleep preview shows a light-theme hypnogram and stage breakdown',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await showHealth(
        tester,
        GatewayRuntimeSnapshot.initial(),
        previewAt: DateTime(2026, 10, 19, 10),
      );
      final heading = find.text('SLEEP ARCHITECTURE');
      await tester.ensureVisible(heading);
      await tester.pumpAndSettle();
      expect(heading, findsOneWidget);
      expect(find.text('Hypnogram'), findsOneWidget);
      expect(find.text('Deep'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Polar chart handles gaps and unsorted real timestamps without claiming Fitbit access',
    (tester) async {
      final now = DateTime.now();
      final latest = sample(now.subtract(const Duration(seconds: 1)), 72);
      await showHealth(
        tester,
        GatewayRuntimeSnapshot.initial().copyWith(
          latestPolarSample: latest,
          polarHistory: [
            latest,
            sample(now.subtract(const Duration(seconds: 40)), 70),
          ],
        ),
      );
      expect(find.text('72'), findsOneWidget);
      expect(find.textContaining('70–72 bpm'), findsOneWidget);
      expect(find.text('Not connected'), findsNothing);
      expect(find.text('No data'), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Stale, future and missing heart-rate samples stay unavailable', (
    tester,
  ) async {
    final now = DateTime.now();
    for (final reading in [
      sample(now.subtract(const Duration(minutes: 3)), 72),
      sample(now.add(const Duration(minutes: 1)), 73),
      sample(now, 0),
    ]) {
      await showHealth(
        tester,
        GatewayRuntimeSnapshot.initial().copyWith(latestPolarSample: reading),
      );
      expect(find.text('72'), findsNothing);
      expect(find.text('73'), findsNothing);
      expect(find.text('No data'), findsWidgets);
      expect(tester.takeException(), isNull);
    }
  });
}

class _SnapshotRuntime extends GatewayRuntimeService {
  _SnapshotRuntime(this.data);
  final GatewayRuntimeSnapshot data;
  @override
  GatewayRuntimeSnapshot get snapshot => data;
  @override
  Stream<GatewayRuntimeSnapshot> get snapshots => Stream.value(data);
}
