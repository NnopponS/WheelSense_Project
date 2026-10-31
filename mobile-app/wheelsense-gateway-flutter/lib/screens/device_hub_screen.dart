import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../services/health_data_source.dart';
import '../theme/app_palette.dart';
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
  });
  final HealthDataSource healthData;
  final DateTime? previewAt;
  final VoidCallback onManagePairing,
      onMonitor,
      onPolarStudio,
      onNodeRadar,
      onSettings,
      onHealth;

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
        final m5 = s.latestM5Sample;
        final polarRecent = polar != null && _isRecent(polar.timestamp);
        final m5Recent = m5 != null && _isRecent(m5.timestamp);
        final sensorCards = <Widget>[
          _SensorCard(
            title: t.pick('Wheelchair sensor', 'เซนเซอร์รถเข็น'),
            image: 'assets/devices/m5stickcplus2.png',
            paired: s.pairedM5Device != null,
            previewConnected: preview != null,
            battery: s.latestM5Sample?.batteryPercent,
            signal: s.pairedM5Device?.rssi,
            lastSeen: s.latestM5Sample?.timestamp,
            reading: m5Recent && m5.hasDistance
                ? '${m5.distanceM.toStringAsFixed(1)} m'
                : !m5Recent && preview != null
                ? '${preview.distanceM.toStringAsFixed(1)} m'
                : null,
            readingIsPreview: !m5Recent && preview != null,
            onManage: onManagePairing,
            onDetails: onMonitor,
          ),
          _SensorCard(
            title: 'Polar Verity Sense',
            image: 'assets/devices/polar_verity_sense.png',
            paired: s.pairedPolarDevice != null,
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
            onManage: onManagePairing,
            onDetails: onPolarStudio,
          ),
        ];
        return ProductPage(
          children: [
            ProductSurface(
              onTap: onManagePairing,
              child: Row(
                children: [
                  ProductIcon(
                    'bluetooth',
                    color: Theme.of(context).colorScheme.primary,
                    size: 28,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Bluetooth',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  Flexible(
                    child: Text(
                      preview != null
                          ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                          : s.status.bleReady
                          ? t.pick('Allowed', 'อนุญาตแล้ว')
                          : t.pick('Not allowed', 'ยังไม่อนุญาต'),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const ProductIcon('arrow', size: 18),
                ],
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
            LayoutBuilder(
              builder: (context, box) {
                final textScale = MediaQuery.textScalerOf(context).scale(1);
                if (box.maxWidth >= 620 || textScale > 1.3) {
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
                }
                return SizedBox(
                  height: 300 * textScale.clamp(1.0, 1.5),
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.only(right: 4),
                    itemCount: sensorCards.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) => SizedBox(
                      width: (box.maxWidth - 24).clamp(240.0, 340.0).toDouble(),
                      child: sensorCards[index],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            ProductSectionHeading(title: t.pick('Tools', 'เครื่องมือ')),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, box) {
                final textScale = MediaQuery.textScalerOf(context).scale(1);
                final cards = <Widget>[
                  _ToolRow(
                    icon: 'scan',
                    name: t.pick('Node radar', 'เรดาร์โหนด'),
                    onTap: onNodeRadar,
                  ),
                  _ToolRow(
                    icon: 'settings',
                    name: t.pick('Gateway settings', 'ตั้งค่าเกตเวย์'),
                    onTap: onSettings,
                  ),
                ];
                final columns = box.maxWidth >= 620 || textScale <= 1.3 ? 2 : 1;
                final width = columns == 1
                    ? box.maxWidth
                    : (box.maxWidth - 12) / 2;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final card in cards)
                      SizedBox(
                        width: width,
                        height: 116.0 * textScale.clamp(1.0, 1.35),
                        child: card,
                      ),
                  ],
                );
              },
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
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Center(
                  child: ProductIcon(
                    'health',
                    color: AppPalette.brand,
                    size: 38,
                  ),
                ),
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
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
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
  });
  final String title, image;
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
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: 84,
                  height: 96,
                  padding: const EdgeInsets.all(7),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(12),
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
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
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

class _ToolRow extends StatelessWidget {
  const _ToolRow({required this.icon, required this.name, required this.onTap});
  final String icon, name;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ProductSurface(
    onTap: onTap,
    padding: const EdgeInsets.all(14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            ProductIcon(icon, size: 22, color: AppPalette.brand),
            const Spacer(),
            const ProductIcon('arrow', size: 18),
          ],
        ),
        const Spacer(),
        Text(
          name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(
            context,
          ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}
