import 'package:flutter/material.dart';

import '../models/gateway_runtime_snapshot.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/imu_waveform_chart.dart';
import '../widgets/kinematics_card.dart';
import '../widgets/node_scanner_card.dart';
import '../widgets/polar_sensors_card.dart';

/// Elevated Live Monitor Dashboard displaying real-time Kinematics HUD,
/// multi-axis IMU waveforms, Polar Verity Sense streams, and Node_Tsimcam radar.
class LiveMonitorScreen extends StatelessWidget {
  const LiveMonitorScreen({super.key, this.onOpenDevices});

  final VoidCallback? onOpenDevices;

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final state = snapshot.data ?? runtime.snapshot;
        final m5Sample = state.latestM5Sample;
        final polarSample = state.latestPolarSample;

        return Scaffold(
          backgroundColor: isDark ? AppPalette.slate950 : AppPalette.slate50,
          appBar: AppBar(
            title: const Row(
              children: [
                Icon(Icons.monitor_heart_rounded, size: 22, color: AppPalette.brand),
                SizedBox(width: 8),
                Text('Live Telemetry Monitor'),
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
          body: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Top Status Banner (MQTT & Sensor Links)
                _LiveStatusStrip(state: state, isDark: isDark),
                const SizedBox(height: 14),

                // 2. Kinematics HUD (Speed, Distance, Accel)
                KinematicsCard(sample: m5Sample),
                const SizedBox(height: 14),

                // 3. Multi-Axis IMU Waveform Chart (Accel & Gyro)
                ImuWaveformChart(history: state.m5History),
                const SizedBox(height: 14),

                // 4. Polar Verity Sense Studio (HR, PPI, PPG, 3D Motion)
                PolarSensorsCard(
                  sample: polarSample,
                  history: state.polarHistory,
                ),
                const SizedBox(height: 14),

                // 5. Node_Tsimcam Camera Node Radar
                NodeScannerCard(
                  nodes: state.detectedNodes,
                  onRefresh: () => runtime.scanCameraNodes(state.config),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _LiveStatusStrip extends StatelessWidget {
  const _LiveStatusStrip({
    required this.state,
    required this.isDark,
  });

  final GatewayRuntimeSnapshot state;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final mqttConnected = state.status.mqttReady;
    final m5Connected = state.pairedM5Device != null;
    final polarConnected = state.pairedPolarDevice != null;

    return Row(
      children: [
        Expanded(
          child: _StatusBadge(
            label: 'MQTT EMQX',
            detail: mqttConnected ? 'broker.emqx.io' : 'Offline',
            isConnected: mqttConnected,
            icon: Icons.cloud_done_rounded,
            isDark: isDark,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusBadge(
            label: 'IMU Node',
            detail: m5Connected ? (state.pairedM5Device?.name ?? 'M5') : 'No Board',
            isConnected: m5Connected,
            icon: Icons.sensors_rounded,
            isDark: isDark,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _StatusBadge(
            label: 'Polar BLE',
            detail: polarConnected ? (state.pairedPolarDevice?.name ?? 'Polar') : 'No Sensor',
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
                    color: isConnected ? (isDark ? AppPalette.white : AppPalette.slate900) : AppPalette.slate400,
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
