import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/gateway_status.dart';

enum GatewayLanguage {
  english('en', 'English', 'English'),
  thai('th', 'ไทย', 'Thai');

  const GatewayLanguage(this.code, this.label, this.englishLabel);

  final String code;
  final String label;
  final String englishLabel;

  static GatewayLanguage fromCode(String? code) {
    return switch (code) {
      'th' => GatewayLanguage.thai,
      _ => GatewayLanguage.english,
    };
  }
}

class GatewayLocaleController extends ChangeNotifier {
  static const String preferenceKey = 'wheelsense.gateway.language.v1';

  GatewayLanguage _language = GatewayLanguage.english;

  GatewayLanguage get language => _language;

  Future<void> load() async {
    final preferences = await SharedPreferences.getInstance();
    _language = GatewayLanguage.fromCode(preferences.getString(preferenceKey));
    notifyListeners();
  }

  Future<void> setLanguage(GatewayLanguage language) async {
    if (_language == language) {
      return;
    }
    _language = language;
    notifyListeners();
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(preferenceKey, language.code);
  }
}

class GatewayLocaleScope extends InheritedNotifier<GatewayLocaleController> {
  const GatewayLocaleScope({
    super.key,
    required GatewayLocaleController controller,
    required super.child,
  }) : super(notifier: controller);

  static GatewayLocaleController controllerOf(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<GatewayLocaleScope>();
    assert(scope != null, 'GatewayLocaleScope was not found in context.');
    return scope!.notifier!;
  }

  static GatewayStrings stringsOf(BuildContext context) {
    return GatewayStrings(controllerOf(context).language);
  }
}

extension GatewayLocalizationContext on BuildContext {
  GatewayStrings get text => GatewayLocaleScope.stringsOf(this);
  GatewayLocaleController get gatewayLocale =>
      GatewayLocaleScope.controllerOf(this);
}

class GatewayStrings {
  const GatewayStrings(this.language);

  final GatewayLanguage language;

  bool get isThai => language == GatewayLanguage.thai;

  String pick(String english, String thai) => isThai ? thai : english;

  String get appTitle => 'WheelSense';
  String get navOverview => pick('Overview', 'ภาพรวม');
  String get navDevices => pick('Devices', 'อุปกรณ์');
  String get navMonitor => pick('Live Monitor', 'มอนิเตอร์สด');
  String get navPolarStudio => pick('Polar Studio', 'โพลาร์สตูดิโอ');
  String get navNodeRadar => pick('Node Radar', 'เรดาร์โหนด');
  String get navOperations => pick('Operations', 'ปฏิบัติการ');
  String get navPortal => pick('Portal', 'พอร์ทัล');
  String get navSettings => pick('Settings', 'ตั้งค่า');
  String get startGateway => pick('Start gateway', 'เริ่มเกตเวย์');
  String get resumeRelay => pick('Resume relay', 'เชื่อมต่อรีเลย์ต่อ');
  String get openSettings => pick('Open Settings', 'เปิดการตั้งค่า');
  String get openDevices => pick('Open Devices', 'เปิดอุปกรณ์');
  String get done => pick('Done', 'เสร็จแล้ว');
  String get needed => pick('Needed', 'ต้องทำ');
  String get waiting => pick('Waiting', 'รอข้อมูล');
  String get live => pick('Live', 'สด');
  String get empty => pick('Empty', 'ไม่มีข้อมูล');
  String get ready => pick('Ready', 'พร้อม');
  String get off => pick('Off', 'ปิด');
  String get subscribed => pick('Subscribed', 'ติดตามแล้ว');
  String get fix => pick('Fix', 'แก้ไข');
  String get save => pick('Save', 'บันทึก');
  String get saving => pick('Saving', 'กำลังบันทึก');
  String get reset => pick('Reset', 'รีเซ็ต');
  String get test => pick('Test', 'ทดสอบ');
  String get retry => pick('Retry', 'ลองใหม่');
  String get cancel => pick('Cancel', 'ยกเลิก');
  String get rename => pick('Rename', 'เปลี่ยนชื่อ');
  String get reconnect => pick('Reconnect', 'เชื่อมต่อใหม่');
  String get forget => pick('Forget', 'ลบการจับคู่');
  String get scanAgain => pick('Scan Again', 'สแกนอีกครั้ง');
  String get scanning => pick('Scanning', 'กำลังสแกน');
  String get connected => pick('Connected', 'เชื่อมต่อแล้ว');
  String get notConnected => pick('Not connected', 'ยังไม่เชื่อมต่อ');
  String get production => pick('Production', 'ใช้งานจริง');

  String modeLabel(GatewayConnectionMode mode) {
    return switch (mode) {
      GatewayConnectionMode.idle => ready,
      GatewayConnectionMode.scanning => scanning,
      GatewayConnectionMode.connected => pick('Relaying', 'กำลังส่งข้อมูล'),
      GatewayConnectionMode.degraded => pick('Degraded', 'ต้องตรวจสอบ'),
      GatewayConnectionMode.error => pick('Error', 'ผิดพลาด'),
    };
  }

  String get overviewSetupTitle => pick('Gateway setup', 'ตั้งค่าเกตเวย์');
  String get overviewSetupSubtitle => pick(
    'Complete these steps before leaving this phone as the ward gateway.',
    'ทำตามขั้นตอนนี้ก่อนวางโทรศัพท์ไว้เป็นเกตเวย์ประจำวอร์ด',
  );
  String get overviewNextStepTitle => pick('Next step', 'ขั้นตอนถัดไป');
  String get overviewLiveStateTitle => pick('Live state', 'สถานะสด');
  String get overviewLiveStateSubtitle => pick(
    'Latest server-side context received through MQTT.',
    'ข้อมูลล่าสุดจากเซิร์ฟเวอร์ผ่าน MQTT',
  );
  String get metricGateway => pick('Gateway', 'เกตเวย์');
  String get metricTelemetrySync =>
      pick('Telemetry sync', 'การส่งข้อมูลเซนเซอร์');
  String get metricPatientLink => pick('Patient link', 'การผูกผู้ป่วย');
  String get metricNoPublishFailures =>
      pick('No publish failures recorded', 'ยังไม่พบการส่งข้อมูลล้มเหลว');
  String publishFailureCount(int count) =>
      pick('$count publish failures', 'ส่งข้อมูลล้มเหลว $count ครั้ง');
  String get metricWaitingForRetainedConfig =>
      pick('Waiting for retained MQTT config', 'รอ config ที่เก็บไว้จาก MQTT');
  String patientId(int id) => pick('Patient $id', 'ผู้ป่วย $id');
  String caregiverId(int id) => pick('Caregiver $id', 'ผู้ดูแล $id');
  String get unlinked => pick('Unlinked', 'ยังไม่ผูก');

  String get setupPermissions => pick('Permissions', 'สิทธิ์การใช้งาน');
  String get setupPermissionsReady =>
      pick('Bluetooth permissions are ready', 'สิทธิ์ Bluetooth พร้อมแล้ว');
  String get setupPermissionsNeeded => pick(
    'Bluetooth and notification permissions need attention',
    'ต้องอนุญาต Bluetooth และการแจ้งเตือน',
  );
  String get setupServer => pick('Server and broker', 'เซิร์ฟเวอร์และ Broker');
  String brokerConnected(String endpoint) =>
      pick('$endpoint connected', '$endpoint เชื่อมต่อแล้ว');
  String brokerNotConnected(String endpoint) =>
      pick('$endpoint not connected', '$endpoint ยังไม่เชื่อมต่อ');
  String get setupM5 => pick('M5 gateway sensor', 'เซนเซอร์ M5 ของเกตเวย์');
  String get setupM5Pair =>
      pick('Pair the WheelSense M5', 'จับคู่ WheelSense M5');
  String get setupPolar => pick('Polar sensor', 'เซนเซอร์ Polar');
  String get setupPolarOptional =>
      pick('Optional heart-rate relay', 'ตัวเลือกสำหรับส่งอัตราการเต้นหัวใจ');
  String get nextPermissionsTitle =>
      pick('Allow phone permissions', 'อนุญาตสิทธิ์บนโทรศัพท์');
  String get nextPermissionsDetail => pick(
    'Tap Start gateway to request Bluetooth and notification access.',
    'แตะเริ่มเกตเวย์เพื่อขอสิทธิ์ Bluetooth และการแจ้งเตือน',
  );
  String get nextServerTitle =>
      pick('Connect server and MQTT', 'เชื่อมต่อเซิร์ฟเวอร์และ MQTT');
  String get nextServerDetail => pick(
    'Set the portal URL and broker, then test the connection.',
    'ใส่ URL พอร์ทัลและ Broker แล้วทดสอบการเชื่อมต่อ',
  );
  String get nextM5Title => pick('Pair the M5 sensor', 'จับคู่เซนเซอร์ M5');
  String get nextM5Detail => pick(
    'Open Devices, scan nearby BLE, and connect M5StickC Plus2.',
    'เปิดหน้าอุปกรณ์ สแกน BLE ใกล้ตัว แล้วเชื่อมต่อ M5StickC Plus2',
  );
  String get nextFirstPacketTitle =>
      pick('Wait for first telemetry', 'รอข้อมูลชุดแรก');
  String get nextFirstPacketDetail => pick(
    'Keep the M5 connected until the first telemetry packet arrives.',
    'ให้ M5 เชื่อมต่อไว้จนข้อมูลชุดแรกเข้ามา',
  );
  String get nextReadyTitle => pick('Gateway is ready', 'เกตเวย์พร้อมใช้งาน');
  String get nextReadyDetail => pick(
    'Leave this phone powered and online to relay BLE telemetry.',
    'เสียบชาร์จและเปิดเน็ตไว้เพื่อส่งข้อมูล BLE ต่อเนื่อง',
  );

  String get noRoomPrediction =>
      pick('No room prediction', 'ยังไม่มีตำแหน่งห้อง');
  String get noRoomPredictionDetail => pick(
    'Room updates appear after RSSI telemetry reaches the backend.',
    'ตำแหน่งห้องจะแสดงหลังข้อมูล RSSI ส่งถึง backend',
  );
  String liveAlerts(int count) =>
      pick('$count live alerts', 'แจ้งเตือนสด $count รายการ');
  String get noActiveAlerts => pick(
    'No active alerts for this linked gateway.',
    'ไม่มีแจ้งเตือนค้างอยู่สำหรับเกตเวย์นี้',
  );

  String get settingsLanguageTitle => pick('Language', 'ภาษา');
  String get settingsLanguageSubtitle => pick(
    'Choose the language shown in the mobile gateway.',
    'เลือกภาษาที่แสดงในแอปเกตเวย์มือถือ',
  );
  String get settingsPortalEndpoint =>
      pick('Portal endpoint', 'ปลายทางพอร์ทัล');
  String get settingsMqttBroker => pick('MQTT broker', 'MQTT Broker');
  String get settingsGatewayMode => pick('Gateway mode', 'โหมดเกตเวย์');
  String get settingsGatewayModeDetail => pick(
    'BLE gateway, no native login required',
    'เกตเวย์ BLE ไม่ต้องล็อกอินในแอป',
  );
  String get settingsServerTitle => pick('Server setup', 'ตั้งค่าเซิร์ฟเวอร์');
  String get settingsServerSubtitle => pick(
    'Configure the portal and MQTT broker used by the mobile gateway.',
    'ตั้งค่าพอร์ทัลและ MQTT Broker ที่เกตเวย์มือถือใช้งาน',
  );
  String get settingsPortalBaseUrl => pick('Portal base URL', 'URL พอร์ทัล');
  String get settingsGatewayId => pick('Gateway ID', 'รหัสเกตเวย์');
  String get settingsNeedAttention =>
      pick('Settings need attention', 'ต้องแก้ไขการตั้งค่า');
  String get settingsLocalPreset =>
      pick('Local dev preset', 'ค่าทดสอบเครื่องนี้');
  String get settingsLocalPresetWarning => pick(
    'Local dev preset uses cleartext URLs. It is intended for debug/profile builds, not release deployment.',
    'ค่าทดสอบนี้ใช้ URL แบบไม่เข้ารหัส เหมาะสำหรับ debug/profile เท่านั้น ไม่ควรใช้ในงานจริง',
  );
  String get mqttUsername => pick('MQTT username', 'ชื่อผู้ใช้ MQTT');
  String get mqttPassword => pick('MQTT password', 'รหัสผ่าน MQTT');
  String get portalUrlInvalid => pick(
    'Portal URL must be an http or https URL with a host.',
    'URL พอร์ทัลต้องเป็น http หรือ https และต้องมี host',
  );
  String get mqttUrlInvalid => pick(
    'MQTT broker must be a valid mqtt:// or mqtts:// URL with host and port.',
    'MQTT Broker ต้องเป็น URL mqtt:// หรือ mqtts:// ที่มี host และ port ถูกต้อง',
  );

  String get devicesTapToScan => pick('Tap to scan', 'แตะเพื่อสแกน');
  String get devicesNeedsAttention => pick('Needs attention', 'ต้องตรวจสอบ');
  String get devicesConnecting => pick('Connecting...', 'กำลังเชื่อมต่อ...');
  String get devicesScanningNearbyBle =>
      pick('Scanning nearby BLE', 'กำลังสแกน BLE ใกล้ตัว');
  String get devicesTapToConnect => pick('Tap to connect', 'แตะเพื่อเชื่อมต่อ');
  String get distance => pick('Distance', 'ระยะทาง');
  String get velocity => pick('Velocity', 'ความเร็ว');
  String get acceleration => pick('Accel', 'ความเร่ง');
  String get heartRate => pick('Heart Rate', 'ชีพจร');
  String get ppgSignal => pick('PPG Signal', 'สัญญาณ PPG');
  String get bleBeacons => pick('BLE Beacons', 'Beacon BLE');
  String get noBleBeacons => pick('No BLE beacons', 'ยังไม่พบ Beacon BLE');
  String get scanningNearbyBeacons =>
      pick('Scanning nearby beacons', 'กำลังสแกน beacon ใกล้ตัว');
  String get detectedWsnNodes => pick(
    'Detected WSN nodes will appear here.',
    'โหนด WSN ที่พบจะแสดงที่นี่',
  );
  String get tapScanNearWsn =>
      pick('Tap Scan Again near WSN_ nodes.', 'แตะสแกนอีกครั้งใกล้โหนด WSN_');
  String get renameDevice => pick('Rename device', 'เปลี่ยนชื่ออุปกรณ์');
  String get deviceName => pick('Device name', 'ชื่ออุปกรณ์');
  String bleScanFailed(Object error) =>
      pick('BLE scan failed: $error', 'สแกน BLE ไม่สำเร็จ: $error');
  String get m5NotFound => pick(
    'M5StickC Plus2 not found. Turn it on and scan again.',
    'ไม่พบ M5StickC Plus2 กรุณาเปิดเครื่องแล้วสแกนใหม่',
  );
  String get polarNotFound => pick(
    'Polar Verity Sense not found. Turn it on and scan again.',
    'ไม่พบ Polar Verity Sense กรุณาเปิดเครื่องแล้วสแกนใหม่',
  );
  String get m5Connected =>
      pick('M5StickC Plus2 is connected', 'M5StickC Plus2 เชื่อมต่อแล้ว');
  String get polarConnected => pick(
    'Polar Verity Sense is connected',
    'Polar Verity Sense เชื่อมต่อแล้ว',
  );
  String get connectingM5 =>
      pick('Connecting to M5StickC Plus2', 'กำลังเชื่อมต่อ M5StickC Plus2');
  String get connectingPolar => pick(
    'Connecting to Polar Verity Sense',
    'กำลังเชื่อมต่อ Polar Verity Sense',
  );
  String notM5(String name) => pick(
    '$name is not advertising the WheelSense M5 service',
    '$name ไม่ได้ประกาศบริการ WheelSense M5',
  );
  String notPolar(String name) => pick(
    '$name is not a Polar Verity Sense / HR sensor',
    '$name ไม่ใช่ Polar Verity Sense หรือเซนเซอร์ชีพจร',
  );
  String get waitingForM5Telemetry => pick(
    'Waiting for M5StickC Plus2 telemetry',
    'กำลังรอข้อมูลจาก M5StickC Plus2',
  );
  String get waitingForPolarData => pick(
    'Waiting for Polar Verity Sense data',
    'กำลังรอข้อมูลจาก Polar Verity Sense',
  );
  String m5ConnectionFailed(Object error) =>
      pick('M5 connection failed: $error', 'เชื่อมต่อ M5 ไม่สำเร็จ: $error');
  String polarConnectionFailed(Object error) => pick(
    'Polar connection failed: $error',
    'เชื่อมต่อ Polar ไม่สำเร็จ: $error',
  );
  String get invalidM5Packet => pick(
    'M5 packet is not valid JSON telemetry',
    'ข้อมูลจาก M5 ไม่ใช่ JSON telemetry ที่ถูกต้อง',
  );

  String get operationsRunChecks => pick('Run checks', 'ตรวจระบบ');
  String get operationsAlerts => pick('Alerts', 'แจ้งเตือน');
  String get operationsRoom => pick('Room', 'ห้อง');
  String get operationsSyncFailures =>
      pick('Sync failures', 'ส่งข้อมูลล้มเหลว');
  String get alertsSubscribed =>
      pick('Subscribed to live MQTT alerts', 'ติดตามแจ้งเตือน MQTT สดแล้ว');
  String get alertsWaitingConfig =>
      pick('Waiting for alert-enabled config', 'รอ config เปิดใช้งานแจ้งเตือน');
  String get roomUnknown => pick('Unknown', 'ยังไม่ทราบ');
  String get noServerPredictionYet =>
      pick('No server prediction yet', 'ยังไม่มีผลทำนายจากเซิร์ฟเวอร์');
  String confidencePercent(int percent) =>
      pick('$percent% confidence', 'ความมั่นใจ $percent%');
  String get noFailureRecorded =>
      pick('No failure recorded', 'ยังไม่พบการล้มเหลว');
  String get operationsLiveAlertsTitle => pick('Live alerts', 'แจ้งเตือนสด');
  String get operationsLiveAlertsSubtitle => pick(
    'Alerts delivered for the linked patient or gateway.',
    'แจ้งเตือนของผู้ป่วยหรือเกตเวย์ที่ผูกไว้',
  );
  String get noLiveAlerts => pick('No live alerts', 'ยังไม่มีแจ้งเตือนสด');
  String get noLiveAlertsDetail => pick(
    'Alerts appear here after the backend publishes to the linked patient or gateway topic.',
    'แจ้งเตือนจะแสดงเมื่อ backend ส่งมาที่ topic ของผู้ป่วยหรือเกตเวย์',
  );
  String get monitorPolarTitle => pick('Polar vitals', 'ข้อมูลชีพจร Polar');
  String get monitorPolarSubtitle => pick(
    'Live heart rate, HRV, and SpO2 from the paired Polar sensor.',
    'ชีพจร ค่า HRV และ SpO2 แบบสดจากเซนเซอร์ Polar',
  );
  String get monitorMotionTitle => pick('Wheelchair motion', 'การเคลื่อนไหวรถเข็น');
  String get monitorMotionSubtitle => pick(
    'Live distance, velocity, and acceleration from the M5 sensor.',
    'ระยะทาง ความเร็ว และความเร่งแบบสดจากเซนเซอร์ M5',
  );
  String get monitorPolarLink => pick('Polar link', 'การเชื่อมต่อ Polar');
  String get monitorM5Link => pick('M5 link', 'การเชื่อมต่อ M5');
  String get monitorRecording => pick('Recording', 'กำลังบันทึก');
  String get monitorRelaying => pick('Relaying', 'กำลังส่งข้อมูล');
  String get monitorPairHint => pick(
    'Pair the sensor from the Devices tab to see live data.',
    'จับคู่เซนเซอร์ที่หน้าอุปกรณ์เพื่อดูข้อมูลสด',
  );
  String get monitorHrv => pick('HRV (RMSSD)', 'HRV (RMSSD)');
  String get monitorSpo2 => pick('SpO2', 'SpO2');
  String get monitorSpo2Estimated =>
      pick('Estimated from PPG', 'ประมาณจากสัญญาณ PPG');
  String get monitorHrRange => pick('HR range', 'ช่วงชีพจร');
  String get monitorSensorBattery => pick('Sensor battery', 'แบตเตอรี่เซนเซอร์');
  String get monitorCharging => pick('Charging', 'กำลังชาร์จ');
  String get monitorContactOn => pick('Contact', 'สัมผัสผิวหนัง');
  String get monitorContactOff => pick('No contact', 'ไม่สัมผัสผิวหนัง');
  String monitorPublishAge(Duration age) => age.inMinutes < 1
      ? pick('${age.inSeconds}s ago', '${age.inSeconds} วินาทีที่แล้ว')
      : pick('${age.inMinutes}m ago', '${age.inMinutes} นาทีที่แล้ว');

  String get portal => pick('Portal', 'พอร์ทัล');
  String get roomPredictionTitle => pick('Room prediction', 'ผลทำนายห้อง');
  String get roomPredictionSubtitle => pick(
    'Server-derived room confidence from RSSI telemetry.',
    'ความมั่นใจของห้องจาก RSSI ที่เซิร์ฟเวอร์คำนวณ',
  );
  String get waitingForRoomData =>
      pick('Waiting for room data', 'กำลังรอข้อมูลห้อง');
  String get waitingForRoomDataDetail => pick(
    'Pair the gateway and publish RSSI telemetry to receive room predictions.',
    'จับคู่เกตเวย์และส่ง RSSI เพื่อรับผลทำนายห้อง',
  );
  String get rssiRoomScan => pick('RSSI room scan', 'สแกนห้องด้วย RSSI');
  String get rssiRoomScanSubtitle => pick(
    'Local BLE scan tool for WSN beacons and room evidence.',
    'เครื่องมือสแกน BLE ในเครื่องสำหรับ WSN beacon และหลักฐานห้อง',
  );
  String get scanBeacons => pick('Scan beacons', 'สแกน beacon');
  String get noLocalScanData =>
      pick('No local scan data', 'ยังไม่มีข้อมูลสแกนในเครื่อง');
  String get scanningForRssiBeacons =>
      pick('Scanning for RSSI beacons', 'กำลังสแกน RSSI beacon');
  String get nearbyWsnNodesAppear => pick(
    'Nearby WSN_ nodes appear here with signal confidence.',
    'โหนด WSN_ ใกล้ตัวจะแสดงพร้อมค่าความมั่นใจของสัญญาณ',
  );
  String beaconSummary(int count, int rssi) => pick(
    '$count beacons, best $rssi dBm',
    '$count beacon, สัญญาณดีที่สุด $rssi dBm',
  );
  String get diagnostics => pick('Diagnostics', 'ตรวจวินิจฉัย');
  String get bleAdapter => pick('BLE adapter', 'ตัวรับส่ง BLE');
  String get bleAdapterDetail => pick(
    'Bluetooth scan and connect permissions.',
    'สิทธิ์สแกนและเชื่อมต่อ Bluetooth',
  );
  String get mqttBrokerDetail => pick(
    'Registration, telemetry, config, alert, and room topics.',
    'topic ลงทะเบียน, telemetry, config, alert และ room',
  );
  String get androidForegroundService =>
      pick('Android foreground service', 'บริการ foreground ของ Android');
  String get androidForegroundServiceDetail => pick(
    'Keeps the gateway visible and recoverable.',
    'ช่วยให้เกตเวย์ทำงานค้างไว้และกู้คืนได้ง่าย',
  );
  String get now => pick('Now', 'ตอนนี้');
  String minutesAgo(int minutes) => pick('$minutes min', '$minutes นาที');
  String hoursAgo(int hours) => pick('$hours h', '$hours ชม.');

  String get portalUnavailable =>
      pick('Portal unavailable', 'เปิดพอร์ทัลไม่ได้');
  String get portalUrlInvalidSettings => pick(
    'Portal URL is invalid. Update it in Settings.',
    'URL พอร์ทัลไม่ถูกต้อง กรุณาแก้ที่การตั้งค่า',
  );
  String get portalUnreachable => pick(
    'Portal is unreachable. Check network or open externally.',
    'เชื่อมต่อพอร์ทัลไม่ได้ ตรวจเครือข่ายหรือเปิดด้วยเบราว์เซอร์ภายนอก',
  );
  String get openExternally => pick('Open externally', 'เปิดภายนอก');
  String get couldNotOpenPortal =>
      pick('Could not open portal externally', 'เปิดพอร์ทัลภายนอกไม่สำเร็จ');
}
