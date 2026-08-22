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
    this.onOpenMonitor,
  });

  final VoidCallback onOpenDevices;
  final VoidCallback onOpenSettings;
  final VoidCallback onStartGateway;
  final VoidCallback? onOpenMonitor;

  @override
  Widget build(BuildContext context) {
    final strings = context.text;
    final runtime = GatewayServicesScope.of(context);
    return StreamBuilder<GatewayRuntimeSnapshot>(
      stream: runtime.snapshots,
      initialData: runtime.snapshot,
      builder: (context, snapshot) {
        final state = snapshot.data ?? runtime.snapshot;
        final status = state.status;
        final config = state.config;
        final nextAction = _nextAction(
          state: state,
          strings: strings,
          onOpenDevices: onOpenDevices,
          onOpenSettings: onOpenSettings,
          onStartGateway: onStartGateway,
        );
        final setupItems = <_SetupItem>[
          _SetupItem(
            title: strings.setupPermissions,
            detail: status.bleReady
                ? strings.setupPermissionsReady
                : strings.setupPermissionsNeeded,
            done: status.bleReady,
          ),
          _SetupItem(
            title: strings.setupServer,
            detail: status.mqttReady
                ? strings.brokerConnected(
                    '${config.mqttHost}:${config.mqttPort}',
                  )
                : strings.brokerNotConnected(
                    '${config.mqttHost}:${config.mqttPort}',
                  ),
            done: status.mqttReady,
          ),
          _SetupItem(
            title: strings.setupM5,
            detail: state.pairedM5Device?.name ?? strings.setupM5Pair,
            done: state.pairedM5Device != null,
          ),
          _SetupItem(
            title: strings.setupPolar,
            detail: state.pairedPolarDevice?.name ?? strings.setupPolarOptional,
            done: true,
          ),
        ];

        return ClinicalPage(
          trailing: FilledButton.icon(
            onPressed: onStartGateway,
            icon: const Icon(Icons.play_arrow),
            label: Text(strings.startGateway),
          ),
          children: [
            SectionPanel(
              title: strings.overviewNextStepTitle,
              subtitle: nextAction.detail,
              action: FilledButton.icon(
                onPressed: nextAction.onPressed,
                icon: Icon(nextAction.icon),
                label: Text(nextAction.actionLabel),
              ),
              child: CompactRowCard(
                icon: nextAction.icon,
                title: nextAction.title,
                subtitle: nextAction.detail,
                meta: nextAction.meta,
                severity: nextAction.severity,
              ),
            ),
            const SizedBox(height: 12),
            ResponsiveGrid(
              children: [
                MetricTile(
                  metric: MetricSnapshot(
                    label: strings.metricGateway,
                    value: strings.modeLabel(status.mode),
                    detail: status.message,
                    icon: Icons.health_and_safety_outlined,
                    severity: _severity(status.mode),
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: strings.metricTelemetrySync,
                    value: state.lastSuccessfulPublishAt == null
                        ? strings.waiting
                        : strings.modeLabel(GatewayConnectionMode.connected),
                    detail: state.failedPublishCount == 0
                        ? strings.metricNoPublishFailures
                        : strings.publishFailureCount(state.failedPublishCount),
                    icon: Icons.cloud_upload_outlined,
                    severity: state.failedPublishCount == 0
                        ? ClinicalSeverity.normal
                        : ClinicalSeverity.warning,
                  ),
                ),
                MetricTile(
                  metric: MetricSnapshot(
                    label: strings.metricPatientLink,
                    value: config.linkedPersonType ?? strings.unlinked,
                    detail: config.linkedPatientId != null
                        ? strings.patientId(config.linkedPatientId!)
                        : config.linkedCaregiverId != null
                        ? strings.caregiverId(config.linkedCaregiverId!)
                        : strings.metricWaitingForRetainedConfig,
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
              title: strings.overviewSetupTitle,
              subtitle: strings.overviewSetupSubtitle,
              action: TextButton.icon(
                onPressed: onOpenSettings,
                icon: const Icon(Icons.tune),
                label: Text(strings.openSettings),
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
                      meta: item.done ? strings.done : strings.needed,
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
                          label: Text(strings.openDevices),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: onStartGateway,
                          icon: const Icon(Icons.sync),
                          label: Text(strings.resumeRelay),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            SectionPanel(
              title: strings.overviewLiveStateTitle,
              subtitle: strings.overviewLiveStateSubtitle,
              child: Column(
                children: [
                  if (state.latestPolarSample != null ||
                      state.latestM5Sample != null) ...[
                    CompactRowCard(
                      icon: Icons.monitor_heart_outlined,
                      title: state.latestPolarSample != null
                          ? '${strings.heartRate} ${state.latestPolarSample!.heartRateBpm} bpm'
                          : strings.velocity,
                      subtitle: state.latestM5Sample != null
                          ? '${strings.velocity} ${state.latestM5Sample!.velocityMs.toStringAsFixed(2)} m/s'
                          : strings.waitingForM5Telemetry,
                      meta: strings.live,
                      severity: ClinicalSeverity.normal,
                      actionLabel: strings.navMonitor,
                      onAction: onOpenMonitor,
                    ),
                    const SizedBox(height: 10),
                  ],
                  CompactRowCard(
                    icon: Icons.meeting_room_outlined,
                    title:
                        state.latestRoomPrediction?.roomName ??
                        strings.noRoomPrediction,
                    subtitle: state.latestRoomPrediction == null
                        ? strings.noRoomPredictionDetail
                        : '${(state.latestRoomPrediction!.confidence * 100).round()}% via ${state.latestRoomPrediction!.modelType}',
                    meta: state.latestRoomPrediction == null
                        ? strings.waiting
                        : strings.live,
                    severity: state.latestRoomPrediction == null
                        ? ClinicalSeverity.info
                        : ClinicalSeverity.normal,
                  ),
                  const SizedBox(height: 10),
                  CompactRowCard(
                    icon: Icons.notifications_active_outlined,
                    title: strings.liveAlerts(state.alerts.length),
                    subtitle: state.alerts.isEmpty
                        ? strings.noActiveAlerts
                        : state.alerts.first.title,
                    meta: config.alertsEnabled
                        ? strings.subscribed
                        : strings.off,
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

  static _NextAction _nextAction({
    required GatewayRuntimeSnapshot state,
    required GatewayStrings strings,
    required VoidCallback onOpenDevices,
    required VoidCallback onOpenSettings,
    required VoidCallback onStartGateway,
  }) {
    if (!state.status.bleReady) {
      return _NextAction(
        title: strings.nextPermissionsTitle,
        detail: strings.nextPermissionsDetail,
        actionLabel: strings.startGateway,
        meta: strings.needed,
        icon: Icons.bluetooth_searching,
        severity: ClinicalSeverity.warning,
        onPressed: onStartGateway,
      );
    }
    if (!state.status.mqttReady) {
      return _NextAction(
        title: strings.nextServerTitle,
        detail: strings.nextServerDetail,
        actionLabel: strings.openSettings,
        meta: strings.needed,
        icon: Icons.hub_outlined,
        severity: ClinicalSeverity.warning,
        onPressed: onOpenSettings,
      );
    }
    if (state.pairedM5Device == null) {
      return _NextAction(
        title: strings.nextM5Title,
        detail: strings.nextM5Detail,
        actionLabel: strings.openDevices,
        meta: strings.needed,
        icon: Icons.sensors,
        severity: ClinicalSeverity.warning,
        onPressed: onOpenDevices,
      );
    }
    if (!state.config.setupCompleted) {
      return _NextAction(
        title: strings.nextFirstPacketTitle,
        detail: strings.nextFirstPacketDetail,
        actionLabel: strings.openDevices,
        meta: strings.waiting,
        icon: Icons.sync,
        severity: ClinicalSeverity.info,
        onPressed: onOpenDevices,
      );
    }
    return _NextAction(
      title: strings.nextReadyTitle,
      detail: strings.nextReadyDetail,
      actionLabel: strings.resumeRelay,
      meta: strings.ready,
      icon: Icons.check_circle_outline,
      severity: ClinicalSeverity.normal,
      onPressed: onStartGateway,
    );
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

class _NextAction {
  const _NextAction({
    required this.title,
    required this.detail,
    required this.actionLabel,
    required this.meta,
    required this.icon,
    required this.severity,
    required this.onPressed,
  });

  final String title;
  final String detail;
  final String actionLabel;
  final String meta;
  final IconData icon;
  final ClinicalSeverity severity;
  final VoidCallback onPressed;
}
