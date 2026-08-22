import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../models/sensor_telemetry.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';

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
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final bpm = sample?.heartRateBpm ?? 0;
    final rri = sample?.rrIntervalsMs.isNotEmpty == true
        ? sample!.rrIntervalsMs.first.toStringAsFixed(1)
        : '--';
    final spo2 = sample?.spo2Percent != null
        ? '${sample!.spo2Percent}%'
        : '--';
    final battery = sample?.sensorBatteryPercent != null
        ? '${sample!.sensorBatteryPercent}%'
        : '--';
    final contact = sample?.contactStatus ?? true;

    // Build PPG waveform spots from latest sample or history
    final ppgSpots = <FlSpot>[];
    if (sample != null && sample!.ppgSamples.isNotEmpty) {
      final rows = sample!.ppgSamples;
      for (var i = 0; i < rows.length; i++) {
        final r = rows[i];
        if (r.isNotEmpty) {
          ppgSpots.add(FlSpot(i.toDouble(), r[0].toDouble()));
        }
      }
    } else {
      // Fallback to HR history
      for (var i = 0; i < history.length; i++) {
        ppgSpots.add(FlSpot(i.toDouble(), history[i].heartRateBpm.toDouble()));
      }
    }

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
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppPalette.polarHeart.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.favorite_rounded,
                      size: 20,
                      color: AppPalette.polarHeart,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Polar Verity Sense Studio',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: contact
                      ? AppPalette.success.withValues(alpha: 0.15)
                      : AppPalette.danger.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      contact ? Icons.check_circle_rounded : Icons.warning_rounded,
                      size: 14,
                      color: contact ? AppPalette.successBright : AppPalette.dangerBright,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      contact ? 'Skin Contact OK' : 'No Skin Contact',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: contact ? AppPalette.successBright : AppPalette.dangerBright,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Metrics Row
          Row(
            children: [
              Expanded(
                child: _VitalPill(
                  label: 'HEART RATE',
                  value: bpm > 0 ? '$bpm' : '--',
                  unit: 'BPM',
                  icon: Icons.monitor_heart_rounded,
                  color: AppPalette.polarHeartBright,
                  isDark: isDark,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _VitalPill(
                  label: 'R-R / PPI',
                  value: rri,
                  unit: 'ms',
                  icon: Icons.graphic_eq_rounded,
                  color: AppPalette.polarPpgBright,
                  isDark: isDark,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _VitalPill(
                  label: 'SpO2 (PPG)',
                  value: spo2,
                  unit: 'est.',
                  icon: Icons.water_drop_rounded,
                  color: AppPalette.infoBright,
                  isDark: isDark,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _VitalPill(
                  label: 'BATTERY',
                  value: battery,
                  unit: '',
                  icon: Icons.battery_charging_full_rounded,
                  color: AppPalette.successBright,
                  isDark: isDark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // 3D Motion Streams from Polar Verity Sense
          if (sample?.accelXMg != null || sample?.gyroXDps != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
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
                  Row(
                    children: [
                      const Icon(Icons.screen_rotation_rounded, size: 16, color: AppPalette.brand),
                      const SizedBox(width: 6),
                      Text(
                        'Polar 3D Motion (ACC & GYRO & MAG)',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: isDark ? AppPalette.slate200 : AppPalette.slate800,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _MotionStreamItem(
                        title: 'ACC (mg)',
                        x: sample?.accelXMg?.toDouble() ?? 0,
                        y: sample?.accelYMg?.toDouble() ?? 0,
                        z: sample?.accelZMg?.toDouble() ?? 0,
                        isDark: isDark,
                      ),
                      _MotionStreamItem(
                        title: 'GYRO (dps)',
                        x: sample?.gyroXDps ?? 0,
                        y: sample?.gyroYDps ?? 0,
                        z: sample?.gyroZDps ?? 0,
                        isDark: isDark,
                      ),
                      _MotionStreamItem(
                        title: 'MAG (G)',
                        x: sample?.magXGauss ?? 0,
                        y: sample?.magYGauss ?? 0,
                        z: sample?.magZGauss ?? 0,
                        isDark: isDark,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],
          // Optical PPG / HR Waveform Chart
          Text(
            'Optical Pulse Waveform (PPG / HR Live)',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isDark ? AppPalette.slate400 : AppPalette.slate600,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 100,
            child: ppgSpots.isEmpty
                ? Center(
                    child: Text(
                      'Waiting for optical sensor data...',
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
                          color: AppPalette.polarHeartBright,
                          barWidth: 2,
                          dotData: const FlDotData(show: false),
                          belowBarData: BarAreaData(
                            show: true,
                            color: AppPalette.polarHeart.withValues(alpha: 0.1),
                          ),
                        ),
                      ],
                    ),
                    duration: Duration.zero,
                  ),
          ),
        ],
      ),
    );
  }
}

class _VitalPill extends StatelessWidget {
  const _VitalPill({
    required this.label,
    required this.value,
    required this.unit,
    required this.icon,
    required this.color,
    required this.isDark,
  });

  final String label;
  final String value;
  final String unit;
  final IconData icon;
  final Color color;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: isDark ? AppPalette.slate850 : AppPalette.slate50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isDark ? AppPalette.slate800 : AppPalette.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: color),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppPalette.slate400 : AppPalette.slate500,
                    letterSpacing: 0.3,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                value,
                style: AppTypography.monospaceMetrics(
                  color: isDark ? AppPalette.white : AppPalette.slate900,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (unit.isNotEmpty) ...[
                const SizedBox(width: 2),
                Text(
                  unit,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: color,
                  ),
                ),
              ],
            ],
          ),
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
    required this.isDark,
  });

  final String title;
  final double x, y, z;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            color: isDark ? AppPalette.slate400 : AppPalette.slate500,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          'X: ${x.toStringAsFixed(1)}',
          style: TextStyle(fontSize: 10, color: AppPalette.dangerBright, fontFamily: 'monospace'),
        ),
        Text(
          'Y: ${y.toStringAsFixed(1)}',
          style: TextStyle(fontSize: 10, color: AppPalette.successBright, fontFamily: 'monospace'),
        ),
        Text(
          'Z: ${z.toStringAsFixed(1)}',
          style: TextStyle(fontSize: 10, color: AppPalette.leftBright, fontFamily: 'monospace'),
        ),
      ],
    );
  }
}
