import 'package:flutter/material.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import 'tool_preview_readings.dart';
import '../theme/app_palette.dart';
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
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

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
              backgroundColor: isDark
                  ? AppPalette.slate950
                  : AppPalette.slate50,
              appBar: AppBar(
                toolbarHeight: MediaQuery.textScalerOf(context).scale(28) + 28,
                title: const Row(
                  children: [
                    Icon(
                      Icons.monitor_heart_rounded,
                      size: 22,
                      color: AppPalette.brand,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text('Live Telemetry Monitor', maxLines: 2),
                    ),
                  ],
                ),
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
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: _LiveStatusStrip(
                        state: state,
                        m5Sample: m5Sample,
                        polarSample: polarSample,
                        previewing: preview != null,
                        isDark: isDark,
                      ),
                    ),
                    TabBar(
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
                            padding: const EdgeInsets.all(16),
                            children: [
                              KinematicsCard(sample: m5Sample),
                              const SizedBox(height: 14),
                              ImuWaveformChart(history: m5History),
                            ],
                          ),
                          ListView(
                            padding: const EdgeInsets.all(16),
                            children: [
                              PolarSensorsCard(
                                sample: polarSample,
                                history: polarHistory,
                              ),
                            ],
                          ),
                          ListView(
                            padding: const EdgeInsets.all(16),
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
    required this.isDark,
  });

  final GatewayRuntimeSnapshot state;
  final M5TelemetrySample? m5Sample;
  final PolarTelemetrySample? polarSample;
  final bool previewing;
  final bool isDark;

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

    return Row(
      children: [
        Expanded(
          child: _StatusBadge(
            label: mqttConnected || !previewing ? 'MQTT broker' : 'Data feed',
            detail: mqttConnected
                ? state.config.mqttHost
                : previewing
                ? 'Available'
                : 'Offline',
            isConnected: dataAvailable,
            icon: Icons.cloud_done_rounded,
            isDark: isDark,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusBadge(
            label: 'IMU Node',
            detail: m5Connected
                ? (state.pairedM5Device?.name ?? 'Wheelchair sensor')
                : 'No Board',
            isConnected: m5Connected,
            icon: Icons.sensors_rounded,
            isDark: isDark,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusBadge(
            label: 'Polar BLE',
            detail: polarConnected
                ? (state.pairedPolarDevice?.name ?? 'Polar Verity Sense')
                : 'No Sensor',
            isConnected: polarConnected,
            icon: Icons.favorite_rounded,
            isDark: isDark,
          ),
        ),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({
    required this.label,
    required this.detail,
    required this.isConnected,
    required this.icon,
    required this.isDark,
  });

  final String label;
  final String detail;
  final bool isConnected;
  final IconData icon;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final color = isConnected ? AppPalette.successBright : AppPalette.slate400;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? AppPalette.slate900 : AppPalette.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? AppPalette.slate800 : AppPalette.slate200,
        ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppPalette.slate400 : AppPalette.slate600,
                  ),
                ),
                Text(
                  detail,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isConnected
                        ? (isDark ? AppPalette.white : AppPalette.slate900)
                        : AppPalette.slate400,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
