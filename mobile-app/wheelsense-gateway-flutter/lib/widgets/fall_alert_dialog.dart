import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../l10n/gateway_localizations.dart';
import '../models/fall_alert_event.dart';
import '../theme/app_palette.dart';

/// Emergency dialog shown when the belt reports a fall.
///
/// Built to be read at a glance under stress: a solid colour header with the
/// headline, then device, time and readings, then one large "I'm OK" action.
/// No looping animation, and every text pairing is at least 4.5:1 contrast.
class FallAlertDialog extends StatelessWidget {
  const FallAlertDialog({super.key, required this.event, this.onImOk});

  final FallAlertEvent event;
  final VoidCallback? onImOk;

  /// Header fills; both carry white text above 4.5:1.
  static const _emergency = Color(0xFFB91C1C);
  static const _test = Color(0xFF0369A1);

  static Future<void> show(
    BuildContext context,
    FallAlertEvent event, {
    VoidCallback? onImOk,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      builder: (dialogContext) {
        return FallAlertDialog(
          event: event,
          onImOk: () {
            Navigator.of(dialogContext).pop();
            onImOk?.call();
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final t = context.text;
    final isTest = event.kind == FallAlertKind.test;
    final accent = isTest ? _test : _emergency;
    final time = DateFormat('HH:mm:ss').format(event.timestamp.toLocal());
    final reason = event.reason?.replaceAll('_', ' ').trim();

    return Dialog(
      backgroundColor: colors.surface,
      surfaceTintColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Details scroll on short screens; the action below never does.
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header: what happened, in the loudest form on the screen.
                  Semantics(
                    liveRegion: true,
                    child: Container(
                      color: accent,
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 26),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              isTest
                                  ? t.pick('SYSTEM TEST', 'ทดสอบระบบ')
                                  : t.pick(
                                      'CRITICAL ALERT',
                                      'แจ้งเตือนฉุกเฉิน',
                                    ),
                              style: const TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),
                          Container(
                            width: 72,
                            height: 72,
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                            ),
                            child: Icon(
                              isTest
                                  ? Icons.science_rounded
                                  : Icons.warning_rounded,
                              size: 38,
                              color: accent,
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            isTest
                                ? t.pick('Fall Detection Test', 'ทดสอบการล้ม')
                                : t.pick('FALL DETECTED', 'ตรวจพบการล้ม'),
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.4,
                              height: 1.15,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            isTest
                                ? t.pick(
                                    'Test alert generated from belt sensor',
                                    'สัญญาณทดสอบจากเซนเซอร์เข็มขัด',
                                  )
                                : t.pick(
                                    'High impact detected! Check on the wearer immediately.',
                                    'ตรวจพบแรงกระแทกสูง! โปรดตรวจสอบผู้สวมใส่ทันที',
                                  ),
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 16,
                              height: 1.45,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _InfoRow(
                          icon: Icons.sensors_rounded,
                          label: t.pick('Device', 'อุปกรณ์'),
                          value: event.deviceId,
                        ),
                        const SizedBox(height: 10),
                        _InfoRow(
                          icon: Icons.schedule_rounded,
                          label: t.pick('Time', 'เวลา'),
                          value: time,
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            Expanded(
                              child: _Reading(
                                label: t.pick('Peak g-force', 'แรงกระแทก'),
                                value: event.peakG != null
                                    ? '${event.peakG!.toStringAsFixed(2)} g'
                                    : '--',
                              ),
                            ),
                            if (event.batteryPercent != null) ...[
                              const SizedBox(width: 10),
                              Expanded(
                                child: _Reading(
                                  label: t.pick('Battery', 'แบตเตอรี่'),
                                  value: '${event.batteryPercent}%',
                                ),
                              ),
                            ],
                          ],
                        ),
                        if (reason != null && reason.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          _Reading(
                            label: t.pick('Impact type', 'ประเภท'),
                            value: reason,
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Pinned: the one action, large enough to hit with a shaking hand.
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 60,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppPalette.brand,
                      foregroundColor: Colors.white,
                      // From the theme so the label keeps the app font.
                      textStyle: theme.textTheme.titleMedium?.copyWith(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    onPressed: onImOk,
                    icon: const Icon(Icons.check_circle_rounded, size: 24),
                    label: Text(
                      t.pick(
                        "I'm OK — Dismiss Alert",
                        'ฉันปลอดภัย — ปิดแจ้งเตือน',
                      ),
                      maxLines: 2,
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  t.pick(
                    'Dismisses alert and cancels alarm on belt device',
                    'ปิดการแจ้งเตือนและยกเลิกเสียงเตือนบนเข็มขัด',
                  ),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 20, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 10),
        Text(label, style: theme.textTheme.bodyMedium),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.titleSmall?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}

class _Reading extends StatelessWidget {
  const _Reading({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: theme.textTheme.labelMedium),
          const SizedBox(height: 4),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
