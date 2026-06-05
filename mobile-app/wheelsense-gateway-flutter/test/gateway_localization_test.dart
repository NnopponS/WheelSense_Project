import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wheelsense_gateway_flutter/l10n/gateway_localizations.dart';

void main() {
  test('gateway strings provide Thai labels for core navigation', () {
    final strings = GatewayStrings(GatewayLanguage.thai);

    expect(strings.navOverview, 'ภาพรวม');
    expect(strings.navDevices, 'อุปกรณ์');
    expect(strings.startGateway, 'เริ่มเกตเวย์');
    expect(strings.settingsLanguageTitle, 'ภาษา');
  });

  test('locale controller persists selected language', () async {
    SharedPreferences.setMockInitialValues({});

    final first = GatewayLocaleController();
    await first.load();
    expect(first.language, GatewayLanguage.english);

    await first.setLanguage(GatewayLanguage.thai);
    expect(first.language, GatewayLanguage.thai);

    final second = GatewayLocaleController();
    await second.load();
    expect(second.language, GatewayLanguage.thai);
  });
}
