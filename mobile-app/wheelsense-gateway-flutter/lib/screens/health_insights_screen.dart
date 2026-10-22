import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:health/health.dart';
import 'package:intl/intl.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../services/health_data_source.dart';
import '../theme/app_palette.dart';
import '../widgets/product_ui.dart';

class HealthInsightsScreen extends StatelessWidget {
  const HealthInsightsScreen({
    super.key,
    required this.healthData,
    required this.onPolarStudio,
    this.previewAt,
  });

  final HealthDataSource healthData;
  final DateTime? previewAt;
  final VoidCallback onPolarStudio;

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    final preview = previewAt == null ? null : PreviewMetrics.at(previewAt!);
    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final state = snapshot.data ?? runtime.snapshot;
        final polar = state.latestPolarSample;
        final now = DateTime.now();
        final polarRecent =
            polar != null &&
            polar.heartRateBpm > 0 &&
            _isRecent(polar.timestamp, now);
        final polarHistory = state.polarHistory.where((record) {
          final elapsed = now.difference(record.timestamp);
          return record.heartRateBpm > 0 &&
              elapsed >= Duration.zero &&
              elapsed <= const Duration(minutes: 30);
        }).toList()..sort((a, b) => a.timestamp.compareTo(b.timestamp));

        final days = healthData.days;
        final hasSteps = days.any((day) => day.steps != null);
        final hasSleep = days.any((day) => day.sleepMinutes != null);
        final hasResting = days.any((day) => day.restingHeartRateBpm != null);
        final hasHeartRate = days.any((day) => day.heartRateBpm != null);
        final hasHrv = days.any((day) => day.heartRateVariabilityMs != null);
        final hasOxygen = days.any(
          (day) => day.oxygenSaturationPercent != null,
        );
        final hasRespiratory = days.any(
          (day) => day.respiratoryRatePerMinute != null,
        );
        final hasCalories = days.any((day) => day.activeCaloriesKcal != null);
        final hasDistance = days.any((day) => day.distanceM != null);
        final previewDays = preview?.days ?? const <PreviewDay>[];
        final stepValues = hasSteps
            ? days.map((day) => day.steps?.toDouble()).toList()
            : previewDays.map((day) => day.steps.toDouble()).toList();
        final sleepValues = hasSleep
            ? days.map((day) => day.sleepMinutes).toList()
            : previewDays.map((day) => day.sleepMinutes.toDouble()).toList();
        final restingValues = hasResting
            ? days.map((day) => day.restingHeartRateBpm).toList()
            : previewDays
                  .map((day) => day.restingHeartRateBpm.toDouble())
                  .toList();
        final heartRateValues = hasHeartRate
            ? days.map((day) => day.heartRateBpm).toList()
            : previewDays.map((day) => day.heartRateBpm.toDouble()).toList();
        final hrvValues = hasHrv
            ? days.map((day) => day.heartRateVariabilityMs).toList()
            : previewDays
                  .map((day) => day.heartRateVariabilityMs.toDouble())
                  .toList();
        final oxygenValues = hasOxygen
            ? days.map((day) => day.oxygenSaturationPercent).toList()
            : previewDays
                  .map((day) => day.oxygenSaturationPercent.toDouble())
                  .toList();
        final respiratoryValues = hasRespiratory
            ? days.map((day) => day.respiratoryRatePerMinute).toList()
            : previewDays
                  .map((day) => day.respiratoryRatePerMinute.toDouble())
                  .toList();
        final calorieValues = hasCalories
            ? days.map((day) => day.activeCaloriesKcal).toList()
            : previewDays
                  .map((day) => day.activeCaloriesKcal.toDouble())
                  .toList();
        final distanceValues = hasDistance
            ? days.map((day) => day.distanceM).toList()
            : previewDays.map((day) => day.distanceM).toList();

        final todaySteps = hasSteps
            ? (days.isEmpty ? null : days.last.steps)
            : preview?.steps;
        final lastSleepDay = _lastWith(days, (day) => day.sleepMinutes != null);
        final sleepMinutes =
            lastSleepDay?.sleepMinutes ?? preview?.sleepMinutes;
        final lastRestingDay = _lastWith(
          days,
          (day) => day.restingHeartRateBpm != null,
        );
        final resting =
            lastRestingDay?.restingHeartRateBpm ??
            (hasResting ? null : preview?.restingHeartRateBpm.toDouble());
        final hrv =
            _lastWith(
              days,
              (day) => day.heartRateVariabilityMs != null,
            )?.heartRateVariabilityMs ??
            (hasHrv ? null : preview?.heartRateVariabilityMs.toDouble());
        final oxygen =
            _lastWith(
              days,
              (day) => day.oxygenSaturationPercent != null,
            )?.oxygenSaturationPercent ??
            (hasOxygen ? null : preview?.oxygenSaturationPercent.toDouble());
        final respiratory =
            _lastWith(
              days,
              (day) => day.respiratoryRatePerMinute != null,
            )?.respiratoryRatePerMinute ??
            (hasRespiratory
                ? null
                : preview?.respiratoryRatePerMinute.toDouble());
        final calories =
            _lastWith(
              days,
              (day) => day.activeCaloriesKcal != null,
            )?.activeCaloriesKcal ??
            (hasCalories ? null : preview?.activeCaloriesKcal.toDouble());
        final distance =
            _lastWith(days, (day) => day.distanceM != null)?.distanceM ??
            (hasDistance ? null : previewDays.lastOrNull?.distanceM);
        final averageHeartRate =
            _lastWith(days, (day) => day.heartRateBpm != null)?.heartRateBpm ??
            (hasHeartRate ? null : preview?.heartRateBpm.toDouble());
        final t = context.text;
        final previewCaption = preview == null
            ? t.pick('No data', 'ไม่มีข้อมูล')
            : DateFormat('HH:mm:ss').format(preview.at.toLocal());
        final hasSleepStages = days.any(
          (day) =>
              day.sleepDeepMinutes != null ||
              day.sleepLightMinutes != null ||
              day.sleepRemMinutes != null ||
              day.sleepAwakeMinutes != null,
        );
        final stageDeep =
            _lastWith(
              days,
              (day) => day.sleepDeepMinutes != null,
            )?.sleepDeepMinutes ??
            preview?.sleepStages.sleepDeepMinutes.toDouble();
        final stageLight =
            _lastWith(
              days,
              (day) => day.sleepLightMinutes != null,
            )?.sleepLightMinutes ??
            preview?.sleepStages.sleepLightMinutes.toDouble();
        final stageRem =
            _lastWith(
              days,
              (day) => day.sleepRemMinutes != null,
            )?.sleepRemMinutes ??
            preview?.sleepStages.sleepRemMinutes.toDouble();
        final stageAwake =
            _lastWith(
              days,
              (day) => day.sleepAwakeMinutes != null,
            )?.sleepAwakeMinutes ??
            preview?.sleepStages.sleepAwakeMinutes.toDouble();
        final actualDates = days.map((day) => day.date).toList();
        final previewDates = previewDays.map((day) => day.date).toList();
        List<DateTime> datesFor(bool hasData) =>
            hasData ? actualDates : previewDates;
        final trendMetrics = <_TrendMetric>[
          _TrendMetric(
            title: t.pick('Steps', 'ก้าว'),
            unit: t.pick('steps', 'ก้าว'),
            source: hasSteps
                ? _source(healthData, HealthDataType.STEPS, t)
                : '',
            dates: datesFor(hasSteps),
            values: stepValues,
            type: HealthDataType.STEPS,
            isPreview: !hasSteps && preview != null,
            isTotal: true,
            color: AppPalette.brand,
          ),
          _TrendMetric(
            title: t.pick('Sleep duration', 'ระยะเวลานอน'),
            unit: '',
            source: hasSleep
                ? _source(healthData, HealthDataType.SLEEP_ASLEEP, t)
                : '',
            dates: datesFor(hasSleep),
            values: sleepValues,
            type: HealthDataType.SLEEP_ASLEEP,
            isPreview: !hasSleep && preview != null,
            isSleep: true,
            color: AppPalette.polarPpg,
          ),
          _TrendMetric(
            title: t.pick('Resting heart rate', 'ชีพจรขณะพัก'),
            unit: 'bpm',
            source: hasResting
                ? _source(healthData, HealthDataType.RESTING_HEART_RATE, t)
                : '',
            dates: datesFor(hasResting),
            values: restingValues,
            type: HealthDataType.RESTING_HEART_RATE,
            isPreview: !hasResting && preview != null,
            color: AppPalette.polarHeart,
          ),
          _TrendMetric(
            title: t.pick('Heart rate', 'ชีพจร'),
            unit: 'bpm',
            source: hasHeartRate
                ? _source(healthData, HealthDataType.HEART_RATE, t)
                : '',
            dates: datesFor(hasHeartRate),
            values: heartRateValues,
            type: HealthDataType.HEART_RATE,
            isPreview: !hasHeartRate && preview != null,
            color: AppPalette.polarHeart,
          ),
          _TrendMetric(
            title: 'HRV',
            unit: 'ms',
            source: hasHrv
                ? _sourceAny(healthData, const [
                    HealthDataType.HEART_RATE_VARIABILITY_RMSSD,
                    HealthDataType.HEART_RATE_VARIABILITY_SDNN,
                  ], t)
                : '',
            dates: datesFor(hasHrv),
            values: hrvValues,
            type: defaultTargetPlatform == TargetPlatform.iOS
                ? HealthDataType.HEART_RATE_VARIABILITY_SDNN
                : HealthDataType.HEART_RATE_VARIABILITY_RMSSD,
            isPreview: !hasHrv && preview != null,
            color: AppPalette.polarPpg,
          ),
          _TrendMetric(
            title: t.pick('Oxygen saturation', 'ออกซิเจนในเลือด'),
            unit: '%',
            source: hasOxygen
                ? _source(healthData, HealthDataType.BLOOD_OXYGEN, t)
                : '',
            dates: datesFor(hasOxygen),
            values: oxygenValues,
            type: HealthDataType.BLOOD_OXYGEN,
            isPreview: !hasOxygen && preview != null,
            color: AppPalette.brand,
          ),
          _TrendMetric(
            title: t.pick('Breathing rate', 'อัตราการหายใจ'),
            unit: t.pick('breaths/min', 'ครั้ง/นาที'),
            source: hasRespiratory
                ? _source(healthData, HealthDataType.RESPIRATORY_RATE, t)
                : '',
            dates: datesFor(hasRespiratory),
            values: respiratoryValues,
            type: HealthDataType.RESPIRATORY_RATE,
            isPreview: !hasRespiratory && preview != null,
            color: AppPalette.polarHeart,
          ),
          _TrendMetric(
            title: t.pick('Active calories', 'แคลอรีที่ใช้'),
            unit: 'kcal',
            source: hasCalories
                ? _source(healthData, HealthDataType.ACTIVE_ENERGY_BURNED, t)
                : '',
            dates: datesFor(hasCalories),
            values: calorieValues,
            type: HealthDataType.ACTIVE_ENERGY_BURNED,
            isPreview: !hasCalories && preview != null,
            isTotal: true,
            color: AppPalette.brand,
          ),
          _TrendMetric(
            title: t.pick('Distance', 'ระยะทาง'),
            unit: t.pick('meters', 'เมตร'),
            source: hasDistance
                ? _source(healthData, HealthDataType.DISTANCE_DELTA, t)
                : '',
            dates: datesFor(hasDistance),
            values: distanceValues,
            type: HealthDataType.DISTANCE_DELTA,
            isPreview: !hasDistance && preview != null,
            isTotal: true,
            color: AppPalette.brand,
          ),
        ];
        final todayCards =
            <
              ({
                String label,
                String value,
                String unit,
                String caption,
                String icon,
                Color tint,
                VoidCallback? onTap,
              })
            >[
              (
                label: t.pick('Steps today', 'ก้าววันนี้'),
                value: todaySteps == null
                    ? '—'
                    : NumberFormat.decimalPattern().format(todaySteps),
                unit: t.pick('steps', 'ก้าว'),
                caption: hasSteps
                    ? _source(healthData, HealthDataType.STEPS, t)
                    : previewCaption,
                icon: 'activity',
                tint: AppPalette.brand,
                onTap: null,
              ),
              (
                label: t.pick('Sleep', 'การนอน'),
                value: _sleepDuration(sleepMinutes),
                unit: '',
                caption: hasSleep
                    ? _source(healthData, HealthDataType.SLEEP_ASLEEP, t)
                    : previewCaption,
                icon: 'sleep',
                tint: AppPalette.polarPpg,
                onTap: null,
              ),
              (
                label: t.pick('Resting heart rate', 'ชีพจรขณะพัก'),
                value: resting?.toStringAsFixed(0) ?? '—',
                unit: 'bpm',
                caption: hasResting
                    ? _source(healthData, HealthDataType.RESTING_HEART_RATE, t)
                    : previewCaption,
                icon: 'heart',
                tint: AppPalette.polarHeart,
                onTap: null,
              ),
              (
                label: t.pick('Heart rate', 'ชีพจร'),
                value: averageHeartRate?.toStringAsFixed(0) ?? '—',
                unit: 'bpm',
                caption: hasHeartRate
                    ? _source(healthData, HealthDataType.HEART_RATE, t)
                    : previewCaption,
                icon: 'heart',
                tint: AppPalette.polarHeart,
                onTap: null,
              ),
              (
                label: 'HRV',
                value: hrv?.toStringAsFixed(0) ?? '—',
                unit: 'ms',
                caption: hasHrv
                    ? _sourceAny(healthData, const [
                        HealthDataType.HEART_RATE_VARIABILITY_RMSSD,
                        HealthDataType.HEART_RATE_VARIABILITY_SDNN,
                      ], t)
                    : previewCaption,
                icon: 'activity',
                tint: AppPalette.polarPpg,
                onTap: null,
              ),
              (
                label: t.pick('Oxygen', 'ออกซิเจน'),
                value: oxygen?.toStringAsFixed(0) ?? '—',
                unit: '%',
                caption: hasOxygen
                    ? _source(healthData, HealthDataType.BLOOD_OXYGEN, t)
                    : previewCaption,
                icon: 'health',
                tint: AppPalette.brand,
                onTap: null,
              ),
              (
                label: t.pick('Breathing rate', 'อัตราการหายใจ'),
                value: respiratory?.toStringAsFixed(0) ?? '—',
                unit: t.pick('breaths/min', 'ครั้ง/นาที'),
                caption: hasRespiratory
                    ? _source(healthData, HealthDataType.RESPIRATORY_RATE, t)
                    : previewCaption,
                icon: 'heart',
                tint: AppPalette.polarHeart,
                onTap: null,
              ),
              (
                label: t.pick('Active calories', 'แคลอรีที่ใช้'),
                value: calories?.toStringAsFixed(0) ?? '—',
                unit: 'kcal',
                caption: hasCalories
                    ? _source(
                        healthData,
                        HealthDataType.ACTIVE_ENERGY_BURNED,
                        t,
                      )
                    : previewCaption,
                icon: 'activity',
                tint: AppPalette.brand,
                onTap: null,
              ),
              (
                label: t.pick('Distance', 'ระยะทาง'),
                value: _distanceValue(distance),
                unit: _distanceUnit(distance, t),
                caption: hasDistance
                    ? _source(healthData, HealthDataType.DISTANCE_DELTA, t)
                    : previewCaption,
                icon: 'activity',
                tint: AppPalette.brand,
                onTap: null,
              ),
            ];

        return ProductPage(
          children: [
            ProductSectionHeading(
              title: t.pick('Today', 'วันนี้'),
              trailing: IconButton(
                onPressed: healthData.loading
                    ? null
                    : () => unawaited(healthData.refresh()),
                tooltip: t.pick('Refresh', 'รีเฟรช'),
                icon: healthData.loading
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const ProductIcon('chart'),
              ),
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, box) => SizedBox(
                height: MediaQuery.textScalerOf(context).scale(200),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final card in todayCards)
                        Padding(
                          padding: const EdgeInsets.only(right: 12),
                          child: SizedBox(
                            width: math.min(box.maxWidth * 0.74, 240),
                            child: ProductMetricCard(
                              label: card.label,
                              value: card.value,
                              unit: card.unit,
                              caption: card.caption,
                              icon: card.icon,
                              tint: card.tint,
                              onTap: card.onTap,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            if (hasSleepStages || preview != null) ...[
              const SizedBox(height: 20),
              _SleepStagesCard(
                deep: stageDeep,
                light: stageLight,
                rem: stageRem,
                awake: stageAwake,
                totalSleepMinutes: sleepMinutes,
                points: healthData.points,
                previewAt: previewAt,
                previewStages: preview?.sleepStages,
                sleepDate: lastSleepDay?.date ?? preview?.sleepStages.date,
              ),
            ],
            const SizedBox(height: 24),
            const SizedBox(height: 24),
            _HealthTrendsCarousel(
              metrics: trendMetrics,
              rawPoints: healthData.points,
              now: now,
              strings: t,
            ),
            const SizedBox(height: 24),
            ProductSectionHeading(
              title: 'Polar Verity Sense',
              trailing: IconButton(
                onPressed: onPolarStudio,
                tooltip: t.pick('Details', 'รายละเอียด'),
                icon: const ProductIcon('arrow', size: 20),
              ),
            ),
            const SizedBox(height: 12),
            _PolarHeartRateCard(
              latest: polar,
              recent: polarRecent,
              history: polarHistory,
              previewAt: previewAt,
            ),
          ],
        );
      },
    );
  }
}

class _PolarHeartRateCard extends StatelessWidget {
  const _PolarHeartRateCard({
    required this.latest,
    required this.recent,
    required this.history,
    required this.previewAt,
  });

  final PolarTelemetrySample? latest;
  final bool recent;
  final List<PolarTelemetrySample> history;
  final DateTime? previewAt;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final previewing = !recent && previewAt != null;
    final liveAt = previewAt ?? DateTime.now();
    final points = recent
        ? history
              .map(
                (sample) => _TimedValue(
                  sample.timestamp,
                  sample.heartRateBpm.toDouble(),
                ),
              )
              .toList()
        : previewing
        ? List.generate(31, (index) {
            final time = liveAt.subtract(Duration(minutes: 30 - index));
            return _TimedValue(
              time,
              PreviewMetrics.heartRateAt(time).toDouble(),
            );
          })
        : const <_TimedValue>[];
    final values = points.map((point) => point.value).toList();
    final minimum = values.isEmpty ? null : values.reduce(math.min).round();
    final maximum = values.isEmpty ? null : values.reduce(math.max).round();
    final shownRate = recent
        ? latest!.heartRateBpm
        : previewing
        ? PreviewMetrics.heartRateAt(liveAt)
        : null;

    return ProductSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const ProductIcon(
                'polar',
                color: AppPalette.polarHeart,
                size: 26,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  t.pick('Heart rate', 'ชีพจร'),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.end,
            spacing: 8,
            runSpacing: 8,
            children: [
              Text(
                shownRate?.toString() ?? '—',
                style: Theme.of(context).textTheme.displayLarge?.copyWith(
                  fontSize: 42,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  'bpm',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
          Text(
            recent
                ? DateFormat(
                    'dd MMM HH:mm:ss',
                  ).format(latest!.timestamp.toLocal())
                : previewing
                ? DateFormat('HH:mm:ss').format(liveAt.toLocal())
                : t.pick('No data', 'ไม่มีข้อมูล'),
            style: Theme.of(context).textTheme.labelSmall,
          ),
          const SizedBox(height: 12),
          Container(
            height: 136,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(12),
            ),
            child: points.length < 2
                ? Center(
                    child: Text(
                      t.pick('No data', 'ไม่มีข้อมูล'),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  )
                : CustomPaint(
                    painter: _HeartRateLinePainter(
                      points: points,
                      color: AppPalette.polarHeart,
                      gapTolerance: previewing
                          ? const Duration(minutes: 2)
                          : const Duration(seconds: 10),
                    ),
                    child: const SizedBox.expand(),
                  ),
          ),
          if (minimum != null && maximum != null) ...[
            const SizedBox(height: 8),
            Text(
              '$minimum–$maximum bpm · ${t.pick('last 30 min', '30 นาทีล่าสุด')}',
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ],
        ],
      ),
    );
  }
}

class _SleepStagesCard extends StatelessWidget {
  const _SleepStagesCard({
    required this.deep,
    required this.light,
    required this.rem,
    required this.awake,
    required this.totalSleepMinutes,
    required this.points,
    required this.previewAt,
    required this.previewStages,
    required this.sleepDate,
  });

  final double? deep, light, rem, awake;
  final double? totalSleepMinutes;
  final List<HealthDataPoint> points;
  final DateTime? previewAt;
  final PreviewDay? previewStages;
  final DateTime? sleepDate;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final stages = <_SleepStageSummary>[
      _SleepStageSummary(_SleepStage.deep, t.pick('Deep', 'หลับลึก'), deep),
      _SleepStageSummary(_SleepStage.rem, 'REM', rem),
      _SleepStageSummary(_SleepStage.light, t.pick('Light', 'หลับตื้น'), light),
      _SleepStageSummary(_SleepStage.awake, t.pick('Awake', 'ตื่น'), awake),
    ];
    final stageSleepMinutes = (deep ?? 0) + (light ?? 0) + (rem ?? 0);
    final asleepMinutes = totalSleepMinutes ?? stageSleepMinutes;
    final inBedMinutes = awake == null ? null : asleepMinutes + awake!;
    final efficiency = inBedMinutes == null || inBedMinutes == 0
        ? null
        : (asleepMinutes / inBedMinutes * 100).round();
    final segments = _sleepSegments(points, previewAt, previewStages);
    final sessionStart = segments.isNotEmpty
        ? segments.first.start
        : sleepDate ?? previewAt;
    final stageColors = Theme.of(context).colorScheme;
    final transitions = [
      for (var index = 1; index < segments.length; index++)
        if (segments[index - 1].end == segments[index].start &&
            segments[index - 1].stage != segments[index].stage)
          segments[index],
    ].length;
    final transitionsPerHour = asleepMinutes <= 0
        ? null
        : transitions / (asleepMinutes / 60);
    final firstAsleep = segments.indexWhere(
      (segment) => segment.stage != _SleepStage.awake,
    );
    final onsetMinutes = firstAsleep < 0
        ? null
        : segments[firstAsleep].start
              .difference(segments.first.start)
              .inMinutes
              .toDouble();

    return ProductSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.pick('SLEEP ARCHITECTURE', 'โครงสร้างการนอน'),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        letterSpacing: 1.1,
                        color: stageColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      t.pick('Sleep', 'การนอน'),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ],
                ),
              ),
              if (sessionStart != null) ...[
                const SizedBox(width: 8),
                Flexible(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      DateFormat('EEE, MMM d').format(sessionStart.toLocal()),
                      textAlign: TextAlign.end,
                      maxLines: 2,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: stageColors.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _sleepDuration(asleepMinutes),
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      t.pick('total sleep', 'เวลานอนรวม'),
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: stageColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      efficiency == null ? '—' : '$efficiency%',
                      textAlign: TextAlign.end,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(
                            color: AppPalette.brand,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    Text(
                      t.pick('sleep efficiency', 'ประสิทธิภาพการนอน'),
                      textAlign: TextAlign.end,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: stageColors.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 16,
            runSpacing: 6,
            children: [
              _SleepMetric(
                label: t.pick('In bed', 'บนเตียง'),
                value: _sleepDuration(inBedMinutes),
              ),
              _SleepMetric(
                label: t.pick('Awake', 'ตื่น'),
                value: _sleepDuration(awake),
              ),
              _SleepMetric(
                label: t.pick('Onset', 'เริ่มหลับ'),
                value: _sleepDuration(onsetMinutes),
              ),
              _SleepMetric(
                label: t.pick('Awakenings', 'ตื่นระหว่างคืน'),
                value: segments.isEmpty
                    ? '—'
                    : '${segments.where((item) => item.stage == _SleepStage.awake).length}',
              ),
              _SleepMetric(
                label: t.pick('Transitions', 'การเปลี่ยนช่วง'),
                value: transitionsPerHour == null
                    ? '—'
                    : '${transitionsPerHour.toStringAsFixed(1)}/h',
              ),
            ],
          ),
          if (segments.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text(
              t.pick('Hypnogram', 'กราฟช่วงการนอน'),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 158,
              width: double.infinity,
              child: CustomPaint(
                painter: _SleepHypnogramPainter(
                  segments: segments,
                  labels: [
                    t.pick('Awake', 'ตื่น'),
                    'REM',
                    t.pick('Light', 'หลับตื้น'),
                    t.pick('Deep', 'หลับลึก'),
                  ],
                  foreground: stageColors.onSurfaceVariant,
                  grid: stageColors.outlineVariant,
                ),
              ),
            ),
          ],
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Row(
              children: [
                for (final stage in stages.where(
                  (item) => item.minutes != null && item.minutes! > 0,
                ))
                  Expanded(
                    flex: stage.minutes!.round().clamp(1, 10000),
                    child: ColoredBox(
                      color: _sleepStageColor(stage.stage),
                      child: const SizedBox(height: 9),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          for (var index = 0; index < stages.length; index += 2) ...[
            Row(
              children: [
                Expanded(
                  child: _SleepStageTile(
                    stage: stages[index],
                    totalMinutes: asleepMinutes,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _SleepStageTile(
                    stage: stages[index + 1],
                    totalMinutes: asleepMinutes,
                  ),
                ),
              ],
            ),
            if (index + 2 < stages.length) const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

enum _SleepStage { awake, rem, light, deep }

class _SleepSegment {
  const _SleepSegment(this.stage, this.start, this.end);

  final _SleepStage stage;
  final DateTime start;
  final DateTime end;
}

class _SleepStageSummary {
  const _SleepStageSummary(this.stage, this.label, this.minutes);

  final _SleepStage stage;
  final String label;
  final double? minutes;
}

Color _sleepStageColor(_SleepStage stage) => switch (stage) {
  _SleepStage.awake => AppPalette.warning,
  _SleepStage.rem => AppPalette.polarPpg,
  _SleepStage.light => AppPalette.leftBright,
  _SleepStage.deep => AppPalette.left,
};

List<_SleepSegment> _sleepSegments(
  List<HealthDataPoint> points,
  DateTime? previewAt,
  PreviewDay? previewStages,
) {
  final actualStages = points.where((point) {
    return switch (point.type) {
      HealthDataType.SLEEP_DEEP ||
      HealthDataType.SLEEP_LIGHT ||
      HealthDataType.SLEEP_REM ||
      HealthDataType.SLEEP_AWAKE => true,
      _ => false,
    };
  }).toList()..sort((a, b) => a.dateFrom.compareTo(b.dateFrom));

  if (actualStages.isNotEmpty) {
    DateTime nightOf(HealthDataPoint point) {
      final night = point.dateTo.toLocal().subtract(const Duration(hours: 12));
      return DateTime(night.year, night.month, night.day);
    }

    final latestNight = actualStages
        .map(nightOf)
        .reduce((a, b) => a.isAfter(b) ? a : b);
    return [
      for (final point in actualStages.where(
        (point) => nightOf(point) == latestNight,
      ))
        _SleepSegment(
          switch (point.type) {
            HealthDataType.SLEEP_DEEP => _SleepStage.deep,
            HealthDataType.SLEEP_REM => _SleepStage.rem,
            HealthDataType.SLEEP_LIGHT => _SleepStage.light,
            _ => _SleepStage.awake,
          },
          point.dateFrom.toLocal(),
          point.dateTo.toLocal(),
        ),
    ];
  }

  if (previewAt == null || previewStages == null) return const [];
  final totals = <_SleepStage, double>{
    _SleepStage.deep: previewStages.sleepDeepMinutes.toDouble(),
    _SleepStage.rem: previewStages.sleepRemMinutes.toDouble(),
    _SleepStage.light: previewStages.sleepLightMinutes.toDouble(),
    _SleepStage.awake: previewStages.sleepAwakeMinutes.toDouble(),
  };
  final totalMinutes = totals.values.fold<double>(
    0,
    (sum, value) => sum + value,
  );
  if (totalMinutes <= 0) return const [];
  final pattern = [
    _SleepStage.light,
    _SleepStage.deep,
    _SleepStage.light,
    _SleepStage.rem,
    _SleepStage.light,
    _SleepStage.deep,
    _SleepStage.light,
    _SleepStage.rem,
    _SleepStage.light,
    _SleepStage.awake,
    _SleepStage.light,
  ];
  final remaining = Map<_SleepStage, int>.fromEntries(
    _SleepStage.values.map(
      (stage) => MapEntry(stage, pattern.where((item) => item == stage).length),
    ),
  );
  final today = previewAt.toLocal();
  var end = DateTime(today.year, today.month, today.day, 7, 15);
  if (end.isAfter(today)) end = end.subtract(const Duration(days: 1));
  var cursor = end.subtract(Duration(seconds: (totalMinutes * 60).round()));
  final result = <_SleepSegment>[];
  for (final stage in pattern) {
    final stageMinutes = totals[stage] ?? 0;
    final stageCount = remaining[stage] ?? 0;
    if (stageMinutes <= 0 || stageCount == 0) continue;
    final minutes = stageMinutes / stageCount;
    final duration = Duration(seconds: (minutes * 60).round());
    remaining[stage] = stageCount - 1;
    totals[stage] = stageMinutes - minutes;
    result.add(_SleepSegment(stage, cursor, cursor.add(duration)));
    cursor = cursor.add(duration);
  }
  return result;
}

class _SleepMetric extends StatelessWidget {
  const _SleepMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => RichText(
    text: TextSpan(
      style: Theme.of(context).textTheme.labelSmall,
      children: [
        TextSpan(
          text: '$label ',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        TextSpan(
          text: value,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurface,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

class _SleepStageTile extends StatelessWidget {
  const _SleepStageTile({required this.stage, required this.totalMinutes});

  final _SleepStageSummary stage;
  final double totalMinutes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percent =
        stage.stage == _SleepStage.awake ||
            totalMinutes == 0 ||
            stage.minutes == null
        ? null
        : (stage.minutes! / totalMinutes * 100).round();
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: _sleepStageColor(stage.stage),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(stage.label, style: theme.textTheme.labelMedium),
                  Text(
                    percent == null
                        ? _sleepDuration(stage.minutes)
                        : '${_sleepDuration(stage.minutes)} · $percent%',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SleepHypnogramPainter extends CustomPainter {
  const _SleepHypnogramPainter({
    required this.segments,
    required this.labels,
    required this.foreground,
    required this.grid,
  });

  final List<_SleepSegment> segments;
  final List<String> labels;
  final Color foreground;
  final Color grid;

  @override
  void paint(Canvas canvas, Size size) {
    if (segments.isEmpty) return;
    const left = 46.0;
    const right = 4.0;
    const top = 12.0;
    const gap = 29.0;
    const axisHeight = 24.0;
    final plotWidth = math.max(0, size.width - left - right);
    final plotBottom = top + gap * 3;
    final start = segments.first.start;
    final end = segments.last.end;
    final totalSeconds = math.max(1, end.difference(start).inSeconds);
    final stageOrder = [
      _SleepStage.awake,
      _SleepStage.rem,
      _SleepStage.light,
      _SleepStage.deep,
    ];
    double xAt(DateTime time) =>
        left + plotWidth * (time.difference(start).inSeconds / totalSeconds);
    double yAt(_SleepStage stage) => top + gap * stageOrder.indexOf(stage);

    final gridPaint = Paint()
      ..color = grid.withValues(alpha: 0.75)
      ..strokeWidth = 1;
    for (var index = 0; index < stageOrder.length; index++) {
      final y = top + gap * index;
      for (var x = left; x < left + plotWidth; x += 8) {
        canvas.drawLine(
          Offset(x, y),
          Offset(math.min(x + 3, left + plotWidth), y),
          gridPaint,
        );
      }
      _paintText(
        canvas,
        labels[index],
        Offset(0, y - 7),
        foreground,
        width: left - 7,
      );
    }

    for (var index = 0; index < segments.length; index++) {
      final segment = segments[index];
      final x1 = xAt(segment.start);
      final x2 = xAt(segment.end);
      final y = yAt(segment.stage);
      final color = _sleepStageColor(segment.stage);
      canvas.drawRect(
        Rect.fromLTRB(x1, y - 9, x2, y + 9),
        Paint()..color = color.withValues(alpha: 0.13),
      );
      canvas.drawLine(
        Offset(x1, y),
        Offset(x2, y),
        Paint()
          ..color = color
          ..strokeWidth = 3
          ..strokeCap = StrokeCap.round,
      );
      if (index > 0 && segments[index - 1].end == segment.start) {
        canvas.drawLine(
          Offset(x1, yAt(segments[index - 1].stage)),
          Offset(x1, y),
          Paint()
            ..color = color.withValues(alpha: 0.55)
            ..strokeWidth = 2,
        );
      }
    }

    for (var index = 0; index <= 4; index++) {
      final fraction = index / 4;
      final time = start.add(
        Duration(seconds: (totalSeconds * fraction).round()),
      );
      final label = DateFormat('HH:mm').format(time);
      final x = left + plotWidth * fraction;
      _paintText(
        canvas,
        label,
        Offset(x - 24, plotBottom + 8),
        foreground,
        width: 48,
        align: index == 0
            ? TextAlign.left
            : index == 4
            ? TextAlign.right
            : TextAlign.center,
      );
    }
    assert(plotBottom + axisHeight <= size.height + 1);
  }

  void _paintText(
    Canvas canvas,
    String value,
    Offset offset,
    Color color, {
    double width = 72,
    TextAlign align = TextAlign.left,
  }) {
    final painter = TextPainter(
      text: TextSpan(
        text: value,
        style: TextStyle(color: color, fontSize: 10),
      ),
      textDirection: ui.TextDirection.ltr,
      textAlign: align,
      maxLines: 1,
    )..layout(maxWidth: width);
    painter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _SleepHypnogramPainter oldDelegate) => true;
}

enum _TrendRange { day, week, month, year }

class _TrendMetric {
  const _TrendMetric({
    required this.title,
    required this.unit,
    required this.source,
    required this.dates,
    required this.values,
    required this.type,
    required this.color,
    this.isPreview = false,
    this.isTotal = false,
    this.isSleep = false,
  });

  final String title;
  final String unit;
  final String source;
  final List<DateTime> dates;
  final List<double?> values;
  final HealthDataType type;
  final Color color;
  final bool isPreview;
  final bool isTotal;
  final bool isSleep;
}

class _TrendPoint {
  const _TrendPoint(this.date, this.value);

  final DateTime date;
  final double? value;
}

class _HealthTrendsCarousel extends StatefulWidget {
  const _HealthTrendsCarousel({
    required this.metrics,
    required this.rawPoints,
    required this.now,
    required this.strings,
  });

  final List<_TrendMetric> metrics;
  final List<HealthDataPoint> rawPoints;
  final DateTime now;
  final GatewayStrings strings;

  @override
  State<_HealthTrendsCarousel> createState() => _HealthTrendsCarouselState();
}

class _HealthTrendsCarouselState extends State<_HealthTrendsCarousel> {
  final PageController _pages = PageController(viewportFraction: 0.92);
  _TrendRange _range = _TrendRange.week;
  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.strings;
    final rangeLabel = _rangeLabel(_range, t);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ProductSectionHeading(
          title: t.pick('Trends', 'แนวโน้ม'),
          trailing: Text('${_index + 1} / ${widget.metrics.length}'),
        ),
        const SizedBox(height: 10),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final range in _TrendRange.values)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(_rangeLabel(range, t)),
                    selected: range == _range,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _range = range),
                  ),
                ),
            ],
          ),
        ),
        SizedBox(
          height: MediaQuery.textScalerOf(context).scale(220),
          child: PageView.builder(
            controller: _pages,
            itemCount: widget.metrics.length,
            onPageChanged: (index) => setState(() => _index = index),
            itemBuilder: (context, index) {
              final metric = widget.metrics[index];
              final points = _trendPoints(
                metric,
                _range,
                widget.now,
                widget.rawPoints,
              );
              return Padding(
                padding: const EdgeInsets.only(right: 12),
                child: _TrendCard(
                  metric: metric,
                  range: _range,
                  rangeLabel: rangeLabel,
                  points: points,
                  summary: _trendSummaryFor(metric, _range, points, t),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _TrendCard extends StatelessWidget {
  const _TrendCard({
    required this.metric,
    required this.range,
    required this.rangeLabel,
    required this.points,
    required this.summary,
  });

  final _TrendMetric metric;
  final _TrendRange range;
  final String rangeLabel;
  final List<_TrendPoint> points;
  final String summary;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return ProductSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(metric.title, style: textTheme.titleMedium)),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  summary,
                  textAlign: TextAlign.end,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelLarge,
                ),
              ),
            ],
          ),
          if (metric.source.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(metric.source, style: textTheme.labelSmall),
          ],
          const SizedBox(height: 10),
          Semantics(
            label: '${metric.title} · $rangeLabel · ${points.length} points',
            child: ExcludeSemantics(
              child: SizedBox(
                height: 94,
                child: CustomPaint(
                  key: ValueKey(
                    'health-trend-${metric.title}-${range.name}-${points.length}',
                  ),
                  painter: _WeeklyBarsPainter(
                    values: points.map((point) => point.value).toList(),
                    color: metric.color,
                    gridColor: Theme.of(context).colorScheme.outlineVariant,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              for (var index = 0; index < points.length; index++)
                Expanded(
                  child: Text(
                    _showTrendLabel(index, points.length)
                        ? _trendDateLabel(points[index].date, range)
                        : '',
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: textTheme.labelSmall,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

String _rangeLabel(_TrendRange range, GatewayStrings t) => switch (range) {
  _TrendRange.day => t.pick('Day', 'วัน'),
  _TrendRange.week => t.pick('Week', 'สัปดาห์'),
  _TrendRange.month => t.pick('Month', 'เดือน'),
  _TrendRange.year => t.pick('Year', 'ปี'),
};

String _trendDateLabel(DateTime date, _TrendRange range) =>
    DateFormat(switch (range) {
      _TrendRange.day => 'ha',
      _TrendRange.week => 'EEE',
      _TrendRange.month => 'd',
      _TrendRange.year => 'MMM',
    }).format(date);

bool _showTrendLabel(int index, int count) {
  if (count <= 12 || index == count - 1) return true;
  return index % (count / 5).ceil() == 0;
}

String _trendSummaryFor(
  _TrendMetric metric,
  _TrendRange range,
  List<_TrendPoint> points,
  GatewayStrings t,
) {
  final values = points
      .map((point) => point.value)
      .whereType<double>()
      .toList();
  if (values.isEmpty) return t.pick('No data', 'ไม่มีข้อมูล');
  final value = metric.isTotal || (metric.isSleep && range == _TrendRange.day)
      ? values.reduce((a, b) => a + b)
      : values.reduce((a, b) => a + b) / values.length;
  if (metric.isSleep) {
    return '${_sleepDuration(value)} ${t.pick('avg', 'เฉลี่ย')}';
  }
  final amount = metric.type == HealthDataType.DISTANCE_DELTA
      ? '${_distanceValue(value)} ${_distanceUnit(value, t)}'
      : '${_number(value)} ${metric.unit}';
  return metric.isTotal
      ? '$amount ${t.pick('total', 'รวม')}'
      : '$amount ${t.pick('avg', 'เฉลี่ย')}';
}

List<_TrendPoint> _trendPoints(
  _TrendMetric metric,
  _TrendRange range,
  DateTime now,
  List<HealthDataPoint> rawPoints,
) {
  if (range == _TrendRange.day) {
    return metric.isPreview
        ? _previewHourlyPoints(metric, now)
        : _actualHourlyPoints(metric, now, rawPoints);
  }
  final today = DateTime(now.year, now.month, now.day);
  final valuesByDate = <DateTime, double?>{};
  for (var index = 0; index < metric.dates.length; index++) {
    final date = metric.dates[index];
    valuesByDate[DateTime(date.year, date.month, date.day)] =
        index < metric.values.length ? metric.values[index] : null;
  }
  if (range == _TrendRange.year) {
    return List.generate(12, (index) {
      final month = DateTime(now.year, now.month - (11 - index), 1);
      final nextMonth = DateTime(month.year, month.month + 1, 1);
      final values = valuesByDate.entries
          .where(
            (entry) =>
                !entry.key.isBefore(month) && entry.key.isBefore(nextMonth),
          )
          .map((entry) => entry.value)
          .whereType<double>()
          .toList();
      final value = values.isEmpty
          ? null
          : metric.isTotal
          ? values.reduce((a, b) => a + b)
          : values.reduce((a, b) => a + b) / values.length;
      return _TrendPoint(month, value);
    });
  }
  final count = range == _TrendRange.week ? 7 : 30;
  final firstDay = today.subtract(Duration(days: count - 1));
  return List.generate(count, (index) {
    final date = firstDay.add(Duration(days: index));
    return _TrendPoint(date, valuesByDate[date]);
  });
}

List<_TrendPoint> _previewHourlyPoints(_TrendMetric metric, DateTime now) {
  final day = metric.values.isEmpty ? null : metric.values.last;
  final date = DateTime(now.year, now.month, now.day);
  final elapsedHours = now.hour + 1;
  final weights = List.generate(24, (hour) {
    if (metric.isSleep) {
      return hour < 8 ? math.exp(-math.pow((hour - 3.5) / 3, 2)) : 0.0;
    }
    return math.exp(-math.pow((hour - 15) / 6, 2)) +
        0.4 * math.exp(-math.pow((hour - 9) / 2.5, 2));
  });
  final weightTotal = weights
      .take(elapsedHours)
      .fold<double>(0, (sum, value) => sum + value);
  return List.generate(24, (hour) {
    final start = date.add(Duration(hours: hour));
    if (hour > now.hour || day == null) return _TrendPoint(start, null);
    if (metric.isTotal) {
      return _TrendPoint(start, day * weights[hour] / weightTotal);
    }
    if (metric.isSleep) {
      return _TrendPoint(
        start,
        hour < 8
            ? day * weights[hour] / weights.take(8).reduce((a, b) => a + b)
            : 0,
      );
    }
    final amplitude = metric.type == HealthDataType.HEART_RATE ? 8.0 : 2.0;
    return _TrendPoint(
      start,
      day + amplitude * math.sin((hour / 24) * math.pi * 2 - math.pi / 2),
    );
  });
}

List<_TrendPoint> _actualHourlyPoints(
  _TrendMetric metric,
  DateTime now,
  List<HealthDataPoint> rawPoints,
) {
  final date = DateTime(now.year, now.month, now.day);
  final end = date.add(const Duration(days: 1));
  final points = rawPoints
      .where((point) => point.type == metric.type)
      .where(
        (point) => metric.isSleep
            ? point.dateFrom.toLocal().isBefore(end) &&
                  point.dateTo.toLocal().isAfter(date)
            : !point.dateTo.toLocal().isBefore(date) &&
                  point.dateTo.toLocal().isBefore(end),
      )
      .toList();
  return List.generate(24, (hour) {
    final start = date.add(Duration(hours: hour));
    final finish = start.add(const Duration(hours: 1));
    if (start.isAfter(now)) return _TrendPoint(start, null);
    if (metric.isSleep) {
      final minutes = points.fold<double>(0, (sum, point) {
        final from = point.dateFrom.toLocal().isAfter(start)
            ? point.dateFrom.toLocal()
            : start;
        final to = point.dateTo.toLocal().isBefore(finish)
            ? point.dateTo.toLocal()
            : finish;
        return sum + math.max(0, to.difference(from).inMinutes);
      });
      return _TrendPoint(start, minutes == 0 ? null : minutes);
    }
    final values = points
        .where((point) {
          final timestamp = point.dateTo.toLocal();
          return !timestamp.isBefore(start) && timestamp.isBefore(finish);
        })
        .map((point) => point.value)
        .whereType<NumericHealthValue>()
        .map((value) => value.numericValue.toDouble())
        .toList();
    final value = values.isEmpty
        ? null
        : metric.isTotal
        ? values.reduce((a, b) => a + b)
        : values.reduce((a, b) => a + b) / values.length;
    return _TrendPoint(start, value);
  });
}

class _WeeklyBarsPainter extends CustomPainter {
  const _WeeklyBarsPainter({
    required this.values,
    required this.color,
    required this.gridColor,
  });

  final List<double?> values;
  final Color color;
  final Color gridColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty || size.isEmpty) return;
    final plot = Rect.fromLTWH(4, 4, size.width - 8, size.height - 8);
    final guide = Paint()
      ..color = gridColor
      ..strokeWidth = 0.7;
    for (var i = 1; i <= 3; i++) {
      final y = plot.top + plot.height * i / 4;
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), guide);
    }
    final maxValue = math.max(
      1.0,
      values.whereType<double>().fold<double>(0, math.max),
    );
    final slotWidth = plot.width / values.length;
    final barWidth = math.min(18.0, slotWidth * 0.52);
    final barPaint = Paint()..color = color;
    for (var i = 0; i < values.length; i++) {
      final value = values[i];
      if (value == null) continue;
      final height = math.max(2.0, plot.height * value / maxValue);
      final left = plot.left + slotWidth * i + (slotWidth - barWidth) / 2;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(left, plot.bottom - height, barWidth, height),
          const Radius.circular(5),
        ),
        barPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _WeeklyBarsPainter old) =>
      old.values != values || old.color != color || old.gridColor != gridColor;
}

class _TimedValue {
  const _TimedValue(this.timestamp, this.value);

  final DateTime timestamp;
  final double value;
}

class _HeartRateLinePainter extends CustomPainter {
  const _HeartRateLinePainter({
    required this.points,
    required this.color,
    required this.gapTolerance,
  });

  final List<_TimedValue> points;
  final Color color;
  final Duration gapTolerance;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2 || size.isEmpty) return;
    const inset = 12.0;
    final plot = Rect.fromLTWH(
      inset,
      inset,
      math.max(1.0, size.width - inset * 2),
      math.max(1.0, size.height - inset * 2),
    );
    final values = points.map((point) => point.value).toList();
    final lower = math.max(0.0, values.reduce(math.min) - 5);
    final upper = values.reduce(math.max) + 5;
    final span = math.max(1.0, upper - lower);
    final guide = Paint()
      ..color = color.withValues(alpha: 0.14)
      ..strokeWidth = 0.8;
    for (var i = 1; i <= 3; i++) {
      final y = plot.top + plot.height * i / 4;
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), guide);
    }
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final point = points[i];
      final elapsed = point.timestamp
          .difference(points.first.timestamp)
          .inMilliseconds;
      final duration = math.max(
        1,
        points.last.timestamp.difference(points.first.timestamp).inMilliseconds,
      );
      final x = plot.left + plot.width * elapsed / duration;
      final y = plot.bottom - (point.value - lower) / span * plot.height;
      if (i == 0 ||
          point.timestamp.difference(points[i - 1].timestamp) > gapTolerance) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
    final last = points.last;
    final lastY = plot.bottom - (last.value - lower) / span * plot.height;
    canvas.drawCircle(Offset(plot.right, lastY), 4.5, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant _HeartRateLinePainter old) =>
      old.points != points ||
      old.color != color ||
      old.gapTolerance != gapTolerance;
}

bool _isRecent(DateTime timestamp, DateTime now) {
  final age = now.difference(timestamp);
  return age >= Duration.zero && age <= const Duration(minutes: 2);
}

HealthDayMetrics? _lastWith(
  List<HealthDayMetrics> days,
  bool Function(HealthDayMetrics) predicate,
) {
  for (final day in days.reversed) {
    if (predicate(day)) return day;
  }
  return null;
}

String _source(HealthDataSource source, HealthDataType type, GatewayStrings t) {
  final name = source.latest(type)?.sourceName.trim();
  if (name != null && name.isNotEmpty) return name;
  return source.hasAccess ? 'Health Connect' : t.pick('No data', 'ไม่มีข้อมูล');
}

String _sourceAny(
  HealthDataSource source,
  List<HealthDataType> types,
  GatewayStrings t,
) {
  HealthDataPoint? latest;
  for (final type in types) {
    final point = source.latest(type);
    if (point != null &&
        (latest == null || point.dateTo.isAfter(latest.dateTo))) {
      latest = point;
    }
  }
  final name = latest?.sourceName.trim();
  if (name != null && name.isNotEmpty) return name;
  return source.hasAccess ? 'Health Connect' : t.pick('No data', 'ไม่มีข้อมูล');
}

String _number(double? value) =>
    value == null ? '—' : NumberFormat.decimalPattern().format(value.round());

String _sleepDuration(double? minutes) {
  if (minutes == null) return '—';
  final rounded = minutes.round();
  return rounded >= 60 ? '${rounded ~/ 60}h ${rounded % 60}m' : '${rounded}m';
}

String _distanceValue(double? meters) => meters == null
    ? '—'
    : meters >= 1000
    ? (meters / 1000).toStringAsFixed(1)
    : meters.toStringAsFixed(0);

String _distanceUnit(double? meters, GatewayStrings t) => meters == null
    ? ''
    : meters >= 1000
    ? 'km'
    : t.pick('m', 'ม.');
