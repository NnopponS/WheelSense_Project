import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';

class DiagnosticsScreen extends StatefulWidget {
  const DiagnosticsScreen({super.key});

  @override
  State<DiagnosticsScreen> createState() => _DiagnosticsScreenState();
}

class _DiagnosticsScreenState extends State<DiagnosticsScreen> {
  GatewayStatus _status = GatewayStatus.initial();
  bool _running = false;

  @override
  Widget build(BuildContext context) {
    final checks = <DiagnosticCheck>[
      DiagnosticCheck(
        name: 'BLE adapter',
        status: _status.bleReady ? 'Ready' : 'Permission',
        detail: 'Runtime permission and Bluetooth scan readiness.',
        severity: _status.bleReady
            ? ClinicalSeverity.normal
            : ClinicalSeverity.warning,
      ),
      DiagnosticCheck(
        name: 'MQTT publish',
        status: _status.mqttReady ? 'Ready' : 'Offline',
        detail: 'Publishes mobile registration and telemetry topics.',
        severity: _status.mqttReady
            ? ClinicalSeverity.normal
            : ClinicalSeverity.warning,
      ),
      DiagnosticCheck(
        name: 'Portal reachability',
        status: 'Configured',
        detail: 'Portal login opens in WebView from saved URL.',
        severity: ClinicalSeverity.info,
      ),
      DiagnosticCheck(
        name: 'Notification channel',
        status: _status.notificationsReady ? 'Ready' : 'Permission',
        detail: 'Sound and vibration use local notification channel.',
        severity: _status.notificationsReady
            ? ClinicalSeverity.normal
            : ClinicalSeverity.info,
      ),
      DiagnosticCheck(
        name: 'Background mode',
        status: _status.backgroundReady ? 'Ready' : 'Limited',
        detail: 'Android foreground service; iOS connected/event-limited.',
        severity: _status.backgroundReady
            ? ClinicalSeverity.normal
            : ClinicalSeverity.info,
      ),
    ];

    return ClinicalPage(
      trailing: FilledButton.icon(
        onPressed: _running ? null : _runChecks,
        icon: const Icon(Icons.fact_check_outlined),
        label: Text(_running ? 'Running' : 'Run checks'),
      ),
      children: [
        SectionPanel(
          title: 'Diagnostics',
          subtitle: _status.message,
          child: Column(
            children: [
              for (final check in checks) ...[
                CompactRowCard(
                  icon: Icons.checklist_rtl,
                  title: check.name,
                  subtitle: check.detail,
                  meta: check.status,
                  severity: check.severity,
                ),
                if (check != checks.last) const SizedBox(height: 10),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _runChecks() async {
    setState(() => _running = true);
    final runtime = GatewayServicesScope.of(context);
    final config = await runtime.loadConfig();
    final status = await runtime.bootstrap(config: config);
    await runtime.notifyStatus('WheelSense diagnostics', status.message);
    if (!mounted) {
      return;
    }
    setState(() {
      _status = status;
      _running = false;
    });
  }
}
