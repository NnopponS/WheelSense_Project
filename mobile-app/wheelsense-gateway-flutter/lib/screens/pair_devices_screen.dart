import 'dart:async';

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../models/gateway_ui_models.dart';
import '../models/preview_metrics.dart';
import 'tool_preview_readings.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../theme/app_theme.dart';
import '../widgets/clinical_components.dart';
import '../widgets/node_scanner_card.dart';
import '../widgets/product_ui.dart';
import '../widgets/realtime_charts.dart';

enum _ScanTarget { m5, polar }

class PairDevicesScreen extends StatefulWidget {
  const PairDevicesScreen({super.key, this.previewAt, this.initialTab = 0});

  final DateTime? previewAt;

  /// 0 wheelchair sensor, 1 FallGuard Belt, 2 Polar, 3 beacons.
  final int initialTab;

  @override
  State<PairDevicesScreen> createState() => _PairDevicesScreenState();
}

class _PairDevicesScreenState extends State<PairDevicesScreen> {
  final List<BleDeviceSnapshot> _devices = <BleDeviceSnapshot>[];
  final List<M5TelemetrySample> _m5Samples = <M5TelemetrySample>[];
  final List<PolarTelemetrySample> _polarSamples = <PolarTelemetrySample>[];

  StreamSubscription<BleDeviceSnapshot>? _scanSubscription;
  StreamSubscription<String>? _m5Subscription;
  StreamSubscription<PolarTelemetrySample>? _polarSubscription;
  StreamSubscription<GatewayConfig>? _configSubscription;
  Timer? _uiRefreshTimer;
  Timer? _previewTimer;
  DateTime? _previewNow;
  bool _pendingUiUpdate = false;

  BleDeviceSnapshot? _m5Device;
  BleDeviceSnapshot? _polarDevice;
  String? _m5Error;
  String? _polarError;
  _ScanTarget? _scanTarget;
  bool _scanning = false;
  bool _loadedInitialState = false;
  bool _m5RelayActive = false;
  bool _polarRelayActive = false;
  bool _m5Connecting = false;
  bool _polarConnecting = false;
  bool _m5SetupCompletionMarked = false;
  StreamSubscription<GatewayRuntimeSnapshot>? _snapshotSubscription;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loadedInitialState) {
      return;
    }
    _loadedInitialState = true;
    unawaited(_loadInitialState());
  }

  @override
  void initState() {
    super.initState();
    // Batch stream-driven rebuilds to 20Hz (50ms) for responsive real-time motion display.
    _uiRefreshTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (!_pendingUiUpdate || !mounted) {
        return;
      }
      _pendingUiUpdate = false;
      setState(() {});
    });
    _syncPreviewTimer();
  }

  @override
  void didUpdateWidget(covariant PairDevicesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if ((oldWidget.previewAt == null) != (widget.previewAt == null)) {
      _syncPreviewTimer();
    }
  }

  void _syncPreviewTimer() {
    _previewTimer?.cancel();
    _previewTimer = null;
    if (widget.previewAt == null) {
      _previewNow = null;
      return;
    }
    _previewNow = DateTime.now();
    _previewTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _previewNow = DateTime.now());
    });
  }

  @override
  void dispose() {
    _uiRefreshTimer?.cancel();
    _previewTimer?.cancel();
    _scanSubscription?.cancel();
    _m5Subscription?.cancel();
    _polarSubscription?.cancel();
    _configSubscription?.cancel();
    _snapshotSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadInitialState() async {
    final runtime = GatewayServicesScope.of(context);
    _configSubscription ??= runtime.configUpdates.listen(_applyConfigUpdate);
    _snapshotSubscription ??= runtime.snapshots.listen((_) {
      if (!mounted) return;
      _pendingUiUpdate = true;
    });
    final config = await runtime.loadConfig();
    final pairedM5 = await runtime.loadPairedM5Device();
    final pairedPolar = await runtime.loadPairedPolarDevice();
    if (!mounted) {
      return;
    }
    setState(() {
      _m5SetupCompletionMarked = config.setupCompleted;
      _m5Device = pairedM5;
      _polarDevice = pairedPolar;
    });
  }

  void _applyConfigUpdate(GatewayConfig config) {
    if (!mounted) {
      return;
    }
    setState(() {
      _m5SetupCompletionMarked = config.setupCompleted;
    });
  }

  Future<GatewayConfig> _loadLatestConfig() async {
    final runtime = GatewayServicesScope.of(context);
    final config = await runtime.loadConfig();
    if (mounted) {
      setState(() => _m5SetupCompletionMarked = config.setupCompleted);
    }
    return config;
  }

  @override
  Widget build(BuildContext context) {
    final strings = context.text;
    final runtime = GatewayServicesScope.of(context);
    final previewNow = widget.previewAt == null
        ? null
        : _previewNow ?? DateTime.now();
    final preview = previewNow == null ? null : PreviewMetrics.at(previewNow);
    // Prefer the shared rolling history: it also covers relays that were
    // auto-started outside this screen (e.g. on app resume).
    final m5Samples = runtime.snapshot.m5History.isNotEmpty
        ? runtime.snapshot.m5History
        : _m5Samples;
    final polarSamples = runtime.snapshot.polarHistory.isNotEmpty
        ? runtime.snapshot.polarHistory
        : _polarSamples;
    final m5View = _selectedOrCandidate(
      _m5Device,
      (device) => device.looksLikeM5,
    );
    final polarView = _selectedOrCandidate(
      _polarDevice,
      (device) => device.looksLikePolar,
    );
    final actualM5 = m5Samples.lastOrNull ?? runtime.snapshot.latestM5Sample;
    final actualPolar =
        polarSamples.lastOrNull ?? runtime.snapshot.latestPolarSample;
    final now = previewNow ?? DateTime.now();
    final latestM5 = ToolPreviewReadings.resolveWheelchair(
      actual: actualM5,
      preview: preview,
      now: now,
    );
    final latestPolar = ToolPreviewReadings.resolvePolar(
      actual: actualPolar,
      preview: preview,
      now: now,
    );
    final m5Fresh = ToolPreviewReadings.isFresh(actualM5?.timestamp, now);
    final polarFresh = ToolPreviewReadings.isFresh(actualPolar?.timestamp, now);
    final visibleM5History = m5Fresh && m5Samples.isNotEmpty
        ? m5Samples
        : preview == null
        ? m5Samples
        : ToolPreviewReadings.wheelchairHistory(now, preview);
    final visiblePolarHistory = polarFresh && polarSamples.isNotEmpty
        ? polarSamples
        : preview == null
        ? polarSamples
        : ToolPreviewReadings.polarHistory(now, preview);
    final m5Discovered = _discoveredMatching(
      _m5Device,
      (device) => device.looksLikeM5,
    );
    final polarDiscovered = _discoveredMatching(
      _polarDevice,
      (device) => device.looksLikePolar,
    );
    final beacons = _devices
        .where((device) => device.looksLikeNodeTsimcam)
        .sorted((a, b) => b.rssi.compareTo(a.rssi))
        .toList();

    final isM5Connected =
        preview != null ||
        _m5RelayActive ||
        runtime.isM5RelayActive ||
        (runtime.snapshot.pairedM5Device != null && latestM5 != null);
    final isPolarConnected =
        preview != null ||
        _polarRelayActive ||
        runtime.isPolarRelayActive ||
        (runtime.snapshot.pairedPolarDevice != null && latestPolar != null);
    final beltLabel = strings.pick('FallGuard Belt', 'เข็มขัด FallGuard');
    final wheelchairLabel = strings.pick('Wheelchair sensor', 'เซนเซอร์รถเข็น');

    return DefaultTabController(
      length: 4,
      initialIndex: widget.initialTab,
      child: Column(
        children: [
          TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            tabs: [
              Tab(text: wheelchairLabel),
              Tab(text: beltLabel),
              const Tab(text: 'Polar Verity Sense'),
              Tab(text: strings.bleBeacons),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _m5DevicePage(
                  sectionTitle: wheelchairLabel,
                  cardTitle: m5View?.displayName ?? wheelchairLabel,
                  imageAsset: 'assets/devices/m5stickcplus2_real_alt.webp',
                  m5View: m5View,
                  m5Discovered: m5Discovered != null,
                  isM5Connected: isM5Connected,
                  latestM5: latestM5,
                  visibleM5History: visibleM5History,
                  preview: preview,
                  strings: strings,
                ),
                _m5DevicePage(
                  sectionTitle: beltLabel,
                  cardTitle: beltLabel,
                  imageAsset: 'assets/devices/fallguard_belt.png',
                  m5View: m5View,
                  m5Discovered: m5Discovered != null,
                  isM5Connected: isM5Connected,
                  latestM5: latestM5,
                  visibleM5History: visibleM5History,
                  preview: preview,
                  strings: strings,
                ),
                ClinicalPage(
                  children: [
                    _StepIntro(
                      step: strings.pick('Step 2 of 2', 'ขั้นตอนที่ 2 จาก 2'),
                      text: isPolarConnected
                          ? strings.pick(
                              'Optical sensor connected and streaming heart rate.',
                              'เซนเซอร์ออปติคัลเชื่อมต่อแล้วและกำลังส่งอัตราการเต้นของหัวใจ',
                            )
                          : strings.pick(
                              'Wear the Polar sensor, then tap the card to connect.',
                              'สวมเซนเซอร์ Polar แล้วแตะการ์ดเพื่อเชื่อมต่อ',
                            ),
                    ),
                    _SensorDeviceCard(
                      title: polarView?.name ?? 'Polar Verity Sense',
                      imageAsset: 'assets/devices/polar_verity_sense_real.png',
                      connected: isPolarConnected,
                      connecting: _polarConnecting,
                      scanning: _scanning && _scanTarget == _ScanTarget.polar,
                      status: _deviceStatus(
                        device: polarView,
                        discovered: polarDiscovered != null,
                        connected: isPolarConnected,
                        connecting: _polarConnecting,
                        scanning: _scanning && _scanTarget == _ScanTarget.polar,
                        error: preview == null ? _polarError : null,
                        fallback: strings.devicesTapToScan,
                      ),
                      batteryPercent: latestPolar?.sensorBatteryPercent,
                      error: preview == null ? _polarError : null,
                      onTap: _handlePolarTap,
                      actions: [
                        _CardAction(
                          onPressed: _polarDevice == null || _polarConnecting
                              ? null
                              : _reconnectPolar,
                          icon: Icons.sync_rounded,
                          label: strings.reconnect,
                        ),
                        _CardAction(
                          onPressed: _polarDevice == null ? null : _renamePolar,
                          icon: Icons.edit_rounded,
                          label: strings.rename,
                        ),
                        _CardAction(
                          onPressed: _polarDevice == null ? null : _forgetPolar,
                          icon: Icons.link_off_rounded,
                          label: strings.forget,
                        ),
                      ],
                      metrics: [
                        _SensorMetric(
                          label: strings.heartRate,
                          value: latestPolar == null
                              ? '--'
                              : '${latestPolar.heartRateBpm}',
                          unit: 'bpm',
                          icon: Icons.favorite_rounded,
                          iconColor: WheelSenseColors.emergency,
                        ),
                        _SensorMetric(
                          label: strings.ppgSignal,
                          value: latestPolar?.ppgRatio == null
                              ? '--'
                              : latestPolar!.ppgRatio!.toStringAsFixed(2),
                          unit: 'ratio',
                          icon: Icons.monitor_heart_rounded,
                          iconColor: AppPalette.brand,
                        ),
                      ],
                      extra: isPolarConnected && visiblePolarHistory.length >= 2
                          ? PolarSignalChart(
                              samples: List.of(visiblePolarHistory),
                            )
                          : null,
                    ),
                  ],
                ),
                ClinicalPage(
                  children: [
                    _SensorSection(
                      title: strings.bleBeacons,
                      action: FilledButton(
                        onPressed: _scanning ? null : _scan,
                        child: Text(
                          _scanning ? strings.scanning : strings.scanAgain,
                        ),
                      ),
                      child: preview != null && beacons.isEmpty
                          ? NodeScannerCard(
                              nodes: ToolPreviewReadings.nodes(now, preview),
                            )
                          : _BeaconListCard(
                              beacons: beacons,
                              scanning: _scanning,
                              onBeaconTap: (beacon) => _show(
                                '${beacon.name}: RSSI ${beacon.rssi} dBm',
                              ),
                            ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _m5DevicePage({
    required String sectionTitle,
    required String cardTitle,
    required String imageAsset,
    required BleDeviceSnapshot? m5View,
    required bool m5Discovered,
    required bool isM5Connected,
    required M5TelemetrySample? latestM5,
    required List<M5TelemetrySample> visibleM5History,
    required PreviewMetrics? preview,
    required GatewayStrings strings,
  }) {
    return ClinicalPage(
      children: [
        _StepIntro(
          step: strings.pick('Step 1 of 2', 'ขั้นตอนที่ 1 จาก 2'),
          text: isM5Connected
              ? strings.pick(
                  'Connected and streaming motion data over Bluetooth.',
                  'เชื่อมต่อแล้วและกำลังส่งข้อมูลการเคลื่อนไหวผ่านบลูทูธ',
                )
              : strings.pick(
                  'Turn the sensor on, then tap the card to connect.',
                  'เปิดเซนเซอร์ แล้วแตะการ์ดเพื่อเชื่อมต่อ',
                ),
        ),
        _SensorDeviceCard(
          title: cardTitle,
          imageAsset: imageAsset,
          connected: isM5Connected,
          connecting: _m5Connecting,
          scanning: _scanning && _scanTarget == _ScanTarget.m5,
          status: _deviceStatus(
            device: m5View,
            discovered: m5Discovered,
            connected: isM5Connected,
            connecting: _m5Connecting,
            scanning: _scanning && _scanTarget == _ScanTarget.m5,
            error: preview == null ? _m5Error : null,
            fallback: strings.devicesTapToScan,
          ),
          batteryPercent: latestM5?.batteryPercent,
          error: preview == null ? _m5Error : null,
          onTap: _handleM5Tap,
          actions: [
            _CardAction(
              onPressed: _m5Device == null || _m5Connecting
                  ? null
                  : _reconnectM5,
              icon: Icons.sync_rounded,
              label: strings.reconnect,
            ),
            _CardAction(
              onPressed: _m5Device == null ? null : _renameM5,
              icon: Icons.edit_rounded,
              label: strings.rename,
            ),
            _CardAction(
              onPressed: _m5Device == null ? null : _forgetM5,
              icon: Icons.link_off_rounded,
              label: strings.forget,
            ),
          ],
          metrics: [
            if (latestM5?.stepCount != null)
              _SensorMetric(
                label: strings.steps,
                value: '${latestM5!.stepCount}',
                unit: '',
              ),
            _SensorMetric(
              label: strings.distance,
              value: _number(latestM5?.distanceM),
              unit: 'm',
            ),
            _SensorMetric(
              label: strings.velocity,
              value: _number(latestM5?.velocityMs),
              unit: 'm/s',
            ),
            _SensorMetric(
              label: strings.acceleration,
              value: latestM5 == null
                  ? '--'
                  : (latestM5.accelMs2 / 9.80665).toStringAsFixed(2),
              unit: 'g',
            ),
          ],
          extra: isM5Connected && visibleM5History.length >= 2
              ? Column(
                  children: [
                    AccelLineChart(samples: List.of(visibleM5History)),
                    const SizedBox(height: 12),
                    GyroLineChart(samples: List.of(visibleM5History)),
                    const SizedBox(height: 12),
                    MotionLineChart(samples: List.of(visibleM5History)),
                  ],
                )
              : null,
        ),
      ],
    );
  }

  String _deviceStatus({
    required BleDeviceSnapshot? device,
    required bool discovered,
    required bool connected,
    required bool connecting,
    required bool scanning,
    required String? error,
    required String fallback,
  }) {
    if (error != null) {
      return context.text.devicesNeedsAttention;
    }
    if (connected) {
      return context.text.connected;
    }
    if (connecting) {
      return context.text.devicesConnecting;
    }
    if (scanning) {
      return context.text.devicesScanningNearbyBle;
    }
    if (discovered) {
      return context.text.devicesTapToConnect;
    }
    if (device != null) {
      return context.text.devicesTapToScan;
    }
    return fallback;
  }

  BleDeviceSnapshot? _selectedOrCandidate(
    BleDeviceSnapshot? selected,
    bool Function(BleDeviceSnapshot device) predicate,
  ) {
    if (selected != null) {
      return _devices.firstWhereOrNull((device) => device.id == selected.id) ??
          selected;
    }
    return _devices.firstWhereOrNull(predicate);
  }

  BleDeviceSnapshot? _discoveredMatching(
    BleDeviceSnapshot? selected,
    bool Function(BleDeviceSnapshot device) predicate,
  ) {
    if (selected != null) {
      return _devices.firstWhereOrNull((device) => device.id == selected.id);
    }
    return _devices.firstWhereOrNull(predicate);
  }

  Future<void> _scan([_ScanTarget? target]) async {
    final runtime = GatewayServicesScope.of(context);
    final config = await runtime.loadConfig();
    setState(() {
      _devices.clear();
      _scanTarget = target;
      _scanning = true;
      if (target == _ScanTarget.m5) {
        _m5Error = null;
      } else if (target == _ScanTarget.polar) {
        _polarError = null;
      }
    });

    await _scanSubscription?.cancel();
    _scanSubscription = runtime
        .scanBleDevices(config)
        .listen(
          (device) {
            if (!mounted) {
              return;
            }
            setState(() {
              _devices.removeWhere((candidate) => candidate.id == device.id);
              _devices.add(device);
              _devices.sort((a, b) => b.rssi.compareTo(a.rssi));
            });
            _autoConnectIfTargetFound(device);
          },
          onError: (Object error) {
            if (!mounted) {
              return;
            }
            setState(() {
              _scanning = false;
              _scanTarget = null;
            });
            _show(context.text.bleScanFailed(error));
          },
          onDone: () {
            if (mounted) {
              final missed = _scanTarget;
              setState(() {
                _scanning = false;
                _scanTarget = null;
              });
              if (missed == _ScanTarget.m5 &&
                  !_m5Connecting &&
                  !_m5RelayActive) {
                _show(context.text.m5NotFound);
              } else if (missed == _ScanTarget.polar &&
                  !_polarConnecting &&
                  !_polarRelayActive) {
                _show(context.text.polarNotFound);
              }
            }
          },
        );
  }

  void _handleM5Tap() {
    if (_m5RelayActive) {
      _show(context.text.m5Connected);
      return;
    }
    if (_m5Connecting || _scanning) {
      _show(_m5Connecting ? context.text.connectingM5 : context.text.scanning);
      return;
    }
    final device = _discoveredMatching(
      _m5Device,
      (candidate) => candidate.looksLikeM5,
    );
    if (device == null) {
      unawaited(_scan(_ScanTarget.m5));
      return;
    }
    unawaited(_pairM5(device));
  }

  void _handlePolarTap() {
    if (_polarRelayActive) {
      _show(context.text.polarConnected);
      return;
    }
    if (_polarConnecting || _scanning) {
      _show(
        _polarConnecting ? context.text.connectingPolar : context.text.scanning,
      );
      return;
    }
    final device = _discoveredMatching(
      _polarDevice,
      (candidate) => candidate.looksLikePolar,
    );
    if (device == null) {
      unawaited(_scan(_ScanTarget.polar));
      return;
    }
    unawaited(_pairPolar(device));
  }

  void _autoConnectIfTargetFound(BleDeviceSnapshot device) {
    if (_scanTarget == _ScanTarget.m5 && device.looksLikeM5) {
      unawaited(_scanSubscription?.cancel());
      setState(() {
        _scanning = false;
        _scanTarget = null;
      });
      unawaited(_pairM5(device));
    } else if (_scanTarget == _ScanTarget.polar && device.looksLikePolar) {
      unawaited(_scanSubscription?.cancel());
      setState(() {
        _scanning = false;
        _scanTarget = null;
      });
      unawaited(_pairPolar(device));
    }
  }

  Future<void> _pairM5(BleDeviceSnapshot device) async {
    final strings = context.text;
    if (!device.looksLikeM5) {
      _show(strings.notM5(device.name));
      return;
    }
    final runtime = GatewayServicesScope.of(context);
    final config = await _loadLatestConfig();
    await _m5Subscription?.cancel();
    if (!mounted) {
      return;
    }
    setState(() {
      _m5Device = device.name == 'Unnamed BLE Device'
          ? device.copyWith(name: 'M5StickC Plus2')
          : device;
      _m5Samples.clear();
      _m5Error = null;
      _m5RelayActive = false;
      _m5Connecting = true;
    });

    try {
      final stream = await runtime.startM5TelemetryRelay(config, _m5Device!);
      _m5Subscription = stream.listen(
        (payload) {
          final sample = _parseM5(payload);
          if (!mounted || sample == null) {
            return;
          }
          final firstPacket = !_m5RelayActive;
          _m5Connecting = false;
          _m5RelayActive = true;
          _pushLimited(_m5Samples, sample);
          if (firstPacket) {
            setState(() {});
          } else {
            _pendingUiUpdate = true;
          }
          if (!_m5SetupCompletionMarked) {
            _m5SetupCompletionMarked = true;
            unawaited(runtime.markSetupCompleted());
          }
        },
        onError: (Object error) {
          if (mounted) {
            setState(() {
              _m5Connecting = false;
              _m5RelayActive = false;
              _m5Error = '$error';
            });
          }
        },
      );
      _show(strings.waitingForM5Telemetry);
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _m5Connecting = false;
          _m5Error = '$error';
        });
      }
      _show(strings.m5ConnectionFailed(error));
    }
  }

  Future<void> _pairPolar(BleDeviceSnapshot device) async {
    final strings = context.text;
    if (!device.looksLikePolar) {
      _show(strings.notPolar(device.name));
      return;
    }
    final runtime = GatewayServicesScope.of(context);
    final config = await _loadLatestConfig();
    await _polarSubscription?.cancel();
    if (!mounted) {
      return;
    }
    setState(() {
      _polarDevice = device.name == 'Unnamed BLE Device'
          ? device.copyWith(name: 'Polar Verity Sense')
          : device;
      _polarSamples.clear();
      _polarError = null;
      _polarRelayActive = false;
      _polarConnecting = true;
    });

    try {
      final stream = await runtime.startPolarTelemetryRelay(
        config,
        _polarDevice!,
      );
      if (mounted) {
        setState(() => _polarRelayActive = false);
      }
      _polarSubscription = stream.listen(
        (sample) {
          if (!mounted) {
            return;
          }
          final firstPacket = !_polarRelayActive;
          _polarConnecting = false;
          _polarRelayActive = true;
          _pushLimited(_polarSamples, sample);
          if (firstPacket) {
            setState(() {});
          } else {
            _pendingUiUpdate = true;
          }
        },
        onError: (Object error) {
          if (mounted) {
            setState(() {
              _polarConnecting = false;
              _polarRelayActive = false;
              _polarError = '$error';
            });
          }
        },
      );
      _show(strings.waitingForPolarData);
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _polarConnecting = false;
          _polarError = '$error';
        });
      }
      _show(strings.polarConnectionFailed(error));
    }
  }

  M5TelemetrySample? _parseM5(String payload) {
    try {
      return M5TelemetrySample.fromPayload(payload);
    } on Object {
      if (mounted) {
        setState(() {
          _m5Connecting = false;
          _m5Error = context.text.invalidM5Packet;
        });
      }
      return null;
    }
  }

  void _pushLimited<T>(List<T> samples, T sample) {
    samples.add(sample);
    if (samples.length > 80) {
      samples.removeRange(0, samples.length - 80);
    }
  }

  void _reconnectM5() {
    final device = _m5Device;
    if (device == null) {
      return;
    }
    unawaited(_pairM5(device));
  }

  void _reconnectPolar() {
    final device = _polarDevice;
    if (device == null) {
      return;
    }
    unawaited(_pairPolar(device));
  }

  Future<void> _renameM5() async {
    final device = _m5Device;
    if (device == null) {
      return;
    }
    final runtime = GatewayServicesScope.of(context);
    final config = await _loadLatestConfig();
    if (!mounted) {
      return;
    }
    final name = await _askDeviceName(device.displayName);
    if (!mounted || name == null || name.isEmpty) {
      return;
    }
    await runtime.renameM5Device(config: config, device: device, name: name);
    if (!mounted) {
      return;
    }
    setState(() => _m5Device = device.copyWith(name: name));
  }

  Future<void> _renamePolar() async {
    final device = _polarDevice;
    if (device == null) {
      return;
    }
    final runtime = GatewayServicesScope.of(context);
    final config = await _loadLatestConfig();
    if (!mounted) {
      return;
    }
    final name = await _askDeviceName(device.name);
    if (!mounted || name == null || name.isEmpty) {
      return;
    }
    await runtime.renamePolarDevice(config: config, device: device, name: name);
    if (!mounted) {
      return;
    }
    setState(() => _polarDevice = device.copyWith(name: name));
  }

  Future<void> _forgetM5() async {
    final runtime = GatewayServicesScope.of(context);
    await _m5Subscription?.cancel();
    await runtime.forgetM5Device();
    if (!mounted) {
      return;
    }
    setState(() {
      _m5Device = null;
      _m5RelayActive = false;
      _m5Connecting = false;
      _m5Samples.clear();
    });
  }

  Future<void> _forgetPolar() async {
    final runtime = GatewayServicesScope.of(context);
    await _polarSubscription?.cancel();
    await runtime.forgetPolarDevice();
    if (!mounted) {
      return;
    }
    setState(() {
      _polarDevice = null;
      _polarRelayActive = false;
      _polarConnecting = false;
      _polarSamples.clear();
    });
  }

  Future<String?> _askDeviceName(String current) async {
    final controller = TextEditingController(text: current);
    final result = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(context.text.renameDevice),
          content: TextField(
            controller: controller,
            autofocus: true,
            decoration: InputDecoration(labelText: context.text.deviceName),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(context.text.cancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, controller.text.trim()),
              child: Text(context.text.save),
            ),
          ],
        );
      },
    );
    controller.dispose();
    return result;
  }

  String _number(double? value) {
    return value == null ? '--' : value.toStringAsFixed(2);
  }

  void _show(String message) {
    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _SensorSection extends StatelessWidget {
  const _SensorSection({required this.title, required this.child, this.action});

  final String title;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(title, style: Theme.of(context).textTheme.titleLarge),
            ),
            ?action,
          ],
        ),
        const SizedBox(height: 10),
        child,
      ],
    );
  }
}

class _SensorDeviceCard extends StatelessWidget {
  const _SensorDeviceCard({
    required this.title,
    required this.imageAsset,
    required this.connected,
    required this.connecting,
    required this.scanning,
    required this.status,
    required this.batteryPercent,
    required this.metrics,
    required this.onTap,
    this.actions = const <Widget>[],
    this.error,
    this.extra,
  });

  final String title;
  final String imageAsset;
  final bool connected;
  final bool connecting;
  final bool scanning;
  final String status;
  final int? batteryPercent;
  final List<_SensorMetric> metrics;
  final VoidCallback? onTap;
  final List<Widget> actions;
  final String? error;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = error != null
        ? WheelSenseColors.emergency
        : connected
        ? theme.colorScheme.primary
        : connecting || scanning
        ? WheelSenseColors.clinicalBlue
        : WheelSenseColors.muted;

    return ProductSurface(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 64,
                height: 64,
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainer,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: imageAsset.endsWith('.svg')
                    ? SvgPicture.asset(imageAsset, fit: BoxFit.contain)
                    : Image.asset(imageAsset, fit: BoxFit.contain),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: BoxDecoration(
                            color: statusColor,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 7),
                        Expanded(
                          child: Text(
                            status,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: statusColor,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              _BatteryLabel(percent: batteryPercent),
            ],
          ),
          const SizedBox(height: 18),
          IntrinsicHeight(
            child: Row(
              children: [
                for (var index = 0; index < metrics.length; index++) ...[
                  Expanded(child: _SensorMetricView(metric: metrics[index])),
                  if (index < metrics.length - 1)
                    VerticalDivider(
                      width: 20,
                      color: theme.colorScheme.outlineVariant,
                    ),
                ],
              ],
            ),
          ),
          if (extra != null) ...[const SizedBox(height: 18), extra!],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Divider(),
            const SizedBox(height: 4),
            Row(
              children: [for (final action in actions) Expanded(child: action)],
            ),
          ],
        ],
      ),
    );
  }
}

/// Icon-over-label text action; three fit evenly across a card at any width.
class _CardAction extends StatelessWidget {
  const _CardAction({
    required this.onPressed,
    required this.icon,
    required this.label,
  });

  final VoidCallback? onPressed;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: Theme.of(context).colorScheme.onSurface,
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 20),
          const SizedBox(height: 4),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

/// Eyebrow step label and one line of guidance above a pairing card.
class _StepIntro extends StatelessWidget {
  const _StepIntro({required this.step, required this.text});

  final String step;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            step.toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.primary,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 4),
          Text(text, style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _BatteryLabel extends StatelessWidget {
  const _BatteryLabel({required this.percent});

  final int? percent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          percent == null
              ? Icons.battery_unknown_rounded
              : percent! < 25
              ? Icons.battery_alert_rounded
              : Icons.battery_5_bar_rounded,
          size: 16,
          color: percent != null && percent! < 25
              ? AppPalette.warning
              : theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 3),
        Text(
          percent == null ? '--' : '$percent%',
          style: theme.textTheme.labelMedium,
        ),
      ],
    );
  }
}

class _SensorMetric {
  const _SensorMetric({
    required this.label,
    required this.value,
    required this.unit,
    this.icon,
    this.iconColor,
  });

  final String label;
  final String value;
  final String unit;
  final IconData? icon;
  final Color? iconColor;
}

class _SensorMetricView extends StatelessWidget {
  const _SensorMetricView({required this.metric});

  final _SensorMetric metric;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          metric.label,
          textAlign: TextAlign.center,
          style: theme.textTheme.labelMedium,
        ),
        const SizedBox(height: 6),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (metric.icon != null) ...[
                Icon(metric.icon, color: metric.iconColor, size: 20),
                const SizedBox(width: 6),
              ],
              Text(
                metric.value,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(width: 3),
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Text(metric.unit, style: theme.textTheme.bodySmall),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _BeaconListCard extends StatelessWidget {
  const _BeaconListCard({
    required this.beacons,
    required this.scanning,
    required this.onBeaconTap,
  });

  final List<BleDeviceSnapshot> beacons;
  final bool scanning;
  final ValueChanged<BleDeviceSnapshot> onBeaconTap;

  @override
  Widget build(BuildContext context) {
    final strings = context.text;
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          children: [
            if (beacons.isEmpty)
              Padding(
                padding: const EdgeInsets.all(12),
                child: CompactRowCard(
                  icon: scanning
                      ? Icons.radar_rounded
                      : Icons.bluetooth_disabled_rounded,
                  title: scanning
                      ? strings.scanningNearbyBeacons
                      : strings.noBleBeacons,
                  subtitle: scanning
                      ? strings.detectedWsnNodes
                      : strings.tapScanNearWsn,
                  meta: scanning ? strings.live : strings.ready,
                  severity: ClinicalSeverity.info,
                ),
              ),
            for (final beacon in beacons) ...[
              _BeaconRow(beacon: beacon, onTap: () => onBeaconTap(beacon)),
              if (beacon != beacons.last) const Divider(indent: 64),
            ],
          ],
        ),
      ),
    );
  }
}

class _BeaconRow extends StatelessWidget {
  const _BeaconRow({required this.beacon, required this.onTap});

  final BleDeviceSnapshot beacon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            ProductIconBadge('scan', tint: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Text(beacon.name, style: theme.textTheme.titleSmall),
            ),
            Text('${beacon.rssi} dBm', style: theme.textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
