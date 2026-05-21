import 'package:flutter/material.dart';

enum ClinicalSeverity { normal, warning, critical, info }

class MetricSnapshot {
  const MetricSnapshot({
    required this.label,
    required this.value,
    required this.detail,
    required this.icon,
    this.severity = ClinicalSeverity.normal,
  });

  final String label;
  final String value;
  final String detail;
  final IconData icon;
  final ClinicalSeverity severity;
}

class DeviceCandidate {
  const DeviceCandidate({
    required this.name,
    required this.deviceId,
    required this.rssi,
    required this.room,
    required this.batteryPercent,
    required this.lastSeen,
  });

  final String name;
  final String deviceId;
  final int rssi;
  final String room;
  final int batteryPercent;
  final String lastSeen;
}

class RoomScanPoint {
  const RoomScanPoint({
    required this.room,
    required this.beaconCount,
    required this.bestRssi,
    required this.confidence,
  });

  final String room;
  final int beaconCount;
  final int bestRssi;
  final double confidence;
}

class GatewayAlert {
  const GatewayAlert({
    required this.title,
    required this.detail,
    required this.time,
    required this.severity,
    required this.actionLabel,
  });

  final String title;
  final String detail;
  final String time;
  final ClinicalSeverity severity;
  final String actionLabel;
}

class DiagnosticCheck {
  const DiagnosticCheck({
    required this.name,
    required this.status,
    required this.detail,
    required this.severity,
  });

  final String name;
  final String status;
  final String detail;
  final ClinicalSeverity severity;
}
