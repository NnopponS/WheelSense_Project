import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../services/health_data_source.dart';
import '../widgets/calm_care_ui.dart';
import '../widgets/product_ui.dart';

class DeviceHubScreen extends StatelessWidget {
  const DeviceHubScreen({
    super.key,
    required this.healthData,
    required this.onHealth,
    this.previewAt,
    required this.onManagePairing,
    required this.onMonitor,
    required this.onPolarStudio,
    required this.onNodeRadar,
    required this.onSettings,
    this.onPairBelt,
  });
  final HealthDataSource healthData;
  final DateTime? previewAt;
  final VoidCallback onManagePairing,
      onMonitor,
      onPolarStudio,
      onNodeRadar,
      onSettings,
      onHealth;

  /// Opens pairing on the FallGuard Belt tab; falls back to [onManagePairing].
  final VoidCallback? onPairBelt;

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final s = snapshot.data ?? runtime.snapshot;
        final t = context.text;
        final preview = previewAt == null
            ? null
            : PreviewMetrics.at(previewAt!);
        final polar = s.latestPolarSample;
        final beltDevice = s.pairedBeltM5Device;
        final wheelchairDevice = s.pairedWheelchairM5Device;
        final beltM5 = beltDevice == null
            ? null
            : s.latestM5SampleByDeviceId[beltDevice.id];
        final wheelchairM5 = wheelchairDevice == null
            ? null
            : s.latestM5SampleByDeviceId[wheelchairDevice.id];
        final polarRecent = polar != null && _isRecent(polar.timestamp);
        final beltRecent = beltM5 != null && _isRecent(beltM5.timestamp);
        final wheelchairRecent =
            wheelchairM5 != null && _isRecent(wheelchairM5.timestamp);
        // Each M5 slot is active only while its own relay is running.
        final beltActive =
            beltDevice != null && s.m5ConnectedDeviceIds.contains(beltDevice.id);
        final wheelchairActive =
            wheelchairDevice != null &&
            s.m5ConnectedDeviceIds.contains(wheelchairDevice.id);
        final polarPaired = s.pairedPolarDevice != null;
        // Preview shows every sensor; otherwise only the ones paired here.
        final sensorCards = <Widget>[
          if (preview != null || wheelchairActive)
            _SensorCard(
              title: t.pick('Wheelchair sensor', 'เซนเซอร์รถเข็น'),
              image: 'assets/devices/m5stickcplus2.png',
              paired: wheelchairActive,
              previewConnected: preview != null && !beltActive,
              battery: wheelchairActive ? wheelchairM5?.batteryPercent : null,
              signal: wheelchairActive ? wheelchairDevice?.rssi : null,
              lastSeen: wheelchairActive ? wheelchairM5?.timestamp : null,
              note: beltActive
                  ? t.pick(
                      'Running alongside the FallGuard Belt.',
                      'ทำงานควบคู่กับเข็มขัด FallGuard',
                    )
                  : null,
              reading: wheelchairRecent && wheelchairM5!.stepCount != null
                  ? t.pick(
                      '${wheelchairM5.stepCount} steps',
                      '${wheelchairM5.stepCount} ก้าว',
                    )
                  : wheelchairRecent && wheelchairM5!.hasDistance
                  ? '${wheelchairM5.distanceM.toStringAsFixed(1)} m'
                  : !wheelchairRecent && preview != null
                  ? '${preview.distanceM.toStringAsFixed(1)} m'
                  : null,
              readingIsPreview:
                  !wheelchairRecent && preview != null && !beltActive,
              onManage: onManagePairing,
              onDetails: onMonitor,
            ),
          if (preview != null || beltActive)
            _SensorCard(
              title: t.pick('FallGuard Belt', 'เข็มขัด FallGuard'),
              image: 'assets/devices/fallguard_belt.png',
              paired: beltActive,
              previewConnected: preview != null && !wheelchairActive,
              battery: beltActive ? beltM5?.batteryPercent : null,
              signal: beltActive ? beltDevice?.rssi : null,
              lastSeen: beltActive ? beltM5?.timestamp : null,
              note: wheelchairActive
                  ? t.pick(
                      'Running alongside the wheelchair sensor.',
                      'ทำงานควบคู่กับเซนเซอร์รถเข็น',
                    )
                  : null,
              reading: beltRecent && beltM5!.stepCount != null
                  ? t.pick(
                      '${beltM5.stepCount} steps',
                      '${beltM5.stepCount} ก้าว',
                    )
                  : !beltActive && preview != null
                  ? t.pick('${preview.steps} steps', '${preview.steps} ก้าว')
                  : null,
              readingIsPreview: !beltActive && preview != null,
              onManage: onPairBelt ?? onManagePairing,
              onDetails: onMonitor,
            ),
          if (preview != null || polarPaired)
            _SensorCard(
              title: 'Polar Verity Sense',
              image: 'assets/devices/polar_verity_sense.png',
              paired: polarPaired,
              previewConnected: preview != null,
              battery: s.latestPolarSample?.sensorBatteryPercent,
              signal: s.latestPolarSample?.rssi ?? s.pairedPolarDevice?.rssi,
              lastSeen: s.latestPolarSample?.timestamp,
              reading: polarRecent
                  ? '${polar.heartRateBpm} bpm'
                  : preview == null
                  ? null
                  : '${preview.heartRateBpm} bpm',
              readingIsPreview: !polarRecent && preview != null,
              note: null,
              onManage: onManagePairing,
              onDetails: onPolarStudio,
            ),
        ];
        final connected = preview != null
            ? sensorCards.length
            : (wheelchairActive && wheelchairRecent ? 1 : 0) +
                  (beltActive && beltRecent ? 1 : 0) +
                  (polarPaired && polarRecent ? 1 : 0);
        return ProductPage(
          children: [
            // Same charcoal + mint pair as Home, so every tab feels related.
            CalmCareSplitCards(
              dark: CalmCareSplitItem(
                icon: Icons.sensors_rounded,
                label: t.pick('Sensors', 'เซนเซอร์'),
                text: sensorCards.isEmpty
                    ? t.pick('No devices yet', 'ยังไม่มีอุปกรณ์')
                    : t.pick(
                        '$connected of ${sensorCards.length} connected',
                        'เชื่อมต่อแล้ว $connected จาก ${sensorCards.length}',
                      ),
                onTap: onManagePairing,
              ),
              light: CalmCareSplitItem(
                icon: Icons.bluetooth_rounded,
                label: 'Bluetooth',
                text: preview != null
                    ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                    : s.status.bleReady
                    ? t.pick('Allowed', 'อนุญาตแล้ว')
                    : t.pick('Not allowed', 'ยังไม่อนุญาต'),
                onTap: onManagePairing,
              ),
            ),
            const SizedBox(height: 20),
            ProductSectionHeading(title: t.pick('Health data', 'ข้อมูลสุขภาพ')),
            const SizedBox(height: 12),
            AnimatedBuilder(
              animation: healthData,
              builder: (context, _) => _HealthConnectionCard(
                healthData: healthData,
                onHealth: onHealth,
                previewConnected: preview != null,
              ),
            ),
            const SizedBox(height: 24),
            ProductSectionHeading(
              title: t.pick('Sensors', 'เซนเซอร์'),
              trailing: IconButton(
                onPressed: onManagePairing,
                tooltip: t.pick('Add device', 'เพิ่มอุปกรณ์'),
                icon: const ProductIcon('add'),
              ),
            ),
            const SizedBox(height: 12),
            if (sensorCards.isEmpty)
              _NoDevicesCard(onAdd: onManagePairing)
            else
              LayoutBuilder(
                builder: (context, box) {
                  final width = box.maxWidth >= 620
                      ? (box.maxWidth - 12) / 2
                      : box.maxWidth;
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final card in sensorCards)
                        SizedBox(width: width, child: card),
                    ],
                  );
                },
              ),
            const SizedBox(height: 24),
            ProductSectionHeading(title: t.pick('Tools', 'เครื่องมือ')),
            const SizedBox(height: 12),
            CalmCareToolTile(
              title: t.pick('Node radar', 'เรดาร์โหนด'),
              subtitle: t.pick(
                'Nearby room nodes and signal',
                'โหนดในห้องใกล้เคียงและความแรงสัญญาณ',
              ),
              icon: Icons.radar_rounded,
              onTap: onNodeRadar,
            ),
            const SizedBox(height: 12),
            CalmCareToolTile(
              title: t.pick('Gateway settings', 'ตั้งค่าเกตเวย์'),
              subtitle: t.pick(
                'Server, gateway ID and sign-in',
                'เซิร์ฟเวอร์ รหัสเกตเวย์ และการเข้าสู่ระบบ',
              ),
              icon: Icons.tune_rounded,
              onTap: onSettings,
            ),
          ],
        );
      },
    );
  }

  bool _isRecent(DateTime timestamp) {
    final age = DateTime.now().difference(timestamp);
    return age >= Duration.zero && age <= const Duration(minutes: 2);
  }
}

class _NoDevicesCard extends StatelessWidget {
  const _NoDevicesCard({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final theme = Theme.of(context);
    return ProductSurface(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          ProductIconBadge(
            'bluetooth',
            tint: theme.colorScheme.primary,
            size: 56,
          ),
          const SizedBox(height: 14),
          Text(
            t.pick('No devices yet', 'ยังไม่มีอุปกรณ์'),
            style: theme.textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            t.pick(
              'Add the wheelchair sensor, FallGuard Belt or Polar Verity Sense.',
              'เพิ่มเซนเซอร์รถเข็น เข็มขัด FallGuard หรือ Polar Verity Sense',
            ),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onAdd,
              icon: const ProductIcon('add'),
              label: Text(t.pick('Add device', 'เพิ่มอุปกรณ์')),
            ),
          ),
        ],
      ),
    );
  }
}

class _HealthConnectionCard extends StatelessWidget {
  const _HealthConnectionCard({
    required this.healthData,
    required this.onHealth,
    required this.previewConnected,
  });

  final HealthDataSource healthData;
  final VoidCallback onHealth;
  final bool previewConnected;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    return ProductSurface(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              ProductIconBadge(
                'health',
                tint: Theme.of(context).colorScheme.primary,
                size: 48,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Google Health',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      healthData.sources.isEmpty
                          ? 'Fitbit · Health Connect'
                          : healthData.sources.join(' · '),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 8),
                    ProductStatusPill(
                      label: healthData.hasAccess || previewConnected
                          ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                          : t.pick('Not connected', 'ยังไม่เชื่อมต่อ'),
                      positive: healthData.hasAccess || previewConnected,
                      compact: true,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.tonal(
                  onPressed: healthData.loading
                      ? null
                      : () {
                          unawaited(
                            healthData.refresh(
                              requestAccess: !healthData.hasAccess,
                            ),
                          );
                        },
                  child: healthData.loading
                      // Spinner takes the button's text colour so it stays
                      // visible on the charcoal pill.
                      ? Builder(
                          builder: (context) => SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: DefaultTextStyle.of(context).style.color,
                            ),
                          ),
                        )
                      : Text(
                          healthData.hasAccess
                              ? t.pick('Refresh', 'รีเฟรช')
                              : t.pick('Connect', 'เชื่อมต่อ'),
                        ),
                ),
              ),
              const SizedBox(width: 10),
              IconButton.outlined(
                onPressed: onHealth,
                tooltip: t.pick('Health details', 'ข้อมูลสุขภาพ'),
                icon: const ProductIcon('arrow', size: 20),
              ),
            ],
          ),
          if (healthData.failed) ...[
            const SizedBox(height: 8),
            Text(
              t.pick('Unable to connect', 'เชื่อมต่อไม่สำเร็จ'),
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SensorCard extends StatelessWidget {
  const _SensorCard({
    required this.title,
    required this.image,
    required this.paired,
    required this.previewConnected,
    required this.battery,
    required this.signal,
    required this.lastSeen,
    required this.reading,
    required this.readingIsPreview,
    required this.onManage,
    required this.onDetails,
    this.note,
  });
  final String title, image;

  /// One line of context, e.g. that two sensors share a connection.
  final String? note;
  final bool paired, previewConnected;
  final int? battery, signal;
  final DateTime? lastSeen;
  final String? reading;
  final bool readingIsPreview;
  final VoidCallback onManage, onDetails;

  @override
  Widget build(BuildContext context) {
    final t = context.text;
    final age = lastSeen == null ? null : DateTime.now().difference(lastSeen!);
    final recent =
        age != null &&
        age >= Duration.zero &&
        age <= const Duration(minutes: 2);
    final status = previewConnected
        ? t.pick('Connected', 'เชื่อมต่อแล้ว')
        : !paired
        ? t.pick('Not paired', 'ยังไม่จับคู่')
        : recent
        ? t.pick('Receiving', 'กำลังรับข้อมูล')
        : t.pick('Paired', 'จับคู่แล้ว');
    return ProductSurface(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              InkWell(
                onTap: onDetails,
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: 96,
                  height: 86,
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainer,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Image.asset(
                    image,
                    fit: BoxFit.contain,
                    semanticLabel: title,
                    errorBuilder: (_, _, _) =>
                        const ProductIcon('devices', size: 40),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    ProductStatusPill(
                      label: status,
                      positive: recent || previewConnected,
                      compact: true,
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (note != null) ...[
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.info_outline_rounded,
                  size: 16,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    note!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ],
            ),
          ],
          if (reading != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                ProductIcon(
                  readingIsPreview ? 'eye' : 'activity',
                  size: 16,
                  color: readingIsPreview
                      ? Theme.of(context).colorScheme.secondary
                      : Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    reading!,
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ),
              ],
            ),
          ],
          if (paired &&
              (battery != null || signal != null || lastSeen != null)) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: [
                if (battery != null)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const ProductIcon('battery', size: 17),
                      const SizedBox(width: 4),
                      Text(
                        '$battery%',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                if (signal != null)
                  Text(
                    '$signal dBm',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                if (lastSeen != null)
                  Text(
                    DateFormat('dd MMM HH:mm').format(lastSeen!.toLocal()),
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.tonal(
                  onPressed: previewConnected ? onDetails : onManage,
                  child: Text(
                    previewConnected
                        ? t.pick('View data', 'ดูข้อมูล')
                        : paired
                        ? t.pick('Manage', 'จัดการ')
                        : t.pick('Pair device', 'จับคู่อุปกรณ์'),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              IconButton.outlined(
                onPressed: onDetails,
                tooltip: t.pick('Details', 'รายละเอียด'),
                icon: const ProductIcon('arrow', size: 20),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
