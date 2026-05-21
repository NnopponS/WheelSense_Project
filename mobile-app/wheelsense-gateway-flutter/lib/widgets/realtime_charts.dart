import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models/sensor_telemetry.dart';

class GyroLineChart extends StatelessWidget {
  const GyroLineChart({super.key, required this.samples});

  final List<M5TelemetrySample> samples;

  @override
  Widget build(BuildContext context) {
    return _ChartFrame(
      legend: const [
        _LegendItem(label: 'X', color: Color(0xFF2563EB)),
        _LegendItem(label: 'Y', color: Color(0xFF16A34A)),
        _LegendItem(label: 'Z', color: Color(0xFFDC2626)),
      ],
      painter: _GyroPainter(samples),
      empty: samples.length < 2,
    );
  }
}

class PolarSignalChart extends StatelessWidget {
  const PolarSignalChart({super.key, required this.samples});

  final List<PolarTelemetrySample> samples;

  @override
  Widget build(BuildContext context) {
    return _ChartFrame(
      legend: const [
        _LegendItem(label: 'HR', color: Color(0xFFBE123C)),
        _LegendItem(label: 'SpO2', color: Color(0xFF7C3AED)),
        _LegendItem(label: 'RSSI', color: Color(0xFF0F766E)),
      ],
      painter: _PolarPainter(samples),
      empty: samples.length < 2,
    );
  }
}

class _ChartFrame extends StatelessWidget {
  const _ChartFrame({
    required this.legend,
    required this.painter,
    required this.empty,
  });

  final List<_LegendItem> legend;
  final CustomPainter painter;
  final bool empty;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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
            Wrap(spacing: 12, runSpacing: 6, children: legend),
            const SizedBox(height: 8),
            SizedBox(
              height: 176,
              child: empty
                  ? Center(
                      child: Text(
                        'Waiting for live packets',
                        style: theme.textTheme.labelMedium,
                      ),
                    )
                  : CustomPaint(painter: painter),
            ),
          ],
        ),
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({required this.label, required this.color});

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
        const SizedBox(width: 6),
        Text(label, style: Theme.of(context).textTheme.labelMedium),
      ],
    );
  }
}

class _GyroPainter extends CustomPainter {
  const _GyroPainter(this.samples);

  final List<M5TelemetrySample> samples;

  @override
  void paint(Canvas canvas, Size size) {
    _drawGrid(canvas, size);
    final values = <double>[
      for (final sample in samples) ...[
        sample.gyroX,
        sample.gyroY,
        sample.gyroZ,
      ],
    ];
    final range = _Range.from(values, minimumSpan: 1);
    _drawSeries(
      canvas,
      size,
      samples.map((sample) => sample.gyroX).toList(),
      range,
      const Color(0xFF2563EB),
    );
    _drawSeries(
      canvas,
      size,
      samples.map((sample) => sample.gyroY).toList(),
      range,
      const Color(0xFF16A34A),
    );
    _drawSeries(
      canvas,
      size,
      samples.map((sample) => sample.gyroZ).toList(),
      range,
      const Color(0xFFDC2626),
    );
  }

  @override
  bool shouldRepaint(covariant _GyroPainter oldDelegate) {
    return oldDelegate.samples != samples;
  }
}

class _PolarPainter extends CustomPainter {
  const _PolarPainter(this.samples);

  final List<PolarTelemetrySample> samples;

  @override
  void paint(Canvas canvas, Size size) {
    _drawGrid(canvas, size);
    _drawSeries(
      canvas,
      size,
      samples.map((sample) => sample.heartRateBpm.toDouble()).toList(),
      const _Range(40, 190),
      const Color(0xFFBE123C),
    );
    _drawNullableSeries(
      canvas,
      size,
      samples.map((sample) => sample.spo2Percent?.toDouble()).toList(),
      const _Range(80, 100),
      const Color(0xFF7C3AED),
    );
    _drawSeries(
      canvas,
      size,
      samples.map((sample) => (sample.rssi ?? -100).toDouble()).toList(),
      const _Range(-100, -30),
      const Color(0xFF0F766E),
    );
  }

  @override
  bool shouldRepaint(covariant _PolarPainter oldDelegate) {
    return oldDelegate.samples != samples;
  }
}

class _Range {
  const _Range(this.min, this.max);

  factory _Range.from(List<double> values, {required double minimumSpan}) {
    final rawMin = values.reduce(math.min);
    final rawMax = values.reduce(math.max);
    if ((rawMax - rawMin).abs() >= minimumSpan) {
      final padding = (rawMax - rawMin) * 0.12;
      return _Range(rawMin - padding, rawMax + padding);
    }
    return _Range(rawMin - minimumSpan, rawMax + minimumSpan);
  }

  final double min;
  final double max;
}

void _drawGrid(Canvas canvas, Size size) {
  final paint = Paint()
    ..color = const Color(0xFFE1EAF5)
    ..strokeWidth = 1;
  for (var i = 0; i <= 4; i += 1) {
    final y = size.height * i / 4;
    canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
  }
}

void _drawSeries(
  Canvas canvas,
  Size size,
  List<double> values,
  _Range range,
  Color color,
) {
  if (values.length < 2) {
    return;
  }
  final paint = Paint()
    ..color = color
    ..strokeWidth = 2.4
    ..style = PaintingStyle.stroke
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;
  final path = Path();
  for (var index = 0; index < values.length; index += 1) {
    final x = size.width * index / (values.length - 1);
    final ratio = ((values[index] - range.min) / (range.max - range.min)).clamp(
      0.0,
      1.0,
    );
    final y = size.height - ratio * size.height;
    if (index == 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  canvas.drawPath(path, paint);
}

void _drawNullableSeries(
  Canvas canvas,
  Size size,
  List<double?> values,
  _Range range,
  Color color,
) {
  if (values.whereType<double>().length < 2) {
    return;
  }
  final paint = Paint()
    ..color = color
    ..strokeWidth = 2.4
    ..style = PaintingStyle.stroke
    ..strokeCap = StrokeCap.round
    ..strokeJoin = StrokeJoin.round;
  final path = Path();
  var hasActiveSegment = false;
  for (var index = 0; index < values.length; index += 1) {
    final value = values[index];
    if (value == null) {
      hasActiveSegment = false;
      continue;
    }
    final x = size.width * index / (values.length - 1);
    final ratio = ((value - range.min) / (range.max - range.min)).clamp(
      0.0,
      1.0,
    );
    final y = size.height - ratio * size.height;
    if (!hasActiveSegment) {
      path.moveTo(x, y);
      hasActiveSegment = true;
    } else {
      path.lineTo(x, y);
    }
  }
  canvas.drawPath(path, paint);
}
