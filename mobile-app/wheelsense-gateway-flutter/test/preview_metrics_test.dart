import 'package:flutter_test/flutter_test.dart';
import 'package:wheelsense_gateway_flutter/models/preview_metrics.dart';

void main() {
  test('preview locations select the strongest node and rotate over time', () {
    final first = PreviewMetrics.at(DateTime(2026, 10, 19, 12));
    final later = PreviewMetrics.at(DateTime(2026, 10, 19, 12, 0, 6));

    expect(first.locations, hasLength(4));
    expect(first.days, hasLength(366));
    expect(first.days.first.date, DateTime(2025, 10, 19));
    expect(first.days.last.date, DateTime(2026, 10, 19));
    expect(
      first.locations.map((location) => location.nodeId).toSet(),
      hasLength(4),
    );
    expect(
      first.currentLocation,
      first.locations.reduce((a, b) => a.rssi > b.rssi ? a : b),
    );
    expect(later.currentLocation.nodeId, isNot(first.currentLocation.nodeId));
  });
}
