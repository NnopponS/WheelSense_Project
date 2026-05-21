import 'dart:async';

import 'package:collection/collection.dart';
import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../theme/app_theme.dart';
import '../widgets/clinical_components.dart';

enum _ScanTarget { m5, polar }

class PairDevicesScreen extends StatefulWidget {
  const PairDevicesScreen({super.key});

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

  GatewayConfig _config = GatewayConfig.defaults();
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
  void dispose() {
    _scanSubscription?.cancel();
    _m5Subscription?.cancel();
    _polarSubscription?.cancel();
    super.dispose();
  }

  Future<void> _loadInitialState() async {
    final runtime = GatewayServicesScope.of(context);
    final config = await runtime.loadConfig();
    final pairedM5 = await runtime.loadPairedM5Device();
    final pairedPolar = await runtime.loadPairedPolarDevice();
    if (!mounted) {
      return;
    }
    setState(() {
      _config = config;
      _m5Device = pairedM5;
      _polarDevice = pairedPolar;
    });
  }

  @override
  Widget build(BuildContext context) {
    final m5View = _selectedOrCandidate(
      _m5Device,
      (device) => device.looksLikeM5,
    );
    final polarView = _selectedOrCandidate(
      _polarDevice,
      (device) => device.looksLikePolar,
    );
    final latestM5 = _m5Samples.lastOrNull;
    final latestPolar = _polarSamples.lastOrNull;
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

    return ClinicalPage(
      children: [
        _SensorSection(
          title: 'M5StickC Plus2',
          child: _SensorDeviceCard(
            title: m5View?.name ?? 'M5StickC Plus2',
            imageAsset: 'assets/devices/m5stickcplus2_real_alt.webp',
            connected: _m5RelayActive,
            connecting: _m5Connecting,
            scanning: _scanning && _scanTarget == _ScanTarget.m5,
            status: _deviceStatus(
              device: m5View,
              discovered: m5Discovered != null,
              connected: _m5RelayActive,
              connecting: _m5Connecting,
              scanning: _scanning && _scanTarget == _ScanTarget.m5,
              error: _m5Error,
              fallback: 'Tap to scan',
            ),
            batteryPercent: latestM5?.batteryPercent,
            error: _m5Error,
            onTap: _handleM5Tap,
            metrics: [
              _SensorMetric(
                label: 'Distance',
                value: _number(latestM5?.distanceM),
                unit: 'm',
              ),
              _SensorMetric(
                label: 'Velocity',
                value: _number(latestM5?.velocityMs),
                unit: 'm/s',
              ),
              _SensorMetric(
                label: 'Accel',
                value: latestM5 == null
                    ? '--'
                    : (latestM5.accelMs2 / 9.80665).toStringAsFixed(2),
                unit: 'g',
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _SensorSection(
          title: 'Polar Verity Sense',
          child: _SensorDeviceCard(
            title: polarView?.name ?? 'Polar Verity Sense',
            imageAsset: 'assets/devices/polar_verity_sense_real.png',
            connected: _polarRelayActive,
            connecting: _polarConnecting,
            scanning: _scanning && _scanTarget == _ScanTarget.polar,
            status: _deviceStatus(
              device: polarView,
              discovered: polarDiscovered != null,
              connected: _polarRelayActive,
              connecting: _polarConnecting,
              scanning: _scanning && _scanTarget == _ScanTarget.polar,
              error: _polarError,
              fallback: 'Tap to scan',
            ),
            batteryPercent: latestPolar?.sensorBatteryPercent,
            error: _polarError,
            onTap: _handlePolarTap,
            metrics: [
              _SensorMetric(
                label: 'Heart Rate',
                value: latestPolar == null
                    ? '--'
                    : '${latestPolar.heartRateBpm}',
                unit: 'bpm',
                icon: Icons.favorite,
                iconColor: WheelSenseColors.emergency,
              ),
              _SensorMetric(
                label: 'PPG Signal',
                value: latestPolar?.ppgRatio == null
                    ? '--'
                    : latestPolar!.ppgRatio!.toStringAsFixed(2),
                unit: 'ratio',
                icon: Icons.monitor_heart_outlined,
                iconColor: WheelSenseColors.success,
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _SensorSection(
          title: 'BLE Beacons',
          action: FilledButton(
            onPressed: _scanning ? null : _scan,
            child: Text(_scanning ? 'Scanning' : 'Scan Again'),
          ),
          child: _BeaconListCard(
            beacons: beacons,
            scanning: _scanning,
            onBeaconTap: (beacon) =>
                _show('${beacon.name}: RSSI ${beacon.rssi} dBm'),
          ),
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
      return 'Needs attention';
    }
    if (connected) {
      return 'Connected';
    }
    if (connecting) {
      return 'Connecting...';
    }
    if (scanning) {
      return 'Scanning nearby BLE';
    }
    if (discovered) {
      return 'Tap to connect';
    }
    if (device != null) {
      return 'Tap to scan';
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
      _config = config;
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
            _show('BLE scan failed: $error');
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
                _show('M5StickC Plus2 not found. Turn it on and scan again.');
              } else if (missed == _ScanTarget.polar &&
                  !_polarConnecting &&
                  !_polarRelayActive) {
                _show(
                  'Polar Verity Sense not found. Turn it on and scan again.',
                );
              }
            }
          },
        );
  }

  void _handleM5Tap() {
    if (_m5RelayActive) {
      _show('M5StickC Plus2 is connected');
      return;
    }
    if (_m5Connecting || _scanning) {
      _show(_m5Connecting ? 'Connecting to M5StickC Plus2' : 'Scanning BLE');
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
      _show('Polar Verity Sense is connected');
      return;
    }
    if (_polarConnecting || _scanning) {
      _show(
        _polarConnecting ? 'Connecting to Polar Verity Sense' : 'Scanning BLE',
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
    if (!device.looksLikeM5) {
      _show('${device.name} is not advertising the WheelSense M5 service');
      return;
    }
    final runtime = GatewayServicesScope.of(context);
    await _m5Subscription?.cancel();
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
      final stream = await runtime.startM5TelemetryRelay(_config, _m5Device!);
      _m5Subscription = stream.listen(
        (payload) {
          final sample = _parseM5(payload);
          if (!mounted || sample == null) {
            return;
          }
          setState(() {
            _m5Connecting = false;
            _m5RelayActive = true;
            _pushLimited(_m5Samples, sample);
          });
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
      _show('Waiting for M5StickC Plus2 telemetry');
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _m5Connecting = false;
          _m5Error = '$error';
        });
      }
      _show('M5 connection failed: $error');
    }
  }

  Future<void> _pairPolar(BleDeviceSnapshot device) async {
    if (!device.looksLikePolar) {
      _show('${device.name} is not a Polar Verity Sense / HR sensor');
      return;
    }
    final runtime = GatewayServicesScope.of(context);
    await _polarSubscription?.cancel();
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
        _config,
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
          setState(() {
            _polarConnecting = false;
            _polarRelayActive = true;
            _pushLimited(_polarSamples, sample);
          });
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
      _show('Waiting for Polar Verity Sense data');
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _polarConnecting = false;
          _polarError = '$error';
        });
      }
      _show('Polar connection failed: $error');
    }
  }

  M5TelemetrySample? _parseM5(String payload) {
    try {
      return M5TelemetrySample.fromPayload(payload);
    } on Object {
      setState(() => _m5Error = 'M5 packet is not valid JSON telemetry');
      return null;
    }
  }

  void _pushLimited<T>(List<T> samples, T sample) {
    samples.add(sample);
    if (samples.length > 80) {
      samples.removeRange(0, samples.length - 80);
    }
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
    this.error,
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
  final String? error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = error != null
        ? WheelSenseColors.emergency
        : connected
        ? WheelSenseColors.success
        : connecting || scanning
        ? WheelSenseColors.clinicalBlue
        : WheelSenseColors.muted;

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
          child: Column(
            children: [
              Row(
                children: [
                  SizedBox(
                    width: 126,
                    height: 104,
                    child: Image.asset(imageAsset, fit: BoxFit.contain),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: theme.textTheme.titleLarge),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Icon(Icons.circle, size: 14, color: statusColor),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                status,
                                style: theme.textTheme.titleMedium?.copyWith(
                                  color: statusColor,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  _BatteryLabel(percent: batteryPercent),
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right, size: 32),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(height: 1),
              const SizedBox(height: 16),
              IntrinsicHeight(
                child: Row(
                  children: [
                    for (var index = 0; index < metrics.length; index++) ...[
                      Expanded(
                        child: _SensorMetricView(metric: metrics[index]),
                      ),
                      if (index < metrics.length - 1)
                        const VerticalDivider(
                          width: 20,
                          thickness: 1,
                          color: Color(0xFFB8C2D0),
                        ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BatteryLabel extends StatelessWidget {
  const _BatteryLabel({required this.percent});

  final int? percent;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          percent == null
              ? Icons.battery_unknown_outlined
              : percent! < 25
              ? Icons.battery_alert_outlined
              : Icons.battery_5_bar,
          size: 24,
          color: percent == null
              ? WheelSenseColors.muted
              : percent! < 25
              ? WheelSenseColors.warning
              : WheelSenseColors.ink,
        ),
        const SizedBox(width: 6),
        Text(
          percent == null ? '--' : '$percent%',
          style: Theme.of(context).textTheme.titleMedium,
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
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: 10),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (metric.icon != null) ...[
                Icon(metric.icon, color: metric.iconColor, size: 34),
                const SizedBox(width: 8),
              ],
              Text(
                metric.value,
                style: theme.textTheme.displaySmall?.copyWith(
                  color: WheelSenseColors.ink,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(width: 5),
              Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Text(metric.unit, style: theme.textTheme.titleMedium),
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          children: [
            if (beacons.isEmpty)
              Padding(
                padding: const EdgeInsets.all(12),
                child: CompactRowCard(
                  icon: scanning ? Icons.radar : Icons.bluetooth_disabled,
                  title: scanning
                      ? 'Scanning nearby beacons'
                      : 'No BLE beacons',
                  subtitle: scanning
                      ? 'Detected WSN nodes will appear here.'
                      : 'Tap Scan Again near WSN_ nodes.',
                  meta: scanning ? 'Live' : 'Ready',
                  severity: ClinicalSeverity.info,
                ),
              ),
            for (final beacon in beacons) ...[
              _BeaconRow(beacon: beacon, onTap: () => onBeaconTap(beacon)),
              if (beacon != beacons.last)
                const Divider(height: 1, indent: 76, endIndent: 16),
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: WheelSenseColors.clinicalBlue,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.sensors, color: Colors.white),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Text(beacon.name, style: theme.textTheme.titleMedium),
            ),
            Text('RSSI', style: theme.textTheme.labelLarge),
            const SizedBox(width: 14),
            Text('${beacon.rssi}', style: theme.textTheme.titleMedium),
            const SizedBox(width: 6),
            const Icon(Icons.chevron_right, size: 28),
          ],
        ),
      ),
    );
  }
}
