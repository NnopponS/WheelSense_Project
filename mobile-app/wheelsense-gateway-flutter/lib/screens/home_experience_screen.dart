import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/preview_metrics.dart';
import '../services/gateway_services.dart';
import '../theme/app_palette.dart';
import '../widgets/calm_care_ui.dart';
import '../widgets/product_ui.dart';

class HomeExperienceScreen extends StatefulWidget {
  const HomeExperienceScreen({
    super.key,
    this.previewAt,
    required this.onDevices,
    required this.onHealth,
    required this.onPortal,
    required this.onSettings,
    required this.onMonitor,
    required this.onStartGateway,
    this.onQuickSettings,
  });

  final DateTime? previewAt;
  final VoidCallback onDevices,
      onHealth,
      onPortal,
      onSettings,
      onMonitor,
      onStartGateway;

  /// Opens the avatar's quick settings (theme, language, preview data).
  final VoidCallback? onQuickSettings;

  @override
  State<HomeExperienceScreen> createState() => _HomeExperienceScreenState();
}

/// Home sections the filter pills can show.
enum _HomeFilter { overview, readings, devices, safety }

class _HomeExperienceScreenState extends State<HomeExperienceScreen> {
  var _filter = _HomeFilter.overview;

  DateTime? get previewAt => widget.previewAt;
  VoidCallback get onDevices => widget.onDevices;
  VoidCallback get onHealth => widget.onHealth;
  VoidCallback get onPortal => widget.onPortal;
  VoidCallback get onSettings => widget.onSettings;
  VoidCallback get onMonitor => widget.onMonitor;
  VoidCallback get onStartGateway => widget.onStartGateway;

  bool _shows(_HomeFilter section) =>
      _filter == _HomeFilter.overview || _filter == section;

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
            title: s.pairedBeltM5Device == null &&
                    s.pairedWheelchairM5Device != null
                ? t.pick('Wheelchair sensor', 'เซนเซอร์รถเข็น')
                : s.pairedWheelchairM5Device != null
                ? t.pick('Belt + Wheelchair', 'เข็มขัด + วีลแชร์')
                : t.pick('FallGuard Belt', 'เข็มขัด FallGuard'),
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
        final fallEvents = s.fallHistory.isNotEmpty
            ? s.fallHistory
            : s.latestFallEvent == null
            ? const <FallAlertEvent>[]
            : <FallAlertEvent>[s.latestFallEvent!];
        final recentFallEvents = fallEvents.reversed.take(5);

        final patient = s.config.linkedPatientId == null
            ? null
            : t.patientId(s.config.linkedPatientId!);
        final fallActive = s.latestFallEvent?.kind == FallAlertKind.detected;
        final m5Linked = preview != null || s.pairedM5Device != null;
        final polarLinked = preview != null || s.pairedPolarDevice != null;
        final linkedCount = (m5Linked ? 1 : 0) + (polarLinked ? 1 : 0);
        final activeConnections = connectionCards
            .whereType<_ConnectionCard>()
            .where((card) => card.active)
            .length;

        return ProductPage(
          children: [
            CalmCareGreetingHeader(
              greeting: patient == null
                  ? t.pick('Hello!', 'สวัสดี!')
                  : t.pick('Hello, $patient', 'สวัสดี $patient'),
              hasAlerts: s.alerts.isNotEmpty || fallActive,
              bellTooltip: s.alerts.isNotEmpty || fallActive
                  ? t.pick('New alerts', 'มีการแจ้งเตือนใหม่')
                  : t.pick('Alerts', 'แจ้งเตือน'),
              onBellTap: () => setState(() => _filter = _HomeFilter.safety),
              avatarTooltip: t.pick('Quick settings', 'ตั้งค่าด่วน'),
              onAvatarTap: widget.onQuickSettings ?? onPortal,
            ),
            const SizedBox(height: 16),
            CalmCareStatusPill(
              label: t.pick(
                '$activeConnections of ${connectionCards.length} connections active',
                'เชื่อมต่ออยู่ $activeConnections จาก ${connectionCards.length}',
              ),
              icon: Icons.bluetooth_connected_rounded,
              onTap: () => setState(() => _filter = _HomeFilter.devices),
            ),
            const SizedBox(height: 16),
            CalmCareSplitCards(
              dark: CalmCareSplitItem(
                icon: fallActive
                    ? Icons.warning_amber_rounded
                    : Icons.sentiment_satisfied_alt_rounded,
                text: fallActive
                    ? t.pick(
                        'Fall alert active. Check on the wearer.',
                        'ตรวจพบการล้ม โปรดตรวจสอบผู้สวมใส่',
                      )
                    : m5Linked
                    ? t.pick(
                        'Safe, active and monitored today.',
                        'ปลอดภัย คล่องตัว และได้รับการดูแลวันนี้',
                      )
                    : t.pick(
                        'Sensors on standby for now.',
                        'เซนเซอร์อยู่ในโหมดสแตนด์บาย',
                      ),
                onTap: onMonitor,
              ),
              light: CalmCareSplitItem(
                icon: Icons.place_rounded,
                text: currentRoom != null
                    ? t.pick(
                        'Now in $currentRoom.',
                        'ตอนนี้อยู่ที่ $currentRoom',
                      )
                    : t.pick(
                        'Pair devices to see where you are.',
                        'จับคู่อุปกรณ์เพื่อดูตำแหน่ง',
                      ),
                onTap: onDevices,
              ),
            ),
            const SizedBox(height: 18),
            CalmCareFilterPills(
              items: [
                t.pick('Overview', 'ภาพรวม'),
                t.pick('Readings', 'ข้อมูล'),
                t.pick('Devices', 'อุปกรณ์'),
                t.pick('Safety', 'ความปลอดภัย'),
              ],
              selectedIndex: _filter.index,
              onSelect: (index) =>
                  setState(() => _filter = _HomeFilter.values[index]),
            ),
            if (_filter == _HomeFilter.overview) ...[
              const SizedBox(height: 14),
              CalmCareHeroCard(
                title: t.pick('Live monitor', 'ติดตามสด'),
                subtitle: t.pick(
                  'Movement, heart rate and location in real time.',
                  'การเคลื่อนไหว ชีพจร และตำแหน่งแบบเรียลไทม์',
                ),
                playTooltip: t.pick('Open live monitor', 'เปิดการติดตามสด'),
                tags: [
                  if (m5Linked) t.pick('Streaming', 'กำลังส่งข้อมูล'),
                  if (s.m5FallCapable)
                    t.pick('Fall protection', 'ป้องกันการล้ม'),
                  if (s.latestM5Sample?.batteryPercent case final battery?)
                    t.pick('Battery $battery%', 'แบตเตอรี่ $battery%'),
                ],
                footerText: linkedCount == 0
                    ? t.pick(
                        'No devices linked yet',
                        'ยังไม่ได้เชื่อมต่ออุปกรณ์',
                      )
                    : t.pick('Linked devices', 'อุปกรณ์ที่เชื่อมต่อ'),
                footerIcons: [
                  if (m5Linked) Icons.accessible_rounded,
                  if (polarLinked) Icons.favorite_rounded,
                ],
                footerCount: t.pick(
                  '$linkedCount linked',
                  '$linkedCount เครื่อง',
                ),
                onPlayTap: onMonitor,
              ),
            ],
            if (_shows(_HomeFilter.readings)) ...[
              const SizedBox(height: 28),
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
                  final width = MediaQuery.textScalerOf(context).scale(1) > 1.3
                      ? box.maxWidth
                      // Android's first frame can be 0 wide; never go negative.
                      : ((box.maxWidth - 12) / 2).clamp(0.0, double.infinity);
                  return Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final card in cards)
                        SizedBox(width: width, child: card),
                    ],
                  );
                },
              ),
            ],
            if (_shows(_HomeFilter.devices)) ...[
              const SizedBox(height: 28),
              ProductSectionHeading(
                title: t.pick(
                  'Connections & devices',
                  'อุปกรณ์และการเชื่อมต่อ',
                ),
              ),
              const SizedBox(height: 12),
              ProductSurface(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (final card in connectionCards) ...[
                      if (card != connectionCards.first)
                        const Divider(indent: 64),
                      card,
                    ],
                  ],
                ),
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
            ],
            if (currentRoom != null && _shows(_HomeFilter.readings)) ...[
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
            if (s.alerts.isNotEmpty && _shows(_HomeFilter.safety)) ...[
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
            if (_shows(_HomeFilter.safety)) ...[
              const SizedBox(height: 24),
              ProductSectionHeading(
                title: t.pick('Fall alerts', 'แจ้งเตือนการล้ม'),
              ),
              const SizedBox(height: 12),
              ProductSurface(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (recentFallEvents.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 16,
                        ),
                        child: Text(
                          t.pick(
                            'No fall events yet — the belt device will appear here after pairing.',
                            'ยังไม่มีเหตุการณ์ล้ม — อุปกรณ์เข็มขัดจะแสดงที่นี่หลังจับคู่',
                          ),
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      )
                    else
                      for (final fallEvent in recentFallEvents)
                        _FallAlertTile(event: fallEvent),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                      child: CalmCarePillButton(
                        label: t.pick(
                          'Test fall alert',
                          'ทดสอบแจ้งเตือนการล้ม',
                        ),
                        icon: Icons.notifications_active_rounded,
                        onPressed: () {
                          final paired = s.pairedM5Device;
                          if (paired == null || !runtime.fallBeltConnected) {
                            // No connected belt: still show the alert, and
                            // say it only tested the phone.
                            runtime.simulateFallAlert();
                            if (paired != null) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    t.pick(
                                      'Belt not connected — showing a phone-only test.',
                                      'เข็มขัดยังไม่เชื่อมต่อ — แสดงการทดสอบเฉพาะในโทรศัพท์',
                                    ),
                                  ),
                                ),
                              );
                            }
                            return;
                          }
                          unawaited(
                            _triggerFallTest(
                              runtime: runtime,
                              deviceId: paired.id,
                              messenger: ScaffoldMessenger.of(context),
                              strings: t,
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (_filter == _HomeFilter.overview) ...[
              const SizedBox(height: 24),
              CalmCareToolTile(
                title: t.pick('Health insights', 'ข้อมูลเชิงลึกสุขภาพ'),
                subtitle: t.pick(
                  'Sleep, HRV and daily trends',
                  'การนอน HRV และแนวโน้มรายวัน',
                ),
                icon: Icons.insights_rounded,
                onTap: onHealth,
              ),
              const SizedBox(height: 12),
              CalmCareToolTile(
                title: t.pick('Care portal', 'พอร์ทัลการดูแล'),
                subtitle: t.pick(
                  'Your care team and history',
                  'ทีมดูแลและประวัติของคุณ',
                ),
                icon: Icons.volunteer_activism_rounded,
                onTap: onPortal,
              ),
            ],
          ],
        );
      },
    );
  }

  bool _fresh(DateTime time) {
    final age = DateTime.now().difference(time);
    return age >= Duration.zero && age <= const Duration(minutes: 2);
  }

  Future<void> _triggerFallTest({
    required GatewayRuntimeService runtime,
    required String deviceId,
    required ScaffoldMessengerState messenger,
    required GatewayStrings strings,
  }) async {
    try {
      await runtime.triggerFallTest(deviceId);
    } on Object catch (error) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            strings.pick(
              'Fall test command failed: $error',
              'สั่งทดสอบการล้มไม่สำเร็จ: $error',
            ),
          ),
        ),
      );
    }
  }
}

class _FallAlertTile extends StatelessWidget {
  const _FallAlertTile({required this.event});

  final FallAlertEvent event;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = context.text;
    final (icon, color) = switch (event.kind) {
      FallAlertKind.detected => (Icons.error_rounded, AppPalette.danger),
      FallAlertKind.suspect => (
        Icons.warning_amber_rounded,
        AppPalette.warning,
      ),
      FallAlertKind.canceled => (Icons.check_circle_rounded, AppPalette.brand),
      FallAlertKind.test => (Icons.info_rounded, AppPalette.info),
      FallAlertKind.unknown => (
        Icons.help_outline_rounded,
        AppPalette.slate500,
      ),
    };
    final title = switch (event.kind) {
      FallAlertKind.detected => t.pick('Fall detected', 'ตรวจพบการล้ม'),
      FallAlertKind.suspect => t.pick('Possible fall', 'อาจมีการล้ม'),
      FallAlertKind.canceled => t.pick('Alert canceled', 'ยกเลิกแจ้งเตือนแล้ว'),
      FallAlertKind.test => t.pick('Test alert', 'แจ้งเตือนทดสอบ'),
      FallAlertKind.unknown =>
        event.event.isNotEmpty
            ? event.event
            : t.pick('Fall event', 'เหตุการณ์การล้ม'),
    };
    final time = DateFormat('dd MMM HH:mm').format(event.timestamp.toLocal());

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Center(child: Icon(icon, color: color, size: 20)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${event.deviceId} · $time',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          if (event.peakG != null || event.batteryPercent != null) ...[
            const SizedBox(width: 8),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (event.peakG != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 7,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${event.peakG!.toStringAsFixed(1)} g',
                      style: TextStyle(
                        color: color,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                if (event.batteryPercent != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    '${event.batteryPercent}%',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            ProductIconBadge(
              icon,
              tint: active ? colors.primary : colors.onSurfaceVariant,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleSmall,
              ),
            ),
            const SizedBox(width: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 120),
              child: Text(
                detail,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.end,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: active ? colors.primary : colors.onSurfaceVariant,
                ),
              ),
            ),
            const SizedBox(width: 6),
            ProductIcon('arrow', size: 16, color: colors.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}

class _LocationCard extends StatelessWidget {
  const _LocationCard({required this.location, required this.active});
  final PreviewLocation location;
  final bool active;

  @override
  Widget build(BuildContext context) => ProductSurface(
    background: Theme.of(context).colorScheme.surfaceContainer,
    radius: 16,
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
