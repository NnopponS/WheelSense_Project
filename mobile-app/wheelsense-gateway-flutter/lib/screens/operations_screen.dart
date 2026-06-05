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
    final strings = context.text;
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
            label: Text(strings.operationsRunChecks),
          ),
          children: [
            ResponsiveGrid(
              children: [
                MetricTile(
                  metric: MetricSnapshot(
                    label: strings.operationsAlerts,
                    value: '${state.alerts.length}',
                    detail: state.config.alertsEnabled
                        ? strings.alertsSubscribed
                        : strings.alertsWaitingConfig,
                    icon: Icons.notifications_active_outlined,
                    severity: state.alerts.isEmpty
                        ? ClinicalSeverity.info
                        : _severity(state.alerts.first.severity),
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: strings.operationsRoom,
                    value:
                        state.latestRoomPrediction?.roomName ??
                        strings.roomUnknown,
                    detail: state.latestRoomPrediction == null
                        ? strings.noServerPredictionYet
                        : strings.confidencePercent(
                            (state.latestRoomPrediction!.confidence * 100)
                                .round(),
                          ),
                    icon: Icons.location_searching,
                    severity: state.latestRoomPrediction == null
                        ? ClinicalSeverity.info
                        : ClinicalSeverity.normal,
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: strings.operationsSyncFailures,
                    value: '${state.failedPublishCount}',
                    detail:
                        state.lastPublishFailure?.reason.name ??
                        strings.noFailureRecorded,
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
              title: strings.operationsLiveAlertsTitle,
              subtitle: strings.operationsLiveAlertsSubtitle,
              child: state.alerts.isEmpty
                  ? CompactRowCard(
                      icon: Icons.notifications_none,
                      title: strings.noLiveAlerts,
                      subtitle: strings.noLiveAlertsDetail,
                      meta: strings.empty,
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
                            actionLabel: strings.portal,
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
              title: strings.roomPredictionTitle,
              subtitle: strings.roomPredictionSubtitle,
              child: state.latestRoomPrediction == null
                  ? CompactRowCard(
                      icon: Icons.radar,
                      title: strings.waitingForRoomData,
                      subtitle: strings.waitingForRoomDataDetail,
                      meta: strings.waiting,
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
              title: strings.rssiRoomScan,
              subtitle: strings.rssiRoomScanSubtitle,
              action: FilledButton.icon(
                onPressed: _scanningRssi ? null : () => _startRssiScan(runtime),
                icon: const Icon(Icons.radar),
                label: Text(
                  _scanningRssi ? strings.scanning : strings.scanBeacons,
                ),
              ),
              child: _scanPoints.isEmpty
                  ? CompactRowCard(
                      icon: _scanningRssi
                          ? Icons.radar
                          : Icons.bluetooth_disabled,
                      title: _scanningRssi
                          ? strings.scanningForRssiBeacons
                          : strings.noLocalScanData,
                      subtitle: strings.nearbyWsnNodesAppear,
                      meta: _scanningRssi ? strings.live : strings.ready,
                      severity: ClinicalSeverity.info,
                    )
                  : Column(
                      children: [
                        for (final point in _scanPoints) ...[
                          CompactRowCard(
                            icon: Icons.location_searching,
                            title: point.room,
                            subtitle: strings.beaconSummary(
                              point.beaconCount,
                              point.bestRssi,
                            ),
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
              title: strings.diagnostics,
              subtitle: state.status.message,
              child: Column(
                children: [
                  _checkRow(
                    strings: strings,
                    ready: state.status.bleReady,
                    title: strings.bleAdapter,
                    detail: strings.bleAdapterDetail,
                  ),
                  const SizedBox(height: 10),
                  _checkRow(
                    strings: strings,
                    ready: state.status.mqttReady,
                    title: strings.settingsMqttBroker,
                    detail: strings.mqttBrokerDetail,
                  ),
                  const SizedBox(height: 10),
                  _checkRow(
                    strings: strings,
                    ready: state.status.backgroundReady,
                    title: strings.androidForegroundService,
                    detail: strings.androidForegroundServiceDetail,
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
    required GatewayStrings strings,
    required bool ready,
    required String title,
    required String detail,
  }) {
    return CompactRowCard(
      icon: ready ? Icons.check_circle_outline : Icons.error_outline,
      title: title,
      subtitle: detail,
      meta: ready ? strings.ready : strings.fix,
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

  String _timeLabel(DateTime value) {
    final strings = context.text;
    final delta = DateTime.now().difference(value);
    if (delta.inMinutes < 1) {
      return strings.now;
    }
    if (delta.inHours < 1) {
      return strings.minutesAgo(delta.inMinutes);
    }
    return strings.hoursAgo(delta.inHours);
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
