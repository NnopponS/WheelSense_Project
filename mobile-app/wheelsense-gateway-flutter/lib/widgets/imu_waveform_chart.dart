import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../models/sensor_telemetry.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';

enum ImuChartMode { accel, gyro }

class ImuWaveformChart extends StatefulWidget {
  const ImuWaveformChart({
    super.key,
    required this.history,
    this.initialMode = ImuChartMode.accel,
  });

  final List<M5TelemetrySample> history;
  final ImuChartMode initialMode;

  @override
  State<ImuWaveformChart> createState() => _ImuWaveformChartState();
}

class _ImuWaveformChartState extends State<ImuWaveformChart> {
  late ImuChartMode _mode;

  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    final xSpots = <FlSpot>[];
    final ySpots = <FlSpot>[];
    final zSpots = <FlSpot>[];

    final dataList = widget.history.length > 50
        ? widget.history.sublist(widget.history.length - 50)
        : widget.history;

    for (var i = 0; i < dataList.length; i++) {
      final sample = dataList[i];
      final xVal = _mode == ImuChartMode.accel ? sample.accelX : sample.gyroX;
      final yVal = _mode == ImuChartMode.accel ? sample.accelY : sample.gyroY;
      final zVal = _mode == ImuChartMode.accel ? sample.accelZ : sample.gyroZ;

      xSpots.add(FlSpot(i.toDouble(), xVal));
      ySpots.add(FlSpot(i.toDouble(), yVal));
      zSpots.add(FlSpot(i.toDouble(), zVal));
    }

    final unit = _mode == ImuChartMode.accel ? 'g' : 'dps';

    return Container(
      padding: const EdgeInsets.all(16),
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
                  Icon(
                    Icons.show_chart_rounded,
                    size: 20,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _mode == ImuChartMode.accel
                        ? 'Accelerometer Stream ($unit)'
                        : 'Gyroscope Stream ($unit)',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              SegmentedButton<ImuChartMode>(
                segments: const [
                  ButtonSegment(
                    value: ImuChartMode.accel,
                    label: Text('Accel'),
                  ),
                  ButtonSegment(
                    value: ImuChartMode.gyro,
                    label: Text('Gyro'),
                  ),
                ],
                selected: {_mode},
                onSelectionChanged: (set) {
                  setState(() => _mode = set.first);
                },
                style: SegmentedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  textStyle: const TextStyle(fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _AxisLegend(label: 'X Axis', color: AppPalette.dangerBright),
              const SizedBox(width: 14),
              _AxisLegend(label: 'Y Axis', color: AppPalette.successBright),
              const SizedBox(width: 14),
              _AxisLegend(label: 'Z Axis', color: AppPalette.leftBright),
              const Spacer(),
              if (dataList.isNotEmpty)
                Text(
                  'Seq: ${dataList.last.seq}',
                  style: AppTypography.monospaceMetrics(
                    color: isDark ? AppPalette.slate400 : AppPalette.slate600,
                    fontSize: 12,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 160,
            child: xSpots.isEmpty
                ? Center(
                    child: Text(
                      'Waiting for live IMU stream...',
                      style: theme.textTheme.bodyMedium,
                    ),
                  )
                : LineChart(
                    LineChartData(
                      gridData: FlGridData(
                        show: true,
                        drawVerticalLine: false,
                        getDrawingHorizontalLine: (value) => FlLine(
                          color: isDark
                              ? AppPalette.slate800
                              : AppPalette.slate100,
                          strokeWidth: 1,
                        ),
                      ),
                      titlesData: const FlTitlesData(
                        topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 34,
                          ),
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      lineBarsData: [
                        LineChartBarData(
                          spots: xSpots,
                          isCurved: true,
                          color: AppPalette.dangerBright,
                          barWidth: 2,
                          dotData: const FlDotData(show: false),
                        ),
                        LineChartBarData(
                          spots: ySpots,
                          isCurved: true,
                          color: AppPalette.successBright,
                          barWidth: 2,
                          dotData: const FlDotData(show: false),
                        ),
                        LineChartBarData(
                          spots: zSpots,
                          isCurved: true,
                          color: AppPalette.leftBright,
                          barWidth: 2,
                          dotData: const FlDotData(show: false),
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

class _AxisLegend extends StatelessWidget {
  const _AxisLegend({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
        ),
      ],
    );
  }
}
