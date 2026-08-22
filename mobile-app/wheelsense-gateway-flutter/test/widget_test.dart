import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wheelsense_gateway_flutter/main.dart';

void main() {
  testWidgets('Gateway shell renders production workflow tabs and setup', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pumpAndSettle();

    expect(find.text('Overview'), findsWidgets);
    expect(find.text('Live Monitor'), findsWidgets);
    expect(find.text('Polar Studio'), findsWidgets);
    expect(find.text('Node Radar'), findsWidgets);
    expect(find.text('Portal'), findsWidgets);
    expect(find.text('Devices'), findsWidgets);
    expect(find.text('Settings'), findsWidgets);
    expect(find.text('Gateway setup'), findsOneWidget);
    expect(find.text('Open Settings'), findsOneWidget);
  });

  testWidgets('Gateway shell renders Thai labels from saved preference', (
    WidgetTester tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'wheelsense.gateway.language.v1': 'th',
    });

    await tester.pumpWidget(
      const WheelSenseGatewayApp(requestPermissionsOnOpen: false),
    );
    await tester.pumpAndSettle();

    expect(find.text('ภาพรวม'), findsWidgets);
    expect(find.text('มอนิเตอร์สด'), findsWidgets);
    expect(find.text('อุปกรณ์'), findsWidgets);
    expect(find.text('ตั้งค่าเกตเวย์'), findsOneWidget);
    expect(find.text('เปิดการตั้งค่า'), findsOneWidget);
  });
}
