import 'dart:math' as math;

class PreviewMetrics {
  const PreviewMetrics({
    required this.at,
    required this.heartRateBpm,
    required this.distanceM,
    required this.steps,
    required this.restingHeartRateBpm,
    required this.sleepMinutes,
    required this.days,
    required this.locations,
    required this.heartRateVariabilityMs,
    required this.oxygenSaturationPercent,
    required this.respiratoryRatePerMinute,
    required this.activeCaloriesKcal,
    required this.sleepStages,
  });

  factory PreviewMetrics.at(DateTime time) {
    final today = DateTime(time.year, time.month, time.day);
    final secondsOfDay = time.hour * 3600 + time.minute * 60 + time.second;
    final minuteOfDay = secondsOfDay / 60;
    final locationNames = List.generate(4, (index) => 'Room 0${index + 1}');
    final strongest =
        (time.millisecondsSinceEpoch ~/ 6000) % locationNames.length;
    final locations = List.generate(
      locationNames.length,
      (index) => PreviewLocation(
        nodeId: 'SIM_NODE_0${index + 1}',
        roomName: locationNames[index],
        rssi:
            -75 -
            ((index - strongest + locationNames.length) %
                    locationNames.length) *
                4,
      ),
    );
    const historyDays = 365;
    final days = List.generate(historyDays + 1, (index) {
      final isToday = index == historyDays;
      final date = today.subtract(Duration(days: historyDays - index));
      final dayNumber =
          date.millisecondsSinceEpoch ~/ Duration.millisecondsPerDay;
      return PreviewDay(
        date: date,
        steps: isToday
            ? (3820 + minuteOfDay * 5).round()
            : 4300 + (dayNumber * 37 % 1900),
        distanceM: isToday
            ? 2750 + minuteOfDay * 3.6
            : 3200 + dayNumber * 43 % 2300,
        sleepMinutes: isToday
            ? 420 + (math.sin(time.millisecondsSinceEpoch / 30000) * 6).round()
            : 370 + (dayNumber * 11 % 90),
        restingHeartRateBpm: 58 + dayNumber * 13 % 8,
        heartRateBpm: isToday ? heartRateAt(time) : 70 + dayNumber * 7 % 13,
        heartRateVariabilityMs: isToday
            ? 48 + (math.sin(time.millisecondsSinceEpoch / 9000) * 4).round()
            : 42 + dayNumber * 5 % 16,
        oxygenSaturationPercent: isToday
            ? 97 + (math.sin(time.millisecondsSinceEpoch / 11000) * 0.8).round()
            : 96 + dayNumber % 3,
        respiratoryRatePerMinute: isToday
            ? 15 + (math.sin(time.millisecondsSinceEpoch / 13000)).round()
            : 14 + dayNumber % 3,
        activeCaloriesKcal: isToday
            ? (125 + minuteOfDay * 1.7).round()
            : 180 + dayNumber * 29 % 280,
        sleepDeepMinutes: 82 + dayNumber * 3 % 24,
        sleepLightMinutes: 178 + dayNumber * 11 % 42,
        sleepRemMinutes: 94 + dayNumber * 7 % 28,
        sleepAwakeMinutes: 24 + dayNumber * 5 % 18,
      );
    });
    return PreviewMetrics(
      at: time,
      heartRateBpm: heartRateAt(time),
      distanceM: 820 + secondsOfDay * 0.1,
      steps: days.last.steps,
      restingHeartRateBpm:
          62 + (math.sin(time.millisecondsSinceEpoch / 11000)).round(),
      sleepMinutes: days.last.sleepMinutes.toDouble(),
      days: days,
      locations: locations,
      heartRateVariabilityMs: days.last.heartRateVariabilityMs,
      oxygenSaturationPercent: days.last.oxygenSaturationPercent,
      respiratoryRatePerMinute: days.last.respiratoryRatePerMinute,
      activeCaloriesKcal: days.last.activeCaloriesKcal,
      sleepStages: days.last,
    );
  }

  final DateTime at;
  final int heartRateBpm;
  final double distanceM;
  final int steps;
  final int restingHeartRateBpm;
  final double sleepMinutes;
  final List<PreviewDay> days;
  final List<PreviewLocation> locations;
  final int heartRateVariabilityMs;
  final int oxygenSaturationPercent;
  final int respiratoryRatePerMinute;
  final int activeCaloriesKcal;
  final PreviewDay sleepStages;

  PreviewLocation get currentLocation =>
      locations.reduce((a, b) => a.rssi > b.rssi ? a : b);

  static int heartRateAt(DateTime time) {
    final seconds = time.millisecondsSinceEpoch / 1000;
    return 72 +
        (5 * math.sin(seconds / 6) + 2 * math.sin(seconds / 17)).round();
  }
}

class PreviewDay {
  const PreviewDay({
    required this.date,
    required this.steps,
    required this.distanceM,
    required this.sleepMinutes,
    required this.restingHeartRateBpm,
    required this.heartRateBpm,
    required this.heartRateVariabilityMs,
    required this.oxygenSaturationPercent,
    required this.respiratoryRatePerMinute,
    required this.activeCaloriesKcal,
    required this.sleepDeepMinutes,
    required this.sleepLightMinutes,
    required this.sleepRemMinutes,
    required this.sleepAwakeMinutes,
  });

  final DateTime date;
  final int steps;
  final double distanceM;
  final int sleepMinutes;
  final int restingHeartRateBpm;
  final int heartRateBpm;
  final int heartRateVariabilityMs;
  final int oxygenSaturationPercent;
  final int respiratoryRatePerMinute;
  final int activeCaloriesKcal;
  final int sleepDeepMinutes;
  final int sleepLightMinutes;
  final int sleepRemMinutes;
  final int sleepAwakeMinutes;
}

class PreviewLocation {
  const PreviewLocation({
    required this.nodeId,
    required this.roomName,
    required this.rssi,
  });

  final String nodeId;
  final String roomName;
  final int rssi;

  String get nodeName => 'Node ${nodeId.split('_').last}';
}
