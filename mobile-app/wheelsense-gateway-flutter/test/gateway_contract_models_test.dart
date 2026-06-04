import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_config.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_runtime_snapshot.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_setup_form.dart';
import 'package:wheelsense_gateway_flutter/models/gateway_status.dart';
import 'package:wheelsense_gateway_flutter/models/mqtt_broker_config.dart';
import 'package:wheelsense_gateway_flutter/services/mqtt_gateway_service.dart';

void main() {
  test('retained MQTT config preserves portal and linked identity', () {
    final config = GatewayConfig.defaults();

    final next = applyMqttConfigUpdate(config, <String, Object?>{
      'portal_base_url': 'https://portal.wheelsense.test/',
      'linked_patient_id': 42,
      'linked_caregiver_id': null,
      'linked_person_type': 'patient',
      'alerts_enabled': true,
    });

    expect(next.portalBaseUrl, 'https://portal.wheelsense.test');
    expect(next.linkedPatientId, 42);
    expect(next.linkedCaregiverId, isNull);
    expect(next.linkedPersonType, 'patient');
    expect(next.alertsEnabled, isTrue);
  });

  test('portal-only retained config preserves existing linked identity', () {
    final config = GatewayConfig.defaults().copyWith(
      linkedPatientId: 42,
      linkedPersonType: 'patient',
      alertsEnabled: true,
    );

    final next = applyMqttConfigUpdate(config, <String, Object?>{
      'portal_base_url': 'https://new-portal.wheelsense.test/',
    });

    expect(next.portalBaseUrl, 'https://new-portal.wheelsense.test');
    expect(next.linkedPatientId, 42);
    expect(next.linkedPersonType, 'patient');
    expect(next.alertsEnabled, isTrue);
  });

  test('retained config equality detects unchanged replay', () {
    final config = GatewayConfig.defaults().copyWith(
      linkedPatientId: 42,
      linkedPersonType: 'patient',
      alertsEnabled: true,
    );

    final next = applyMqttConfigUpdate(config, <String, Object?>{
      'portal_base_url': config.portalBaseUrl,
      'linked_patient_id': 42,
      'linked_person_type': 'patient',
      'alerts_enabled': true,
    });

    expect(gatewayConfigEquals(next, config), isTrue);
  });

  test('MQTT subscriptions cover config, control, room, and alerts', () {
    final config = GatewayConfig.defaults().copyWith(
      deviceId: 'MOBILE_A',
      linkedPatientId: 7,
      linkedPersonType: 'patient',
      alertsEnabled: true,
    );

    final topics = MqttGatewayService.subscriptionTopicsFor(config);

    expect(topics, contains('WheelSense/config/all'));
    expect(topics, contains('WheelSense/config/MOBILE_A'));
    expect(topics, contains('WheelSense/mobile/MOBILE_A/#'));
    expect(topics, contains('WheelSense/mobile/MOBILE_A/control'));
    expect(topics, contains('WheelSense/room/MOBILE_A'));
    expect(topics, contains('WheelSense/alerts/7'));
  });

  test('alert events parse rich and fallback MQTT payloads', () {
    final rich = GatewayAlertEvent.fromMqtt(
      topic: 'WheelSense/alerts/7',
      payload: <String, Object?>{
        'alert_id': 88,
        'severity': 'critical',
        'title': 'Fall detected',
        'description': 'Room 204 needs response',
        'patient_id': 7,
        'device_id': 'MOBILE_A',
        'timestamp': '2026-06-04T02:30:00Z',
      },
    );

    expect(rich.id, '88');
    expect(rich.severity, GatewayAlertSeverity.critical);
    expect(rich.title, 'Fall detected');
    expect(rich.patientId, 7);

    final fallback = GatewayAlertEvent.fromMqtt(
      topic: 'WheelSense/alerts/MOBILE_A',
      payload: <String, Object?>{
        'alert_type': 'fall',
        'severity': 'critical',
        'device_id': 'MOBILE_A',
      },
    );

    expect(fallback.title, 'Fall alert');
    expect(fallback.deviceId, 'MOBILE_A');
  });

  test('room prediction events parse server room topic payload', () {
    final event = RoomPredictionEvent.fromPayload(<String, Object?>{
      'room_id': 204,
      'room_name': 'Room 204',
      'confidence': 0.932,
      'model_type': 'knn',
      'strategy': 'max_rssi',
    });

    expect(event.roomId, '204');
    expect(event.roomName, 'Room 204');
    expect(event.confidence, closeTo(0.932, 0.001));
    expect(event.modelType, 'knn');
    expect(event.strategy, 'max_rssi');
  });

  test(
    'publish result reports disconnected MQTT instead of silent false',
    () async {
      final result = await MqttGatewayService().publishTelemetry(
        config: GatewayConfig.defaults(),
        payload: '{"seq":1}',
      );

      expect(result.success, isFalse);
      expect(result.reason, TelemetryPublishFailureReason.disconnected);
    },
  );

  test('runtime snapshot clears current publish failure after success', () {
    final initial = GatewayRuntimeSnapshot.initial().recordPublish(
      TelemetryPublishResult.failed(
        topic: 'WheelSense/mobile/MOBILE_A/telemetry',
        reason: TelemetryPublishFailureReason.disconnected,
      ),
    );

    final recovered = initial.recordPublish(
      TelemetryPublishResult.sent('WheelSense/mobile/MOBILE_A/telemetry'),
    );

    expect(initial.failedPublishCount, 1);
    expect(recovered.failedPublishCount, 0);
    expect(recovered.lastPublishFailure, isNull);
    expect(recovered.lastSuccessfulPublishAt, isNotNull);
  });

  test(
    'subscription topics retarget alerts when retained identity changes',
    () {
      final oldConfig = GatewayConfig.defaults().copyWith(
        deviceId: 'MOBILE_A',
        linkedPatientId: 7,
        linkedPersonType: 'patient',
        alertsEnabled: true,
      );
      final newConfig = oldConfig.copyWith(
        linkedPatientId: 8,
        linkedCaregiverId: null,
        linkedPersonType: 'patient',
        alertsEnabled: true,
      );

      final removed = MqttGatewayService.subscriptionTopicsFor(
        oldConfig,
      ).difference(MqttGatewayService.subscriptionTopicsFor(newConfig));
      final added = MqttGatewayService.subscriptionTopicsFor(
        newConfig,
      ).difference(MqttGatewayService.subscriptionTopicsFor(oldConfig));

      expect(removed, contains('WheelSense/alerts/7'));
      expect(added, contains('WheelSense/alerts/8'));
    },
  );

  test(
    'MQTT broker parser accepts only broker URLs without extra request parts',
    () {
      final secure = MqttBrokerConfig.parse('mqtts://mqtt.wheelsense.test');
      expect(secure, isNotNull);
      expect(secure!.host, 'mqtt.wheelsense.test');
      expect(secure.port, 8883);
      expect(secure.useTls, isTrue);

      final clear = MqttBrokerConfig.parse('broker.emqx.io:1883');
      expect(clear, isNotNull);
      expect(clear!.host, 'broker.emqx.io');
      expect(clear.port, 1883);
      expect(clear.useTls, isFalse);

      expect(MqttBrokerConfig.parse('http://broker.example'), isNull);
      expect(MqttBrokerConfig.parse('mqtt://user@broker.example:1883'), isNull);
      expect(MqttBrokerConfig.parse('mqtt://broker.example:1883/path'), isNull);
      expect(MqttBrokerConfig.parse('mqtt://broker.example:1883?x=1'), isNull);
      expect(MqttBrokerConfig.parse('mqtt://broker.example:1883#frag'), isNull);
    },
  );

  test(
    'BLE relay auto-start is gated by setup completion and BLE readiness',
    () {
      final readyStatus = GatewayStatus.initial().copyWith(bleReady: true);
      final incomplete = GatewayConfig.defaults();
      final complete = incomplete.copyWith(setupCompleted: true);

      expect(
        shouldAutoStartBleRelay(
          config: incomplete,
          status: readyStatus,
          requested: true,
        ),
        isFalse,
      );
      expect(
        shouldAutoStartBleRelay(
          config: complete,
          status: readyStatus.copyWith(bleReady: false),
          requested: true,
        ),
        isFalse,
      );
      expect(
        shouldAutoStartBleRelay(
          config: complete,
          status: readyStatus,
          requested: false,
        ),
        isFalse,
      );
      expect(
        shouldAutoStartBleRelay(
          config: complete,
          status: readyStatus,
          requested: true,
        ),
        isTrue,
      );
    },
  );

  test('server setup form save does not complete first-run pairing gate', () {
    final current = GatewayConfig.defaults();

    final result = buildGatewayConfigFromSetupForm(
      current: current,
      portalInput: 'https://portal.wheelsense.test/',
      mqttInput: 'mqtts://mqtt.wheelsense.test:8883',
      gatewayIdInput: 'MOBILE_A',
      usernameInput: '',
      passwordInput: '',
    );

    expect(result.isValid, isTrue);
    expect(result.config!.portalBaseUrl, 'https://portal.wheelsense.test');
    expect(result.config!.deviceId, 'MOBILE_A');
    expect(result.config!.setupCompleted, isFalse);
  });
}
