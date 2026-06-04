import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';

class OperationsScreen extends StatefulWidget {
  const OperationsScreen({super.key, required this.onOpenPortal});

  final VoidCallback onOpenPortal;

  @override
  State<OperationsScreen> createState() => _OperationsScreenState();
}

class _OperationsScreenState extends State<OperationsScreen> {
  final List<RoomScanPoint> _scanPoints = <RoomScanPoint>[];
  StreamSubscription<BleDeviceSnapshot>? _scanSubscription;
  bool _scanningRssi = false;

  @override
  void dispose() {
    _scanSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final state = snapshot.data ?? runtime.snapshot;
        return ClinicalPage(
          trailing: FilledButton.icon(
            onPressed: () async {
              final config = await runtime.loadConfig();
              await runtime.bootstrap(config: config);
            },
            icon: const Icon(Icons.fact_check_outlined),
            label: const Text('Run checks'),
          ),
          children: [
            ResponsiveGrid(
              children: [
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Alerts',
                    value: '${state.alerts.length}',
                    detail: state.config.alertsEnabled
                        ? 'Subscribed to live MQTT alerts'
                        : 'Waiting for alert-enabled config',
                    icon: Icons.notifications_active_outlined,
                    severity: state.alerts.isEmpty
                        ? ClinicalSeverity.info
                        : _severity(state.alerts.first.severity),
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Room',
                    value: state.latestRoomPrediction?.roomName ?? 'Unknown',
                    detail: state.latestRoomPrediction == null
                        ? 'No server prediction yet'
                        : '${(state.latestRoomPrediction!.confidence * 100).round()}% confidence',
                    icon: Icons.location_searching,
                    severity: state.latestRoomPrediction == null
                        ? ClinicalSeverity.info
                        : ClinicalSeverity.normal,
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Sync failures',
                    value: '${state.failedPublishCount}',
                    detail:
                        state.lastPublishFailure?.reason.name ??
                        'No failure recorded',
                    icon: Icons.sync_problem,
                    severity: state.failedPublishCount == 0
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.warning,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: 'Live alerts',
              subtitle: 'Alerts delivered for the linked patient or gateway.',
              child: state.alerts.isEmpty
                  ? const CompactRowCard(
                      icon: Icons.notifications_none,
                      title: 'No live alerts',
                      subtitle:
                          'Alerts appear here after the backend publishes to the linked patient or gateway topic.',
                      meta: 'Empty',
                      severity: ClinicalSeverity.info,
                    )
                  : Column(
                      children: [
                        for (final alert in state.alerts) ...[
                          CompactRowCard(
                            icon:
                                alert.severity == GatewayAlertSeverity.critical
                                ? Icons.emergency
                                : Icons.notifications_active_outlined,
                            title: alert.title,
                            subtitle: alert.description,
                            meta: _timeLabel(alert.timestamp),
                            severity: _severity(alert.severity),
                            actionLabel: 'Portal',
                            onAction: widget.onOpenPortal,
                          ),
                          if (alert != state.alerts.last)
                            const SizedBox(height: 10),
                        ],
                      ],
                    ),
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: 'Room prediction',
              subtitle: 'Server-derived room confidence from RSSI telemetry.',
              child: state.latestRoomPrediction == null
                  ? const CompactRowCard(
                      icon: Icons.radar,
                      title: 'Waiting for room data',
                      subtitle:
                          'Pair the gateway and publish RSSI telemetry to receive room predictions.',
                      meta: 'Waiting',
                      severity: ClinicalSeverity.info,
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        CompactRowCard(
                          icon: Icons.meeting_room_outlined,
                          title: state.latestRoomPrediction!.roomName,
                          subtitle:
                              'Model ${state.latestRoomPrediction!.modelType}${state.latestRoomPrediction!.strategy == null ? '' : ' / ${state.latestRoomPrediction!.strategy}'}',
                          meta:
                              '${(state.latestRoomPrediction!.confidence * 100).round()}%',
                          severity: ClinicalSeverity.normal,
                        ),
                        const SizedBox(height: 8),
                        LinearProgressIndicator(
                          value: state.latestRoomPrediction!.confidence
                              .clamp(0, 1)
                              .toDouble(),
                        ),
                      ],
                    ),
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: 'RSSI room scan',
              subtitle:
                  'Local BLE scan tool for WSN beacons and room evidence.',
              action: FilledButton.icon(
                onPressed: _scanningRssi ? null : () => _startRssiScan(runtime),
                icon: const Icon(Icons.radar),
                label: Text(_scanningRssi ? 'Scanning' : 'Scan beacons'),
              ),
              child: _scanPoints.isEmpty
                  ? CompactRowCard(
                      icon: _scanningRssi
                          ? Icons.radar
                          : Icons.bluetooth_disabled,
                      title: _scanningRssi
                          ? 'Scanning for RSSI beacons'
                          : 'No local scan data',
                      subtitle:
                          'Nearby WSN_ nodes appear here with signal confidence.',
                      meta: _scanningRssi ? 'Live' : 'Ready',
                      severity: ClinicalSeverity.info,
                    )
                  : Column(
                      children: [
                        for (final point in _scanPoints) ...[
                          CompactRowCard(
                            icon: Icons.location_searching,
                            title: point.room,
                            subtitle:
                                '${point.beaconCount} beacons, best ${point.bestRssi} dBm',
                            meta: '${(point.confidence * 100).round()}%',
                            severity: point.confidence >= 0.85
                                ? ClinicalSeverity.normal
                                : ClinicalSeverity.info,
                          ),
                          if (point != _scanPoints.last)
                            const SizedBox(height: 10),
                        ],
                      ],
                    ),
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: 'Diagnostics',
              subtitle: state.status.message,
              child: Column(
                children: [
                  _checkRow(
                    ready: state.status.bleReady,
                    title: 'BLE adapter',
                    detail: 'Bluetooth scan and connect permissions.',
                  ),
                  const SizedBox(height: 10),
                  _checkRow(
                    ready: state.status.mqttReady,
                    title: 'MQTT broker',
                    detail:
                        'Registration, telemetry, config, alert, and room topics.',
                  ),
                  const SizedBox(height: 10),
                  _checkRow(
                    ready: state.status.backgroundReady,
                    title: 'Android foreground service',
                    detail: 'Keeps the gateway visible and recoverable.',
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  static CompactRowCard _checkRow({
    required bool ready,
    required String title,
    required String detail,
  }) {
    return CompactRowCard(
      icon: ready ? Icons.check_circle_outline : Icons.error_outline,
      title: title,
      subtitle: detail,
      meta: ready ? 'Ready' : 'Fix',
      severity: ready ? ClinicalSeverity.normal : ClinicalSeverity.warning,
    );
  }

  static ClinicalSeverity _severity(GatewayAlertSeverity severity) {
    return switch (severity) {
      GatewayAlertSeverity.critical => ClinicalSeverity.critical,
      GatewayAlertSeverity.warning => ClinicalSeverity.warning,
      GatewayAlertSeverity.info => ClinicalSeverity.info,
      GatewayAlertSeverity.normal => ClinicalSeverity.normal,
    };
  }

  static String _timeLabel(DateTime value) {
    final delta = DateTime.now().difference(value);
    if (delta.inMinutes < 1) {
      return 'Now';
    }
    if (delta.inHours < 1) {
      return '${delta.inMinutes} min';
    }
    return '${delta.inHours} h';
  }

  Future<void> _startRssiScan(GatewayRuntimeService runtime) async {
    final config = await runtime.loadConfig();
    setState(() {
      _scanPoints.clear();
      _scanningRssi = true;
    });
    await _scanSubscription?.cancel();
    _scanSubscription = runtime
        .scanBleDevices(config)
        .listen(
          (device) {
            if (!mounted || !device.looksLikeNodeTsimcam) {
              return;
            }
            final confidence = max(0.35, min(0.98, (100 + device.rssi) / 70));
            setState(() {
              _scanPoints.removeWhere((point) => point.room == device.name);
              _scanPoints.add(
                RoomScanPoint(
                  room: device.name,
                  beaconCount: max(1, device.serviceUuids.length),
                  bestRssi: device.rssi,
                  confidence: confidence.toDouble(),
                ),
              );
              _scanPoints.sort((a, b) => b.confidence.compareTo(a.confidence));
            });
          },
          onDone: () {
            if (mounted) {
              setState(() => _scanningRssi = false);
            }
          },
          onError: (_) {
            if (mounted) {
              setState(() => _scanningRssi = false);
            }
          },
        );
  }
}
