import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:wheelsense_gateway_flutter/main.dart';
import 'package:wheelsense_gateway_flutter/screens/live_monitor_screen.dart';
import 'package:wheelsense_gateway_flutter/screens/polar_studio_screen.dart';
import 'package:wheelsense_gateway_flutter/screens/node_radar_screen.dart';
import 'package:wheelsense_gateway_flutter/screens/server_setup_screen.dart';
import 'package:wheelsense_gateway_flutter/screens/device_hub_screen.dart';
import 'package:wheelsense_gateway_flutter/screens/health_insights_screen.dart';
import 'package:wheelsense_gateway_flutter/screens/portal_webview_screen.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Future<void> togglePreview(WidgetTester tester) async {
    final toggle = find.byWidgetPredicate(
      (widget) =>
          widget is IconButton && widget.tooltip == 'Toggle preview data',
    );
    await tester.tap(toggle);
    await tester.pump(const Duration(milliseconds: 350));
  }

  testWidgets('Every engineering tool opens and returns to Devices', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pump(const Duration(milliseconds: 350));
    await tester.tap(find.byType(NavigationDestination).at(1));
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.byType(DeviceHubScreen), findsOneWidget);
    expect(find.text('Live monitor'), findsNothing);
    expect(find.text('Polar Studio'), findsNothing);
    expect(find.text('Connected'), findsWidgets);
    expect(find.text('View data'), findsWidgets);
    await togglePreview(tester);
    expect(find.text('Pair device'), findsWidgets);
    for (final tool in <String, Type>{
      'Gateway settings': ServerSetupScreen,
      'Node radar': NodeRadarScreen,
    }.entries) {
      final button = find.text(tool.key).first;
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.byType(tool.value), findsOneWidget);
      expect(find.textContaining('SIM'), findsNothing);
      expect(tester.takeException(), isNull, reason: tool.key);
      if (tool.value == ServerSetupScreen) {
        await tester.tap(find.text('ไทย'));
        await tester.pump(const Duration(milliseconds: 350));
        expect(
          find.descendant(
            of: find.byType(AppBar),
            matching: find.text('ตั้งค่า'),
          ),
          findsOneWidget,
        );
        await tester.tap(find.text('English'));
        await tester.pump(const Duration(milliseconds: 350));
      }
      if (tool.value == LiveMonitorScreen) {
        await tester.tap(find.byTooltip('Pair / Scan Sensors'));
      } else {
        await tester.tap(find.byTooltip('Back').last);
      }
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump();
      expect(find.byType(DeviceHubScreen), findsOneWidget);
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('Preview sensor details show data without disconnected labels', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 900);
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pump(const Duration(milliseconds: 350));
    await tester.tap(find.byType(NavigationDestination).at(1));
    await tester.pump(const Duration(milliseconds: 350));

    for (final sensor in <String, Type>{
      'Wheelchair sensor': LiveMonitorScreen,
      'Polar Verity Sense': PolarStudioScreen,
    }.entries) {
      final image = find.byWidgetPredicate(
        (widget) => widget is Image && widget.semanticLabel == sensor.key,
      );
      if (sensor.key == 'Polar Verity Sense') {
        final wheelchairImage = find.byWidgetPredicate(
          (widget) =>
              widget is Image && widget.semanticLabel == 'Wheelchair sensor',
        );
        await tester.drag(wheelchairImage, const Offset(-260, 0));
        await tester.pump(const Duration(milliseconds: 350));
      }
      await tester.ensureVisible(image);
      await tester.tap(image);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      expect(find.byType(sensor.value), findsOneWidget);
      expect(find.text('Offline'), findsNothing);
      expect(find.text('No Board'), findsNothing);
      expect(find.text('No Sensor'), findsNothing);
      expect(tester.takeException(), isNull, reason: sensor.key);
      await tester.pageBack();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump();
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('Theme button switches and restores the saved appearance', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pump(const Duration(milliseconds: 350));
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.light,
    );

    await tester.tap(find.byTooltip('Switch to dark mode'));
    await tester.pump();
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.dark,
    );
    expect(
      (await SharedPreferences.getInstance()).getBool(
        'wheelsense.gateway.dark_theme.v1',
      ),
      isTrue,
    );

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pump(const Duration(milliseconds: 350));
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.dark,
    );
    await tester.tap(find.byType(NavigationDestination).at(3));
    await tester.pump(const Duration(milliseconds: 350));
    await tester.tap(find.byTooltip('Switch to light mode'));
    await tester.pump();
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
      ThemeMode.light,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('WheelSense shows four product tabs and live Preview readings', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pump(const Duration(milliseconds: 350));

    expect(find.byType(NavigationBar), findsOneWidget);
    final navigation = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(navigation.destinations, hasLength(4));
    expect(find.text('Home'), findsWidgets);
    expect(find.text('Devices'), findsWidgets);
    expect(find.text('Health'), findsOneWidget);
    expect(find.text('Care'), findsOneWidget);
    expect(find.text('Good to see you.'), findsNothing);
    expect(find.text('Heart rate'), findsOneWidget);
    expect(find.text('Distance'), findsOneWidget);
    expect(find.text('Current location'), findsOneWidget);
    expect(find.textContaining('Node 0'), findsNWidgets(4));
    expect(find.textContaining('SIM'), findsNothing);

    await tester.tap(find.text('Devices').last);
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.byType(DeviceHubScreen), findsOneWidget);
    expect(find.text('Wheelchair sensor'), findsOneWidget);
    expect(find.text('Polar Verity Sense'), findsOneWidget);
    expect(find.text('Google Health'), findsOneWidget);
    expect(find.text('Fitbit · Health Connect'), findsOneWidget);
    expect(find.text('Connected'), findsWidgets);

    await tester.tap(find.text('Health').last);
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.byType(HealthInsightsScreen), findsOneWidget);
    expect(find.text('HRV'), findsWidgets);
    expect(find.text('Oxygen'), findsWidgets);
    expect(find.text('Breathing rate'), findsWidgets);
    expect(find.text('SLEEP ARCHITECTURE'), findsOneWidget);

    await tester.tap(find.byType(NavigationDestination).at(3));
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.byType(PortalWebViewScreen), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('WheelSense respects Thai preference in product navigation', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'wheelsense.gateway.language.v1': 'th',
    });

    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pump(const Duration(milliseconds: 350));

    expect(find.text('หน้าหลัก'), findsWidgets);
    expect(find.text('อุปกรณ์'), findsWidgets);
    expect(find.text('สุขภาพ'), findsOneWidget);
    expect(find.text('การดูแล'), findsOneWidget);
    expect(find.text('ยินดีต้อนรับกลับ'), findsNothing);

    await tester.tap(find.text('สุขภาพ').last);
    await tester.pump(const Duration(milliseconds: 350));
    expect(find.text('เข้าใจสุขภาพของคุณ'), findsNothing);
    expect(find.byType(HealthInsightsScreen), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  for (final width in [360.0, 390.0, 430.0]) {
    for (final language in ['en', 'th']) {
      for (final brightness in Brightness.values) {
        for (final scale in [1.0, 2.0]) {
          testWidgets(
            '$width dp $language ${brightness.name} text $scale: all tabs',
            (tester) async {
              FlutterSecureStorage.setMockInitialValues({});
              final originalError = FlutterError.onError;
              FlutterError.onError = (details) {
                debugPrint(details.toString());
                originalError?.call(details);
              };
              addTearDown(() => FlutterError.onError = originalError);
              SharedPreferences.setMockInitialValues({
                'wheelsense.gateway.language.v1': language,
              });
              tester.view.devicePixelRatio = 1;
              tester.view.physicalSize = Size(width, 900);
              tester.platformDispatcher.platformBrightnessTestValue =
                  brightness;
              tester.platformDispatcher.textScaleFactorTestValue = scale;
              addTearDown(() {
                tester.view.resetPhysicalSize();
                tester.view.resetDevicePixelRatio();
                tester.platformDispatcher.clearPlatformBrightnessTestValue();
                tester.platformDispatcher.clearTextScaleFactorTestValue();
              });
              await tester.pumpWidget(
                const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
              );
              await tester.pump(const Duration(milliseconds: 350));
              if (brightness == Brightness.dark) {
                await tester.tap(
                  find.byTooltip(
                    language == 'th'
                        ? 'เปลี่ยนเป็นธีมมืด'
                        : 'Switch to dark mode',
                  ),
                );
                await tester.pump();
              }
              for (var index = 0; index < 4; index++) {
                await tester.tap(find.byType(NavigationDestination).at(index));
                await tester.pump(const Duration(milliseconds: 350));
                expect(tester.takeException(), isNull);
                final scroll = find.byType(SingleChildScrollView).hitTestable();
                if (scroll.evaluate().isNotEmpty) {
                  await tester.drag(scroll.first, const Offset(0, -600));
                  await tester.pump(const Duration(milliseconds: 350));
                  expect(tester.takeException(), isNull);
                }
              }
              await tester.pumpWidget(const SizedBox.shrink());
              await tester.pump();
            },
          );
        }
      }
    }
  }
}
