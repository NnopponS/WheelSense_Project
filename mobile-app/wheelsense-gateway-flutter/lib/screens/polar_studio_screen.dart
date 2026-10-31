import 'package:flutter/material.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
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
              appBar: AppBar(
                title: Text(context.text.pick('Heart sensor', 'เซนเซอร์หัวใจ')),
              ),
              body: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (paired == null && polar == null)
                      ProductSurface(
                        padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
                        child: Column(
                          children: [
                            Container(
                              width: 72,
                              height: 72,
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primaryContainer,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                Icons.bluetooth_searching_rounded,
                                size: 32,
                                color: theme.colorScheme.onPrimaryContainer,
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              context.text.pick('Not paired', 'ยังไม่จับคู่'),
                              style: theme.textTheme.titleMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              context.text.pick(
                                'Pair your Polar sensor from Devices.',
                                'จับคู่เซนเซอร์ Polar จากหน้าอุปกรณ์',
                              ),
                              textAlign: TextAlign.center,
                              style: theme.textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      )
                    else ...[
                      // Primary Polar Verity Sense Card
                      PolarSensorsCard(sample: polar, history: history),
                      const SizedBox(height: 12),

                      // Sensor Diagnostics Card
                      if (paired != null)
                        ProductSurface(
                          padding: EdgeInsets.zero,
                          child: ExpansionTile(
                            shape: const Border(),
                            collapsedShape: const Border(),
                            title: Text(
                              context.text.pick(
                                'Sensor details',
                                'รายละเอียดเซนเซอร์',
                              ),
                              style: theme.textTheme.titleSmall,
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
              style: Theme.of(context).textTheme.bodySmall,
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
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurface,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
