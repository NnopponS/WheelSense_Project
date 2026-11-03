import 'package:flutter/material.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import 'tool_preview_readings.dart';
import '../widgets/imu_waveform_chart.dart';
import '../widgets/kinematics_card.dart';
import '../widgets/node_scanner_card.dart';
import '../widgets/polar_sensors_card.dart';

/// Elevated Live Monitor Dashboard displaying real-time Kinematics HUD,
/// multi-axis IMU waveforms, Polar Verity Sense streams, and Node_Tsimcam radar.
class LiveMonitorScreen extends StatelessWidget {
  const LiveMonitorScreen({super.key, this.onOpenDevices, this.previewAt});

  final VoidCallback? onOpenDevices;
  final DateTime? previewAt;

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);

    return ToolPreviewTicker(
      previewAt: previewAt,
      builder: (context, now) {
        final time = now ?? DateTime.now();
        final preview = now == null ? null : PreviewMetrics.at(time);
        return StreamBuilder<GatewayRuntimeSnapshot>(
          stream: runtime.snapshots,
          initialData: runtime.snapshot,
          builder: (context, snapshot) {
            final state = snapshot.data ?? runtime.snapshot;
            final actualM5 = state.latestM5Sample;
            final actualPolar = state.latestPolarSample;
            final m5Fresh = ToolPreviewReadings.isFresh(
              actualM5?.timestamp,
              time,
            );
            final polarFresh = ToolPreviewReadings.isFresh(
              actualPolar?.timestamp,
              time,
            );
            final m5Sample = ToolPreviewReadings.resolveWheelchair(
              actual: actualM5,
              preview: preview,
              now: time,
            );
            final polarSample = ToolPreviewReadings.resolvePolar(
              actual: actualPolar,
              preview: preview,
              now: time,
            );
            final m5History = m5Fresh && state.m5History.isNotEmpty
                ? state.m5History
                : preview != null
                ? ToolPreviewReadings.wheelchairHistory(time, preview)
                : state.m5History;
            final polarHistory = polarFresh && state.polarHistory.isNotEmpty
                ? state.polarHistory
                : preview != null
                ? ToolPreviewReadings.polarHistory(time, preview)
                : state.polarHistory;
            final freshNodes = state.detectedNodes
                .where(
                  (node) => ToolPreviewReadings.isFresh(node.lastSeen, time),
                )
                .toList();
            final nodes = freshNodes.isNotEmpty || preview == null
                ? state.detectedNodes
                : ToolPreviewReadings.nodes(time, preview);

            return Scaffold(
              appBar: AppBar(
                title: Text(context.text.pick('Live monitor', 'ติดตามสด')),
                actions: [
                  if (onOpenDevices != null)
                    IconButton(
                      icon: const Icon(Icons.bluetooth_searching_rounded),
                      tooltip: 'Pair / Scan Sensors',
                      onPressed: onOpenDevices,
                    ),
                ],
              ),
              body: DefaultTabController(
                length: 3,
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                      child: _LiveStatusStrip(
                        state: state,
                        m5Sample: m5Sample,
                        polarSample: polarSample,
                        previewing: preview != null,
                      ),
                    ),
                    TabBar(
                      overlayColor: WidgetStateProperty.all(Colors.transparent),
                      tabs: [
                        Tab(
                          text: context.text.pick('Movement', 'การเคลื่อนไหว'),
                        ),
                        Tab(text: context.text.pick('Heart', 'หัวใจ')),
                        Tab(text: context.text.pick('Location', 'ตำแหน่ง')),
                      ],
                    ),
                    Expanded(
                      child: TabBarView(
                        children: [
                          ListView(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                            children: [
                              KinematicsCard(sample: m5Sample),
                              const SizedBox(height: 12),
                              ImuWaveformChart(history: m5History),
                            ],
                          ),
                          ListView(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                            children: [
                              PolarSensorsCard(
                                sample: polarSample,
                                history: polarHistory,
                              ),
                            ],
                          ),
                          ListView(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                            children: [NodeScannerCard(nodes: nodes)],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _LiveStatusStrip extends StatelessWidget {
  const _LiveStatusStrip({
    required this.state,
    required this.m5Sample,
    required this.polarSample,
    required this.previewing,
  });

  final GatewayRuntimeSnapshot state;
  final M5TelemetrySample? m5Sample;
  final PolarTelemetrySample? polarSample;
  final bool previewing;

  @override
  Widget build(BuildContext context) {
    final mqttConnected = state.status.mqttReady;
    final dataAvailable = mqttConnected || previewing;
    final m5Age = m5Sample == null
        ? null
        : DateTime.now().difference(m5Sample!.timestamp);
    final polarAge = polarSample == null
        ? null
        : DateTime.now().difference(polarSample!.timestamp);
    final m5Connected =
        m5Age != null &&
        m5Age >= Duration.zero &&
        m5Age < const Duration(minutes: 2);
    final polarConnected =
        polarAge != null &&
        polarAge >= Duration.zero &&
        polarAge < const Duration(minutes: 2);

    final t = context.text;
    return Wrap(
      spacing: 18,
      runSpacing: 6,
      children: [
        _StatusDot(
          label: mqttConnected
              ? state.config.mqttHost
              : t.pick('Data feed', 'ฟีดข้อมูล'),
          on: dataAvailable,
        ),
        _StatusDot(
          label: state.pairedWheelchairM5Device != null &&
                  state.pairedBeltM5Device == null
              ? t.pick('Wheelchair sensor', 'เซนเซอร์รถเข็น')
              : state.pairedWheelchairM5Device != null
              ? t.pick('Belt + Wheelchair', 'เข็มขัด + วีลแชร์')
              : 'FallGuard Belt',
          on: m5Connected,
        ),
        _StatusDot(label: 'Polar', on: polarConnected),
      ],
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.label, required this.on});

  final String label;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final t = context.text;
    return Semantics(
      label:
          '$label, ${on ? t.pick('connected', 'เชื่อมต่อแล้ว') : t.pick('not connected', 'ยังไม่เชื่อมต่อ')}',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            on ? Icons.check_circle_rounded : Icons.remove_circle_outline_rounded,
            size: 15,
            color: on ? colors.primary : colors.onSurfaceVariant,
          ),
          const SizedBox(width: 5),
          Text(label, style: Theme.of(context).textTheme.labelMedium),
        ],
      ),
    );
  }
}
