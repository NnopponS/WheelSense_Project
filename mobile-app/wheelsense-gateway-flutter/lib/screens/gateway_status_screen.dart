import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';

class GatewayStatusScreen extends StatelessWidget {
  const GatewayStatusScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    return StreamBuilder<GatewayStatus>(
      stream: runtime.statuses,
      initialData: runtime.status,
      builder: (context, snapshot) {
        final status = snapshot.data ?? GatewayStatus.initial();
        return ClinicalPage(
          trailing: FilledButton.icon(
            onPressed: () async {
              final config = await runtime.loadConfig();
              await runtime.bootstrap(config: config);
            },
            icon: const Icon(Icons.power_settings_new),
            label: const Text('Start gateway'),
          ),
          children: [
            ResponsiveGrid(
              children: [
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Gateway health',
                    value: _modeLabel(status.mode),
                    detail: status.message,
                    icon: Icons.health_and_safety_outlined,
                    severity: _severity(status.mode),
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'BLE',
                    value: status.bleReady ? 'Ready' : 'Permission needed',
                    detail: 'M5StickC Plus 2 peripheral relay',
                    icon: Icons.bluetooth_connected,
                    severity: status.bleReady
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.warning,
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'MQTT',
                    value: status.mqttReady ? 'Ready' : 'Offline',
                    detail: 'WheelSense/mobile/{gateway}/telemetry',
                    icon: Icons.sync,
                    severity: status.mqttReady
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.warning,
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Background',
                    value: status.backgroundReady ? 'Enabled' : 'Limited',
                    detail: 'Android foreground service, iOS event-limited',
                    icon: Icons.notification_important_outlined,
                    severity: status.backgroundReady
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.info,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: 'Runtime state',
              subtitle: 'Operational status for the mobile BLE gateway.',
              child: Column(
                children: [
                  CompactRowCard(
                    icon: Icons.router,
                    title: 'Upload path',
                    subtitle:
                        'Phone pairs BLE devices and publishes one MQTT stream.',
                    meta: status.mqttReady ? 'Online' : 'Waiting',
                    severity: status.mqttReady
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.warning,
                  ),
                  const SizedBox(height: 10),
                  CompactRowCard(
                    icon: Icons.storage,
                    title: 'Production behavior',
                    subtitle:
                        'BLE data is shown locally and MQTT publishes when broker is online.',
                    meta: _modeLabel(status.mode),
                    severity: _severity(status.mode),
                  ),
                  const SizedBox(height: 10),
                  CompactRowCard(
                    icon: Icons.schedule,
                    title: 'Last update',
                    subtitle: status.updatedAt.toLocal().toIso8601String(),
                    meta: 'Local',
                    severity: ClinicalSeverity.info,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  static String _modeLabel(GatewayConnectionMode mode) {
    return switch (mode) {
      GatewayConnectionMode.idle => 'Ready',
      GatewayConnectionMode.scanning => 'Scanning',
      GatewayConnectionMode.connected => 'Relaying',
      GatewayConnectionMode.degraded => 'Degraded',
      GatewayConnectionMode.error => 'Error',
    };
  }

  static ClinicalSeverity _severity(GatewayConnectionMode mode) {
    return switch (mode) {
      GatewayConnectionMode.connected ||
      GatewayConnectionMode.idle => ClinicalSeverity.normal,
      GatewayConnectionMode.scanning => ClinicalSeverity.info,
      GatewayConnectionMode.degraded => ClinicalSeverity.warning,
      GatewayConnectionMode.error => ClinicalSeverity.critical,
    };
  }
}
