import 'package:flutter/material.dart';

import '../models/gateway_ui_models.dart';
import '../services/gateway_services.dart';
import '../widgets/clinical_components.dart';

class OverviewScreen extends StatelessWidget {
  const OverviewScreen({
    super.key,
    required this.onOpenDevices,
    required this.onOpenSettings,
    required this.onStartGateway,
  });

  final VoidCallback onOpenDevices;
  final VoidCallback onOpenSettings;
  final VoidCallback onStartGateway;

  @override
  Widget build(BuildContext context) {
    final runtime = GatewayServicesScope.of(context);
    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final state = snapshot.data ?? runtime.snapshot;
        final status = state.status;
        final config = state.config;
        final setupItems = <_SetupItem>[
          _SetupItem(
            title: 'Permissions',
            detail: status.bleReady
                ? 'Bluetooth permissions are ready'
                : 'Bluetooth and notification permissions need attention',
            done: status.bleReady,
          ),
          _SetupItem(
            title: 'Server and broker',
            detail: status.mqttReady
                ? '${config.mqttHost}:${config.mqttPort} connected'
                : '${config.mqttHost}:${config.mqttPort} not connected',
            done: status.mqttReady,
          ),
          _SetupItem(
            title: 'M5 gateway sensor',
            detail: state.pairedM5Device?.name ?? 'Pair the WheelSense M5',
            done: state.pairedM5Device != null,
          ),
          _SetupItem(
            title: 'Polar sensor',
            detail:
                state.pairedPolarDevice?.name ?? 'Optional heart-rate relay',
            done: true,
          ),
        ];

        return ClinicalPage(
          trailing: FilledButton.icon(
            onPressed: onStartGateway,
            icon: const Icon(Icons.play_arrow),
            label: const Text('Start gateway'),
          ),
          children: [
            ResponsiveGrid(
              children: [
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Gateway',
                    value: _modeLabel(status.mode),
                    detail: status.message,
                    icon: Icons.health_and_safety_outlined,
                    severity: _severity(status.mode),
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Telemetry sync',
                    value: state.lastSuccessfulPublishAt == null
                        ? 'Waiting'
                        : 'Publishing',
                    detail: state.failedPublishCount == 0
                        ? 'No publish failures recorded'
                        : '${state.failedPublishCount} publish failures',
                    icon: Icons.cloud_upload_outlined,
                    severity: state.failedPublishCount == 0
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.warning,
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: 'Patient link',
                    value: config.linkedPersonType ?? 'Unlinked',
                    detail: config.linkedPatientId != null
                        ? 'Patient ${config.linkedPatientId}'
                        : config.linkedCaregiverId != null
                        ? 'Caregiver ${config.linkedCaregiverId}'
                        : 'Waiting for retained MQTT config',
                    icon: Icons.link_outlined,
                    severity: config.alertsEnabled
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.info,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: 'Gateway setup',
              subtitle:
                  'Complete these steps before leaving this phone as the ward gateway.',
              action: TextButton.icon(
                onPressed: onOpenSettings,
                icon: const Icon(Icons.tune),
                label: const Text('Open Settings'),
              ),
              child: Column(
                children: [
                  for (final item in setupItems) ...[
                    CompactRowCard(
                      icon: item.done
                          ? Icons.check_circle_outline
                          : Icons.radio_button_unchecked,
                      title: item.title,
                      subtitle: item.detail,
                      meta: item.done ? 'Done' : 'Needed',
                      severity: item.done
                          ? ClinicalSeverity.normal
                          : ClinicalSeverity.warning,
                    ),
                    if (item != setupItems.last) const SizedBox(height: 10),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: onOpenDevices,
                          icon: const Icon(Icons.sensors),
                          label: const Text('Open Devices'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: onStartGateway,
                          icon: const Icon(Icons.sync),
                          label: const Text('Resume relay'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: 'Live state',
              subtitle: 'Latest server-side context received through MQTT.',
              child: Column(
                children: [
                  CompactRowCard(
                    icon: Icons.meeting_room_outlined,
                    title:
                        state.latestRoomPrediction?.roomName ??
                        'No room prediction',
                    subtitle: state.latestRoomPrediction == null
                        ? 'Room updates appear after RSSI telemetry reaches the backend.'
                        : '${(state.latestRoomPrediction!.confidence * 100).round()}% via ${state.latestRoomPrediction!.modelType}',
                    meta: state.latestRoomPrediction == null
                        ? 'Waiting'
                        : 'Live',
                    severity: state.latestRoomPrediction == null
                        ? ClinicalSeverity.info
                        : ClinicalSeverity.normal,
                  ),
                  const SizedBox(height: 10),
                  CompactRowCard(
                    icon: Icons.notifications_active_outlined,
                    title: '${state.alerts.length} live alerts',
                    subtitle: state.alerts.isEmpty
                        ? 'No active alerts for this linked gateway.'
                        : state.alerts.first.title,
                    meta: config.alertsEnabled ? 'Subscribed' : 'Off',
                    severity: state.alerts.isEmpty
                        ? ClinicalSeverity.info
                        : _alertSeverity(state.alerts.first.severity),
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

  static ClinicalSeverity _alertSeverity(GatewayAlertSeverity severity) {
    return switch (severity) {
      GatewayAlertSeverity.critical => ClinicalSeverity.critical,
      GatewayAlertSeverity.warning => ClinicalSeverity.warning,
      GatewayAlertSeverity.info => ClinicalSeverity.info,
      GatewayAlertSeverity.normal => ClinicalSeverity.normal,
    };
  }
}

class _SetupItem {
  const _SetupItem({
    required this.title,
    required this.detail,
    required this.done,
  });

  final String title;
  final String detail;
  final bool done;
}
