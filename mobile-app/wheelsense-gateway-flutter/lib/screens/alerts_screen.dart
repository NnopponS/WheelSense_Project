import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';

const _alerts = [
  GatewayAlert(
    title: 'Emergency from Room 204',
    detail:
        'Wheelchair sensor reports SOS press. Response confirmation required in portal.',
    time: 'Now',
    severity: ClinicalSeverity.critical,
    actionLabel: 'Open',
  ),
  GatewayAlert(
    title: 'Low battery WS-B021',
    detail: 'Device battery below ward threshold. Replace during next round.',
    time: '8 min',
    severity: ClinicalSeverity.warning,
    actionLabel: 'Assign',
  ),
  GatewayAlert(
    title: 'RSSI confidence recovered',
    detail: 'Room 205 localization confidence returned above threshold.',
    time: '18 min',
    severity: ClinicalSeverity.normal,
    actionLabel: 'View',
  ),
];

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ClinicalPage(
      children: [
        SectionPanel(
          title: 'Alerts',
          subtitle:
              'Critical patient and device events stay above routine diagnostics.',
          child: Column(
            children: [
              for (final alert in _alerts) ...[
                CompactRowCard(
                  icon: alert.severity == ClinicalSeverity.critical
                      ? Icons.emergency
                      : Icons.notifications_active_outlined,
                  title: alert.title,
                  subtitle: alert.detail,
                  meta: alert.time,
                  severity: alert.severity,
                  actionLabel: alert.actionLabel,
                  onAction: () => _notify(context, alert),
                ),
                if (alert != _alerts.last) const SizedBox(height: 10),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _notify(BuildContext context, GatewayAlert alert) async {
    final runtime = GatewayServicesScope.of(context);
    await runtime.notifyStatus(alert.title, alert.detail);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Notification sent: ${alert.title}')),
      );
    }
  }
}
