import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wheelsense_gateway_flutter/main.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('Health trends switch between day, week, month, and year', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pump(const Duration(milliseconds: 350));
    await tester.tap(find.byType(NavigationDestination).at(2));
    await tester.pump(const Duration(milliseconds: 350));

    for (final range in <String, int>{
      'Day': 24,
      'Week': 7,
      'Month': 30,
      'Year': 12,
    }.entries) {
      final choice = find.widgetWithText(ChoiceChip, range.key);
      await tester.ensureVisible(choice);
      await tester.tap(choice);
      await tester.pump();
      expect(
        find.byKey(
          ValueKey(
            'health-trend-Steps-${range.key.toLowerCase()}-${range.value}',
          ),
        ),
        findsOneWidget,
      );
    }
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
