import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/sensor_telemetry.dart';
import '../l10n/gateway_localizations.dart';
import 'product_ui.dart';

class KinematicsCard extends StatelessWidget {
  const KinematicsCard({super.key, required this.sample});

  final M5TelemetrySample? sample;

  @override
  Widget build(BuildContext context) {
    final sample = this.sample;
    final t = context.text;
    if (sample == null) {
      return ProductSurface(
        child: Text(t.pick('No M5 data', 'ไม่มีข้อมูล M5')),
      );
    }

    final distM = sample.distanceM;
    final direction = sample.direction ?? 0;
    final metrics = [
      ProductStat(
        label: t.pick('Speed', 'ความเร็ว'),
        value: sample.speedKmh.toStringAsFixed(1),
        unit: 'km/h',
        note: '${sample.velocityMs.toStringAsFixed(2)} m/s',
      ),
      ProductStat(
        label: t.pick('Distance', 'ระยะทาง'),
        value: distM >= 1000
            ? (distM / 1000).toStringAsFixed(2)
            : distM.toStringAsFixed(1),
        unit: distM >= 1000 ? 'km' : 'm',
        note: t.pick('Odometer', 'ระยะสะสม'),
      ),
      ProductStat(
        label: t.pick('Acceleration', 'ความเร่ง'),
        value: sample.accelMs2.toStringAsFixed(2),
        unit: 'm/s²',
        note: t.pick('Magnitude', 'ขนาด'),
      ),
    ];

    return ProductSurface(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ProductSectionHeading(
            title: t.pick('Movement', 'การเคลื่อนไหว'),
            subtitle: DateFormat.Hms().format(sample.timestamp.toLocal()),
            trailing: ProductStatusPill(
              compact: true,
              positive: direction > 0,
              icon: direction > 0
                  ? Icons.arrow_upward_rounded
                  : direction < 0
                  ? Icons.arrow_downward_rounded
                  : Icons.pause_rounded,
              label: direction > 0
                  ? t.pick('Forward', 'เดินหน้า')
                  : direction < 0
                  ? t.pick('Reverse', 'ถอยหลัง')
                  : t.pick('Stationary', 'หยุดนิ่ง'),
            ),
          ),
          const SizedBox(height: 20),
          LayoutBuilder(
            builder: (context, constraints) {
              const gap = 16.0;
              final columns = constraints.maxWidth >= 420 ? 3 : 2;
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
        ],
      ),
    );
  }
}
