// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

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
    expect(find.text('Devices'), findsWidgets);
    expect(find.text('Operations'), findsWidgets);
    expect(find.text('Portal'), findsWidgets);
    expect(find.text('Settings'), findsWidgets);
    expect(find.text('Gateway setup'), findsOneWidget);
    expect(find.text('Open Settings'), findsOneWidget);
  });
}
