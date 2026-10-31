import 'package:flutter/foundation.dart';
import 'package:health/health.dart';
import 'package:permission_handler/permission_handler.dart';

class HealthDayMetrics {
  const HealthDayMetrics({
    required this.date,
    this.steps,
    this.sleepMinutes,
    this.restingHeartRateBpm,
    this.heartRateBpm,
    this.heartRateVariabilityMs,
    this.oxygenSaturationPercent,
    this.respiratoryRatePerMinute,
    this.activeCaloriesKcal,
    this.distanceM,
    this.sleepDeepMinutes,
    this.sleepLightMinutes,
    this.sleepRemMinutes,
    this.sleepAwakeMinutes,
  });

  final DateTime date;
  final int? steps;
  final double? sleepMinutes;
  final double? restingHeartRateBpm;
  final double? heartRateBpm;
  final double? heartRateVariabilityMs;
  final double? oxygenSaturationPercent;
  final double? respiratoryRatePerMinute;
  final double? activeCaloriesKcal;
  final double? distanceM;
  final double? sleepDeepMinutes;
  final double? sleepLightMinutes;
  final double? sleepRemMinutes;
  final double? sleepAwakeMinutes;
}

class HealthDataSource extends ChangeNotifier {
  static const healthTypes = <HealthDataType>[
    HealthDataType.STEPS,
    HealthDataType.SLEEP_ASLEEP,
    HealthDataType.RESTING_HEART_RATE,
    HealthDataType.HEART_RATE,
    HealthDataType.HEART_RATE_VARIABILITY_RMSSD,
    HealthDataType.HEART_RATE_VARIABILITY_SDNN,
    HealthDataType.BLOOD_OXYGEN,
    HealthDataType.RESPIRATORY_RATE,
    HealthDataType.ACTIVE_ENERGY_BURNED,
    HealthDataType.DISTANCE_DELTA,
    HealthDataType.SLEEP_DEEP,
    HealthDataType.SLEEP_LIGHT,
    HealthDataType.SLEEP_REM,
    HealthDataType.SLEEP_AWAKE,
  ];

  final Health _health = Health();
  List<HealthDataPoint> points = const [];
  List<HealthDayMetrics> days = const [];
  bool hasAccess = false;
  bool loading = false;
  bool failed = false;

  List<String> get sources => points
      .map((point) => point.sourceName.trim())
      .where((name) => name.isNotEmpty)
      .toSet()
      .take(3)
      .toList();

  HealthDataPoint? latest(HealthDataType type) {
    HealthDataPoint? result;
    for (final point in points.where((item) => item.type == type)) {
      if (result == null || point.dateTo.isAfter(result.dateTo)) result = point;
    }
    return result;
  }

  Future<void> refresh({bool requestAccess = false}) async {
    if (loading) return;
    loading = true;
    failed = false;
    notifyListeners();
    try {
      await _health.configure();
      final requestedTypes = healthTypes.where((type) {
        if (defaultTargetPlatform == TargetPlatform.android) {
          return type != HealthDataType.HEART_RATE_VARIABILITY_SDNN;
        }
        if (defaultTargetPlatform == TargetPlatform.iOS) {
          return type != HealthDataType.HEART_RATE_VARIABILITY_RMSSD;
        }
        return true;
      }).toList();
      if (requestAccess && defaultTargetPlatform == TargetPlatform.android) {
        await Permission.activityRecognition.request();
      }
      var granted = await _grantedTypes(requestedTypes);
      if (granted.isEmpty && requestAccess) {
        await _health.requestAuthorization(
          requestedTypes,
          permissions: List<HealthDataAccess>.filled(
            requestedTypes.length,
            HealthDataAccess.READ,
          ),
        );
        granted = await _grantedTypes(requestedTypes);
        if (granted.isEmpty && defaultTargetPlatform == TargetPlatform.iOS) {
          granted = requestedTypes;
        }
      }
      if (granted.isEmpty) {
        hasAccess = false;
        points = const [];
        days = const [];
        return;
      }

      final end = DateTime.now();
      final today = DateTime(end.year, end.month, end.day);
      final start = today.subtract(const Duration(days: 365));
      final rawPoints = <HealthDataPoint>[];
      for (final type in granted) {
        try {
          rawPoints.addAll(
            await _health.getHealthDataFromTypes(
              types: [type],
              startTime: start,
              endTime: end,
            ),
          );
        } on Object {
          continue;
        }
      }
      final unique = _health.removeDuplicates(rawPoints);
      final pointsByDay = <DateTime, List<HealthDataPoint>>{};
      final stepDays = <DateTime>{};
      for (final point in unique) {
        final local = point.dateTo.toLocal();
        final isSleep =
            point.type == HealthDataType.SLEEP_ASLEEP ||
            point.type == HealthDataType.SLEEP_DEEP ||
            point.type == HealthDataType.SLEEP_LIGHT ||
            point.type == HealthDataType.SLEEP_REM ||
            point.type == HealthDataType.SLEEP_AWAKE;
        final day = isSleep ? local.subtract(const Duration(hours: 12)) : local;
        final key = DateTime(day.year, day.month, day.day);
        (pointsByDay[key] ??= <HealthDataPoint>[]).add(point);
        if (point.type == HealthDataType.STEPS) {
          final from = point.dateFrom.toLocal();
          final to = point.dateTo.toLocal();
          var stepDay = DateTime(from.year, from.month, from.day);
          final lastStepDay = DateTime(to.year, to.month, to.day);
          while (!stepDay.isAfter(lastStepDay)) {
            stepDays.add(stepDay);
            stepDay = stepDay.add(const Duration(days: 1));
          }
        }
      }

      final daily = <HealthDayMetrics>[];
      for (var offset = 365; offset >= 0; offset--) {
        final date = today.subtract(Duration(days: offset));
        final nextDay = date.add(const Duration(days: 1));
        final dayPoints = pointsByDay[date] ?? const <HealthDataPoint>[];
        int? steps;
        if (stepDays.contains(date)) {
          steps = await _health.getTotalStepsInInterval(
            date,
            nextDay.isAfter(end) ? end : nextDay,
          );
        }

        final sleepRecords = dayPoints
            .where((point) => point.type == HealthDataType.SLEEP_ASLEEP)
            .toList();
        final sleepMinutes = sleepRecords.isEmpty
            ? _sumSleepStages(dayPoints)
            : _sumDurations(sleepRecords);

        final resting = _averageForDay(
          dayPoints,
          HealthDataType.RESTING_HEART_RATE,
        );
        final hrv = _averageForDay(
          dayPoints,
          _hasValues(dayPoints, HealthDataType.HEART_RATE_VARIABILITY_RMSSD)
              ? HealthDataType.HEART_RATE_VARIABILITY_RMSSD
              : HealthDataType.HEART_RATE_VARIABILITY_SDNN,
        );

        daily.add(
          HealthDayMetrics(
            date: date,
            steps: steps,
            sleepMinutes: sleepMinutes,
            restingHeartRateBpm: resting,
            heartRateBpm: _averageForDay(dayPoints, HealthDataType.HEART_RATE),
            heartRateVariabilityMs: hrv,
            oxygenSaturationPercent: _averageForDay(
              dayPoints,
              HealthDataType.BLOOD_OXYGEN,
            ),
            respiratoryRatePerMinute: _averageForDay(
              dayPoints,
              HealthDataType.RESPIRATORY_RATE,
            ),
            activeCaloriesKcal: _sumValues(
              dayPoints,
              HealthDataType.ACTIVE_ENERGY_BURNED,
            ),
            distanceM: _sumValues(dayPoints, HealthDataType.DISTANCE_DELTA),
            sleepDeepMinutes: _sumSleepStage(
              dayPoints,
              HealthDataType.SLEEP_DEEP,
            ),
            sleepLightMinutes: _sumSleepStage(
              dayPoints,
              HealthDataType.SLEEP_LIGHT,
            ),
            sleepRemMinutes: _sumSleepStage(
              dayPoints,
              HealthDataType.SLEEP_REM,
            ),
            sleepAwakeMinutes: _sumSleepStage(
              dayPoints,
              HealthDataType.SLEEP_AWAKE,
            ),
          ),
        );
      }

      hasAccess = true;
      points = unique;
      days = daily;
    } on Object {
      failed = true;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<List<HealthDataType>> _grantedTypes(
    List<HealthDataType> requestedTypes,
  ) async {
    final granted = <HealthDataType>[];
    for (final type in requestedTypes) {
      if (await _health.hasPermissions(
            [type],
            permissions: const [HealthDataAccess.READ],
          ) ??
          false) {
        granted.add(type);
      }
    }
    return granted;
  }

  double? _averageForDay(List<HealthDataPoint> points, HealthDataType type) {
    final values = points
        .where((point) => point.type == type)
        .map((point) => point.value)
        .whereType<NumericHealthValue>()
        .map((value) => value.numericValue.toDouble())
        .toList();
    return values.isEmpty
        ? null
        : values.reduce((a, b) => a + b) / values.length;
  }

  double? _sumValues(List<HealthDataPoint> points, HealthDataType type) {
    final values = points
        .where((point) => point.type == type)
        .map((point) => point.value)
        .whereType<NumericHealthValue>()
        .map((value) => value.numericValue.toDouble())
        .toList();
    return values.isEmpty ? null : values.reduce((a, b) => a + b);
  }

  bool _hasValues(List<HealthDataPoint> points, HealthDataType type) =>
      points.any((point) => point.type == type);

  double _sumDurations(List<HealthDataPoint> points) => points.fold<double>(
    0,
    (sum, point) => sum + point.dateTo.difference(point.dateFrom).inMinutes,
  );

  double? _sumSleepStages(List<HealthDataPoint> points) {
    final values = [
      _sumSleepStage(points, HealthDataType.SLEEP_DEEP),
      _sumSleepStage(points, HealthDataType.SLEEP_LIGHT),
      _sumSleepStage(points, HealthDataType.SLEEP_REM),
    ].whereType<double>().toList();
    return values.isEmpty ? null : values.reduce((a, b) => a + b);
  }

  double? _sumSleepStage(List<HealthDataPoint> points, HealthDataType type) {
    final records = points.where((point) => point.type == type).toList();
    return records.isEmpty ? null : _sumDurations(records);
  }
}
