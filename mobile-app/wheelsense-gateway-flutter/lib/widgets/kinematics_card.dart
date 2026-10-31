import 'package:flutter/material.dart';

import '../models/sensor_telemetry.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';
import '../l10n/gateway_localizations.dart';
import 'product_ui.dart';

class KinematicsCard extends StatelessWidget {
  const KinematicsCard({super.key, required this.sample});

  final M5TelemetrySample? sample;

  @override
  Widget build(BuildContext context) {
    if (sample == null) {
      return ProductSurface(
        child: Text(context.text.pick('No M5 data', 'ไม่มีข้อมูล M5')),
      );
    }
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final speedKmh = sample?.speedKmh ?? 0.0;
    final speedMs = sample?.velocityMs ?? 0.0;
    final distM = sample?.distanceM ?? 0.0;
    final accelMs2 = sample?.accelMs2 ?? 0.0;
    final direction = sample?.direction ?? 0;

    final directionStr = direction > 0
        ? 'Forward'
        : direction < 0
        ? 'Reverse'
        : 'Stationary';

    final directionColor = direction > 0
        ? AppPalette.successBright
        : direction < 0
        ? AppPalette.warningBright
        : AppPalette.slate400;
    final metrics = [
      _MetricBox(
        label: 'SPEED',
        value: speedKmh.toStringAsFixed(1),
        unit: 'km/h',
        subValue: '${speedMs.toStringAsFixed(2)} m/s',
        accentColor: AppPalette.brand,
        isDark: isDark,
      ),
      _MetricBox(
        label: 'DISTANCE',
        value: distM >= 1000
            ? (distM / 1000).toStringAsFixed(2)
            : distM.toStringAsFixed(1),
        unit: distM >= 1000 ? 'km' : 'm',
        subValue: 'Total odometer',
        accentColor: AppPalette.leftBright,
        isDark: isDark,
      ),
      _MetricBox(
        label: 'ACCEL',
        value: accelMs2.toStringAsFixed(2),
        unit: 'm/s²',
        subValue: 'Magnitude',
        accentColor: AppPalette.rightBright,
        isDark: isDark,
      ),
    ];

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? AppPalette.slate900 : AppPalette.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppPalette.slate800 : AppPalette.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'M5 · ${sample!.timestamp.toLocal()}',
            style: theme.textTheme.labelSmall,
          ),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppPalette.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.speed_rounded,
                  size: 20,
                  color: AppPalette.brand,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Motion & Kinematics',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: directionColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      direction > 0
                          ? Icons.arrow_upward_rounded
                          : direction < 0
                          ? Icons.arrow_downward_rounded
                          : Icons.pause_circle_outline_rounded,
                      size: 14,
                      color: directionColor,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      directionStr,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: directionColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          LayoutBuilder(
            builder: (context, constraints) {
              const gap = 12.0;
              final columns = constraints.maxWidth >= 480 ? 3 : 2;
              final width =
                  (constraints.maxWidth - gap * (columns - 1)) / columns;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final metric in metrics)
                    SizedBox(width: width, child: metric),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MetricBox extends StatelessWidget {
  const _MetricBox({
    required this.label,
    required this.value,
    required this.unit,
    required this.subValue,
    required this.accentColor,
    required this.isDark,
  });

  final String label;
  final String value;
  final String unit;
  final String subValue;
  final Color accentColor;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppPalette.slate850 : AppPalette.slate50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppPalette.slate800 : AppPalette.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: isDark ? AppPalette.slate400 : AppPalette.slate500,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 4),
          Wrap(
            spacing: 3,
            children: [
              Text(
                value,
                style: AppTypography.monospaceMetrics(
                  color: isDark ? AppPalette.white : AppPalette.slate900,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                unit,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: accentColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            subValue,
            style: TextStyle(
              fontSize: 10,
              color: isDark ? AppPalette.slate500 : AppPalette.slate400,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
