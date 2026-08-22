import 'package:flutter/material.dart';

import '../models/sensor_telemetry.dart';
import '../theme/app_palette.dart';
import '../theme/app_typography.dart';

class NodeScannerCard extends StatelessWidget {
  const NodeScannerCard({
    super.key,
    required this.nodes,
    this.onRefresh,
  });

  final List<NodeTsimcamSnapshot> nodes;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: isDark ? AppPalette.slate900 : AppPalette.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark ? AppPalette.slate800 : AppPalette.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AppPalette.info.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.radar_rounded,
                      size: 20,
                      color: AppPalette.infoBright,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Node_Tsimcam Camera Radar',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (onRefresh != null)
                IconButton(
                  icon: const Icon(Icons.refresh_rounded, size: 20),
                  onPressed: onRefresh,
                  tooltip: 'Scan beacons',
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (nodes.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 24),
              alignment: Alignment.center,
              child: Column(
                children: [
                  Icon(
                    Icons.cell_tower_rounded,
                    size: 36,
                    color: isDark ? AppPalette.slate700 : AppPalette.slate300,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No T-SIMCam / WSN_* nodes detected in range',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: nodes.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final node = nodes[index];
                return _NodeItemTile(node: node, isDark: isDark);
              },
            ),
        ],
      ),
    );
  }
}

class _NodeItemTile extends StatelessWidget {
  const _NodeItemTile({
    required this.node,
    required this.isDark,
  });

  final NodeTsimcamSnapshot node;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    final rssi = node.rssi;
    final signalPct = ((rssi + 100) / 70).clamp(0.0, 1.0);
    final signalColor = rssi >= -65
        ? AppPalette.successBright
        : rssi >= -80
        ? AppPalette.warningBright
        : AppPalette.dangerBright;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? AppPalette.slate850 : AppPalette.slate50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? AppPalette.slate800 : AppPalette.slate200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppPalette.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.videocam_rounded,
                  size: 18,
                  color: AppPalette.brand,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      node.nodeId,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                    Text(
                      '${node.deviceId} • MAC: ${node.bleMac}',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? AppPalette.slate400 : AppPalette.slate500,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.wifi_tethering_rounded, size: 14, color: signalColor),
                      const SizedBox(width: 4),
                      Text(
                        '${node.rssi} dBm',
                        style: AppTypography.monospaceMetrics(
                          color: signalColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    width: 50,
                    height: 4,
                    margin: const EdgeInsets.only(top: 4),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: LinearProgressIndicator(
                        value: signalPct,
                        backgroundColor: isDark ? AppPalette.slate700 : AppPalette.slate200,
                        valueColor: AlwaysStoppedAnimation<Color>(signalColor),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (node.ipAddress != null || node.batteryPercent != null) ...[
            const SizedBox(height: 8),
            const Divider(height: 1),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (node.ipAddress != null)
                  Text(
                    'IP: ${node.ipAddress}',
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      color: isDark ? AppPalette.slate400 : AppPalette.slate600,
                    ),
                  ),
                if (node.batteryPercent != null)
                  Row(
                    children: [
                      Icon(
                        Icons.battery_std_rounded,
                        size: 13,
                        color: isDark ? AppPalette.slate400 : AppPalette.slate600,
                      ),
                      const SizedBox(width: 2),
                      Text(
                        '${node.batteryPercent}% (${node.batteryVoltageV?.toStringAsFixed(2) ?? ''}V)',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? AppPalette.slate400 : AppPalette.slate600,
                        ),
                      ),
                    ],
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: node.streamEnabled
                        ? AppPalette.success.withValues(alpha: 0.15)
                        : AppPalette.slate700.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    node.streamEnabled ? 'STREAM ON' : 'IDLE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: node.streamEnabled ? AppPalette.successBright : AppPalette.slate400,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
