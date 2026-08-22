import 'package:flutter/material.dart';

import '../models/gateway_runtime_snapshot.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../widgets/polar_sensors_card.dart';

class PolarStudioScreen extends StatelessWidget {
  const PolarStudioScreen({super.key});

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
        final polar = state.latestPolarSample;
        final paired = state.pairedPolarDevice;

        return Scaffold(
          backgroundColor: isDark ? AppPalette.slate950 : AppPalette.slate50,
          appBar: AppBar(
            title: const Row(
              children: [
                Icon(Icons.favorite_rounded, size: 22, color: AppPalette.polarHeart),
                SizedBox(width: 8),
                Text('Polar Verity Sense Studio'),
              ],
            ),
          ),
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (paired == null)
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: isDark ? AppPalette.slate900 : AppPalette.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isDark ? AppPalette.slate800 : AppPalette.slate200,
                      ),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.bluetooth_searching_rounded,
                          size: 40,
                          color: AppPalette.polarHeart,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'No Polar Verity Sense Paired',
                          style: theme.textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Pair your Polar sensor in Settings to enable high-frequency optical PPG, 3D motion, and HRV streaming.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium,
                        ),
                      ],
                    ),
                  )
                else ...[
                  // Primary Polar Verity Sense Card
                  PolarSensorsCard(sample: polar, history: state.polarHistory),
                  const SizedBox(height: 16),

                  // Sensor Diagnostics Card
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: isDark ? AppPalette.slate900 : AppPalette.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isDark ? AppPalette.slate800 : AppPalette.slate200,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Sensor Specifications & Stream State',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 12),
                        _SpecRow(label: 'Device Identifier', value: paired.id, isDark: isDark),
                        _SpecRow(label: 'Device Name', value: paired.name, isDark: isDark),
                        _SpecRow(label: 'Optical PPG Mode', value: '4-Channel LED Optical (Active)', isDark: isDark),
                        _SpecRow(label: '3D Accelerometer', value: '52Hz / 104Hz Multi-Axis', isDark: isDark),
                        _SpecRow(label: '3D Gyroscope', value: '±2000 dps High Dynamic Range', isDark: isDark),
                        _SpecRow(label: 'Magnetometer', value: '3-Axis Geomagnetic Heading', isDark: isDark),
                        _SpecRow(label: 'Contact Detection', value: polar?.contactStatus == true ? 'Skin Contact Detected' : 'Idle / Off Body', isDark: isDark),
                        _SpecRow(label: 'Signal Quality', value: polar?.signalLabel ?? 'Good', isDark: isDark),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SpecRow extends StatelessWidget {
  const _SpecRow({
    required this.label,
    required this.value,
    required this.isDark,
  });

  final String label;
  final String value;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppPalette.slate400 : AppPalette.slate600,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isDark ? AppPalette.white : AppPalette.slate900,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }
}
