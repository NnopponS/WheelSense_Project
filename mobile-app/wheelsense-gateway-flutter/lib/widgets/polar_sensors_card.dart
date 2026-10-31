import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/sensor_telemetry.dart';
import '../theme/app_palette.dart';
import '../l10n/gateway_localizations.dart';
import 'product_ui.dart';

class PolarSensorsCard extends StatelessWidget {
  const PolarSensorsCard({
    super.key,
    required this.sample,
    required this.history,
  });

  final PolarTelemetrySample? sample;
  final List<PolarTelemetrySample> history;

  @override
  Widget build(BuildContext context) {
    final sample = this.sample;
    final t = context.text;
    if (sample == null) {
      return ProductSurface(
        child: Text(t.pick('No Polar data', 'ไม่มีข้อมูล Polar')),
      );
    }
    final theme = Theme.of(context);

    final bpm = sample.heartRateBpm;
    final contact = sample.contactStatus;

    // PPG waveform from the latest sample, falling back to HR history.
    final ppgSpots = <FlSpot>[];
    if (sample.ppgSamples.isNotEmpty) {
      final rows = sample.ppgSamples;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].isNotEmpty) {
          ppgSpots.add(FlSpot(i.toDouble(), rows[i][0].toDouble()));
        }
      }
    } else {
      for (var i = 0; i < history.length; i++) {
        ppgSpots.add(FlSpot(i.toDouble(), history[i].heartRateBpm.toDouble()));
      }
    }

    final metrics = [
      ProductStat(
        label: t.pick('Heart rate', 'ชีพจร'),
        value: bpm > 0 ? '$bpm' : '--',
        unit: 'bpm',
      ),
      ProductStat(
        label: 'R-R / PPI',
        value: sample.rrIntervalsMs.isNotEmpty
            ? sample.rrIntervalsMs.first.toStringAsFixed(0)
            : '--',
        unit: 'ms',
      ),
      ProductStat(
        label: 'SpO₂',
        value: sample.spo2Percent?.toString() ?? '--',
        unit: '%',
        note: t.pick('Experimental', 'ค่าทดลอง'),
      ),
      ProductStat(
        label: t.pick('Battery', 'แบตเตอรี่'),
        value: sample.sensorBatteryPercent?.toString() ?? '--',
        unit: '%',
      ),
    ];

    return ProductSurface(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProductSectionHeading(
            title: 'Polar Verity Sense',
            subtitle: DateFormat.Hms().format(sample.timestamp.toLocal()),
            trailing: ProductStatusPill(
              compact: true,
              positive: contact == true,
              label: contact == true
                  ? t.pick('Skin contact', 'สัมผัสผิว')
                  : contact == false
                  ? t.pick('No contact', 'ไม่สัมผัสผิว')
                  : t.pick('Contact unknown', 'ไม่ทราบการสัมผัส'),
            ),
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              const gap = 16.0;
              final columns = constraints.maxWidth >= 520 ? 4 : 2;
              final width =
                  ((constraints.maxWidth - gap * (columns - 1)) / columns)
                      .clamp(0.0, double.infinity);
              return Wrap(
                spacing: gap,
                runSpacing: 18,
                children: [
                  for (final metric in metrics)
                    SizedBox(width: width, child: metric),
                ],
              );
            },
          ),
          const SizedBox(height: 24),
          Text(
            t.pick('Pulse waveform', 'คลื่นชีพจร'),
            style: theme.textTheme.labelMedium,
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 96,
            child: ppgSpots.isEmpty
                ? Center(
                    child: Text(
                      t.pick(
                        'Waiting for optical sensor data…',
                        'กำลังรอข้อมูลเซนเซอร์ออปติคัล…',
                      ),
                      style: theme.textTheme.bodyMedium,
                    ),
                  )
                : LineChart(
                    LineChartData(
                      gridData: const FlGridData(show: false),
                      titlesData: const FlTitlesData(show: false),
                      borderData: FlBorderData(show: false),
                      lineBarsData: [
                        LineChartBarData(
                          spots: ppgSpots,
                          isCurved: true,
                          color: AppPalette.polarHeart,
                          barWidth: 2,
                          dotData: const FlDotData(show: false),
                          belowBarData: BarAreaData(
                            show: true,
                            color: AppPalette.polarHeart.withValues(
                              alpha: 0.08,
                            ),
                          ),
                        ),
                      ],
                    ),
                    duration: Duration.zero,
                  ),
          ),
          if (sample.accelXMg != null || sample.gyroXDps != null) ...[
            const SizedBox(height: 20),
            const Divider(),
            const SizedBox(height: 16),
            Text(
              t.pick('3D motion', 'การเคลื่อนไหว 3 มิติ'),
              style: theme.textTheme.labelMedium,
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _MotionStreamItem(
                    title: 'ACC mg',
                    x: sample.accelXMg?.toDouble() ?? 0,
                    y: sample.accelYMg?.toDouble() ?? 0,
                    z: sample.accelZMg?.toDouble() ?? 0,
                  ),
                ),
                Expanded(
                  child: _MotionStreamItem(
                    title: 'GYRO dps',
                    x: sample.gyroXDps ?? 0,
                    y: sample.gyroYDps ?? 0,
                    z: sample.gyroZDps ?? 0,
                  ),
                ),
                Expanded(
                  child: _MotionStreamItem(
                    title: 'MAG G',
                    x: sample.magXGauss ?? 0,
                    y: sample.magYGauss ?? 0,
                    z: sample.magZGauss ?? 0,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _MotionStreamItem extends StatelessWidget {
  const _MotionStreamItem({
    required this.title,
    required this.x,
    required this.y,
    required this.z,
  });

  final String title;
  final double x, y, z;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final value = theme.textTheme.bodySmall?.copyWith(
      color: theme.colorScheme.onSurface,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    Widget axis(String name, double v, Color color) => Row(
      children: [
        Text(name, style: value?.copyWith(color: color)),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            v.toStringAsFixed(1),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: value,
          ),
        ),
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.labelSmall),
        const SizedBox(height: 4),
        axis('X', x, AppPalette.dangerBright),
        axis('Y', y, AppPalette.successBright),
        axis('Z', z, AppPalette.leftBright),
      ],
    );
  }
}
