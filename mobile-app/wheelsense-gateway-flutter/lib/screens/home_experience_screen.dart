import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/product_ui.dart';

class HomeExperienceScreen extends StatelessWidget {
  const HomeExperienceScreen({
    super.key,
    this.previewAt,
    required this.onDevices,
    required this.onHealth,
    required this.onPortal,
    required this.onSettings,
    required this.onMonitor,
    required this.onStartGateway,
  });

  final DateTime? previewAt;
  final VoidCallback onDevices,
      onHealth,
      onPortal,
      onSettings,
      onMonitor,
      onStartGateway;

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final s = snapshot.data ?? runtime.snapshot;
        final t = context.text;
        final polar = s.latestPolarSample;
        final m5 = s.latestM5Sample;
        final polarFresh =
            polar != null && polar.heartRateBpm > 0 && _fresh(polar.timestamp);
        final m5Fresh = m5 != null && _fresh(m5.timestamp);
        final preview = previewAt == null
            ? null
            : PreviewMetrics.at(previewAt!);
        final roomPrediction = s.latestRoomPrediction;
        final roomPredictionFresh =
            roomPrediction != null &&
            roomPrediction.roomName.trim().isNotEmpty &&
            _fresh(roomPrediction.timestamp);
        final currentRoom = roomPredictionFresh
            ? roomPrediction.roomName
            : preview?.currentLocation.roomName;
        final showPolarPreview = !polarFresh && preview != null;
        final showDistancePreview = !m5Fresh && preview != null;
        final polarTime = polar == null
            ? ''
            : DateFormat('HH:mm:ss').format(polar.timestamp.toLocal());
        final m5Time = m5 == null
            ? ''
            : DateFormat('HH:mm:ss').format(m5.timestamp.toLocal());
        final connectionCards = <Widget>[
          _ConnectionCard(
            icon: 'bluetooth',
            title: 'Bluetooth',
            detail: preview != null
                ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                : s.status.bleReady
                ? t.pick('Allowed', 'อนุญาตแล้ว')
                : t.pick('Not allowed', 'ยังไม่อนุญาต'),
            active: preview != null || s.status.bleReady,
            onTap: onDevices,
          ),
          _ConnectionCard(
            icon: 'cloud',
            title: t.pick('Server', 'เซิร์ฟเวอร์'),
            detail: preview != null
                ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                : !s.config.hasBroker
                ? t.pick('Set up', 'ตั้งค่า')
                : s.status.mqttReady
                ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                : t.pick('Offline', 'ออฟไลน์'),
            active:
                preview != null || (s.status.mqttReady && s.config.hasBroker),
            onTap: onSettings,
          ),
          _ConnectionCard(
            icon: 'person',
            title: t.pick('Patient', 'ผู้ป่วย'),
            detail: s.config.linkedPatientId == null
                ? t.pick('Unassigned', 'ยังไม่ระบุ')
                : t.patientId(s.config.linkedPatientId!),
            active: s.config.linkedPatientId != null,
            onTap: onPortal,
          ),
          _ConnectionCard(
            icon: 'activity',
            title: t.pick('Wheelchair sensor', 'เซนเซอร์รถเข็น'),
            detail: preview != null
                ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                : s.pairedM5Device?.displayName ?? t.pick('Pair', 'จับคู่'),
            active: preview != null || s.pairedM5Device != null,
            onTap: onDevices,
          ),
          _ConnectionCard(
            icon: 'heart',
            title: 'Polar Verity Sense',
            detail: preview != null
                ? t.pick('Connected', 'เชื่อมต่อแล้ว')
                : s.pairedPolarDevice?.name ?? t.pick('Pair', 'จับคู่'),
            active: preview != null || s.pairedPolarDevice != null,
            onTap: onDevices,
          ),
        ];

        return ProductPage(
          children: [
            ProductSectionHeading(
              title: t.pick('Latest readings', 'ข้อมูลล่าสุด'),
              trailing: IconButton(
                onPressed: onMonitor,
                tooltip: t.navMonitor,
                icon: const ProductIcon('chart'),
              ),
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, box) {
                final cards = <Widget>[
                  ProductMetricCard(
                    label: t.pick('Heart rate', 'ชีพจร'),
                    value: polarFresh
                        ? polar.heartRateBpm.toString()
                        : showPolarPreview
                        ? preview.heartRateBpm.toString()
                        : '—',
                    unit: 'bpm',
                    caption: polarFresh
                        ? 'Polar · $polarTime'
                        : showPolarPreview
                        ? DateFormat('HH:mm:ss').format(previewAt!.toLocal())
                        : t.pick('No data', 'ไม่มีข้อมูล'),
                    icon: 'heart',
                    tint: AppPalette.polarHeart,
                    onTap: onHealth,
                  ),
                  ProductMetricCard(
                    label: t.pick('Distance', 'ระยะทาง'),
                    value: m5Fresh && m5.hasDistance
                        ? m5.distanceM.toStringAsFixed(1)
                        : showDistancePreview
                        ? preview.distanceM.toStringAsFixed(1)
                        : '—',
                    unit: 'm',
                    caption: m5Fresh && m5.hasDistance
                        ? 'M5 · $m5Time'
                        : showDistancePreview
                        ? DateFormat('HH:mm:ss').format(previewAt!.toLocal())
                        : t.pick('No data', 'ไม่มีข้อมูล'),
                    icon: 'activity',
                    tint: AppPalette.brand,
                    onTap: onMonitor,
                  ),
                ];
                if (box.maxWidth >= 600 ||
                    MediaQuery.textScalerOf(context).scale(1) > 1.3) {
                  final width = box.maxWidth >= 600
                      ? (box.maxWidth - 12) / 2
                      : box.maxWidth;
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final card in cards)
                        SizedBox(width: width, child: card),
                    ],
                  );
                }
                return SizedBox(
                  height: 162,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.only(right: 4),
                    itemCount: cards.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) => SizedBox(
                      width: box.maxWidth * 0.68,
                      child: cards[index],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            ProductSectionHeading(
              title: t.pick('Connections & devices', 'อุปกรณ์และการเชื่อมต่อ'),
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (context, box) {
                final cardHeight =
                    150.0 *
                    MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.4);
                if (box.maxWidth >= 760) {
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final card in connectionCards)
                        SizedBox(
                          width: (box.maxWidth - 48) / 5,
                          height: cardHeight,
                          child: card,
                        ),
                    ],
                  );
                }
                return SizedBox(
                  height: cardHeight,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.only(right: 4),
                    itemCount: connectionCards.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) => SizedBox(
                      width: (box.maxWidth - 24).clamp(240.0, 280.0),
                      child: connectionCards[index],
                    ),
                  ),
                );
              },
            ),
            if (preview == null &&
                !polarFresh &&
                !m5Fresh &&
                s.config.setupCompleted) ...[
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: onStartGateway,
                icon: const ProductIcon('bluetooth', size: 18),
                label: Text(t.pick('Reconnect', 'เชื่อมต่ออีกครั้ง')),
              ),
            ],
            if (currentRoom != null) ...[
              const SizedBox(height: 24),
              ProductSectionHeading(
                title: t.pick('Current location', 'ตำแหน่งปัจจุบัน'),
              ),
              const SizedBox(height: 12),
              ProductSurface(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const ProductIcon('scan', color: AppPalette.brand),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            currentRoom,
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                        ),
                        if (roomPredictionFresh)
                          Text(
                            '${(roomPrediction.confidence * 100).round()}%',
                            style: Theme.of(context).textTheme.labelLarge,
                          )
                        else if (preview != null)
                          Text(
                            '${preview.currentLocation.rssi} dBm',
                            style: Theme.of(context).textTheme.labelLarge,
                          ),
                      ],
                    ),
                    if (!roomPredictionFresh && preview != null) ...[
                      const SizedBox(height: 12),
                      SizedBox(
                        height:
                            90.0 *
                            MediaQuery.textScalerOf(
                              context,
                            ).scale(1).clamp(1.0, 1.5),
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.only(right: 4),
                          itemCount: preview.locations.length,
                          separatorBuilder: (_, _) => const SizedBox(width: 10),
                          itemBuilder: (context, index) => SizedBox(
                            width: 166,
                            child: _LocationCard(
                              location: preview.locations[index],
                              active:
                                  preview.locations[index] ==
                                  preview.currentLocation,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
            if (s.alerts.isNotEmpty) ...[
              const SizedBox(height: 24),
              ProductSectionHeading(title: t.pick('Alerts', 'แจ้งเตือน')),
              const SizedBox(height: 12),
              SizedBox(
                height: 156,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.only(right: 4),
                  itemCount: s.alerts.take(3).length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (context, index) {
                    final alert = s.alerts[index];
                    return SizedBox(
                      width: 256,
                      child: ProductSurface(
                        onTap: onPortal,
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              alert.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 5),
                            Expanded(
                              child: Text(
                                alert.description,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              DateFormat(
                                'dd MMM HH:mm',
                              ).format(alert.timestamp.toLocal()),
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
            const SizedBox(height: 24),
            ProductSurface(
              onTap: onPortal,
              child: Row(
                children: [
                  const ProductIcon('care', size: 28, color: AppPalette.brand),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      t.pick('Care portal', 'พอร์ทัลการดูแล'),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  const ProductIcon('arrow', size: 20),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  bool _fresh(DateTime time) {
    final age = DateTime.now().difference(time);
    return age >= Duration.zero && age <= const Duration(minutes: 2);
  }
}

class _ConnectionCard extends StatelessWidget {
  const _ConnectionCard({
    required this.icon,
    required this.title,
    required this.detail,
    required this.active,
    required this.onTap,
  });
  final String icon, title, detail;
  final bool active;
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
            ProductIcon(icon, color: Theme.of(context).colorScheme.primary),
            const Spacer(),
            ProductIcon(
              active ? 'check' : 'arrow',
              size: 18,
              color: active
                  ? AppPalette.brand
                  : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ],
        ),
        const Spacer(),
        Text(
          title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(
            context,
          ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 3),
        Text(
          detail,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
  );
}

class _LocationCard extends StatelessWidget {
  const _LocationCard({required this.location, required this.active});
  final PreviewLocation location;
  final bool active;

  @override
  Widget build(BuildContext context) => ProductSurface(
    padding: const EdgeInsets.all(11),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Row(
          children: [
            ProductIcon(
              active ? 'check' : 'scan',
              size: 18,
              color: active
                  ? AppPalette.brand
                  : Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                location.nodeName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge,
              ),
            ),
          ],
        ),
        const SizedBox(height: 5),
        Row(
          children: [
            Expanded(
              child: Text(
                location.roomName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                '${location.rssi} dBm',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.end,
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}
