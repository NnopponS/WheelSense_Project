import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';

class RssiRoomScanScreen extends StatefulWidget {
  const RssiRoomScanScreen({super.key});

  @override
  State<RssiRoomScanScreen> createState() => _RssiRoomScanScreenState();
}

class _RssiRoomScanScreenState extends State<RssiRoomScanScreen> {
  final List<RoomScanPoint> _scanPoints = <RoomScanPoint>[];
  StreamSubscription<BleDeviceSnapshot>? _scanSubscription;
  bool _scanning = false;

  @override
  void dispose() {
    _scanSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final best = _scanPoints.isEmpty
        ? null
        : _scanPoints.reduce((a, b) => a.confidence >= b.confidence ? a : b);
    return ClinicalPage(
      trailing: FilledButton.icon(
        onPressed: _scanning ? null : _startScan,
        icon: const Icon(Icons.play_arrow),
        label: Text(_scanning ? 'Scanning' : 'Start scan'),
      ),
      children: [
        ResponsiveGrid(
          children: [
            MetricTile(
              metric: MetricSnapshot(
                label: 'Current room',
                value: best?.room ?? 'Unknown',
                detail: best == null
                    ? 'No RSSI window yet'
                    : '${(best.confidence * 100).round()}% confidence',
                icon: Icons.meeting_room_outlined,
              ),
            ),
            MetricTile(
              metric: MetricSnapshot(
                label: 'RSSI samples',
                value: '${_scanPoints.length}',
                detail: 'Mobile-side BLE scan',
                icon: Icons.timeline,
                severity: ClinicalSeverity.info,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SectionPanel(
          title: 'RSSI room scan',
          subtitle: 'Live room confidence from nearby BLE nodes.',
          child: Column(
            children: [
              if (_scanPoints.isEmpty)
                const CompactRowCard(
                  icon: Icons.radar,
                  title: 'No scan data',
                  subtitle: 'Start a scan to collect RSSI observations.',
                  meta: 'Ready',
                  severity: ClinicalSeverity.info,
                ),
              for (final point in _scanPoints) ...[
                _RoomConfidenceRow(point: point),
                if (point != _scanPoints.last) const SizedBox(height: 10),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _startScan() async {
    final runtime = GatewayServicesScope.of(context);
    final config = await runtime.loadConfig();
    setState(() {
      _scanPoints.clear();
      _scanning = true;
    });
    await _scanSubscription?.cancel();
    _scanSubscription = runtime
        .scanBleDevices(config)
        .listen(
          (device) {
            if (!mounted) {
              return;
            }
            final confidence = max(0.35, min(0.98, (100 + device.rssi) / 70));
            setState(() {
              _scanPoints.removeWhere((point) => point.room == device.id);
              _scanPoints.add(
                RoomScanPoint(
                  room: device.name,
                  beaconCount: max(1, device.serviceUuids.length),
                  bestRssi: device.rssi,
                  confidence: confidence.toDouble(),
                ),
              );
            });
          },
          onDone: () {
            if (mounted) {
              setState(() => _scanning = false);
            }
          },
          onError: (_) {
            if (mounted) {
              setState(() => _scanning = false);
            }
          },
        );
  }
}

class _RoomConfidenceRow extends StatelessWidget {
  const _RoomConfidenceRow({required this.point});

  final RoomScanPoint point;

  @override
  Widget build(BuildContext context) {
    final severity = point.confidence >= 0.85
        ? ClinicalSeverity.normal
        : point.confidence >= 0.7
        ? ClinicalSeverity.warning
        : ClinicalSeverity.info;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CompactRowCard(
          icon: Icons.location_searching,
          title: point.room,
          subtitle:
              '${point.beaconCount} beacons  |  best ${point.bestRssi} dBm',
          meta: '${(point.confidence * 100).round()}%',
          severity: severity,
        ),
        const SizedBox(height: 6),
        LinearProgressIndicator(value: point.confidence),
      ],
    );
  }
}
