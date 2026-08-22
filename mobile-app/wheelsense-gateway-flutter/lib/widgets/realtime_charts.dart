import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/sensor_telemetry.dart';

/// One plotted line. Values may contain nulls (gaps break the line).
class ChartSeries {
  const ChartSeries({
    required this.label,
    required this.color,
    required this.values,
    this.fallbackRange,
    this.minimumSpan = 1,
    this.valueFormat = _oneDecimal,
  });

  final String label;
  final Color color;
  final List<double?> values;

  /// Used when fewer than two non-null values exist yet, so the axis is stable
  /// and meaningful instead of collapsing to zero.
  final (double, double)? fallbackRange;
  final double minimumSpan;
  final String Function(double value) valueFormat;

  static String _oneDecimal(double value) => value.toStringAsFixed(1);
}

/// Shared live line chart: y-tick labels, gap-aware series, gradient fill
/// under the first series, and a drag/touch readout of every series value.
class RealtimeLineChart extends StatefulWidget {
  const RealtimeLineChart({
    super.key,
    required this.series,
    required this.unit,
    this.height = 176,
    this.timestamps = const <DateTime>[],
  });

  final List<ChartSeries> series;
  final String unit;
  final double height;
  final List<DateTime> timestamps;

  @override
  State<RealtimeLineChart> createState() => _RealtimeLineChartState();
}

class _RealtimeLineChartState extends State<RealtimeLineChart> {
  int? _hoverIndex;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final count = widget.series.firstOrNull?.values.length ?? 0;
    final empty = count < 2;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFF8FBFF),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFDCE7F5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 6,
              children: [
                for (final s in widget.series)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: s.color,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '${s.label} (${widget.unit})',
                        style: theme.textTheme.labelMedium,
                      ),
                    ],
                  ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: widget.height,
              child: empty
                  ? Center(
                      child: Text(
                        'Waiting for live packets',
                        style: theme.textTheme.labelMedium,
                      ),
                    )
                  : LayoutBuilder(
                      builder: (context, constraints) {
                        return GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onPanDown: (details) =>
                              _updateHover(details.localPosition, constraints),
                          onPanUpdate: (details) =>
                              _updateHover(details.localPosition, constraints),
                          onPanEnd: (_) => setState(() => _hoverIndex = null),
                          onPanCancel: () => setState(() => _hoverIndex = null),
                          child: CustomPaint(
                            painter: _RealtimeChartPainter(
                              series: widget.series,
                              hoverIndex: _hoverIndex,
                            ),
                            child: _hoverIndex == null
                                ? null
                                : Align(
                                    alignment: Alignment.topRight,
                                    child: _readout(theme),
                                  ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _readout(ThemeData theme) {
    final index = _hoverIndex!;
    final time = index < widget.timestamps.length
        ? DateFormat.Hms().format(widget.timestamps[index])
        : '';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0xFFDCE7F5)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (time.isNotEmpty)
            Text(time, style: theme.textTheme.labelSmall),
          for (final s in widget.series)
            if (s.values[index] case final value?)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: s.color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    '${s.label} ${s.valueFormat(value)}',
                    style: theme.textTheme.labelSmall,
                  ),
                ],
              ),
        ],
      ),
    );
  }

  void _updateHover(Offset position, BoxConstraints constraints) {
    final count = widget.series.firstOrNull?.values.length ?? 0;
    if (count < 2 || constraints.maxWidth <= 0) {
      return;
    }
    final ratio = (position.dx / constraints.maxWidth).clamp(0.0, 1.0);
    setState(() => _hoverIndex = (ratio * (count - 1)).round());
  }
}

class _RealtimeChartPainter extends CustomPainter {
  const _RealtimeChartPainter({required this.series, this.hoverIndex});

  final List<ChartSeries> series;
  final int? hoverIndex;

  static const double _tickInset = 42;

  @override
  void paint(Canvas canvas, Size size) {
    final plot = Rect.fromLTWH(
      _tickInset,
      0,
      math.max(0, size.width - _tickInset),
      size.height,
    );
    _drawGrid(canvas, plot);

    for (var i = 0; i < series.length; i += 1) {
      final s = series[i];
      final range = _rangeFor(s);
      if (i == 0) {
        _drawTicks(canvas, plot, range, s);
      }
      _drawSeries(canvas, plot, s, range, fill: i == 0);
    }

    final hover = hoverIndex;
    if (hover != null && series.firstOrNull != null) {
      final count = series.first.values.length;
      final x = plot.left + plot.width * hover / (count - 1);
      final paint = Paint()
        ..color = const Color(0xFF94A3B8)
        ..strokeWidth = 1;
      canvas.drawLine(Offset(x, 0), Offset(x, plot.bottom), paint);
    }
  }

  @override
  bool shouldRepaint(covariant _RealtimeChartPainter oldDelegate) {
    return oldDelegate.series != series || oldDelegate.hoverIndex != hoverIndex;
  }

  static (double, double) _rangeFor(ChartSeries series) {
    final values = series.values.whereType<double>().toList();
    if (values.length < 2) {
      return series.fallbackRange ?? (0, series.minimumSpan);
    }
    final rawMin = values.reduce(math.min);
    final rawMax = values.reduce(math.max);
    if ((rawMax - rawMin).abs() >= series.minimumSpan) {
      final padding = (rawMax - rawMin) * 0.12;
      return (rawMin - padding, rawMax + padding);
    }
    return (rawMin - series.minimumSpan, rawMax + series.minimumSpan);
  }

  static void _drawGrid(Canvas canvas, Rect plot) {
    final paint = Paint()
      ..color = const Color(0xFFE1EAF5)
      ..strokeWidth = 1;
    for (var i = 0; i <= 4; i += 1) {
      final y = plot.top + plot.height * i / 4;
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), paint);
    }
  }

  static void _drawTicks(Canvas canvas, Rect plot, (double, double) range,
      ChartSeries series) {
    final (min, max) = range;
    for (var i = 0; i <= 4; i += 1) {
      final value = max - (max - min) * i / 4;
      final tp = TextPainter(
        text: TextSpan(
          text: series.valueFormat(value),
          style: const TextStyle(
            color: Color(0xFF64748B),
            fontSize: 10,
          ),
        ),
        textDirection: ui.TextDirection.ltr,
      )..layout(maxWidth: _tickInset - 6);
      final y = plot.top + plot.height * i / 4;
      tp.paint(canvas, Offset(plot.left - tp.width - 4, y - tp.height / 2));
    }
  }

  static void _drawSeries(
    Canvas canvas,
    Rect plot,
    ChartSeries series,
    (double, double) range,
    {required bool fill}
  ) {
    final (min, max) = range;
    final values = series.values;
    if (values.whereType<double>().length < 2) {
      return;
    }

    Offset? point(int index) {
      final value = values[index];
      if (value == null) {
        return null;
      }
      final x = plot.left + plot.width * index / (values.length - 1);
      final ratio = ((value - min) / (max - min)).clamp(0.0, 1.0);
      return Offset(x, plot.bottom - ratio * plot.height);
    }

    final path = Path();
    var started = false;
    final segments = <Path>[];
    for (var index = 0; index < values.length; index += 1) {
      final p = point(index);
      if (p == null) {
        if (started) {
          segments.add(path);
        }
        path.reset();
        started = false;
        continue;
      }
      if (!started) {
        path.moveTo(p.dx, p.dy);
        started = true;
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    if (started) {
      segments.add(path);
    }

    if (fill && segments.isNotEmpty) {
      final fillPath = Path();
      for (final segment in segments) {
        final metricsList = segment.computeMetrics();
        for (final metric in metricsList) {
          final start = metric.getTangentForOffset(0)?.position;
          final end = metric.getTangentForOffset(metric.length)?.position;
          if (start == null || end == null) {
            continue;
          }
          fillPath.addPath(segment, Offset.zero);
          fillPath
            ..moveTo(end.dx, plot.bottom)
            ..lineTo(start.dx, plot.bottom)
            ..close();
        }
      }
      canvas.drawPath(
        fillPath,
        Paint()
          ..color = series.color.withValues(alpha: 0.08)
          ..style = PaintingStyle.fill,
      );
    }

    final paint = Paint()
      ..color = series.color
      ..strokeWidth = 2.4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final segment in segments) {
      canvas.drawPath(segment, paint);
    }
  }
}

// ---------------------------------------------------------------------------
// WheelSense chart presets (used by PairDevices and Live Monitor).
// ---------------------------------------------------------------------------

class GyroLineChart extends StatelessWidget {
  const GyroLineChart({super.key, required this.samples});

  final List<M5TelemetrySample> samples;

  @override
  Widget build(BuildContext context) {
    return RealtimeLineChart(
      unit: '°/s',
      timestamps: [for (final s in samples) s.timestamp],
      series: [
        ChartSeries(
          label: 'Gyro X',
          color: const Color(0xFF2563EB),
          values: [for (final s in samples) s.gyroX],
        ),
        ChartSeries(
          label: 'Gyro Y',
          color: const Color(0xFF16A34A),
          values: [for (final s in samples) s.gyroY],
        ),
        ChartSeries(
          label: 'Gyro Z',
          color: const Color(0xFFDC2626),
          values: [for (final s in samples) s.gyroZ],
        ),
      ],
    );
  }
}

class MotionLineChart extends StatelessWidget {
  const MotionLineChart({super.key, required this.samples});

  final List<M5TelemetrySample> samples;

  @override
  Widget build(BuildContext context) {
    return RealtimeLineChart(
      unit: 'm/s',
      timestamps: [for (final s in samples) s.timestamp],
      series: [
        ChartSeries(
          label: 'Velocity',
          color: const Color(0xFF2563EB),
          values: [for (final s in samples) s.velocityMs],
          minimumSpan: 0.5,
        ),
      ],
    );
  }
}

class AccelLineChart extends StatelessWidget {
  const AccelLineChart({super.key, required this.samples});

  final List<M5TelemetrySample> samples;

  @override
  Widget build(BuildContext context) {
    return RealtimeLineChart(
      unit: 'g',
      timestamps: [for (final s in samples) s.timestamp],
      series: [
        ChartSeries(
          label: 'Accel X',
          color: const Color(0xFF2563EB),
          values: [
            for (final s in samples) s.accelX,
          ],
        ),
        ChartSeries(
          label: 'Accel Y',
          color: const Color(0xFF16A34A),
          values: [
            for (final s in samples) s.accelY,
          ],
        ),
        ChartSeries(
          label: 'Accel Z',
          color: const Color(0xFFDC2626),
          values: [
            for (final s in samples) s.accelZ,
          ],
        ),
      ],
    );
  }
}

class PolarSignalChart extends StatelessWidget {
  const PolarSignalChart({super.key, required this.samples});

  final List<PolarTelemetrySample> samples;

  @override
  Widget build(BuildContext context) {
    return RealtimeLineChart(
      unit: 'bpm',
      timestamps: [for (final s in samples) s.timestamp],
      series: [
        ChartSeries(
          label: 'HR',
          color: const Color(0xFFBE123C),
          values: [
            for (final s in samples) s.heartRateBpm.toDouble(),
          ],
          fallbackRange: (40, 180),
          valueFormat: (v) => v.round().toString(),
        ),
        ChartSeries(
          label: 'SpO2',
          color: const Color(0xFF7C3AED),
          values: [for (final s in samples) s.spo2Percent?.toDouble()],
          fallbackRange: (90, 100),
          valueFormat: (v) => v.round().toString(),
        ),
        ChartSeries(
          label: 'RSSI',
          color: const Color(0xFF0F766E),
          values: [for (final s in samples) s.rssi?.toDouble()],
          fallbackRange: (-95, -45),
          valueFormat: (v) => v.round().toString(),
        ),
      ],
    );
  }
}
