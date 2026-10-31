import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../models/sensor_telemetry.dart';
import '../theme/app_palette.dart';
import 'product_ui.dart';

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

    final colors = theme.colorScheme;
    return ProductSurface(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProductSectionHeading(
            title: _mode == ImuChartMode.accel ? 'Accelerometer' : 'Gyroscope',
            subtitle: dataList.isEmpty
                ? unit
                : '$unit  ·  seq ${dataList.last.seq}',
            trailing: SegmentedButton<ImuChartMode>(
              showSelectedIcon: false,
              segments: const [
                ButtonSegment(value: ImuChartMode.accel, label: Text('Accel')),
                ButtonSegment(value: ImuChartMode.gyro, label: Text('Gyro')),
              ],
              selected: {_mode},
              onSelectionChanged: (set) {
                setState(() => _mode = set.first);
              },
              style: SegmentedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 12),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 14,
            runSpacing: 8,
            children: const [
              _AxisLegend(label: 'X', color: AppPalette.dangerBright),
              _AxisLegend(label: 'Y', color: AppPalette.successBright),
              _AxisLegend(label: 'Z', color: AppPalette.leftBright),
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
                          color: colors.outlineVariant,
                          strokeWidth: 1,
                        ),
                      ),
                      titlesData: FlTitlesData(
                        topTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                        rightTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                        bottomTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                        // Axis labels use the small caption style so they
                        // never inherit the 16px body size and wrap.
                        leftTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 40,
                            getTitlesWidget: (value, meta) => SideTitleWidget(
                              meta: meta,
                              child: Text(
                                meta.formattedValue,
                                maxLines: 1,
                                style: theme.textTheme.labelSmall,
                              ),
                            ),
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
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(label, style: Theme.of(context).textTheme.labelMedium),
      ],
    );
  }
}
