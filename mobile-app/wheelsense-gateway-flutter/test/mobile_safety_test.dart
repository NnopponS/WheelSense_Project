import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wheelsense_gateway_flutter/services/gateway_services.dart';

List<int> _mqttPublishPacket(String topic, String payload) {
  final topicBytes = utf8.encode(topic);
  final payloadBytes = utf8.encode(payload);
  final remainingLength = 2 + topicBytes.length + payloadBytes.length;
  return [
    0x30,
    remainingLength,
    topicBytes.length >> 8,
    topicBytes.length & 0xff,
    ...topicBytes,
    ...payloadBytes,
  ];
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });

  test('MQTT accepts anonymous plaintext and TLS broker settings', () {
    final plain = GatewayConfig.defaults().copyWith(
      mqttHost: 'broker.emqx.io',
      mqttPort: 1883,
      mqttUseTls: false,
      mqttUsername: '',
      mqttPassword: '',
    );
    final tls = plain.copyWith(
      mqttHost: 'private.example',
      mqttPort: 8883,
      mqttUseTls: true,
    );

    expect(plain.hasBroker, isTrue);
    expect(tls.hasBroker, isTrue);
    expect(plain.copyWith(mqttHost: '', mqttPort: 0).hasBroker, isFalse);
  });

  test('Plain MQTT sends registration and receives a server URL', () async {
    final broker = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final sockets = <Socket>[];
    final registrationReceived = Completer<void>();
    final subscriptionReceived = Completer<void>();
    Socket? brokerSocket;
    final brokerSubscription = broker.listen((socket) {
      sockets.add(socket);
      brokerSocket = socket;
      socket.listen((packet) {
        if (packet.isEmpty) return;
        final type = packet.first >> 4;
        if (type == 1) {
          socket.add(const [0x20, 0x02, 0x00, 0x00]);
        } else if (type == 3 && !registrationReceived.isCompleted) {
          registrationReceived.complete();
        } else if (type == 8 && !subscriptionReceived.isCompleted) {
          subscriptionReceived.complete();
        }
      });
    });
    final config = GatewayConfig.defaults().copyWith(
      mqttHost: InternetAddress.loopbackIPv4.address,
      mqttPort: broker.port,
      mqttUseTls: false,
      mqttUsername: '',
      mqttPassword: '',
    );
    final mqtt = MqttGatewayService();

    try {
      expect(
        await mqtt.connect(config).timeout(const Duration(seconds: 3)),
        isTrue,
      );
      await registrationReceived.future.timeout(const Duration(seconds: 3));
      expect(
        MqttGatewayService.subscriptionTopicsFor(config),
        contains('WheelSense/config/all'),
      );
      final messages = mqtt.subscribeStatus(config);
      final received = messages.first.timeout(const Duration(seconds: 3));
      await subscriptionReceived.future.timeout(const Duration(seconds: 3));
      brokerSocket!.add(
        _mqttPublishPacket(
          'WheelSense/config/all',
          jsonEncode({'portal_base_url': 'http://127.0.0.1:5173'}),
        ),
      );
      final message = await received;
      expect(message.topic, 'WheelSense/config/all');
      expect(message.payload['portal_base_url'], 'http://127.0.0.1:5173');
    } finally {
      await mqtt.disconnect();
      await brokerSubscription.cancel();
      await broker.close();
      for (final socket in sockets) {
        socket.destroy();
      }
    }
  });

  test(
    'Portal trusts exact HTTPS origin and only loopback development HTTP',
    () {
      final base = Uri.parse('https://care.example');
      for (final safe in [
        'https://care.example/login',
        'https://care.example:443/patient',
        'https://care.example/callback?code=test',
      ]) {
        expect(GatewayWebViewService.isTrustedNavigation(base, safe), isTrue);
      }
      for (final unsafe in [
        'http://care.example',
        'https://care.example.attacker.test',
        'https://other.example',
        'https://care.example:444',
        'https://user:secret@care.example',
        'javascript:alert(1)',
        'file:///etc/passwd',
        'intent://care.example',
      ]) {
        expect(
          GatewayWebViewService.isTrustedNavigation(base, unsafe),
          isFalse,
        );
      }
      expect(
        GatewayWebViewService.portalUri('http://10.0.2.2:3000'),
        isNotNull,
      );
      expect(GatewayWebViewService.portalUri('http://remote.example'), isNull);
    },
  );

  test(
    'Legacy MQTT password migrates securely without losing identity or pairing',
    () async {
      final config = GatewayConfig.defaults().copyWith(
        deviceId: 'test-mobile',
        mqttPassword: 'test-only',
      );
      SharedPreferences.setMockInitialValues({
        'wheelsense.gateway.config.v1': jsonEncode(config.toJson()),
      });
      final preferences = GatewayPreferencesService();
      final migrated = await preferences.loadConfig();
      expect(migrated.deviceId, 'test-mobile');
      expect(migrated.mqttPassword, 'test-only');
      final prefs = await SharedPreferences.getInstance();
      expect(
        jsonDecode(prefs.getString('wheelsense.gateway.config.v1')!),
        isNot(contains('mqttPassword')),
      );
      expect(
        await const FlutterSecureStorage().read(
          key: 'wheelsense.gateway.mqtt_password.v1',
        ),
        'test-only',
      );
      expect((await preferences.loadConfig()).mqttPassword, 'test-only');
    },
  );

  test('Failed secure migration preserves the original password', () async {
    final config = GatewayConfig.defaults().copyWith(mqttPassword: 'test-only');
    final original = jsonEncode(config.toJson());
    SharedPreferences.setMockInitialValues({
      'wheelsense.gateway.config.v1': original,
    });
    final preferences = GatewayPreferencesService(storage: _FailingStorage());
    await expectLater(
      preferences.loadConfig(),
      throwsA(isA<PlatformException>()),
    );
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('wheelsense.gateway.config.v1'), original);
  });

  test(
    'Forgetting a sensor clears its latest reading while ordinary copies preserve it',
    () {
      final sample = PolarTelemetrySample(
        timestamp: DateTime.utc(2026),
        heartRateBpm: 72,
        rrIntervalsMs: const [833],
        rssi: -50,
      );
      final snapshot = GatewayRuntimeSnapshot.initial().copyWith(
        latestPolarSample: sample,
      );
      expect(snapshot.copyWith().latestPolarSample, sample);
      expect(
        snapshot.copyWith(latestPolarSample: null).latestPolarSample,
        isNull,
      );
      final m5 = M5TelemetrySample.fromPayload('{"velocity_ms":0.5}');
      expect(
        snapshot
            .copyWith(latestM5Sample: m5)
            .copyWith(latestM5Sample: null)
            .latestM5Sample,
        isNull,
      );
    },
  );
}

class _FailingStorage extends FlutterSecureStorage {
  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    throw PlatformException(code: 'storage_unavailable');
  }
}
