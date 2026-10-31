import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/l10n/gateway_localizations.dart';
import 'package:wheelsense_gateway_flutter/models/fall_alert_event.dart';
import 'package:wheelsense_gateway_flutter/widgets/fall_alert_dialog.dart';

Widget _buildTestApp({
  required Widget child,
  GatewayLanguage language = GatewayLanguage.english,
}) {
  final controller = GatewayLocaleController();
  if (language == GatewayLanguage.thai) {
    controller.setLanguage(GatewayLanguage.thai);
  }
  return GatewayLocaleScope(
    controller: controller,
    child: MaterialApp(
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  group('FallAlertDialog', () {
    testWidgets(
      'displays modern fall alert dialog with metrics and no separate Dismiss button',
      (tester) async {
        final event = FallAlertEvent(
          kind: FallAlertKind.detected,
          event: 'fall_detected',
          deviceId: 'DEMO_BELT',
          timestamp: DateTime(2026, 10, 26, 23, 13, 2),
          peakG: 3.10,
          batteryPercent: 92,
          reason: 'high_impact',
          rawPayload: '{"event":"fall_detected"}',
        );

        bool okTapped = false;

        await tester.pumpWidget(
          _buildTestApp(
            child: Builder(
              builder: (context) {
                return Center(
                  child: ElevatedButton(
                    onPressed: () {
                      FallAlertDialog.show(
                        context,
                        event,
                        onImOk: () {
                          okTapped = true;
                        },
                      );
                    },
                    child: const Text('Show Dialog'),
                  ),
                );
              },
            ),
          ),
        );

        await tester.tap(find.text('Show Dialog'));
        await tester.pumpAndSettle();

        // Check title and metrics
        expect(find.text('FALL DETECTED'), findsOneWidget);
        expect(find.text('CRITICAL ALERT'), findsOneWidget);
        expect(find.textContaining('DEMO_BELT'), findsOneWidget);
        expect(find.text('3.10 g'), findsOneWidget);
        expect(find.text('92%'), findsOneWidget);

        // Verify Dismiss button does NOT exist
        expect(find.text('Dismiss'), findsNothing);

        // Verify the single I'm OK action button is present
        final okButton = find.text("I'm OK — Dismiss Alert");
        expect(okButton, findsOneWidget);

        // Tap I'm OK
        await tester.tap(okButton);
        await tester.pumpAndSettle();

        // Dialog should be dismissed and callback fired
        expect(okTapped, isTrue);
        expect(find.byType(FallAlertDialog), findsNothing);
      },
    );

    testWidgets('supports Thai localization for fall alert', (tester) async {
      final event = FallAlertEvent(
        kind: FallAlertKind.detected,
        event: 'fall_detected',
        deviceId: 'DEMO_BELT',
        timestamp: DateTime(2026, 10, 26, 23, 13, 2),
        peakG: 3.10,
        rawPayload: '{"event":"fall_detected"}',
      );

      await tester.pumpWidget(
        _buildTestApp(
          language: GatewayLanguage.thai,
          child: Builder(
            builder: (context) {
              return Center(
                child: ElevatedButton(
                  onPressed: () {
                    FallAlertDialog.show(context, event);
                  },
                  child: const Text('Show'),
                ),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      expect(find.text('ตรวจพบการล้ม'), findsOneWidget);
      expect(find.text('แจ้งเตือนฉุกเฉิน'), findsOneWidget);
      expect(find.text('ฉันปลอดภัย — ปิดแจ้งเตือน'), findsOneWidget);
      expect(find.text('Dismiss'), findsNothing);
    });

    testWidgets('renders test alert correctly', (tester) async {
      final event = FallAlertEvent(
        kind: FallAlertKind.test,
        event: 'fall_test',
        deviceId: 'TEST_BELT',
        timestamp: DateTime(2026, 10, 26, 23, 13, 2),
        rawPayload: '{"event":"fall_test"}',
      );

      await tester.pumpWidget(
        _buildTestApp(
          child: Builder(
            builder: (context) {
              return Center(
                child: ElevatedButton(
                  onPressed: () {
                    FallAlertDialog.show(context, event);
                  },
                  child: const Text('Show'),
                ),
              );
            },
          ),
        ),
      );

      await tester.tap(find.text('Show'));
      await tester.pumpAndSettle();

      expect(find.text('Fall Detection Test'), findsOneWidget);
      expect(find.text('SYSTEM TEST'), findsOneWidget);
      expect(find.text("I'm OK — Dismiss Alert"), findsOneWidget);
      expect(find.text('Dismiss'), findsNothing);
    });
  });
}
