import 'package:flutter/material.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/product_ui.dart';
import '../widgets/polar_sensors_card.dart';
import 'tool_preview_readings.dart';

class PolarStudioScreen extends StatelessWidget {
  const PolarStudioScreen({super.key, this.previewAt});

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
            final actualPolar = state.latestPolarSample;
            final polar = ToolPreviewReadings.resolvePolar(
              actual: actualPolar,
              preview: preview,
              now: time,
            );
            final polarFresh = ToolPreviewReadings.isFresh(
              actualPolar?.timestamp,
              time,
            );
            final history = polarFresh && state.polarHistory.isNotEmpty
                ? state.polarHistory
                : preview == null
                ? state.polarHistory
                : ToolPreviewReadings.polarHistory(time, preview);
            final paired = state.pairedPolarDevice;

            return Scaffold(
              backgroundColor: isDark
                  ? AppPalette.slate950
                  : AppPalette.slate50,
              appBar: AppBar(
                toolbarHeight: MediaQuery.textScalerOf(context).scale(28) + 28,
                title: const Row(
                  children: [
                    ProductIcon(
                      'polar',
                      size: 22,
                      color: AppPalette.polarHeart,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text('Polar Verity Sense Studio', maxLines: 2),
                    ),
                  ],
                ),
              ),
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (paired == null && polar == null)
                      Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          color: isDark
                              ? AppPalette.slate900
                              : AppPalette.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: isDark
                                ? AppPalette.slate800
                                : AppPalette.slate200,
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
                              context.text.pick('Not paired', 'ยังไม่จับคู่'),
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      )
                    else ...[
                      // Primary Polar Verity Sense Card
                      PolarSensorsCard(sample: polar, history: history),
                      const SizedBox(height: 16),

                      // Sensor Diagnostics Card
                      if (paired != null)
                        Container(
                          decoration: BoxDecoration(
                            color: isDark
                                ? AppPalette.slate900
                                : AppPalette.white,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(
                              color: isDark
                                  ? AppPalette.slate800
                                  : AppPalette.slate200,
                            ),
                          ),
                          child: ExpansionTile(
                            title: Text(
                              context.text.pick(
                                'Sensor details',
                                'รายละเอียดเซนเซอร์',
                              ),
                              style: theme.textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            childrenPadding: const EdgeInsets.fromLTRB(
                              16,
                              0,
                              16,
                              14,
                            ),
                            children: [
                              _SpecRow(
                                label: 'Device Identifier',
                                value: paired.id,
                                isDark: isDark,
                              ),
                              _SpecRow(
                                label: 'Device Name',
                                value: paired.name,
                                isDark: isDark,
                              ),
                              _SpecRow(
                                label: 'Optical PPG Mode',
                                value: '4-Channel LED Optical (Active)',
                                isDark: isDark,
                              ),
                              _SpecRow(
                                label: '3D Accelerometer',
                                value: '52Hz / 104Hz Multi-Axis',
                                isDark: isDark,
                              ),
                              _SpecRow(
                                label: '3D Gyroscope',
                                value: '±2000 dps High Dynamic Range',
                                isDark: isDark,
                              ),
                              _SpecRow(
                                label: 'Magnetometer',
                                value: '3-Axis Geomagnetic Heading',
                                isDark: isDark,
                              ),
                              _SpecRow(
                                label: 'Contact Detection',
                                value: polar?.contactStatus == true
                                    ? 'Skin Contact Detected'
                                    : 'Idle / Off Body',
                                isDark: isDark,
                              ),
                              _SpecRow(
                                label: 'Signal Quality',
                                value: polar?.signalLabel ?? 'Good',
                                isDark: isDark,
                              ),
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
        children: [
          Expanded(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                color: isDark ? AppPalette.slate400 : AppPalette.slate600,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: Text(
              value,
              textAlign: TextAlign.end,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isDark ? AppPalette.white : AppPalette.slate900,
                fontFamily: 'monospace',
              ),
            ),
          ),
        ],
      ),
    );
  }
}
