import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wheelsense_gateway_flutter/main.dart';
import 'package:wheelsense_gateway_flutter/screens/pair_devices_screen.dart';

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets(
    'PairDevicesScreen orders Wheelchair sensor before FallGuard Belt and uses real belt image',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(600, 900);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(
        const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
      );
      await tester.pump(const Duration(milliseconds: 350));

      // Tap Devices tab in bottom nav
      await tester.tap(find.byType(NavigationDestination).at(1));
      await tester.pump(const Duration(milliseconds: 350));

      // Tap Bluetooth tile to open PairDevicesScreen
      final bluetoothTile = find.text('Bluetooth').first;
      await tester.tap(bluetoothTile);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));

      expect(find.byType(PairDevicesScreen), findsOneWidget);

      // Verify Tab order: Wheelchair sensor comes before FallGuard Belt
      final tabs = tester.widgetList<Tab>(find.byType(Tab)).toList();
      expect(tabs.length, greaterThanOrEqualTo(2));
      expect(tabs[0].text, 'Wheelchair sensor');
      expect(tabs[1].text, 'FallGuard Belt');

      // The active view at index 0 is Wheelchair sensor
      expect(find.text('Wheelchair sensor'), findsWidgets);

      // Switch to FallGuard Belt tab
      // Target the tab itself: Devices (underneath) has a belt card too.
      await tester.tap(find.widgetWithText(Tab, 'FallGuard Belt'));
      await tester.pumpAndSettle();

      // Verify the belt image asset is assets/devices/fallguard_belt.png
      expect(
        find.byWidgetPredicate(
          (w) =>
              w is Image &&
              (w.image as AssetImage).assetName ==
                  'assets/devices/fallguard_belt.png',
        ),
        findsOneWidget,
      );
    },
  );
}
